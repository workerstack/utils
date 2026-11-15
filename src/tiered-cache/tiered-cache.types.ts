/** A named TTL pair from `CACHE_PRESETS`; every tier of one cache expires on it. */
export type CachePreset = "IMMUTABLE" | "LONG" | "SHORT" | "STANDARD";

/** A preset's TTLs, in seconds; `Infinity` for one that never expires. */
export type CachePresetTtl = {
  /** The most stale an answer can be: past it no tier serves the value, and KV drops the row. */
  readonly hardS: number;
  /** When a value goes stale: it is still served, once, by the read that revalidates it. */
  readonly softS: number;
};

/** Where one read's answer came from: memory, KV, the source, or the source past both on a bypass. */
export type CacheTier = "bypass" | "kv" | "lru" | "origin";

/** One cache read of a request, for `Cache-Status` and `Age`. */
export type CacheTraceEntry = {
  /** The cache's `name`. */
  cache: string;
  /** Whether the answer was past its soft TTL, so a revalidation started behind it. */
  stale: boolean;
  /** Whether the answer is now in the cache: a source that found nothing stores nothing. */
  stored: boolean;
  /** When the answer was read from the source, in ms since epoch: `Age` is now minus this. */
  storedAt: number;
  /** Which tier answered. */
  tier: CacheTier;
};

/**
 * What a request lets its cache reads do, decided once at the request's edge: whether it may skip
 * every cache, and where the reads report.
 */
export type CacheRequest = {
  /** Skip every tier and ask the source, then refill the tiers; `asksBypass` reads it from headers. */
  bypass: boolean;
  /** Each cache read of the request appends one entry here. */
  trace: CacheTraceEntry[];
};

/** How a `TieredCache` stores its values. */
export type TieredCacheOptions = {
  /** Named in each read's trace, and so in `Cache-Status`. */
  name: string;
  /** The TTLs every tier keeps a value for. */
  preset: CachePreset;
  /** Honor a request's bypass (default). Off for public reads no caller may force to the source. */
  bypass?: boolean;
  /**
   * Keep entries in the isolate's memory (default). Off for values a user changes and must see
   * changed on their next request: another isolate's memory would still answer the old one.
   */
  isolate?: boolean;
  /** L2 KV config. Omit for memory-only caches. */
  kv?: {
    /** Starts every KV key of this cache, so caches sharing one namespace never collide. */
    prefix: string;
  };
  /** Maximum LRU entries. */
  maxSize: number;
};

/** The KV calls the cache makes, on JSON text it wrote itself: a Workers `KVNamespace` is one. */
export type TieredCacheKv = {
  /** Remove the row; resolves whether or not it existed. */
  delete(key: string): Promise<void>;
  /** The row's text, or null when absent. */
  get(key: string): Promise<string | null>;
  /** Write the row, expiring after `expirationTtl` seconds when given. */
  put(
    key: string,
    value: string,
    options?: {
      /** Seconds until KV drops the row; at least 60 on Workers KV. */
      expirationTtl?: number;
    },
  ): Promise<void>;
};

/** Keeps a promise running past the response, as a Worker's `ctx.waitUntil` does. */
export type Background = (p: Promise<unknown>) => void;

/** The request a read runs in. */
export type CacheCtx = {
  /** Runs KV writes and revalidations after the answer is returned. */
  background: Background;
  /** The request's bypass and trace; omitted, reads never bypass and trace nowhere. */
  cacheRequest?: CacheRequest;
};

/** Where a `get` looks past memory. */
export type GetOptions<V> = {
  /** L3: source-of-truth fetch (DB query). Return undefined on miss. */
  fetch: () => Promise<V | undefined>;
  /** L2: KV namespace. Only used when the cache has a kv config. */
  kv?: TieredCacheKv;
};

/** Where a `set` writes past memory. */
export type SetOptions = {
  /** Runs the KV write after the caller moves on. */
  background: Background;
  /** L2: KV namespace. Only used when the cache has a kv config. */
  kv?: TieredCacheKv;
};

/** Where an `invalidate` deletes past memory; the same as a `set`'s. */
export type InvalidateOptions = SetOptions;

/** The headers `asksBypass` reads: a Fetch `Headers` is one. */
export type HeaderReader = {
  /** The header's value, or null when absent. Names are case-insensitive. */
  get(name: string): string | null;
};

/** A value and when it was read from the source (ms since epoch), in memory and in KV alike. */
export type Stored<V> = { at: number; v: V };

/** The KV calls for one key of one cache. */
export type KvOps<V> = {
  del: () => Promise<void>;
  get: () => Promise<Stored<V> | undefined>;
  put: (stored: Stored<V>) => Promise<void>;
};

/** Where a miss or a revalidation reads, and where it writes back. */
export type CacheSource<V> = {
  background: Background;
  fetch: () => Promise<V | undefined>;
  kv: KvOps<V> | undefined;
};
