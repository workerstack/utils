/** One cached value and when it stops being fresh (soft) and when it is dropped (hard), in ms since epoch. */
export type LruEntry<V> = { hardExpiry: number; softExpiry: number; value: V };

/** A value and whether it is past its soft TTL, for stale-while-revalidate. */
export type LruMeta<V> = {
  /** True between soft and hard expiry: serve it, and revalidate it behind the answer. */
  stale: boolean;
  /** The cached value, the same reference that was set. */
  value: V;
};

/** How many entries an `LruCache` keeps and how long each one lives. */
export type LruCacheOptions = {
  /** Hard TTL in ms: an entry is evicted after this, even by `getWithMeta()`. Defaults to the soft TTL. */
  hardTtlMs?: number;
  /** Maximum number of entries; setting one more evicts the least recently used. */
  maxSize: number;
  /** Soft TTL in ms: an entry is stale after this, and a miss for `get()`. Omitted, entries never go stale. */
  ttlMs?: number;
};
