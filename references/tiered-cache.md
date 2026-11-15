---
description: Memory, KV and source cache
order: 30
---

# Tiered cache

`@workerstack/utils/tiered-cache` exports `TieredCache`, which reads a key from memory first, then from Workers KV, then from the source you give it. It writes what it finds back to the tiers above.

```ts
import { CACHE_PRESETS, TieredCache, asksBypass } from "@workerstack/utils/tiered-cache";
import type { CacheRequest, HeaderReader, TieredCacheKv } from "@workerstack/utils/tiered-cache";

type User = { id: string; name: string };

declare const env: { CACHE: TieredCacheKv };
declare const ctx: { waitUntil(promise: Promise<unknown>): void };
declare const request: { headers: HeaderReader };
declare function loadUser(id: string): Promise<User | undefined>;

const users = new TieredCache<User>({ kv: { prefix: "user:" }, maxSize: 500, name: "users", preset: "STANDARD" });

const cacheRequest: CacheRequest = { bypass: asksBypass(request.headers), trace: [] };
const background = (promise: Promise<unknown>): void => ctx.waitUntil(promise);

export const user: User | undefined = await users.get("42", { background, cacheRequest }, { fetch: () => loadUser("42"), kv: env.CACHE });

cacheRequest.trace; // one entry for this read, naming the tier that answered

CACHE_PRESETS.STANDARD; // { hardS: 600, softS: 120 }
```

- **Presets.** Every tier keeps a value for its preset's TTLs, in seconds: `SHORT` (30 s soft, 60 s hard), `STANDARD` (120 s, 600 s), `LONG` (1 h, 1 day) and `IMMUTABLE` (never). Past the soft TTL a value is still served once, and a revalidation starts in the background. Past the hard TTL no tier serves it.
- **KV.** Set `kv.prefix` to use KV, and pass a Workers `KVNamespace` as `kv` on each read. Leave `kv` out for a memory-only cache. A key over KV's 512-byte limit skips KV.
- **Memory.** Set `isolate: false` for values a user changes and must see changed on their next request, since another isolate's memory would still hold the old one.
- **Bypass.** `asksBypass(headers)` is true for `x-fresh: 1` or a `Cache-Control` with `no-cache`. A bypassed read asks the source, then refills the tiers. Set `bypass: false` on a cache no caller may force to the source.
- **Trace.** Each read appends one entry to `cacheRequest.trace`: the cache's `name`, the tier that answered, whether it was stale, and when the value was read from the source. Use it to write `Cache-Status` and `Age`.
- **Writes.** `set(key, value, { background, kv })` stores a value, and `invalidate(key, { background, kv })` deletes it from every tier.
- **Source.** `fetch` returns `undefined` when the source has nothing. Nothing is stored then.
