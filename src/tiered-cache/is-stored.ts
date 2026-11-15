import type { Stored } from "./tiered-cache.types.ts";

/**
 * Whether a KV row is the cache's own `{ at, v }` envelope with a finite read time. `v` is trusted
 * as `V`: only this cache writes under its versioned prefix.
 */
export function isStored<V>(row: unknown): row is Stored<V> {
  return typeof row === "object" && row !== null && "v" in row && "at" in row && Number.isFinite(row.at);
}
