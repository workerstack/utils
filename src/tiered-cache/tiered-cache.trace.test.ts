import { describe, expect, it, vi } from "vitest";

import { useFakeClock } from "../__fixtures__/use-fake-clock.ts";
import { cacheCtx } from "./__fixtures__/cache-ctx.ts";
import { cacheOptions } from "./__fixtures__/cache-options.ts";
import { fakeKv } from "./__fixtures__/fake-kv.ts";
import { type CacheRequest, type CacheTraceEntry, TieredCache } from "./index.ts";

const S = 1000;

function traced(): CacheRequest {
  return { bypass: false, trace: [] };
}

function entry(tier: CacheTraceEntry["tier"], read: Partial<CacheTraceEntry> = {}): CacheTraceEntry {
  return { cache: "test", stale: false, stored: true, storedAt: 0, tier, ...read };
}

useFakeClock();

describe("a request that may bypass", () => {
  it("asks the source past both tiers, refills them, and traces each tier", async () => {
    const { kv } = fakeKv();
    const cache = new TieredCache<string>(cacheOptions("STANDARD"));
    const plain = traced();

    await cache.get("k", cacheCtx(plain), { fetch: () => Promise.resolve("v1"), kv });
    vi.setSystemTime(5 * S);
    await cache.get("k", cacheCtx(plain), { fetch: () => Promise.resolve("v2"), kv });

    const bypass: CacheRequest = { bypass: true, trace: [] };

    await expect(cache.get("k", cacheCtx(bypass), { fetch: () => Promise.resolve("v2"), kv })).resolves.toBe("v2");
    expect(plain.trace).toStrictEqual([entry("origin"), entry("lru")]);
    expect(bypass.trace).toStrictEqual([entry("bypass", { storedAt: 5 * S })]);
    await expect(cache.get("k", cacheCtx(), { fetch: () => Promise.resolve("v3"), kv })).resolves.toBe("v2");
  });

  it("is answered from the cache when the cache was built with bypass off", async () => {
    const { kv } = fakeKv();
    const cache = new TieredCache<string>(cacheOptions("LONG", { bypass: false }));

    await cache.get("all", cacheCtx(), { fetch: () => Promise.resolve("catalog"), kv });

    const asked: CacheRequest = { bypass: true, trace: [] };

    await expect(cache.get("all", cacheCtx(asked), { fetch: () => Promise.resolve("call"), kv })).resolves.toBe(
      "catalog",
    );
    expect(asked.trace).toStrictEqual([entry("lru")]);
  });
});

describe("the trace", () => {
  it("names a KV answer, and a stale one past the soft TTL", async () => {
    const { kv } = fakeKv();
    const ctx = cacheCtx();

    await new TieredCache<string>(cacheOptions("STANDARD")).get("k", ctx, { fetch: () => Promise.resolve("r"), kv });
    await ctx.settle();

    const cache = new TieredCache<string>(cacheOptions("STANDARD"));
    const fromKv = traced();
    const stale = traced();

    await cache.get("k", cacheCtx(fromKv), { fetch: () => Promise.resolve("r"), kv });
    vi.setSystemTime(121 * S);
    await cache.get("k", cacheCtx(stale), { fetch: () => Promise.resolve("r"), kv });

    expect(fromKv.trace).toStrictEqual([entry("kv")]);
    expect(stale.trace).toStrictEqual([entry("lru", { stale: true })]);
  });

  it("marks a source that found nothing as stored nowhere", async () => {
    const { kv } = fakeKv();
    const read = traced();
    const cache = new TieredCache<string>(cacheOptions("LONG"));

    await expect(cache.get("missing", cacheCtx(read), { fetch: () => Promise.resolve(undefined), kv })).resolves.toBe(
      undefined,
    );
    expect(read.trace).toStrictEqual([entry("origin", { stored: false })]);
  });
});
