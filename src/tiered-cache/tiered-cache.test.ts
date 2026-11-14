import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asksBypass, CACHE_PRESETS, type CacheRequest, TieredCache, type TieredCacheKv } from "./index.ts";

/** Mirrors Workers KV: keys over 512 UTF-8 bytes are rejected with 414. */
function fakeKv() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  const check = (key: string) => {
    const bytes = new TextEncoder().encode(key).length;
    if (bytes > 512) {
      throw new Error(`KV GET failed: 414 UTF-8 encoded length of ${bytes} exceeds key length limit of 512.`);
    }
  };
  const kv: TieredCacheKv = {
    delete: async (key) => {
      check(key);
      store.delete(key);
    },
    get: async (key) => {
      check(key);
      const raw = store.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    },
    put: async (key, value, options) => {
      check(key);
      store.set(key, value);
      ttls.set(key, options?.expirationTtl);
    },
  };
  return { kv, store, ttls };
}

function ctx(cacheRequest?: CacheRequest) {
  const pending: Promise<unknown>[] = [];
  return {
    background: (p: Promise<unknown>) => {
      pending.push(p);
    },
    pending,
    ...(cacheRequest === undefined ? {} : { cacheRequest }),
  };
}

const S = 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("cache presets", () => {
  it("are SHORT 30/60 s, STANDARD 2/10 min, LONG 1/24 h and IMMUTABLE never, soft before hard", () => {
    expect(CACHE_PRESETS).toEqual({
      IMMUTABLE: { hardS: Number.POSITIVE_INFINITY, softS: Number.POSITIVE_INFINITY },
      LONG: { hardS: 86_400, softS: 3600 },
      SHORT: { hardS: 60, softS: 30 },
      STANDARD: { hardS: 600, softS: 120 },
    });
  });

  it("keep an IMMUTABLE value forever: no KV expiry, no revalidation from memory or KV", async () => {
    const options = {
      kv: { prefix: "imm:" },
      maxSize: 10,
      name: "imm",
      preset: "IMMUTABLE",
    } as const;
    const { kv, store, ttls } = fakeKv();
    let fetches = 0;
    const fetch = async () => {
      fetches += 1;
      return "org_1";
    };
    const c = ctx();
    expect(await new TieredCache<string>(options).get("p1", c, { fetch, kv })).toBe("org_1");
    await Promise.all(c.pending);
    expect([...ttls.values()]).toEqual([undefined]);
    expect(store.size).toBe(1);
    vi.setSystemTime(400 * 86_400 * S);
    const later = ctx();
    const memory = new TieredCache<string>(options);
    expect(await memory.get("p1", later, { fetch, kv })).toBe("org_1");
    expect(await memory.get("p1", later, { fetch, kv })).toBe("org_1");
    await Promise.all(later.pending);
    expect(fetches).toBe(1);
  });

  it("keep a KV row for the hard TTL, under a v2 key holding when its value was read", async () => {
    const cache = new TieredCache<string>({
      kv: { prefix: "tmpl:" },
      maxSize: 10,
      name: "template",
      preset: "STANDARD",
    });
    const { kv, store, ttls } = fakeKv();
    const c = ctx();
    await cache.get("t1", c, { fetch: async () => "row", kv });
    await Promise.all(c.pending);
    expect(store.get("tmpl:v2:t1")).toBe('{"at":0,"v":"row"}');
    expect(ttls.get("tmpl:v2:t1")).toBe(600);
    expect([cache.name, cache.preset]).toEqual(["template", "STANDARD"]);
  });
});

describe("TieredCache staleness bound", () => {
  it("never lets a KV copy reloaded into another isolate outlive the hard TTL from when it was read", async () => {
    const { kv } = fakeKv();
    const options = {
      kv: { prefix: "tmpl:" },
      maxSize: 10,
      name: "template",
      preset: "STANDARD" as const,
    };
    const first = new TieredCache<string>(options);
    const second = new TieredCache<string>(options);
    const c = ctx();
    await first.get("t1", c, { fetch: async () => "old", kv });
    await Promise.all(c.pending);
    vi.setSystemTime(590 * S);
    expect(await second.get("t1", c, { fetch: async () => "new", kv })).toBe("old");
    vi.setSystemTime(601 * S);
    expect(await second.get("t1", c, { fetch: async () => "new", kv })).toBe("new");
  });

  it("times a value from before its fetch, so one read before a write still dies at its own hard TTL", async () => {
    const cache = new TieredCache<string>({
      kv: { prefix: "tmpl:" },
      maxSize: 10,
      name: "template",
      preset: "STANDARD",
    });
    const { kv, store } = fakeKv();
    const c = ctx();
    await cache.get("t1", c, {
      fetch: async () => {
        vi.setSystemTime(10 * S);
        return "read before the write";
      },
      kv,
    });
    await Promise.all(c.pending);
    expect(JSON.parse(store.get("tmpl:v2:t1") as string).at).toBe(0);
    vi.setSystemTime(600 * S + 1);
    expect(await cache.get("t1", c, { fetch: async () => "fresh", kv })).toBe("fresh");
  });

  it("bounds a value whose background KV delete never landed by the same hard TTL", async () => {
    const { kv } = fakeKv();
    const options = {
      kv: { prefix: "usr:" },
      maxSize: 10,
      name: "user",
      preset: "STANDARD" as const,
    };
    const cache = new TieredCache<string>(options);
    const other = new TieredCache<string>(options);
    const c = ctx();
    await cache.get("u1", c, { fetch: async () => "old", kv });
    await Promise.all(c.pending);
    const lost = { ...kv, delete: () => new Promise<void>(() => {}) };
    void cache.invalidate("u1", { background: () => {}, kv: lost });
    vi.setSystemTime(601 * S);
    expect(await other.get("u1", c, { fetch: async () => "new", kv })).toBe("new");
  });
});

describe("TieredCache revalidation", () => {
  it("serves a stale entry once and refreshes it from the source when KV's copy is stale too", async () => {
    const cache = new TieredCache<string>({
      kv: { prefix: "org:" },
      maxSize: 10,
      name: "org",
      preset: "STANDARD",
    });
    const { kv, store } = fakeKv();
    const first = ctx();
    await cache.get("o1", first, { fetch: async () => "old", kv });
    await Promise.all(first.pending);
    vi.setSystemTime(121 * S);
    const stale = ctx();
    expect(await cache.get("o1", stale, { fetch: async () => "new", kv })).toBe("old");
    await Promise.all(stale.pending);
    await Promise.all(stale.pending);
    expect(JSON.parse(store.get("org:v2:o1") as string)).toEqual({ at: 121 * S, v: "new" });
    expect(await cache.get("o1", ctx(), { fetch: async () => "newer", kv })).toBe("new");
  });
});

describe("asksBypass", () => {
  it("reads x-fresh: 1 and a Cache-Control that lists no-cache, in any case or position", () => {
    const of = (headers: Record<string, string>) => asksBypass(new Headers(headers));
    expect(of({ "x-fresh": "1" })).toBe(true);
    expect(of({ "cache-control": "max-age=0, No-Cache" })).toBe(true);
    expect(of({ "cache-control": "no-cache" })).toBe(true);
  });

  it("reads nothing else as a bypass", () => {
    const of = (headers: Record<string, string>) => asksBypass(new Headers(headers));
    expect(of({})).toBe(false);
    expect(of({ "x-fresh": "0" })).toBe(false);
    expect(of({ "cache-control": "max-age=60" })).toBe(false);
    expect(of({ "cache-control": "no-store" })).toBe(false);
  });
});

describe("TieredCache bypass and trace", () => {
  it("asks the source past both tiers and refills them when the request may bypass, and traces each tier", async () => {
    const cache = new TieredCache<string>({
      kv: { prefix: "tmpl:" },
      maxSize: 10,
      name: "template",
      preset: "STANDARD",
    });
    const { kv } = fakeKv();
    const plain: CacheRequest = { bypass: false, trace: [] };
    await cache.get("t1", ctx(plain), { fetch: async () => "v1", kv });
    vi.setSystemTime(5 * S);
    await cache.get("t1", ctx(plain), { fetch: async () => "v2", kv });
    const bypass: CacheRequest = { bypass: true, trace: [] };
    expect(await cache.get("t1", ctx(bypass), { fetch: async () => "v2", kv })).toBe("v2");
    expect(plain.trace).toEqual([
      { cache: "template", stale: false, stored: true, storedAt: 0, tier: "origin" },
      { cache: "template", stale: false, stored: true, storedAt: 0, tier: "lru" },
    ]);
    expect(bypass.trace).toEqual([{ cache: "template", stale: false, stored: true, storedAt: 5 * S, tier: "bypass" }]);
    expect(await cache.get("t1", ctx(), { fetch: async () => "v3", kv })).toBe("v2");
  });

  it("traces a KV answer, and a stale one past the soft TTL", async () => {
    const { kv } = fakeKv();
    const options = {
      kv: { prefix: "tmpl:" },
      maxSize: 10,
      name: "template",
      preset: "STANDARD" as const,
    };
    const c = ctx();
    await new TieredCache<string>(options).get("t1", c, { fetch: async () => "row", kv });
    await Promise.all(c.pending);
    const cache = new TieredCache<string>(options);
    const fromKv: CacheRequest = { bypass: false, trace: [] };
    await cache.get("t1", ctx(fromKv), { fetch: async () => "row", kv });
    vi.setSystemTime(121 * S);
    const stale: CacheRequest = { bypass: false, trace: [] };
    await cache.get("t1", ctx(stale), { fetch: async () => "row", kv });
    expect(fromKv.trace).toEqual([{ cache: "template", stale: false, stored: true, storedAt: 0, tier: "kv" }]);
    expect(stale.trace).toEqual([{ cache: "template", stale: true, stored: true, storedAt: 0, tier: "lru" }]);
  });

  it("traces a source that found nothing as stored nowhere", async () => {
    const cache = new TieredCache<string>({
      kv: { prefix: "art:" },
      maxSize: 10,
      name: "article",
      preset: "LONG",
    });
    const { kv } = fakeKv();
    const read: CacheRequest = { bypass: false, trace: [] };
    expect(await cache.get("missing", ctx(read), { fetch: async () => undefined, kv })).toBeUndefined();
    expect(read.trace).toEqual([{ cache: "article", stale: false, stored: false, storedAt: 0, tier: "origin" }]);
  });

  it("never bypasses a cache built without one, whatever the request may do", async () => {
    const cache = new TieredCache<string>({
      bypass: false,
      kv: { prefix: "tpr:" },
      maxSize: 10,
      name: "tierPricing",
      preset: "LONG",
    });
    const { kv } = fakeKv();
    await cache.get("all", ctx(), { fetch: async () => "catalog", kv });
    const asked: CacheRequest = { bypass: true, trace: [] };
    expect(await cache.get("all", ctx(asked), { fetch: async () => "stripe call", kv })).toBe("catalog");
    expect(asked.trace[0]?.tier).toBe("lru");
  });
});

describe("TieredCache KV keys", () => {
  it("serves a key longer than the KV limit from the source instead of throwing", async () => {
    const cache = new TieredCache<string>({
      kv: { prefix: "art:" },
      maxSize: 10,
      name: "article",
      preset: "LONG",
    });
    const { kv, store } = fakeKv();
    const c = ctx();
    const longKey = `${".prose { color: var(--color-ink-2); } ".repeat(40)}:en`;

    await expect(cache.get(longKey, c, { fetch: async () => undefined, kv })).resolves.toBeUndefined();
    await expect(cache.get(longKey, c, { fetch: async () => "row", kv })).resolves.toBe("row");
    await Promise.all(c.pending);
    expect(store.size).toBe(0);
    await expect(cache.invalidate(longKey, { background: c.background, kv })).resolves.toBeUndefined();
  });
});

describe("TieredCache without the isolate tier", () => {
  /* Two isolates share KV and the source, never memory. */
  it("reads what another isolate wrote, so a user sees their own change on the next request", async () => {
    const { kv } = fakeKv();
    let source = { dismissed: false };
    const options = {
      isolate: false,
      kv: { prefix: "obd:" },
      maxSize: 10,
      name: "onboarding",
      preset: "STANDARD" as const,
    };
    const reader = new TieredCache<{ dismissed: boolean }>(options);
    const writer = new TieredCache<{ dismissed: boolean }>(options);
    const c = ctx();
    expect(await reader.get("u1", c, { fetch: async () => source, kv })).toEqual({
      dismissed: false,
    });
    source = { dismissed: true };
    await writer.invalidate("u1", { background: c.background, kv });
    writer.set("u1", source, { background: c.background, kv });
    await Promise.all(c.pending);
    expect(await reader.get("u1", c, { fetch: async () => source, kv })).toEqual({
      dismissed: true,
    });
  });
});
