import { describe, it, expect } from "vitest";
import { wibDayIndex, classifyDue, daysLate } from "../dueClassification";

// UTC ms for "WIB midnight of date D" — same convention as periodRange.test.ts.
function wibMidnight(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day, -7, 0, 0, 0);
}

const TODAY = wibMidnight(2026, 5, 27);
const YESTERDAY = wibMidnight(2026, 5, 26);
const TOMORROW = wibMidnight(2026, 5, 28);
const NOON_TODAY = TODAY + 12 * 3600_000;

describe("wibDayIndex", () => {
  it("is constant across a whole WIB day and increments at WIB midnight", () => {
    expect(wibDayIndex(TODAY)).toBe(wibDayIndex(TODAY + 23 * 3600_000));
    expect(wibDayIndex(TOMORROW)).toBe(wibDayIndex(TODAY) + 1);
  });
});

describe("classifyDue", () => {
  it("classifies a due date from yesterday as overdue", () => {
    expect(classifyDue(YESTERDAY + 8 * 3600_000, NOON_TODAY)).toBe("overdue");
  });
  it("classifies any time today as today (00:00 and 23:00 WIB)", () => {
    expect(classifyDue(TODAY, NOON_TODAY)).toBe("today");
    expect(classifyDue(TODAY + 23 * 3600_000, NOON_TODAY)).toBe("today");
  });
  it("classifies tomorrow as future", () => {
    expect(classifyDue(TOMORROW, NOON_TODAY)).toBe("future");
  });
});

describe("daysLate", () => {
  it("returns whole WIB days late, ignoring time-of-day", () => {
    expect(daysLate(YESTERDAY + 8 * 3600_000, NOON_TODAY)).toBe(1);
    expect(daysLate(wibMidnight(2026, 5, 25) + 20 * 3600_000, NOON_TODAY)).toBe(2);
  });
  it("returns 0 for a due date that is today", () => {
    expect(daysLate(TODAY + 23 * 3600_000, NOON_TODAY)).toBe(0);
  });
});
