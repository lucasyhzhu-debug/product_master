import { describe, it, expect } from "vitest";
import { effectiveDateOf, DAY_MS } from "../effectiveDates";

const T = 1_000_000_000_000;

describe("effectiveDateOf", () => {
  it("adds days to the notice date", () => {
    expect(effectiveDateOf(T, 14)).toBe(T + 14 * DAY_MS);
  });
  it("supports the 30-day termination window", () => {
    expect(effectiveDateOf(T, 30)).toBe(T + 30 * DAY_MS);
  });
  it("returns the notice date itself for 0 days", () => {
    expect(effectiveDateOf(T, 0)).toBe(T);
  });
});
