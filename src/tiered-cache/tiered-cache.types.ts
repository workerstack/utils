export type CachePreset = "IMMUTABLE" | "LONG" | "SHORT" | "STANDARD";

export type CachePresetTtl = { readonly hardS: number; readonly softS: number };

/** Where one read's answer came from: memory, KV, the source, or the source past both on a bypass. */
export type CacheTier = "bypass" | "kv" | "lru" | "origin";

/**
 * One cache read of a request, for `Cache-Status` and `Age`.
 * `stored`: whether the answer is now in the cache (a source that found nothing stores nothing).
 */
export type CacheTraceEntry = {
  cache: string;
  stale: boolean;
  stored: boolean;
  storedAt: number;
  tier: CacheTier;
};

/**
 * What a request lets its cache reads do, decided once at the request's edge: whether it may skip
 * every cache, and where the reads report.
 */
export type CacheRequest = { bypass: boolean; trace: CacheTraceEntry[] };

export type TieredCacheOptions = {
  /** Named in each read's trace, and so in `Cache-Status`. */
  name: string;
  preset: CachePreset;
  /** Honor a request's bypass (default). Off for public reads no caller may force to the source. */
  bypass?: boolean;
  /**
   * Keep entries in the isolate's memory (default). Off for values a user changes and must see
   * changed on their next request: another isolate's memory would still answer the old one.
   */
  isolate?: boolean;
  /** L2 KV, under this key prefix. Omit for memory-only caches. */
  kv?: { prefix: string };
  /** Maximum LRU entries. */
  maxSize: number;
};

/** The KV calls the cache makes (JSON values it wrote itself): a Workers `KVNamespace` is one. */
export interface TieredCacheKv {
  delete(key: string): Promise<void>;
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export type Background = (p: Promise<unknown>) => void;

export type CacheCtx = { background: Background; cacheRequest?: CacheRequest };

export type GetOptions<V> = {
  /** L3: source-of-truth fetch (DB query). Return undefined on miss. */
  fetch: () => Promise<V | undefined>;
  /** L2: KV namespace. Only used when the cache has a kv config. */
  kv?: TieredCacheKv;
};

export type SetOptions = { background: Background; kv?: TieredCacheKv };

export type InvalidateOptions = SetOptions;

/** A value and when it was read from the source (ms since epoch), in memory and in KV alike. */
export type Stored<V> = { at: number; v: V };

export type KvOps<V> = {
  del: () => Promise<void>;
  get: () => Promise<Stored<V> | null>;
  put: (stored: Stored<V>) => Promise<void>;
};

export type CacheSource<V> = {
  background: Background;
  fetch: () => Promise<V | undefined>;
  kv: KvOps<V> | undefined;
};
