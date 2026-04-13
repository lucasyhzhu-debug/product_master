import { describe, it, expect } from "vitest";
import {
  INDONESIAN_MONTHS,
  parseIndonesianDate,
  resolveYearForRollover,
} from "../../../../convex/lib/indonesianDate";

describe("INDONESIAN_MONTHS map", () => {
  it("contains all 12 Indonesian BCA abbreviations with correct 0-indexed values", () => {
    expect(INDONESIAN_MONTHS).toMatchObject({
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      Mei: 4,
      Jun: 5,
      Jul: 6,
      Agu: 7,
      Sep: 8,
      Okt: 9,
      Nov: 10,
      Des: 11,
    });
  });
});

describe("parseIndonesianDate", () => {
  it("parses '28-Des' with year 2025 to UTC 2025-12-28 midnight", () => {
    expect(parseIndonesianDate("28-Des", 2025)).toBe(Date.UTC(2025, 11, 28));
  });

  it("parses '05-Jan' with year 2026 to UTC 2026-01-05 midnight", () => {
    expect(parseIndonesianDate("05-Jan", 2026)).toBe(Date.UTC(2026, 0, 5));
  });

  it("throws on unknown month token", () => {
    expect(() => parseIndonesianDate("15-May", 2025)).toThrow(
      /Invalid Indonesian date/,
    );
  });

  it("throws on invalid day", () => {
    expect(() => parseIndonesianDate("32-Nov", 2025)).toThrow(
      /Invalid Indonesian date/,
    );
  });
});

describe("resolveYearForRollover", () => {
  const dec2025Start = Date.UTC(2025, 11, 20);
  const jan2026End = Date.UTC(2026, 0, 19);

  it("period 20/12/2025 – 19/01/2026: 'Des' resolves to 2025", () => {
    expect(
      resolveYearForRollover({
        monthIdx: 11, // December
        periodStart: dec2025Start,
        periodEnd: jan2026End,
      }),
    ).toBe(2025);
  });

  it("period 20/12/2025 – 19/01/2026: 'Jan' resolves to 2026", () => {
    expect(
      resolveYearForRollover({
        monthIdx: 0, // January
        periodStart: dec2025Start,
        periodEnd: jan2026End,
      }),
    ).toBe(2026);
  });

  it("period 01/11/2025 – 30/11/2025 (no rollover): 'Nov' resolves to 2025", () => {
    expect(
      resolveYearForRollover({
        monthIdx: 10, // November
        periodStart: Date.UTC(2025, 10, 1),
        periodEnd: Date.UTC(2025, 10, 30),
      }),
    ).toBe(2025);
  });
});
