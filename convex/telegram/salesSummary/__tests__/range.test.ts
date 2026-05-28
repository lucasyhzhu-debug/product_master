import { describe, it, expect } from "vitest";
import { resolveCadenceRange } from "../range";

// Helper: UTC ms for WIB midnight of a date (WIB = UTC+7).
function wibMidnight(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, -7, 0, 0, 0);
}

describe("resolveCadenceRange", () => {
  it("daily = today's WIB day, current end = now", () => {
    const now = wibMidnight(2026, 5, 28) + 23 * 3600_000; // Thu 2026-05-28 23:00 WIB
    const r = resolveCadenceRange("daily", now);
    expect(r.currentStart).toBe(wibMidnight(2026, 5, 28));
    expect(r.currentEnd).toBe(now);
    expect(r.periodLabel).toBe("Thu 28 May 2026");
  });

  it("weekly = prior complete Mon–Sun when fired on a Monday", () => {
    const now = wibMidnight(2026, 5, 25) + 7 * 3600_000; // Mon 2026-05-25 07:00 WIB
    const r = resolveCadenceRange("weekly", now);
    expect(r.currentStart).toBe(wibMidnight(2026, 5, 18)); // prior Monday
    expect(r.currentEnd).toBe(wibMidnight(2026, 5, 25));    // this Monday (exclusive)
    expect(r.previousStart).toBe(wibMidnight(2026, 5, 11));
    expect(r.previousEnd).toBe(wibMidnight(2026, 5, 18));
    expect(r.periodLabel).toBe("18–24 May 2026");
  });

  it("monthly = prior calendar month when fired on the 1st", () => {
    const now = wibMidnight(2026, 6, 1) + 8 * 3600_000; // Mon 2026-06-01 08:00 WIB
    const r = resolveCadenceRange("monthly", now);
    expect(r.currentStart).toBe(wibMidnight(2026, 5, 1)); // May 1
    expect(r.currentEnd).toBe(wibMidnight(2026, 6, 1));   // Jun 1 (exclusive)
    expect(r.previousStart).toBe(wibMidnight(2026, 4, 1));
    expect(r.previousEnd).toBe(wibMidnight(2026, 5, 1));
    expect(r.periodLabel).toBe("May 2026");
  });

  it("monthly handles January → prior December of previous year", () => {
    const now = wibMidnight(2026, 1, 1) + 8 * 3600_000;
    const r = resolveCadenceRange("monthly", now);
    expect(r.currentStart).toBe(wibMidnight(2025, 12, 1));
    expect(r.currentEnd).toBe(wibMidnight(2026, 1, 1));
    expect(r.periodLabel).toBe("December 2025");
  });
});
