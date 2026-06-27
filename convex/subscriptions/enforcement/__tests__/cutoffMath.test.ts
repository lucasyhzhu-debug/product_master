import { describe, it, expect } from "vitest";
import { cutoffMs, isPastCutoff } from "../cutoffMath";
import { wibMidnightToUtc } from "../../../lib/periodRange";

// WIB Wed 2026-06-24 midnight (delivery day)
const deliveryDay = wibMidnightToUtc(2026, 5, 24); // month 0-indexed: 5 = June

describe("cutoffMath (offset -1, hour 13 = prior-day 13:00 WIB)", () => {
  it("cutoff is the prior WIB day at 13:00", () => {
    // prior day = 2026-06-23 13:00 WIB = wibMidnight(23) + 13h
    const expected = wibMidnightToUtc(2026, 5, 23) + 13 * 3600_000;
    expect(cutoffMs(deliveryDay, -1, 13)).toBe(expected);
  });
  it("not past cutoff just before", () => {
    expect(isPastCutoff(deliveryDay, -1, 13, cutoffMs(deliveryDay, -1, 13) - 1)).toBe(false);
  });
  it("past cutoff at boundary", () => {
    expect(isPastCutoff(deliveryDay, -1, 13, cutoffMs(deliveryDay, -1, 13))).toBe(true);
  });
});
