/**
 * Unit tests for expense analytics period calculation helpers.
 *
 * Tests WIB-aligned date math for the ExpenseAnalytics dashboard period picker.
 */
import { describe, it, expect } from "vitest";
import {
  getCurrentWibMonth,
  wibMidnightToUtc,
  computePeriodRange,
  prevMonth,
  nextMonth,
  isCurrentOrFutureMonth,
  utcToWibDateStr,
  wibDateStrToUtc,
} from "../expenseAnalyticsPeriod";

// WIB = UTC+7, so WIB midnight = UTC 17:00 previous day
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

describe("getCurrentWibMonth", () => {
  it("returns March 2026 for a timestamp in March 2026 WIB", () => {
    // 2026-03-14 12:00 WIB = 2026-03-14 05:00 UTC
    const ts = Date.UTC(2026, 2, 14, 5, 0, 0, 0);
    const result = getCurrentWibMonth(ts);
    expect(result).toEqual({ year: 2026, month: 2 }); // month is 0-indexed
  });

  it("handles year boundary - Jan 1 00:30 WIB (still Dec 31 in UTC)", () => {
    // 2026-01-01 00:30 WIB = 2025-12-31 17:30 UTC
    const ts = Date.UTC(2025, 11, 31, 17, 30, 0, 0);
    const result = getCurrentWibMonth(ts);
    expect(result).toEqual({ year: 2026, month: 0 }); // Jan 2026 in WIB
  });

  it("handles late night UTC being next day in WIB", () => {
    // 2026-02-28 18:00 UTC = 2026-03-01 01:00 WIB
    const ts = Date.UTC(2026, 1, 28, 18, 0, 0, 0);
    const result = getCurrentWibMonth(ts);
    expect(result).toEqual({ year: 2026, month: 2 }); // March in WIB
  });
});

describe("wibMidnightToUtc", () => {
  it("converts March 1 2026 WIB midnight to UTC", () => {
    const result = wibMidnightToUtc(2026, 2, 1);
    // WIB 00:00 Mar 1 = UTC 17:00 Feb 28
    expect(result).toBe(Date.UTC(2026, 1, 28, 17, 0, 0, 0));
  });

  it("handles month overflow for period end (month+1)", () => {
    const result = wibMidnightToUtc(2026, 3, 1); // April 1
    expect(result).toBe(Date.UTC(2026, 2, 31, 17, 0, 0, 0));
  });
});

describe("computePeriodRange", () => {
  it("month mode: March 2026 returns correct WIB-aligned start/end", () => {
    const result = computePeriodRange("month", 2026, 2);
    expect(result.periodStart).toBe(wibMidnightToUtc(2026, 2, 1));
    expect(result.periodEnd).toBe(wibMidnightToUtc(2026, 3, 1));
  });

  it("month mode: January correctly returns start of year", () => {
    const result = computePeriodRange("month", 2026, 0);
    expect(result.periodStart).toBe(wibMidnightToUtc(2026, 0, 1));
    expect(result.periodEnd).toBe(wibMidnightToUtc(2026, 1, 1));
  });

  it("custom mode: uses provided timestamps", () => {
    const customStart = wibMidnightToUtc(2026, 1, 15);
    const customEnd = wibMidnightToUtc(2026, 2, 15);
    const result = computePeriodRange("custom", 2026, 2, customStart, customEnd);
    expect(result.periodStart).toBe(customStart);
    expect(result.periodEnd).toBe(customEnd);
  });

  it("custom mode: falls back to month range when no custom dates provided", () => {
    const result = computePeriodRange("custom", 2026, 2);
    expect(result.periodStart).toBe(wibMidnightToUtc(2026, 2, 1));
    expect(result.periodEnd).toBe(wibMidnightToUtc(2026, 3, 1));
  });
});

describe("prevMonth / nextMonth", () => {
  it("prevMonth wraps Dec to Nov", () => {
    expect(prevMonth(2026, 11)).toEqual({ year: 2026, month: 10 });
  });

  it("prevMonth wraps Jan to Dec previous year", () => {
    expect(prevMonth(2026, 0)).toEqual({ year: 2025, month: 11 });
  });

  it("nextMonth wraps Nov to Dec", () => {
    expect(nextMonth(2026, 10)).toEqual({ year: 2026, month: 11 });
  });

  it("nextMonth wraps Dec to Jan next year", () => {
    expect(nextMonth(2026, 11)).toEqual({ year: 2027, month: 0 });
  });

  it("handles mid-year navigation", () => {
    expect(prevMonth(2026, 6)).toEqual({ year: 2026, month: 5 });
    expect(nextMonth(2026, 6)).toEqual({ year: 2026, month: 7 });
  });
});

describe("isCurrentOrFutureMonth", () => {
  it("returns true for current month", () => {
    // March 2026 WIB
    const now = Date.UTC(2026, 2, 14, 5, 0, 0, 0);
    expect(isCurrentOrFutureMonth(2026, 2, now)).toBe(true);
  });

  it("returns true for future month", () => {
    const now = Date.UTC(2026, 2, 14, 5, 0, 0, 0);
    expect(isCurrentOrFutureMonth(2026, 3, now)).toBe(true);
  });

  it("returns false for past month", () => {
    const now = Date.UTC(2026, 2, 14, 5, 0, 0, 0);
    expect(isCurrentOrFutureMonth(2026, 1, now)).toBe(false);
  });

  it("returns true for future year", () => {
    const now = Date.UTC(2026, 2, 14, 5, 0, 0, 0);
    expect(isCurrentOrFutureMonth(2027, 0, now)).toBe(true);
  });
});

describe("utcToWibDateStr / wibDateStrToUtc roundtrip", () => {
  it("roundtrips correctly for a mid-month date", () => {
    const utcMs = wibMidnightToUtc(2026, 2, 15); // March 15 WIB midnight
    const dateStr = utcToWibDateStr(utcMs);
    expect(dateStr).toBe("2026-03-15");
    expect(wibDateStrToUtc(dateStr)).toBe(utcMs);
  });

  it("roundtrips correctly for first of month", () => {
    const utcMs = wibMidnightToUtc(2026, 0, 1); // Jan 1 WIB midnight
    const dateStr = utcToWibDateStr(utcMs);
    expect(dateStr).toBe("2026-01-01");
    expect(wibDateStrToUtc(dateStr)).toBe(utcMs);
  });
});
