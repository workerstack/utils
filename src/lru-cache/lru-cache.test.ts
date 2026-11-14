import { describe, expect, it } from "vitest";
import { LruCache } from "./lru-cache.ts";

describe("LruCache", () => {
  describe("basic operations", () => {
    it("should set and get values", () => {
      const cache = new LruCache<string, number>({ maxSize: 10 });

      cache.set("a", 1);
      cache.set("b", 2);

      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBe(2);
    });

    it("should return undefined for missing keys", () => {
      const cache = new LruCache<string, number>({ maxSize: 10 });

      expect(cache.get("missing")).toBeUndefined();
    });

    it("should update existing keys", () => {
      const cache = new LruCache<string, number>({ maxSize: 10 });

      cache.set("a", 1);
      cache.set("a", 2);

      expect(cache.get("a")).toBe(2);
      expect(cache.size).toBe(1);
    });

    it("should delete keys", () => {
      const cache = new LruCache<string, number>({ maxSize: 10 });

      cache.set("a", 1);
      expect(cache.delete("a")).toBe(true);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.delete("a")).toBe(false);
    });

    it("should clear all entries", () => {
      const cache = new LruCache<string, number>({ maxSize: 10 });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBeUndefined();
    });

    it("should track size correctly", () => {
      const cache = new LruCache<string, number>({ maxSize: 10 });

      expect(cache.size).toBe(0);

      cache.set("a", 1);
      expect(cache.size).toBe(1);

      cache.set("b", 2);
      expect(cache.size).toBe(2);

      cache.delete("a");
      expect(cache.size).toBe(1);

      cache.clear();
      expect(cache.size).toBe(0);
    });

    it("should check key existence with has", () => {
      const cache = new LruCache<string, number>({ maxSize: 10 });

      expect(cache.has("a")).toBe(false);

      cache.set("a", 1);
      expect(cache.has("a")).toBe(true);

      cache.delete("a");
      expect(cache.has("a")).toBe(false);
    });
  });

  describe("LRU eviction", () => {
    it("should evict oldest entry when max size reached", () => {
      const cache = new LruCache<string, number>({ maxSize: 3 });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      expect(cache.size).toBe(3);

      cache.set("d", 4);

      expect(cache.size).toBe(3);
      expect(cache.get("a")).toBeUndefined(); /* oldest evicted */
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
    });

    it("should update access order on get", () => {
      const cache = new LruCache<string, number>({ maxSize: 3 });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      /* access 'a' to make it most recently used */
      cache.get("a");

      /* add new entry, should evict 'b' (oldest) not 'a' */
      cache.set("d", 4);

      expect(cache.get("a")).toBe(1); /* still exists */
      expect(cache.get("b")).toBeUndefined(); /* evicted */
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
    });

    it("should update access order on set", () => {
      const cache = new LruCache<string, number>({ maxSize: 3 });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      /* update 'a' to make it most recently used */
      cache.set("a", 10);

      /* add new entry, should evict 'b' (oldest) */
      cache.set("d", 4);

      expect(cache.get("a")).toBe(10); /* still exists, updated */
      expect(cache.get("b")).toBeUndefined(); /* evicted */
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
    });

    it("should handle single-entry cache", () => {
      const cache = new LruCache<string, number>({ maxSize: 1 });

      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);

      cache.set("b", 2);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
    });
  });

  describe("TTL expiration", () => {
    it("should expire entries after TTL", async () => {
      const cache = new LruCache<string, number>({ maxSize: 10, ttlMs: 50 });

      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);

      await new Promise((r) => setTimeout(r, 60));

      expect(cache.get("a")).toBeUndefined();
    });

    it("should not expire entries before TTL", async () => {
      const cache = new LruCache<string, number>({ maxSize: 10, ttlMs: 100 });

      cache.set("a", 1);

      await new Promise((r) => setTimeout(r, 50));
      expect(cache.get("a")).toBe(1);
    });

    it("should support per-key TTL override", async () => {
      const cache = new LruCache<string, number>({ maxSize: 10, ttlMs: 100 });

      cache.set("default", 1);
      cache.set("custom", 2, 50);

      await new Promise((r) => setTimeout(r, 60));

      expect(cache.get("custom")).toBeUndefined(); /* expired after 50ms */
      expect(cache.get("default")).toBe(1); /* still valid, 100ms TTL */
    });

    it("should remove expired entries on has check", async () => {
      const cache = new LruCache<string, number>({ maxSize: 10, ttlMs: 50 });

      cache.set("a", 1);
      expect(cache.has("a")).toBe(true);

      await new Promise((r) => setTimeout(r, 60));

      expect(cache.has("a")).toBe(false);
      expect(cache.size).toBe(0);
    });

    it("should handle cache without TTL", () => {
      const cache = new LruCache<string, number>({ maxSize: 10 });

      cache.set("a", 1);

      /* immediately check - should still exist since no TTL */
      expect(cache.get("a")).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("should handle various key types", () => {
      const cache = new LruCache<number | string, string>({ maxSize: 10 });

      cache.set(1, "number key");
      cache.set("string", "string key");

      expect(cache.get(1)).toBe("number key");
      expect(cache.get("string")).toBe("string key");
    });

    it("should handle object values", () => {
      const cache = new LruCache<string, { data: string }>({ maxSize: 10 });

      const obj = { data: "test" };
      cache.set("key", obj);

      expect(cache.get("key")).toEqual(obj);
      expect(cache.get("key")).toBe(obj); /* same reference */
    });

    it("should handle null and undefined values", () => {
      const cache = new LruCache<string, null | undefined>({ maxSize: 10 });

      cache.set("null", null);
      cache.set("undefined", undefined);

      expect(cache.get("null")).toBeNull();
      expect(cache.get("undefined")).toBeUndefined();
      expect(cache.has("null")).toBe(true);
      expect(cache.has("undefined")).toBe(true);
    });

    it("should handle rapid set/get operations", () => {
      const cache = new LruCache<number, number>({ maxSize: 100 });

      for (let i = 0; i < 1000; i++) {
        cache.set(i, i * 2);
      }

      expect(cache.size).toBe(100); /* only last 100 */

      for (let i = 900; i < 1000; i++) {
        expect(cache.get(i)).toBe(i * 2);
      }

      expect(cache.get(0)).toBeUndefined(); /* evicted */
      expect(cache.get(899)).toBeUndefined(); /* evicted */
    });

    it("should handle empty cache operations", () => {
      const cache = new LruCache<string, number>({ maxSize: 10 });

      expect(cache.get("missing")).toBeUndefined();
      expect(cache.has("missing")).toBe(false);
      expect(cache.delete("missing")).toBe(false);
      expect(cache.size).toBe(0);

      cache.clear();
      expect(cache.size).toBe(0);
    });
  });
});
