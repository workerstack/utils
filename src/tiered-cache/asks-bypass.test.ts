import { describe, expect, it } from "vitest";

import { asksBypass } from "./asks-bypass.ts";

describe("asksBypass", () => {
  it.each<Record<string, string>>([
    { "x-fresh": "1" },
    { "cache-control": "max-age=0, No-Cache" },
    { "cache-control": "no-cache" },
  ])("reads %o as a bypass", (headers) => {
    expect(asksBypass(new Headers(headers))).toBe(true);
  });

  it.each<Record<string, string>>([
    {},
    { "x-fresh": "0" },
    { "cache-control": "max-age=60" },
    { "cache-control": "no-store" },
  ])("reads %o as no bypass", (headers) => {
    expect(asksBypass(new Headers(headers))).toBe(false);
  });
});
