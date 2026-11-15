import { describe, expect, it } from "vitest";

import { isStored } from "./is-stored.ts";

describe("isStored", () => {
  it.each([
    { at: 0, v: "row" },
    { at: 1, v: null },
  ])("takes the cache's own envelope %o", (row) => {
    expect(isStored(row)).toBe(true);
  });

  it.each([null, "row", 1, { v: "row" }, { at: 0 }, { at: "0", v: "row" }, { at: Number.NaN, v: "row" }])(
    "rejects %o",
    (row) => {
      expect(isStored(row)).toBe(false);
    },
  );
});
