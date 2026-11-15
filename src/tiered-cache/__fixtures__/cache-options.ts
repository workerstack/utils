import type { CachePreset, TieredCacheOptions } from "../tiered-cache.types.ts";

/** A KV-backed cache named "test" under the "t:" prefix, on `preset`, with `overrides` on top. */
export function cacheOptions(preset: CachePreset, overrides: Partial<TieredCacheOptions> = {}): TieredCacheOptions {
  return { kv: { prefix: "t:" }, maxSize: 10, name: "test", preset, ...overrides };
}
