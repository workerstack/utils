import { afterEach, beforeEach, vi } from "vitest";

/** Fakes `Date` from 0 ms for each test of the file; move it with `vi.setSystemTime`. */
export function useFakeClock(): void {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0, toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
}
