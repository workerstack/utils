import type { TieredCacheKv } from "../tiered-cache.types.ts";

const KEY_LIMIT_BYTES = 512;

function guarded<T>(key: string, run: () => T): Promise<T> {
  const bytes = new TextEncoder().encode(key).length;

  if (bytes > KEY_LIMIT_BYTES) {
    return Promise.reject(new Error(`KV failed: 414 UTF-8 encoded length of ${bytes} exceeds key length limit of 512.`));
  }

  return Promise.resolve(run());
}

/** Workers KV in memory: rows and their TTLs, and a 414 for a key over 512 UTF-8 bytes. */
export function fakeKv(): { kv: TieredCacheKv; store: Map<string, string>; ttls: Map<string, number | undefined> } {
  const store = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();

  const kv: TieredCacheKv = {
    delete: (key) =>
      guarded(key, () => {
        store.delete(key);
      }),
    get: (key) => guarded(key, () => store.get(key) ?? null),
    put: (key, value, options) =>
      guarded(key, () => {
        store.set(key, value);
        ttls.set(key, options?.expirationTtl);
      }),
  };

  return { kv, store, ttls };
}
