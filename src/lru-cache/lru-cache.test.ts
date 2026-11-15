import { describe, expect, it } from "vitest";

import { LruCache } from "./lru-cache.ts";

function filled(maxSize: number, keys: string[]): LruCache<string, number> {
  const cache = new LruCache<string, number>({ maxSize });

  for (const [i, key] of keys.entries()) cache.set(key, i + 1);

  return cache;
}

function leave(): void {
  // no access: the cache keeps its insertion order
}

describe("LruCache reads and writes", () => {
  it("gets what was set, and the last value set for a key", () => {
    const cache = filled(10, ["a", "b"]);

    cache.set("b", 20);

    expect([cache.get("a"), cache.get("b"), cache.size]).toStrictEqual([1, 20, 2]);
  });

  it("misses a key never set, deleted, or cleared", () => {
    const cache = filled(10, ["a", "b", "c"]);

    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
    expect([cache.get("a"), cache.has("a"), cache.get("missing")]).toStrictEqual([undefined, false, undefined]);

    cache.clear();

    expect([cache.size, cache.get("b"), cache.has("c")]).toStrictEqual([0, undefined, false]);
  });

  it("keeps the same reference, and null or undefined as values", () => {
    const value = { data: "test" };
    const cache = new LruCache<string, { data: string } | null | undefined>({ maxSize: 10 });

    cache.set("object", value);
    cache.set("null", null);
    cache.set("undefined", undefined);

    expect(cache.get("object")).toBe(value);
    expect([cache.get("null"), cache.has("null"), cache.has("undefined")]).toStrictEqual([null, true, true]);
  });
});

describe("LruCache eviction", () => {
  it.each<[string, (cache: LruCache<string, number>) => void, string[]]>([
    ["no access", leave, ["b", "c", "d"]],
    ["a get of a", (cache) => cache.get("a"), ["a", "c", "d"]],
    ["a set of a", (cache) => cache.set("a", 1), ["a", "c", "d"]],
    ["a has of a, which does not mark it used", (cache) => cache.has("a"), ["b", "c", "d"]],
  ])("drops the least recently used key when full, after %s", (_access, access, kept) => {
    const cache = filled(3, ["a", "b", "c"]);

    access(cache);
    cache.set("d", 4);

    expect(["a", "b", "c", "d"].filter((key) => cache.has(key))).toStrictEqual(kept);
  });

  it("keeps only the newest maxSize keys of many", () => {
    const cache = new LruCache<number, number>({ maxSize: 100 });

    for (let i = 0; i < 1000; i++) cache.set(i, i * 2);

    expect([cache.size, cache.get(899), cache.get(900), cache.get(999)]).toStrictEqual([100, undefined, 1800, 1998]);
  });
});
