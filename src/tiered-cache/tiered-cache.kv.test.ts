import type { KVNamespace } from "@cloudflare/workers-types/index.ts";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { useFakeClock } from "../__fixtures__/use-fake-clock.ts";
import { cacheCtx } from "./__fixtures__/cache-ctx.ts";
import { cacheOptions } from "./__fixtures__/cache-options.ts";
import { fakeKv } from "./__fixtures__/fake-kv.ts";
import { TieredCache, type TieredCacheKv } from "./index.ts";

const S = 1000;

useFakeClock();

describe("the KV a cache takes", () => {
  it("is what a Workers KVNamespace is", () => {
    expectTypeOf<KVNamespace>().toExtend<TieredCacheKv>();
  });

  it("is skipped for a key past KV's 512-byte limit, which the source answers instead", async () => {
    const { kv, store } = fakeKv();
    const ctx = cacheCtx();
    const cache = new TieredCache<string>(cacheOptions("LONG"));
    const longKey = `${"x".repeat(600)}:en`;

    await expect(cache.get(longKey, ctx, { fetch: () => Promise.resolve(undefined), kv })).resolves.toBeUndefined();
    await expect(cache.get(longKey, ctx, { fetch: () => Promise.resolve("row"), kv })).resolves.toBe("row");
    await ctx.settle();

    expect(store.size).toBe(0);
    await expect(cache.invalidate(longKey, { background: ctx.background, kv })).resolves.toBeUndefined();
  });

  it("answers no row the cache did not write, and the source fills it", async () => {
    const { kv, store } = fakeKv();

    store.set("t:v2:k", '{"value":"foreign"}');

    const cache = new TieredCache<string>(cacheOptions("STANDARD", { isolate: false }));

    await expect(cache.get("k", cacheCtx(), { fetch: () => Promise.resolve("source"), kv })).resolves.toBe("source");
  });
});

describe("a revalidation", () => {
  it("takes KV's copy when another isolate already refreshed it, without asking the source", async () => {
    const { kv } = fakeKv();
    const cache = new TieredCache<string>(cacheOptions("STANDARD"));
    const ctx = cacheCtx();

    await cache.get("k", ctx, { fetch: () => Promise.resolve("old"), kv });
    await ctx.settle();
    vi.setSystemTime(121 * S);
    new TieredCache<string>(cacheOptions("STANDARD")).set("k", "refreshed", { background: ctx.background, kv });

    const fetch = vi.fn<() => Promise<string>>(() => Promise.resolve("source"));

    await expect(cache.get("k", ctx, { fetch, kv })).resolves.toBe("old");
    await ctx.settle();

    expect(fetch).not.toHaveBeenCalled();
    await expect(cache.get("k", ctx, { fetch, kv })).resolves.toBe("refreshed");
  });
});

describe("a cache without the isolate tier", () => {
  it("reads what another isolate wrote, so a user sees their own change on the next request", async () => {
    const { kv } = fakeKv();
    const ctx = cacheCtx();
    const reader = new TieredCache<{ dismissed: boolean }>(cacheOptions("STANDARD", { isolate: false }));
    const writer = new TieredCache<{ dismissed: boolean }>(cacheOptions("STANDARD", { isolate: false }));
    let source = { dismissed: false };

    await expect(reader.get("u", ctx, { fetch: () => Promise.resolve(source), kv })).resolves.toStrictEqual(source);
    source = { dismissed: true };
    await writer.invalidate("u", { background: ctx.background, kv });
    writer.set("u", source, { background: ctx.background, kv });
    await ctx.settle();

    await expect(reader.get("u", ctx, { fetch: () => Promise.resolve(source), kv })).resolves.toStrictEqual({
      dismissed: true,
    });
    expect(reader.size).toBe(0);
  });
});
