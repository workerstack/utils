import { isStored } from "./is-stored.ts";
import { CACHE_PRESETS, KV_MAX_KEY_BYTES } from "./tiered-cache.constants.ts";
import type { CachePreset, KvOps, TieredCacheKv } from "./tiered-cache.types.ts";

/**
 * KV operations for `key`, under `<prefix>v2:` so values written before the stored-at envelope
 * are never read. Keys past the KV limit (often user input such as a slug) skip L2.
 */
export function resolveKvOps<V>(target: {
  key: string;
  ns: TieredCacheKv | undefined;
  prefix: string | undefined;
  preset: CachePreset;
}): KvOps<V> | undefined {
  const { key, ns, prefix, preset } = target;

  if (ns === undefined || prefix === undefined) return undefined;

  const fullKey = `${prefix}v2:${key}`;

  if (new TextEncoder().encode(fullKey).length > KV_MAX_KEY_BYTES) return undefined;

  const { hardS } = CACHE_PRESETS[preset];
  // KV refuses a non-finite TTL: an IMMUTABLE row is written without one
  const putOptions = Number.isFinite(hardS) ? { expirationTtl: hardS } : undefined;

  return {
    del: () => ns.delete(fullKey),
    get: async () => {
      const text = await ns.get(fullKey);
      const row: unknown = text === null ? null : JSON.parse(text);

      return isStored<V>(row) ? row : undefined;
    },
    put: (stored) => ns.put(fullKey, JSON.stringify(stored), putOptions),
  };
}
