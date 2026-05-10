import { describe, it, expect } from "vitest";
import { calculatePeriodRange, getWibDateStr, utcToWibDateStr } from "../periodRange";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Helper: create a UTC timestamp from WIB date/time components */
function wibToUtc(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0);
}

describe("calculatePeriodRange", () => {
  // ─── "today" preset ───

  describe("today", () => {
    it("should use WIB midnight, not UTC midnight", () => {
      // 2026-02-09 02:00 WIB (= 2026-02-08 19:00 UTC)
      const now = wibToUtc(2026, 2, 9, 2, 0);
      const range = calculatePeriodRange("today", now);

      // currentStart should be 2026-02-09 00:00 WIB = 2026-02-08 17:00 UTC
      const expectedStart = wibToUtc(2026, 2, 9, 0, 0);
      expect(range.currentStart).toBe(expectedStart);
      expect(range.currentEnd).toBe(now);
      expect(range.periodLabel).toBe("Today");
      expect(range.comparisonLabel).toBe("vs yesterday");
    });

    it("should set previous period to yesterday", () => {
      const now = wibToUtc(2026, 2, 9, 14, 30);
      const range = calculatePeriodRange("today", now);

      const todayMidnight = wibToUtc(2026, 2, 9, 0, 0);
      const yesterdayMidnight = wibToUtc(2026, 2, 8, 0, 0);
      expect(range.previousStart).toBe(yesterdayMidnight);
      expect(range.previousEnd).toBe(todayMidnight);
    });
  });

  // ─── "yesterday" preset ───

  describe("yesterday", () => {
    it("should return correct day boundaries near WIB midnight", () => {
      // 2026-02-09 00:30 WIB (just past midnight)
      const now = wibToUtc(2026, 2, 9, 0, 30);
      const range = calculatePeriodRange("yesterday", now);

      const todayStart = wibToUtc(2026, 2, 9, 0, 0);
      const yesterdayStart = wibToUtc(2026, 2, 8, 0, 0);
      const dayBeforeStart = wibToUtc(2026, 2, 7, 0, 0);

      expect(range.currentStart).toBe(yesterdayStart);
      expect(range.currentEnd).toBe(todayStart);
      expect(range.previousStart).toBe(dayBeforeStart);
      expect(range.previousEnd).toBe(yesterdayStart);
      expect(range.periodLabel).toBe("Yesterday");
    });
  });

  // ─── "last7days" preset ───

  describe("last7days", () => {
    it("should return valid ranges where previous < current", () => {
      const now = wibToUtc(2026, 2, 9, 10, 0);
      const range = calculatePeriodRange("last7days", now);

      expect(range.previousStart).toBeLessThan(range.previousEnd);
      expect(range.previousEnd).toBeLessThanOrEqual(range.currentStart);
      expect(range.currentStart).toBeLessThan(range.currentEnd);
      expect(range.periodLabel).toBe("Last 7 days");
    });

    it("should span 7 days for current period", () => {
      const now = wibToUtc(2026, 2, 9, 10, 0);
      const range = calculatePeriodRange("last7days", now);

      // currentStart should be 6 days before today's WIB midnight
      const expectedStart = wibToUtc(2026, 2, 3, 0, 0); // Feb 3
      expect(range.currentStart).toBe(expectedStart);
    });
  });

  // ─── "last30days" preset ───

  describe("last30days", () => {
    it("should return valid ranges where previous < current", () => {
      const now = wibToUtc(2026, 2, 9, 10, 0);
      const range = calculatePeriodRange("last30days", now);

      expect(range.previousStart).toBeLessThan(range.previousEnd);
      expect(range.previousEnd).toBeLessThanOrEqual(range.currentStart);
      expect(range.currentStart).toBeLessThan(range.currentEnd);
      expect(range.periodLabel).toBe("Last 30 days");
    });
  });

  // ─── "thisMonth" preset ───

  describe("thisMonth", () => {
    it("should start from the 1st of current month", () => {
      // March 15, 2026
      const now = wibToUtc(2026, 3, 15, 10, 0);
      const range = calculatePeriodRange("thisMonth", now);

      const marchFirst = wibToUtc(2026, 3, 1, 0, 0);
      expect(range.currentStart).toBe(marchFirst);
      expect(range.currentEnd).toBe(now);
      expect(range.periodLabel).toBe("This month");
    });

    it("should set previous to full February when current is March", () => {
      const now = wibToUtc(2026, 3, 1, 10, 0);
      const range = calculatePeriodRange("thisMonth", now);

      const febFirst = wibToUtc(2026, 2, 1, 0, 0);
      const marchFirst = wibToUtc(2026, 3, 1, 0, 0);
      expect(range.previousStart).toBe(febFirst);
      expect(range.previousEnd).toBe(marchFirst);
    });

    it("should handle January (previous = December of prior year)", () => {
      const now = wibToUtc(2026, 1, 15, 10, 0);
      const range = calculatePeriodRange("thisMonth", now);

      const decFirst = wibToUtc(2025, 12, 1, 0, 0);
      const janFirst = wibToUtc(2026, 1, 1, 0, 0);
      expect(range.previousStart).toBe(decFirst);
      expect(range.previousEnd).toBe(janFirst);
    });
  });

  // ─── Cross-preset validation ───

  describe("all presets return valid non-overlapping ranges", () => {
    const presets = ["today", "yesterday", "last7days", "last30days", "thisMonth"] as const;
    const now = wibToUtc(2026, 2, 9, 14, 0);

    for (const preset of presets) {
      it(`${preset}: current range != previous range`, () => {
        const range = calculatePeriodRange(preset, now);
        expect(range.currentStart).not.toBe(range.previousStart);
        expect(range.currentEnd).not.toBe(range.previousEnd);
      });
    }
  });
});

// ─── Phase 81 / Plan 02: Canonical getWibDateStr ───────────────────────────

describe("getWibDateStr (Phase 81 canonical YYYY-MM-DD WIB helper)", () => {
  it("converts UTC epoch ms to YYYY-MM-DD WIB date string", () => {
    // 2026-03-12 00:00 UTC + WIB offset (7h) = 2026-03-12 07:00 WIB → "2026-03-12"
    const utcMs = Date.UTC(2026, 2, 12, 0, 0, 0);
    expect(getWibDateStr(utcMs)).toBe("2026-03-12");
  });

  it("crosses date boundary at WIB midnight (UTC 17:00 → next WIB day)", () => {
    // 2026-03-11 17:00 UTC = 2026-03-12 00:00 WIB → "2026-03-12"
    const utcMs = Date.UTC(2026, 2, 11, 17, 0, 0);
    expect(getWibDateStr(utcMs)).toBe("2026-03-12");
  });

  it("keeps same WIB date for UTC 16:59:59Z (last second before WIB midnight)", () => {
    // 2026-04-16T16:59:59Z UTC = 2026-04-16T23:59:59 WIB → "2026-04-16"
    expect(getWibDateStr(Date.UTC(2026, 3, 16, 16, 59, 59))).toBe("2026-04-16");
  });

  it("throws on NaN input (WR-02 regression — NaN-guard promoted from toWibDateString)", () => {
    expect(() => getWibDateStr(NaN)).toThrow(/non-finite/);
  });

  it("throws on +Infinity input", () => {
    expect(() => getWibDateStr(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });

  it("throws on -Infinity input", () => {
    expect(() => getWibDateStr(Number.NEGATIVE_INFINITY)).toThrow(/non-finite/);
  });

  it("matches deprecated utcToWibDateStr output for finite values (D-11 1:1 parity)", () => {
    const samples = [
      0,
      Date.UTC(2025, 0, 1),
      Date.UTC(2026, 2, 12, 0, 0, 0),
      Date.UTC(2026, 3, 16, 17, 0, 0),
      Date.UTC(2026, 11, 31, 23, 59, 59),
    ];
    for (const t of samples) {
      expect(getWibDateStr(t)).toBe(utcToWibDateStr(t));
    }
  });
});
