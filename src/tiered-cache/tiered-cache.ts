import { LruCache } from "../lru-cache/lru-cache.ts";
import { resolveKvOps } from "./resolve-kv-ops.ts";
import { CACHE_PRESETS, MS } from "./tiered-cache.constants.ts";
import type {
  CacheCtx,
  CachePreset,
  CacheSource,
  CacheTraceEntry,
  GetOptions,
  InvalidateOptions,
  KvOps,
  SetOptions,
  Stored,
  TieredCacheKv,
  TieredCacheOptions,
} from "./tiered-cache.types.ts";

/**
 * 3-tier cache: isolate LRU (SWR) → KV → fetch (DB), on a preset.
 *
 * Every value carries when it was read from the source, taken before the fetch, and expires from
 * then in every tier: a KV copy reloaded into another isolate, or a read that raced a write, can
 * never be served past `at + hard`. That makes the preset's hard TTL a true staleness bound.
 */
export class TieredCache<V> {
  readonly name: string;
  readonly preset: CachePreset;
  readonly bypass: boolean;
  private readonly prefix: string | undefined;
  private readonly isolate: boolean;
  private readonly lru: LruCache<string, Stored<V>>;

  constructor(options: TieredCacheOptions) {
    const { hardS, softS } = CACHE_PRESETS[options.preset];
    this.name = options.name;
    this.preset = options.preset;
    this.bypass = options.bypass !== false;
    this.prefix = options.kv?.prefix;
    this.isolate = options.isolate !== false;
    /* a non-finite TTL is none: the LRU then keeps the entry until it is evicted or invalidated */
    this.lru = new LruCache<string, Stored<V>>({
      maxSize: options.maxSize,
      ...(Number.isFinite(hardS) ? { hardTtlMs: hardS * MS } : {}),
      ...(Number.isFinite(softS) ? { ttlMs: softS * MS } : {}),
    });
  }

  /** 3-tier lookup; undefined when every tier misses. */
  async get(key: string, ctx: CacheCtx, options: GetOptions<V>): Promise<V | undefined> {
    const kv = this.resolveKv(options.kv, key);
    const bypassed = this.bypass && ctx.cacheRequest?.bypass === true;
    if (!bypassed) {
      const cached = await this.cached(key, ctx, { background: ctx.background, fetch: options.fetch, kv });
      if (cached !== undefined) return cached.v;
    }
    const stored = await this.load(key, { background: ctx.background, fetch: options.fetch, kv });
    this.trace(ctx, stored?.at ?? Date.now(), {
      stale: false,
      stored: stored !== undefined,
      tier: bypassed ? "bypass" : "origin",
    });
    return stored?.v;
  }

  /** Remove from all tiers. Its KV delete runs in the background; await it only where a read must not race it. */
  invalidate(key: string, options?: InvalidateOptions): Promise<void> {
    this.lru.delete(key);
    const kv = this.resolveKv(options?.kv, key);
    if (options === undefined || kv === undefined) return Promise.resolve();
    const deleted = kv.del();
    options.background(deleted);
    return deleted;
  }

  /** Update all tiers with a value a write just returned. */
  set(key: string, value: V, options?: SetOptions): void {
    const stored = { at: Date.now(), v: value };
    this.remember(key, stored);
    const kv = this.resolveKv(options?.kv, key);
    if (options !== undefined && kv !== undefined) options.background(kv.put(stored));
  }

  /** Current LRU size. */
  get size(): number {
    return this.lru.size;
  }

  /** The LRU's copy, else KV's while it is within the hard TTL; a stale one is revalidated behind it. */
  private async cached(key: string, ctx: CacheCtx, source: CacheSource<V>): Promise<Stored<V> | undefined> {
    const inMemory = this.isolate ? this.lru.getWithMeta(key) : undefined;
    const hit = inMemory?.value ?? (source.kv === undefined ? undefined : await this.fromKv(key, source.kv));
    if (hit === undefined) return undefined;
    const stale = inMemory?.stale ?? this.isStale(hit);
    if (stale) ctx.background(this.revalidate(key, source));
    this.trace(ctx, hit.at, { stale, stored: true, tier: inMemory === undefined ? "kv" : "lru" });
    return hit;
  }

  private async fromKv(key: string, kv: KvOps<V>): Promise<Stored<V> | undefined> {
    const stored = await kv.get();
    if (stored === null || !this.isAlive(stored)) return undefined;
    this.remember(key, stored);
    return stored;
  }

  /** Background SWR: KV's copy while it is itself fresh, else the source. */
  private async revalidate(key: string, source: CacheSource<V>): Promise<void> {
    const copy = source.kv === undefined ? null : await source.kv.get();
    if (copy !== null && this.isAlive(copy) && !this.isStale(copy)) {
      this.remember(key, copy);
      return;
    }
    const stored = await this.load(key, source);
    if (stored === undefined) this.lru.delete(key);
  }

  /** The source's value, timed from before the read, written to every tier. */
  private async load(key: string, source: CacheSource<V>): Promise<Stored<V> | undefined> {
    const at = Date.now();
    const value = await source.fetch();
    if (value === undefined) return undefined;
    const stored = { at, v: value };
    this.remember(key, stored);
    if (source.kv !== undefined) source.background(source.kv.put(stored));
    return stored;
  }

  private trace(ctx: CacheCtx, storedAt: number, read: Omit<CacheTraceEntry, "cache" | "storedAt">): void {
    ctx.cacheRequest?.trace.push({ cache: this.name, ...read, storedAt });
  }

  private isAlive(stored: Stored<V>): boolean {
    return typeof stored.at === "number" && Date.now() - stored.at <= CACHE_PRESETS[this.preset].hardS * MS;
  }

  private isStale(stored: Stored<V>): boolean {
    return Date.now() - stored.at > CACHE_PRESETS[this.preset].softS * MS;
  }

  private remember(key: string, stored: Stored<V>): void {
    if (this.isolate) this.lru.setAt(key, stored, stored.at);
  }

  private resolveKv(ns: TieredCacheKv | undefined, key: string): KvOps<V> | undefined {
    return resolveKvOps<V>({ key, ns, prefix: this.prefix, preset: this.preset });
  }
}
