import { describe, it, expect } from "vitest";
import { computeWeekStart, computeWeekBounds, isAlignedWeekStart } from "../weekBounds";

// Mon 29 Jun 2026 00:00 WIB === 2026-06-28T17:00:00Z
const MON_29_JUN_WIB = Date.UTC(2026, 5, 28, 17, 0, 0, 0);

describe("computeWeekStart", () => {
  it("returns the same Monday 00:00 WIB for any instant inside that week", () => {
    const wedNoonWib = Date.UTC(2026, 6, 1, 5, 0, 0, 0); // Wed 1 Jul 12:00 WIB
    expect(computeWeekStart(wedNoonWib)).toBe(MON_29_JUN_WIB);
    expect(computeWeekStart(MON_29_JUN_WIB)).toBe(MON_29_JUN_WIB);
  });
});

describe("computeWeekBounds", () => {
  it("weekEnd is one ms before next Monday 00:00 WIB", () => {
    const { weekStart, weekEnd } = computeWeekBounds(MON_29_JUN_WIB);
    expect(weekStart).toBe(MON_29_JUN_WIB);
    expect(weekEnd).toBe(MON_29_JUN_WIB + 7 * 86400000 - 1);
  });
});

describe("isAlignedWeekStart", () => {
  it("true for an aligned Monday, false otherwise", () => {
    expect(isAlignedWeekStart(MON_29_JUN_WIB)).toBe(true);
    expect(isAlignedWeekStart(MON_29_JUN_WIB + 3600000)).toBe(false);
  });
});
