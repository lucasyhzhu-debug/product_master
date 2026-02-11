/**
 * Pure function tests for K3 Mart Cockpit helpers and Indonesian holidays.
 * Tests delta calculations, date formatting, week logic, and holiday detection.
 */

import { expect, test, describe } from "vitest";
import {
  calculateKitchenDelta,
  calculateSuggestedQty,
  getWeekNumber,
  getWeekDates,
  formatDateShort,
} from "../../convex/k3martCockpit/helpers";
import {
  isHoliday,
  getHolidayName,
  isWeekendOrHoliday,
  getISOWeekString,
} from "../../src/lib/indonesianHolidays";

// ============================================
// Kitchen Delta Calculation Tests - 4 tests
// ============================================
describe("calculateKitchenDelta", () => {
  test("basic delta: target 100, current 40, no transfers", () => {
    const result = calculateKitchenDelta(100, 40, 0);
    expect(result.apiStockInQty).toBe(60);
    expect(result.kitchenOrderQty).toBe(60);
  });

  test("delta with transfers: target 100, current 40, transfersIn 30", () => {
    const result = calculateKitchenDelta(100, 40, 30);
    expect(result.apiStockInQty).toBe(60);
    expect(result.kitchenOrderQty).toBe(30); // 60 - 30 transfers
  });

  test("zero delta when currentStock meets target", () => {
    const result = calculateKitchenDelta(100, 100, 0);
    expect(result.apiStockInQty).toBe(0);
    expect(result.kitchenOrderQty).toBe(0);
  });

  test("currentStock exceeds target returns zero", () => {
    const result = calculateKitchenDelta(100, 120, 0);
    expect(result.apiStockInQty).toBe(0);
    expect(result.kitchenOrderQty).toBe(0);
  });
});

// ============================================
// Suggested Quantity Calculation Tests - 3 tests
// ============================================
describe("calculateSuggestedQty", () => {
  test("basic calculation: target 100, current 40, avgDailySales 12.5", () => {
    const result = calculateSuggestedQty(100, 40, 12.5);
    // safetyStock = ceil(12.5) = 13
    // suggested = 100 - 40 + 13 = 73
    expect(result).toBe(73);
  });

  test("zero average daily sales", () => {
    const result = calculateSuggestedQty(100, 40, 0);
    // safetyStock = ceil(0) = 0
    // suggested = 100 - 40 + 0 = 60
    expect(result).toBe(60);
  });

  test("zero current stock", () => {
    const result = calculateSuggestedQty(100, 0, 10.8);
    // safetyStock = ceil(10.8) = 11
    // suggested = 100 - 0 + 11 = 111
    expect(result).toBe(111);
  });
});

// ============================================
// ISO Week Number Tests - 2 tests
// ============================================
describe("getWeekNumber", () => {
  test("known date: 2026-02-11 is week 7", () => {
    expect(getWeekNumber("2026-02-11")).toBe("2026-W07");
  });

  test("year boundary: 2025-12-29 is week 1 of 2026", () => {
    // ISO week date: 2025-12-29 (Monday) starts 2026-W01
    expect(getWeekNumber("2025-12-29")).toBe("2026-W01");
  });
});

// ============================================
// Week Dates Generation Tests - 1 test
// ============================================
describe("getWeekDates", () => {
  test("returns 7 dates starting Monday for week containing 2026-02-11 (Wednesday)", () => {
    const dates = getWeekDates("2026-02-11");
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-02-09"); // Monday
    expect(dates[6]).toBe("2026-02-15"); // Sunday
  });
});

// ============================================
// Date Formatting Tests - 1 test
// ============================================
describe("formatDateShort", () => {
  test("formats 2026-02-11 as 'Wed, Feb 11'", () => {
    const formatted = formatDateShort("2026-02-11");
    expect(formatted).toBe("Wed, Feb 11");
  });
});

// ============================================
// Indonesian Holidays Tests - 5 tests
// ============================================
describe("Indonesian holidays", () => {
  test("isHoliday detects New Year's Day 2026", () => {
    expect(isHoliday("2026-01-01")).toBe(true);
  });

  test("isHoliday returns false for non-holiday", () => {
    expect(isHoliday("2026-02-11")).toBe(false);
  });

  test("getHolidayName returns name for Independence Day", () => {
    expect(getHolidayName("2026-08-17")).toBe("Independence Day");
  });

  test("getHolidayName returns undefined for non-holiday", () => {
    expect(getHolidayName("2026-02-11")).toBeUndefined();
  });

  test("getISOWeekString returns week number for 2026-02-11", () => {
    expect(getISOWeekString("2026-02-11")).toBe("2026-W07");
  });
});

// ============================================
// Weekend/Holiday Detection Tests - 4 tests
// ============================================
describe("isWeekendOrHoliday", () => {
  test("Saturday 2026-02-14 is weekend", () => {
    expect(isWeekendOrHoliday("2026-02-14")).toBe(true);
  });

  test("Sunday 2026-02-15 is weekend", () => {
    expect(isWeekendOrHoliday("2026-02-15")).toBe(true);
  });

  test("Monday holiday (Chinese New Year 2026-02-17)", () => {
    expect(isWeekendOrHoliday("2026-02-17")).toBe(true);
  });

  test("normal weekday Wednesday 2026-02-11", () => {
    expect(isWeekendOrHoliday("2026-02-11")).toBe(false);
  });
});
