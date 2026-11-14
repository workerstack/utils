# utils

Small helpers, one subpath export each, optional peers.

Every utility is its own subpath export: import the one you need, the rest is never loaded and is tree-shaken from your bundle.

```sh
bun add @workerstack/utils
```

| Import | What it is |
| --- | --- |
| `@workerstack/utils/lru-cache` | Bounded LRU cache with soft and hard TTLs for stale-while-revalidate |
| `@workerstack/utils/tiered-cache` | Isolate LRU → Workers KV → source cache on a TTL preset, with request bypass and tracing |

```ts
import { LruCache } from "@workerstack/utils/lru-cache";

const cache = new LruCache<string, number>({ maxSize: 100, ttlMs: 30_000, hardTtlMs: 60_000 });
cache.set("a", 1);
cache.getWithMeta("a"); // { value: 1, stale: false }
```

```ts
import { TieredCache } from "@workerstack/utils/tiered-cache";

const users = new TieredCache<User>({ name: "users", preset: "STANDARD", maxSize: 500, kv: { prefix: "user:" } });

const user = await users.get(id, { background: ctx.waitUntil.bind(ctx) }, { kv: env.CACHE, fetch: () => db.user(id) });
```

## Development

```sh
bun install
bun run fmt:check && bun run lint && bun run typecheck && bun run test && bun run build
```

## License

MIT
