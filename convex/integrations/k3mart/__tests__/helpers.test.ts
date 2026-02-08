/**
 * Unit tests for K3Mart adapter helper functions.
 * Tests date parsing, formatting, and dedup key generation.
 */

import { describe, it, expect } from "vitest";
import { parseK3MartDate, formatDate, buildDedupKey, resolveOutletName } from "../helpers";

// ============================================
// parseK3MartDate() Tests - 8 tests
// ============================================
describe("parseK3MartDate", () => {
  it("should parse standard K3Mart date format with comma", () => {
    const result = parseK3MartDate("07 Feb 2026, 14:23");
    const date = new Date(result);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(1); // Feb = 1
    expect(date.getDate()).toBe(7);
    expect(date.getHours()).toBe(14);
    expect(date.getMinutes()).toBe(23);
  });

  it("should parse January date", () => {
    const result = parseK3MartDate("15 Jan 2026, 09:00");
    const date = new Date(result);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0); // Jan = 0
    expect(date.getDate()).toBe(15);
  });

  it("should parse December date with late time", () => {
    const result = parseK3MartDate("31 Dec 2025, 23:59");
    const date = new Date(result);
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(11); // Dec = 11
    expect(date.getDate()).toBe(31);
    expect(date.getHours()).toBe(23);
    expect(date.getMinutes()).toBe(59);
  });

  it("should parse early morning time", () => {
    const result = parseK3MartDate("01 Mar 2026, 00:05");
    const date = new Date(result);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(5);
  });

  it("should return a valid timestamp (number > 0)", () => {
    const result = parseK3MartDate("07 Feb 2026, 14:23");
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(0);
  });

  it("should handle all 12 months", () => {
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    months.forEach((month, index) => {
      const result = parseK3MartDate(`01 ${month} 2026, 12:00`);
      const date = new Date(result);
      expect(date.getMonth()).toBe(index);
    });
  });

  it("should return a number for invalid date strings (fallback)", () => {
    const result = parseK3MartDate("not-a-date");
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(0);
  });

  it("should produce consistent results for same input", () => {
    const result1 = parseK3MartDate("07 Feb 2026, 14:23");
    const result2 = parseK3MartDate("07 Feb 2026, 14:23");
    expect(result1).toBe(result2);
  });
});

// ============================================
// formatDate() Tests - 6 tests
// ============================================
describe("formatDate", () => {
  it("should format timestamp to YYYY-MM-DD", () => {
    // 2026-02-07 12:00:00 UTC
    const timestamp = new Date(2026, 1, 7, 12, 0, 0).getTime();
    const result = formatDate(timestamp);
    expect(result).toBe("2026-02-07");
  });

  it("should zero-pad single digit months", () => {
    const timestamp = new Date(2026, 0, 15).getTime(); // January
    const result = formatDate(timestamp);
    expect(result).toMatch(/^2026-01-15$/);
  });

  it("should zero-pad single digit days", () => {
    const timestamp = new Date(2026, 2, 5).getTime(); // March 5
    const result = formatDate(timestamp);
    expect(result).toMatch(/^2026-03-05$/);
  });

  it("should handle end of year", () => {
    const timestamp = new Date(2025, 11, 31).getTime(); // Dec 31, 2025
    const result = formatDate(timestamp);
    expect(result).toBe("2025-12-31");
  });

  it("should handle start of year", () => {
    const timestamp = new Date(2026, 0, 1).getTime(); // Jan 1, 2026
    const result = formatDate(timestamp);
    expect(result).toBe("2026-01-01");
  });

  it("should produce consistent results", () => {
    const timestamp = Date.now();
    expect(formatDate(timestamp)).toBe(formatDate(timestamp));
  });
});

// ============================================
// buildDedupKey() Tests - 5 tests
// ============================================
describe("buildDedupKey", () => {
  it("should build pipe-separated key from transaction fields", () => {
    const key = buildDedupKey(
      "07 Feb 2026, 14:23",
      "K3 Mart Outlet 48",
      "PROD-001",
      5,
      75000
    );
    expect(key).toBe("07 Feb 2026, 14:23|K3 Mart Outlet 48|PROD-001|5|75000");
  });

  it("should handle negative qty for returns", () => {
    const key = buildDedupKey(
      "07 Feb 2026, 14:23",
      "K3 Mart Outlet 48",
      "PROD-001",
      -2,
      -30000
    );
    expect(key).toBe("07 Feb 2026, 14:23|K3 Mart Outlet 48|PROD-001|-2|-30000");
  });

  it("should produce unique keys for different transactions", () => {
    const key1 = buildDedupKey("07 Feb 2026, 14:23", "Outlet A", "PROD-001", 5, 75000);
    const key2 = buildDedupKey("07 Feb 2026, 14:24", "Outlet A", "PROD-001", 5, 75000);
    expect(key1).not.toBe(key2);
  });

  it("should produce same key for identical transactions", () => {
    const key1 = buildDedupKey("07 Feb 2026, 14:23", "Outlet A", "PROD-001", 5, 75000);
    const key2 = buildDedupKey("07 Feb 2026, 14:23", "Outlet A", "PROD-001", 5, 75000);
    expect(key1).toBe(key2);
  });

  it("should differentiate by outlet name", () => {
    const key1 = buildDedupKey("07 Feb 2026, 14:23", "Outlet A", "PROD-001", 5, 75000);
    const key2 = buildDedupKey("07 Feb 2026, 14:23", "Outlet B", "PROD-001", 5, 75000);
    expect(key1).not.toBe(key2);
  });
});

// ============================================
// resolveOutletName() Tests - 3 tests
// ============================================
describe("resolveOutletName", () => {
  const nameMap: Record<number, string> = {
    44: "JKT-SCBD",
    45: "JKT-GADING SERPONG",
  };

  it("should return mapped name for known outlet", () => {
    expect(resolveOutletName(44, nameMap)).toBe("JKT-SCBD");
    expect(resolveOutletName(45, nameMap)).toBe("JKT-GADING SERPONG");
  });

  it("should return placeholder for unknown outlet", () => {
    expect(resolveOutletName(99, nameMap)).toBe("K3 Mart #99");
    expect(resolveOutletName(1, nameMap)).toBe("K3 Mart #1");
  });

  it("should handle empty map", () => {
    expect(resolveOutletName(44, {})).toBe("K3 Mart #44");
  });
});
