import type { LruCacheOptions, LruEntry, LruMeta } from "./lru-cache.types.ts";

/**
 * LRU (Least Recently Used) cache with optional TTL and stale-while-revalidate.
 * Bounds cache size and auto-evicts expired entries.
 *
 * When `hardTtlMs` is set, `getWithMeta()` returns stale entries between soft and hard expiry,
 * so callers can serve stale data while revalidating in the background.
 */
export class LruCache<K, V> {
  private readonly cache = new Map<K, LruEntry<V>>();
  private readonly hardTtlMs: number | undefined;
  private readonly maxSize: number;
  private readonly ttlMs: number | undefined;

  /** An empty cache; its TTLs apply to every entry set without its own. */
  constructor(options: LruCacheOptions) {
    this.maxSize = options.maxSize;
    this.ttlMs = options.ttlMs;
    this.hardTtlMs = options.hardTtlMs;
  }

  /** The number of entries, expired ones not yet evicted included. */
  get size(): number {
    return this.cache.size;
  }

  /** The value, or undefined when missing or past soft expiry. Marks the key most recently used. */
  get(key: K): V | undefined {
    const entry = this.fresh(key);

    if (entry === undefined) return undefined;

    this.touch(key, entry);

    return entry.value;
  }

  /**
   * The value with its staleness, for stale-while-revalidate:
   * - before soft expiry: `{ value, stale: false }`
   * - between soft and hard expiry: `{ value, stale: true }`
   * - after hard expiry or not found: undefined
   */
  getWithMeta(key: K): LruMeta<V> | undefined {
    const entry = this.cache.get(key);

    if (entry === undefined) return undefined;

    const now = Date.now();

    if (now > entry.hardExpiry) {
      this.cache.delete(key);

      return undefined;
    }

    this.touch(key, entry);

    return { stale: now > entry.softExpiry, value: entry.value };
  }

  /** Set a value, evicting the least recently used entry when full. `ttlMs` overrides the soft TTL. */
  set(key: K, value: V, ttlMs?: number): void {
    this.insert(key, value, { soft: ttlMs ?? this.ttlMs, storedAt: Date.now() });
  }

  /**
   * Set a value read at `storedAt` (ms since epoch): its soft and hard expiry run from then, not
   * from now, so a copy reloaded from another tier never gets a new window.
   */
  setAt(key: K, value: V, storedAt: number): void {
    this.insert(key, value, { soft: this.ttlMs, storedAt });
  }

  /** Delete a key; whether it was there. */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /** Remove every entry. */
  clear(): void {
    this.cache.clear();
  }

  /** Whether the key is present and not past soft expiry. Does not mark it used. */
  has(key: K): boolean {
    return this.fresh(key) !== undefined;
  }

  /** The entry while it is before soft expiry; one past hard expiry is evicted. */
  private fresh(key: K): LruEntry<V> | undefined {
    const entry = this.cache.get(key);

    if (entry === undefined) return undefined;

    const now = Date.now();

    if (now <= entry.softExpiry) return entry;

    if (now > entry.hardExpiry) this.cache.delete(key);

    return undefined;
  }

  /** Move to the end of the Map's insertion order: the most recently used. */
  private touch(key: K, entry: LruEntry<V>): void {
    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  private insert(key: K, value: V, ttl: { soft: number | undefined; storedAt: number }): void {
    this.cache.delete(key);

    if (this.cache.size >= this.maxSize) this.evictOldest();

    const softExpiry = ttl.soft === undefined ? Number.POSITIVE_INFINITY : ttl.storedAt + ttl.soft;
    const hardExpiry = this.hardTtlMs === undefined ? softExpiry : ttl.storedAt + this.hardTtlMs;

    this.cache.set(key, { hardExpiry, softExpiry, value });
  }

  /** Drop the Map's first key: the least recently used. */
  private evictOldest(): void {
    const oldest = this.cache.keys().next();

    if (oldest.done !== true) this.cache.delete(oldest.value);
  }
}
