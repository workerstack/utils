import { describe, expect, it, vi } from "vitest";

import { useFakeClock } from "../__fixtures__/use-fake-clock.ts";
import { LruCache } from "./lru-cache.ts";

useFakeClock();

describe("LruCache soft TTL", () => {
  it("serves an entry up to its TTL and misses it after", () => {
    const cache = new LruCache<string, number>({ maxSize: 10, ttlMs: 50 });

    cache.set("a", 1);
    vi.setSystemTime(50);
    expect(cache.get("a")).toBe(1);

    vi.setSystemTime(51);
    expect([cache.get("a"), cache.has("a"), cache.size]).toStrictEqual([undefined, false, 0]);
  });

  it("takes a per-key TTL over the cache's, and keeps an entry forever without one", () => {
    const timed = new LruCache<string, number>({ maxSize: 10, ttlMs: 100 });
    const untimed = new LruCache<string, number>({ maxSize: 10 });

    timed.set("default", 1);
    timed.set("custom", 2, 50);
    untimed.set("a", 1);
    vi.setSystemTime(60);

    expect([timed.get("custom"), timed.get("default")]).toStrictEqual([undefined, 1]);
    vi.setSystemTime(100 * 365 * 86_400_000);
    expect(untimed.get("a")).toBe(1);
  });
});

describe("LruCache hard TTL", () => {
  it("serves a stale entry with getWithMeta between soft and hard expiry, then drops it", () => {
    const cache = new LruCache<string, number>({ hardTtlMs: 100, maxSize: 10, ttlMs: 50 });

    cache.set("a", 1);
    expect(cache.getWithMeta("a")).toStrictEqual({ stale: false, value: 1 });

    vi.setSystemTime(80);
    expect([cache.get("a"), cache.size]).toStrictEqual([undefined, 1]);
    expect(cache.getWithMeta("a")).toStrictEqual({ stale: true, value: 1 });

    vi.setSystemTime(101);
    expect([cache.getWithMeta("a"), cache.getWithMeta("missing"), cache.size]).toStrictEqual([undefined, undefined, 0]);
  });

  it("runs both TTLs of setAt from the given time, not from now", () => {
    const cache = new LruCache<string, number>({ hardTtlMs: 100, maxSize: 10, ttlMs: 50 });

    vi.setSystemTime(1000);
    cache.setAt("a", 1, 940);
    expect(cache.getWithMeta("a")).toStrictEqual({ stale: true, value: 1 });

    cache.setAt("b", 2, 899);
    expect(cache.getWithMeta("b")).toBeUndefined();
  });
});
