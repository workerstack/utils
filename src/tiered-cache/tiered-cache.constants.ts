import type { CachePreset, CachePresetTtl } from "./tiered-cache.types.ts";

export const NO_CACHE = "no-cache";
export const FLAG_ON = "1";

/** Workers KV rejects keys over 512 UTF-8 bytes (414). */
export const KV_MAX_KEY_BYTES = 512;

export const MS = 1000;

/**
 * How long a cache keeps a value, in seconds. Soft is when it is revalidated in the background;
 * hard is the most stale an answer can ever be, since an entry past soft is still served once, to
 * the read that revalidates it. SHORT's hard TTL is KV's 60 s floor. IMMUTABLE is for a value
 * that never changes once it exists: no tier expires it, only an invalidation removes it.
 */
export const CACHE_PRESETS: Readonly<Record<CachePreset, CachePresetTtl>> = {
  IMMUTABLE: { hardS: Number.POSITIVE_INFINITY, softS: Number.POSITIVE_INFINITY },
  LONG: { hardS: 86_400, softS: 3600 },
  SHORT: { hardS: 60, softS: 30 },
  STANDARD: { hardS: 600, softS: 120 },
};
