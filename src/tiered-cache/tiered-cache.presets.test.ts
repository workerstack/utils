import { describe, expect, it, vi } from "vitest";

import { useFakeClock } from "../__fixtures__/use-fake-clock.ts";
import { cacheCtx } from "./__fixtures__/cache-ctx.ts";
import { cacheOptions } from "./__fixtures__/cache-options.ts";
import { fakeKv } from "./__fixtures__/fake-kv.ts";
import { type CachePreset, TieredCache } from "./index.ts";

const DAY_MS = 86_400_000;

useFakeClock();

describe("a preset's hard TTL", () => {
  it.each<[CachePreset, number]>([
    ["SHORT", 60],
    ["STANDARD", 600],
    ["LONG", 86_400],
  ])("expires a %s row in KV after %i s", async (preset, expirationTtl) => {
    const { kv, ttls } = fakeKv();
    const ctx = cacheCtx();

    await new TieredCache<string>(cacheOptions(preset)).get("k", ctx, { fetch: () => Promise.resolve("row"), kv });
    await ctx.settle();

    expect(ttls.get("t:v2:k")).toBe(expirationTtl);
  });
});

describe("the IMMUTABLE preset", () => {
  it("writes its KV row with no expiry", async () => {
    const { kv, ttls } = fakeKv();
    const ctx = cacheCtx();

    await new TieredCache<string>(cacheOptions("IMMUTABLE")).get("k", ctx, { fetch: () => Promise.resolve("v"), kv });
    await ctx.settle();

    expect([...ttls.entries()]).toStrictEqual([["t:v2:k", undefined]]);
  });

  it("never revalidates a value, from memory or from KV, however old", async () => {
    const { kv } = fakeKv();
    const fetch = vi.fn<() => Promise<string>>(() => Promise.resolve("org_1"));
    const ctx = cacheCtx();

    await new TieredCache<string>(cacheOptions("IMMUTABLE")).get("k", ctx, { fetch, kv });
    await ctx.settle();
    vi.setSystemTime(400 * DAY_MS);

    const other = new TieredCache<string>(cacheOptions("IMMUTABLE"));

    await expect(other.get("k", ctx, { fetch, kv })).resolves.toBe("org_1");
    await expect(other.get("k", ctx, { fetch, kv })).resolves.toBe("org_1");
    await ctx.settle();

    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("a KV row", () => {
  it("is the value and when it was read, under the prefix's v2 key", async () => {
    const { kv, store } = fakeKv();
    const ctx = cacheCtx();
    const cache = new TieredCache<string>(cacheOptions("STANDARD", { name: "template" }));

    await cache.get("k", ctx, { fetch: () => Promise.resolve("row"), kv });
    await ctx.settle();

    expect(store.get("t:v2:k")).toBe('{"at":0,"v":"row"}');
    expect([cache.name, cache.preset, cache.bypass, cache.size]).toStrictEqual(["template", "STANDARD", true, 1]);
  });
});
