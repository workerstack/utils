import type { CacheCtx, CacheRequest } from "../tiered-cache.types.ts";

async function drain(pending: Promise<unknown>[]): Promise<void> {
  if (pending.length === 0) return;

  await Promise.all(pending.splice(0));
  await drain(pending);
}

/** A request's context; `settle()` awaits its background work, and the work that work starts. */
export function cacheCtx(cacheRequest?: CacheRequest): CacheCtx & { settle: () => Promise<void> } {
  const pending: Promise<unknown>[] = [];

  return {
    background: (p) => {
      pending.push(p);
    },
    ...(cacheRequest === undefined ? {} : { cacheRequest }),
    settle: () => drain(pending),
  };
}
