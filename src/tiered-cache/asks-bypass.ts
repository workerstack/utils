import { FLAG_ON, NO_CACHE } from "./tiered-cache.constants.ts";
import type { HeaderReader } from "./tiered-cache.types.ts";

/** Whether a request asks past the caches: `x-fresh: 1`, or a `Cache-Control` listing `no-cache`. */
export function asksBypass(headers: HeaderReader): boolean {
  if (headers.get("x-fresh") === FLAG_ON) return true;

  const directives = (headers.get("cache-control") ?? "").toLowerCase().split(",");

  return directives.some((directive) => directive.trim() === NO_CACHE);
}
