/** One cached value and when it stops being fresh (soft) and when it is dropped (hard), in ms since epoch. */
export type LruEntry<V> = { hardExpiry: number; softExpiry: number; value: V };

/** A value and whether it is past its soft TTL, for stale-while-revalidate. */
export type LruMeta<V> = { stale: boolean; value: V };

export type LruCacheOptions = {
  /** Hard TTL: an entry is evicted after this, even by `getWithMeta()`. */
  hardTtlMs?: number;
  /** Maximum number of entries. */
  maxSize: number;
  /** Soft TTL: an entry is stale after this, and a miss for `get()`. */
  ttlMs?: number;
};
