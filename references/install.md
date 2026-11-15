---
description: Install and import a utility
order: 10
---

# Install

```sh
bun add @workerstack/utils
```

Each utility is its own subpath export. Import only the one you need: the others are never loaded, and a bundler drops them.

| Import | What it is |
| --- | --- |
| `@workerstack/utils/lru-cache` | A size-bound LRU cache with soft and hard TTLs, for stale-while-revalidate |
| `@workerstack/utils/tiered-cache` | A memory, Workers KV and source cache on one TTL preset, with a request bypass and a trace |
