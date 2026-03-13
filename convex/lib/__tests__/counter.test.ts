import { describe, test, expect } from "vitest";
import { formatCounterNumber, getWibDateStr } from "../counter";

describe("formatCounterNumber", () => {
  test("formats EXP prefix with zero-padded sequence", () => {
    expect(formatCounterNumber("EXP", "0312", 1)).toBe("EXP-0312-001");
  });

  test("formats JE prefix with two-digit sequence", () => {
    expect(formatCounterNumber("JE", "0312", 42)).toBe("JE-0312-042");
  });

  test("formats RMB prefix with three-digit sequence", () => {
    expect(formatCounterNumber("RMB", "0101", 999)).toBe("RMB-0101-999");
  });

  test("formats with year-end date", () => {
    expect(formatCounterNumber("EXP", "1231", 10)).toBe("EXP-1231-010");
  });

  test("pads sequence 0 to 000 (edge case)", () => {
    expect(formatCounterNumber("EXP", "0312", 0)).toBe("EXP-0312-000");
  });

  test("does not truncate sequence above 999", () => {
    expect(formatCounterNumber("EXP", "0312", 1000)).toBe("EXP-0312-1000");
  });
});

describe("getWibDateStr", () => {
  test("returns WIB date, not UTC date (01:00 WIB = 18:00 UTC prev day)", () => {
    // 2026-03-12 01:00 WIB = 2026-03-11 18:00 UTC
    const utcMs = Date.UTC(2026, 2, 11, 18, 0, 0); // March is month 2 (0-indexed)
    expect(getWibDateStr(utcMs)).toBe("0312");
  });

  test("returns correct date at WIB midnight (00:00 WIB = 17:00 UTC prev day)", () => {
    // 2026-03-12 00:00 WIB = 2026-03-11 17:00 UTC
    const utcMs = Date.UTC(2026, 2, 11, 17, 0, 0);
    expect(getWibDateStr(utcMs)).toBe("0312");
  });

  test("returns previous WIB day at 23:59 WIB", () => {
    // 2026-03-11 23:59 WIB = 2026-03-11 16:59 UTC
    const utcMs = Date.UTC(2026, 2, 11, 16, 59, 0);
    expect(getWibDateStr(utcMs)).toBe("0311");
  });

  test("handles year boundary (Jan 1 00:00 WIB = Dec 31 17:00 UTC)", () => {
    // 2026-01-01 00:00 WIB = 2025-12-31 17:00 UTC
    const utcMs = Date.UTC(2025, 11, 31, 17, 0, 0);
    expect(getWibDateStr(utcMs)).toBe("0101");
  });

  test("handles year-end date (Dec 31 23:59 WIB)", () => {
    // 2026-12-31 23:59 WIB = 2026-12-31 16:59 UTC
    const utcMs = Date.UTC(2026, 11, 31, 16, 59, 0);
    expect(getWibDateStr(utcMs)).toBe("1231");
  });

  test("month is 1-indexed in output (January = 01)", () => {
    // 2026-01-15 12:00 WIB = 2026-01-15 05:00 UTC
    const utcMs = Date.UTC(2026, 0, 15, 5, 0, 0);
    expect(getWibDateStr(utcMs)).toBe("0115");
  });
});
