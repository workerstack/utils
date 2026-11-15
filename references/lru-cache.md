---
description: LRU cache, soft and hard TTLs
order: 20
---

# LRU cache

`@workerstack/utils/lru-cache` exports `LruCache`, a cache that holds at most `maxSize` entries and drops the least recently used one when full.

```ts
import { LruCache } from "@workerstack/utils/lru-cache";

const cache = new LruCache<string, number>({ hardTtlMs: 60_000, maxSize: 100, ttlMs: 30_000 });

cache.set("a", 1);
cache.get("a"); // 1, until 30 s have passed
cache.getWithMeta("a"); // { stale: false, value: 1 }; stale: true from 30 s to 60 s; undefined after
```

- `ttlMs` is the soft TTL. Past it, `get` and `has` treat the entry as missing. Leave it out and entries never expire.
- `hardTtlMs` is the hard TTL. Between the soft and the hard TTL, `getWithMeta` still returns the value with `stale: true`, so you can serve it while you fetch a new one. Leave it out and the hard TTL equals the soft one.
- `set(key, value, ttlMs)` takes its own soft TTL for that one entry.
- `setAt(key, value, storedAt)` stores a value read at `storedAt` (ms since epoch). Its TTLs run from then, so a copy reloaded from another tier never gets a new window.
- `get` and `getWithMeta` mark the key as most recently used. `has` does not.
