import { describe, expect, it, vi } from "vitest";

import { useFakeClock } from "../__fixtures__/use-fake-clock.ts";
import { cacheCtx } from "./__fixtures__/cache-ctx.ts";
import { cacheOptions } from "./__fixtures__/cache-options.ts";
import { fakeKv } from "./__fixtures__/fake-kv.ts";
import { TieredCache } from "./index.ts";

const S = 1000;

function fetchNew(): Promise<string> {
  return Promise.resolve("new");
}

function ignore(): void {
  // a background the test never awaits
}

useFakeClock();

describe("the hard TTL as a staleness bound", () => {
  it("never lets a KV copy reloaded into another isolate outlive it, from when it was read", async () => {
    const { kv } = fakeKv();
    const ctx = cacheCtx();

    await new TieredCache<string>(cacheOptions("STANDARD")).get("k", ctx, { fetch: () => Promise.resolve("old"), kv });
    await ctx.settle();

    const second = new TieredCache<string>(cacheOptions("STANDARD"));
    vi.setSystemTime(590 * S);
    await expect(second.get("k", ctx, { fetch: fetchNew, kv })).resolves.toBe("old");
    vi.setSystemTime(601 * S);
    await expect(second.get("k", ctx, { fetch: fetchNew, kv })).resolves.toBe("new");
  });

  it("times a value from before its fetch, so a read that raced a write dies at its own hard TTL", async () => {
    const { kv, store } = fakeKv();
    const ctx = cacheCtx();
    const cache = new TieredCache<string>(cacheOptions("STANDARD"));

    function slowRead(): Promise<string> {
      vi.setSystemTime(10 * S);

      return Promise.resolve("read before the write");
    }

    await cache.get("k", ctx, { fetch: slowRead, kv });
    await ctx.settle();
    expect(store.get("t:v2:k")).toBe('{"at":0,"v":"read before the write"}');

    vi.setSystemTime(600 * S + 1);
    await expect(cache.get("k", ctx, { fetch: () => Promise.resolve("fresh"), kv })).resolves.toBe("fresh");
  });
});

describe("an invalidation whose KV delete never lands", () => {
  it("still leaves the old value no longer than the hard TTL", async () => {
    const { kv } = fakeKv();
    const ctx = cacheCtx();
    const cache = new TieredCache<string>(cacheOptions("STANDARD"));

    await cache.get("k", ctx, { fetch: () => Promise.resolve("old"), kv });
    await ctx.settle();

    const lost = { ...kv, delete: (): Promise<void> => new Promise<void>(ignore) };

    void cache.invalidate("k", { background: ignore, kv: lost });
    vi.setSystemTime(601 * S);

    const other = new TieredCache<string>(cacheOptions("STANDARD"));

    await expect(other.get("k", ctx, { fetch: () => Promise.resolve("new"), kv })).resolves.toBe("new");
  });
});

describe("a stale entry", () => {
  it("is served once, then refreshed from the source when KV's copy is stale too", async () => {
    const { kv, store } = fakeKv();
    const cache = new TieredCache<string>(cacheOptions("STANDARD"));
    const first = cacheCtx();

    await cache.get("k", first, { fetch: () => Promise.resolve("old"), kv });
    await first.settle();
    vi.setSystemTime(121 * S);

    const stale = cacheCtx();

    await expect(cache.get("k", stale, { fetch: () => Promise.resolve("new"), kv })).resolves.toBe("old");
    await stale.settle();

    expect(store.get("t:v2:k")).toBe(`{"at":${121 * S},"v":"new"}`);
    await expect(cache.get("k", cacheCtx(), { fetch: () => Promise.resolve("newer"), kv })).resolves.toBe("new");
  });
});
