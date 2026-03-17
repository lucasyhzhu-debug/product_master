import { describe, it, expect } from "vitest";
import { formatIndonesianDate } from "../dateUtils";

describe("formatIndonesianDate", () => {
  it("formats Date object as Indonesian full date", () => {
    // March 16, 2026 is a Monday (Senin)
    expect(formatIndonesianDate(new Date(2026, 2, 16))).toBe("Senin, 16 Maret 2026");
  });

  it("formats epoch milliseconds as Indonesian full date", () => {
    const epochMs = new Date(2026, 2, 16).getTime();
    expect(formatIndonesianDate(epochMs)).toBe("Senin, 16 Maret 2026");
  });

  it("handles January 1st correctly", () => {
    // Jan 1, 2026 is a Thursday (Kamis)
    expect(formatIndonesianDate(new Date(2026, 0, 1))).toBe("Kamis, 1 Januari 2026");
  });

  it("handles different day of week", () => {
    // March 15, 2026 is a Sunday (Minggu)
    expect(formatIndonesianDate(new Date(2026, 2, 15))).toBe("Minggu, 15 Maret 2026");
  });
});
