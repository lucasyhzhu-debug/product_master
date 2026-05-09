// Phase 76 plan 03 task 3.3 — real Vitest bodies replacing Wave 0 it.todo stubs.
//
// Coverage map (D-XX):
//   D-01 (raw column header order)         → "header row also escaped" + escapeCell tests
//   D-05 (first-period no delta)           → first-period prev/delta empty + second-period prev=first.current
//   D-06 (period bucketing math)           → buildPeriodBuckets weekly/monthly/custom + edges
//   D-08 (footer once, range-aggregated)   → "Data Quality footer appears exactly once"
//   D-11 (filename templates verbatim)     → buildExportFilenames format + periodEnd-1 inclusive end
//   D-14 (escapeCell formula injection)    → =SUM/comma tests
//   D-15 (integer rupiah)                  → "amount cells are integer-only"
//   T-76-03 (path traversal mitigation)    → "filename has no path separators"
//   M3 — REAL year-boundary test
//   M4 / I9 — REAL prior-ISO-week test
//   I6 — REAL format-label tests with (partial) suffix

import { describe, it, expect } from "vitest";
import {
  buildPeriodBuckets,
  buildExportFilenames,
  presetToRange,
  formatWeekLabel,
  formatMonthLabel,
  generateRawTransactionsCSV,
  generateMultiPeriodPLCSV,
  type RawTransactionRow,
  type MultiPeriodPLData,
} from "../financialExportHelpers";
import { wibMidnightToUtc } from "../dateUtils";
import type { WeekData } from "../../../convex/reports/incomeStatement";

// ─── Test fixture: minimal WeekData ───
// All fields zeroed; tests can override specific fields per scenario.
function makeWeekData(overrides: Partial<WeekData> = {}): WeekData {
  return {
    channels: [],
    totalGross: 0,
    totalDiscounts: 0,
    totalCommission: 0,
    totalAdBurn: 0,
    totalPromoBurn: 0,
    totalRevShare: 0,
    totalDeductions: 0,
    netRevenue: 0,
    totalProductionCogs: 0,
    totalPackagingCogs: 0,
    totalCogs: 0,
    grossProfit: 0,
    grossMarginPercent: null,
    gapAnalysis: {
      unmappedProducts: [],
      zeroCostComponents: [],
      missingChannels: [],
      totalMappedProducts: 0,
      totalProducts: 0,
      missingReversals: [],
    },
    opex: [],
    totalOpEx: 0,
    ebit: 0,
    ebitMarginPercent: null,
    depreciationAmount: 0,
    amortizationAmount: 0,
    ebitda: 0,
    ebitdaMarginPercent: null,
    opexExcludingDA: 0,
    depreciationAmortization: 0,
    capExAmount: 0,
    freeCashFlow: 0,
    fcfMarginPercent: null,
    otherItems: [],
    totalOther: 0,
    netIncome: 0,
    netMarginPercent: null,
    ...overrides,
  };
}

// ─── buildPeriodBuckets (D-06) ───

describe("buildPeriodBuckets", () => {
  it("weekly: quarterly range produces 13 buckets", () => {
    // 2026-01-05 (Mon) to 2026-04-06 (Mon) = 13 weeks
    const start = wibMidnightToUtc(2026, 0, 5);
    const end = wibMidnightToUtc(2026, 3, 6);
    const buckets = buildPeriodBuckets(start, end, "weekly");
    expect(buckets.length).toBe(13);
  });

  it("monthly: 4-month range produces 4 buckets", () => {
    const start = wibMidnightToUtc(2026, 0, 1);
    const end = wibMidnightToUtc(2026, 4, 1);
    const buckets = buildPeriodBuckets(start, end, "monthly");
    expect(buckets.length).toBe(4);
  });

  it("custom: returns single bucket spanning full range", () => {
    const start = wibMidnightToUtc(2026, 0, 1);
    const end = wibMidnightToUtc(2026, 0, 15);
    const buckets = buildPeriodBuckets(start, end, "custom");
    expect(buckets).toEqual([[start, end]]);
  });
});

describe("buildPeriodBuckets - edge cases", () => {
  it("partial leading bucket clamps to periodStart", () => {
    // 2026-01-07 (Wed) to 2026-01-19 (Mon) — first bucket clamps to Jan 7, not snapped Mon
    const start = wibMidnightToUtc(2026, 0, 7);
    const end = wibMidnightToUtc(2026, 0, 19);
    const buckets = buildPeriodBuckets(start, end, "weekly");
    expect(buckets[0][0]).toBe(start); // clamped to start, not snapped Monday
  });

  it("partial trailing bucket clamps to periodEnd", () => {
    // 2026-01-05 (Mon) to 2026-01-21 (Wed) — last bucket clamps to Jan 21
    const start = wibMidnightToUtc(2026, 0, 5);
    const end = wibMidnightToUtc(2026, 0, 21);
    const buckets = buildPeriodBuckets(start, end, "weekly");
    expect(buckets[buckets.length - 1][1]).toBe(end);
  });

  // M3 — REAL test, NOT it.todo. Year-boundary weekly bucket Dec 28 → Jan 4.
  it("year boundary Dec 28 -> Jan 4 weekly bucket spans the year change correctly (M3)", () => {
    // 2026-12-28 (Mon) to 2027-01-04 (Mon) — exactly one full ISO week spanning year change
    const start = wibMidnightToUtc(2026, 11, 28);
    const end = wibMidnightToUtc(2027, 0, 4);
    const buckets = buildPeriodBuckets(start, end, "weekly");
    expect(buckets.length).toBe(1);
    expect(buckets[0][0]).toBe(start);
    expect(buckets[0][1]).toBe(end);
  });
});

// ─── buildExportFilenames (D-11, T-76-03) ───

describe("buildExportFilenames", () => {
  it("transactions filename = frollie-transactions-YYYYMMDD-YYYYMMDD.csv", () => {
    const start = wibMidnightToUtc(2026, 2, 1);
    const end = wibMidnightToUtc(2026, 3, 1);
    const { transactions } = buildExportFilenames(start, end, "weekly");
    expect(transactions).toBe("frollie-transactions-20260301-20260331.csv");
  });

  it("pl filename = frollie-pl-summary-YYYYMMDD-YYYYMMDD-{granularity}.csv", () => {
    const start = wibMidnightToUtc(2026, 2, 1);
    const end = wibMidnightToUtc(2026, 3, 1);
    const { pl } = buildExportFilenames(start, end, "monthly");
    expect(pl).toBe("frollie-pl-summary-20260301-20260331-monthly.csv");
  });

  it("uses periodEnd-1 for inclusive end-date label", () => {
    // exclusive end Mar 10 → inclusive label Mar 9
    const start = wibMidnightToUtc(2026, 2, 1);
    const end = wibMidnightToUtc(2026, 2, 10);
    const { transactions } = buildExportFilenames(start, end, "custom");
    expect(transactions).toBe("frollie-transactions-20260301-20260309.csv");
  });

  it("filename has no path separators (../, /, \\)", () => {
    const start = wibMidnightToUtc(2026, 2, 1);
    const end = wibMidnightToUtc(2026, 3, 1);
    const { transactions, pl } = buildExportFilenames(start, end, "weekly");
    expect(transactions).not.toMatch(/[/\\]/);
    expect(transactions).not.toContain("..");
    expect(pl).not.toMatch(/[/\\]/);
    expect(pl).not.toContain("..");
  });
});

// ─── presetToRange (M4 / I9) ───

describe("preset ranges", () => {
  // M4 + Improvement 9 — Last week locked to prior ISO week (Mon-Sun); REAL test.
  it("Last week preset returns prior ISO week (Mon-Sun) in WIB (M4 / I9)", () => {
    // Reference: Wednesday 2026-04-15 — prior ISO week is 2026-04-06 (Mon) → 2026-04-13 (Mon, exclusive end)
    const wedApr15 = wibMidnightToUtc(2026, 3, 15);
    const [start, end] = presetToRange("last-week", wedApr15);
    expect(start).toBe(wibMidnightToUtc(2026, 3, 6)); // Monday Apr 6
    expect(end).toBe(wibMidnightToUtc(2026, 3, 13)); // Monday Apr 13 (exclusive end)
  });

  it("Last week from a Monday: prior week is [prev Mon, this Mon)", () => {
    const monApr13 = wibMidnightToUtc(2026, 3, 13);
    const [start, end] = presetToRange("last-week", monApr13);
    expect(start).toBe(wibMidnightToUtc(2026, 3, 6));
    expect(end).toBe(monApr13);
  });

  it("Last week from a Sunday: prior week is [prev prev Mon, prev Mon)", () => {
    const sunApr12 = wibMidnightToUtc(2026, 3, 12);
    const [start, end] = presetToRange("last-week", sunApr12);
    // Sunday's "this Monday" is 6 days back (Apr 6); prior week is [Mar 30, Apr 6)
    expect(start).toBe(wibMidnightToUtc(2026, 2, 30));
    expect(end).toBe(wibMidnightToUtc(2026, 3, 6));
  });

  it("Last month preset returns prior calendar month in WIB", () => {
    const ref = wibMidnightToUtc(2026, 3, 15); // Apr 15
    const [start, end] = presetToRange("last-month", ref);
    expect(start).toBe(wibMidnightToUtc(2026, 2, 1)); // Mar 1
    expect(end).toBe(wibMidnightToUtc(2026, 3, 1)); // Apr 1
  });

  it("Last quarter preset returns prior 3 months in WIB", () => {
    const ref = wibMidnightToUtc(2026, 3, 15); // Apr 15
    const [start, end] = presetToRange("last-quarter", ref);
    expect(start).toBe(wibMidnightToUtc(2026, 0, 1)); // Jan 1
    expect(end).toBe(wibMidnightToUtc(2026, 3, 1)); // Apr 1
  });

  it("Year to date preset returns Jan 1 to tomorrow midnight in WIB", () => {
    const ref = wibMidnightToUtc(2026, 3, 15); // Apr 15
    const [start, end] = presetToRange("ytd", ref);
    expect(start).toBe(wibMidnightToUtc(2026, 0, 1)); // Jan 1
    expect(end).toBe(wibMidnightToUtc(2026, 3, 16)); // Apr 16 (tomorrow midnight, exclusive)
  });
});

// ─── formatWeekLabel / formatMonthLabel (Improvement 6) ───

describe("formatWeekLabel / formatMonthLabel", () => {
  it("formatWeekLabel returns '{year}-W{nn}' for full ISO week", () => {
    const monApr13 = wibMidnightToUtc(2026, 3, 13);
    const monApr20 = wibMidnightToUtc(2026, 3, 20);
    const label = formatWeekLabel(monApr13, monApr20);
    expect(label).toMatch(/^2026-W\d{2}$/);
    expect(label).not.toContain("(partial)");
  });

  it("formatWeekLabel returns '{year}-W{nn} (partial)' for partial week", () => {
    const monApr13 = wibMidnightToUtc(2026, 3, 13);
    const wedApr15 = wibMidnightToUtc(2026, 3, 15); // 2-day partial
    const label = formatWeekLabel(monApr13, wedApr15);
    expect(label).toMatch(/^2026-W\d{2} \(partial\)$/);
  });

  it("formatMonthLabel returns 'YYYY-MM' for full WIB month", () => {
    const monthStart = wibMidnightToUtc(2026, 3, 1);
    const monthEnd = wibMidnightToUtc(2026, 4, 1);
    expect(formatMonthLabel(monthStart, monthEnd)).toBe("2026-04");
  });

  it("formatMonthLabel returns 'YYYY-MM (partial)' for partial month", () => {
    const monthStart = wibMidnightToUtc(2026, 3, 1);
    const partialEnd = wibMidnightToUtc(2026, 3, 15);
    expect(formatMonthLabel(monthStart, partialEnd)).toBe("2026-04 (partial)");
  });

  // Triple-review C1 — ISO week-year (NOT calendar year) at year boundary.
  // Dec 29 2025 (Mon) belongs to ISO 2026-W01. Calendar year would say "2025-W01" — wrong.
  it("formatWeekLabel uses ISO week-year at year boundary (Dec 29 2025 -> 2026-W01)", () => {
    const monDec29_2025 = wibMidnightToUtc(2025, 11, 29);
    const monJan5_2026 = wibMidnightToUtc(2026, 0, 5);
    const label = formatWeekLabel(monDec29_2025, monJan5_2026);
    expect(label).toBe("2026-W01");
    expect(label).not.toMatch(/^2025-/);
  });

  it("formatWeekLabel: Dec 28 2026 (Mon) belongs to 2026-W53", () => {
    // 2026 has 53 ISO weeks; Dec 28 2026 (Mon) is the start of 2026-W53.
    const monDec28_2026 = wibMidnightToUtc(2026, 11, 28);
    const monJan4_2027 = wibMidnightToUtc(2027, 0, 4);
    const label = formatWeekLabel(monDec28_2026, monJan4_2027);
    expect(label).toBe("2026-W53");
  });

  // CQ M5 — monthly year-boundary regression guard.
  it("formatMonthLabel handles year-boundary December correctly", () => {
    const decStart = wibMidnightToUtc(2026, 11, 1);
    const janStart = wibMidnightToUtc(2027, 0, 1);
    expect(formatMonthLabel(decStart, janStart)).toBe("2026-12");
  });
});

// ─── generateRawTransactionsCSV — escapeCell (D-14) + integer rupiah (D-15) ───

const baseRow: RawTransactionRow = {
  entryDate: wibMidnightToUtc(2026, 2, 15),
  journalEntryId: "j_abc",
  entryNumber: "JE-2026-001",
  sourceType: "expense_approval",
  accountCode: "5100",
  accountName: "COGS",
  debitAmount: 12500000,
  creditAmount: 0,
  description: "ok",
  sourceId: "expense:abc",
  createdByName: "Alice",
  _creationTime: 0,
};

describe("generateRawTransactionsCSV - escapeCell applied (D-14)", () => {
  it("description containing =SUM(A1:A10) is prefix-quoted as '=SUM(A1:A10)", () => {
    const csv = generateRawTransactionsCSV([
      { ...baseRow, description: "=SUM(A1:A10)" },
    ]);
    expect(csv).toContain("'=SUM(A1:A10)");
  });

  it("description containing comma is wrapped in quotes", () => {
    const csv = generateRawTransactionsCSV([
      { ...baseRow, description: "a, b" },
    ]);
    expect(csv).toContain('"a, b"');
  });

  it("escapeCell applied to header row too", () => {
    // No header column literal needs escaping in the locked schema, but the
    // escapeCell pipeline must run unconditionally over the header. Assert
    // header row is present verbatim (no escape needed for safe column names).
    const csv = generateRawTransactionsCSV([]);
    expect(csv.split("\n")[0]).toBe(
      "entry_date,je_id,je_number,je_type,account_code,account_name,debit_idr,credit_idr,description,source_doc_type,source_doc_id,created_by",
    );
  });
});

describe("generateRawTransactionsCSV - integer rupiah (D-15)", () => {
  it("amount cells are integer-only (no decimals, no separators, no symbol)", () => {
    const csv = generateRawTransactionsCSV([baseRow]);
    expect(csv).toContain("12500000");
    expect(csv).not.toContain("12,500,000");
    expect(csv).not.toContain("12500000.00");
    expect(csv).not.toContain("Rp");
    expect(csv).not.toContain("IDR");
  });

  it("zero amount renders as '0' not empty", () => {
    const csv = generateRawTransactionsCSV([
      { ...baseRow, debitAmount: 0, creditAmount: 5000 },
    ]);
    const lines = csv.split("\n");
    // Row 0 = header, row 1 = body. Cells: 0=date, ..., 6=debit_idr, 7=credit_idr
    const cells = lines[1].split(",");
    expect(cells[6]).toBe("0");
    expect(cells[7]).toBe("5000");
  });
});

describe("generateRawTransactionsCSV - empty", () => {
  it("empty rows array returns header-only CSV", () => {
    const csv = generateRawTransactionsCSV([]);
    expect(csv.split("\n").length).toBe(1);
    expect(csv).toContain("entry_date");
  });
});

// ─── generateMultiPeriodPLCSV — D-05 in-range delta + D-08 single footer ───

describe("generateMultiPeriodPLCSV - first period no delta (D-05)", () => {
  it("first period prev_period_idr cell is empty string", () => {
    const data: MultiPeriodPLData = {
      periods: [
        {
          bucketStart: 0,
          bucketEnd: 1,
          label: "P1",
          current: makeWeekData({ totalGross: 1000, netRevenue: 1000 }),
        },
        {
          bucketStart: 1,
          bucketEnd: 2,
          label: "P2",
          current: makeWeekData({ totalGross: 2000, netRevenue: 2000 }),
        },
      ],
      rangeGap: {
        totalProducts: 0,
        totalMappedProducts: 0,
        unmappedProducts: [],
        missingChannels: [],
        zeroCostComponents: [],
        missingReversals: [],
      },
    };
    const csv = generateMultiPeriodPLCSV(data);
    const lines = csv.split("\n");
    const p1Lines = lines.filter((l) => l.startsWith("P1,"));
    expect(p1Lines.length).toBeGreaterThan(0);
    for (const line of p1Lines) {
      const cells = line.split(",");
      expect(cells[6]).toBe(""); // prev_period_idr
      expect(cells[7]).toBe(""); // delta_pct
    }
  });

  it("first period delta_pct cell is empty string", () => {
    const data: MultiPeriodPLData = {
      periods: [
        {
          bucketStart: 0,
          bucketEnd: 1,
          label: "P1",
          current: makeWeekData({ totalGross: 1000 }),
        },
      ],
      rangeGap: {
        totalProducts: 0,
        totalMappedProducts: 0,
        unmappedProducts: [],
        missingChannels: [],
        zeroCostComponents: [],
        missingReversals: [],
      },
    };
    const csv = generateMultiPeriodPLCSV(data);
    const lines = csv.split("\n");
    const p1Lines = lines.filter((l) => l.startsWith("P1,"));
    for (const line of p1Lines) {
      const cells = line.split(",");
      expect(cells[7]).toBe("");
    }
  });

  it("second period prev_period_idr equals first period current value", () => {
    const data: MultiPeriodPLData = {
      periods: [
        {
          bucketStart: 0,
          bucketEnd: 1,
          label: "P1",
          current: makeWeekData({ totalGross: 1000, netRevenue: 1000 }),
        },
        {
          bucketStart: 1,
          bucketEnd: 2,
          label: "P2",
          current: makeWeekData({ totalGross: 2000, netRevenue: 2000 }),
        },
      ],
      rangeGap: {
        totalProducts: 0,
        totalMappedProducts: 0,
        unmappedProducts: [],
        missingChannels: [],
        zeroCostComponents: [],
        missingReversals: [],
      },
    };
    const csv = generateMultiPeriodPLCSV(data);
    const lines = csv.split("\n");
    // Find P2's "Gross Revenue" row — column 6 (prev_period_idr) should equal "1000" (P1's totalGross)
    const p2GrossRow = lines.find(
      (l) => l.startsWith("P2,") && l.includes("Gross Revenue,"),
    );
    expect(p2GrossRow).toBeDefined();
    const cells = p2GrossRow!.split(",");
    expect(cells[6]).toBe("1000");
  });
});

describe("generateMultiPeriodPLCSV - footer once (D-08)", () => {
  it("Data Quality footer appears exactly once at bottom, not per period", () => {
    const data: MultiPeriodPLData = {
      periods: [
        {
          bucketStart: 0,
          bucketEnd: 1,
          label: "P1",
          current: makeWeekData({ totalGross: 1000 }),
        },
        {
          bucketStart: 1,
          bucketEnd: 2,
          label: "P2",
          current: makeWeekData({ totalGross: 2000 }),
        },
      ],
      rangeGap: {
        totalProducts: 10,
        totalMappedProducts: 8,
        unmappedProducts: [
          { name: "X", count: 2, revenue: 100 },
          { name: "Y", count: 1, revenue: 50 },
        ],
        missingChannels: [],
        zeroCostComponents: [],
        missingReversals: [],
      },
    };
    const csv = generateMultiPeriodPLCSV(data);
    const matches = csv.match(/Data Quality Notes \(range-aggregated\)/g);
    expect(matches?.length ?? 0).toBe(1);
    // Footer appears at bottom (after last P2 row)
    const footerIdx = csv.indexOf("Data Quality Notes (range-aggregated)");
    const lastP2 = csv.lastIndexOf("P2,");
    expect(footerIdx).toBeGreaterThan(lastP2);
  });

  // Triple-review I1 — Phase 75 D-15 P&L double-count warning surfaced in multi-period footer.
  it("emits missingReversals warning in footer (Phase 75 D-15 / triple-review I1)", () => {
    const data: MultiPeriodPLData = {
      periods: [
        {
          bucketStart: 0,
          bucketEnd: 1,
          label: "P1",
          current: makeWeekData({ totalGross: 1000 }),
        },
      ],
      rangeGap: {
        totalProducts: 0,
        totalMappedProducts: 0,
        unmappedProducts: [],
        missingChannels: [],
        zeroCostComponents: [],
        missingReversals: [
          {
            expenseId: "exp123",
            description: "Office chair",
            expenseDate: 1700000000000,
            journalEntryId: "je456",
          },
        ],
      },
    };
    const csv = generateMultiPeriodPLCSV(data);
    expect(csv).toContain("Missing reversal JEs (P&L may double-count)");
    expect(csv).toContain("Office chair");
    expect(csv).toContain("expense exp123");
  });

  // CQ M2 / staffreview parity — COGS-timing disclaimer in multi-period footer.
  it("emits COGS-timing disclaimer (parity with single-period CSV)", () => {
    const data: MultiPeriodPLData = {
      periods: [
        {
          bucketStart: 0,
          bucketEnd: 1,
          label: "P1",
          current: makeWeekData({ totalGross: 1000 }),
        },
      ],
      rangeGap: {
        totalProducts: 0,
        totalMappedProducts: 0,
        unmappedProducts: [],
        missingChannels: [],
        zeroCostComponents: [],
        missingReversals: [],
      },
    };
    const csv = generateMultiPeriodPLCSV(data);
    expect(csv).toContain("COGS timing");
    expect(csv).toContain("order-time snapshot");
  });
});

// Sanity meta — kept from Wave 0 stub
describe("Phase 76 helpers — meta", () => {
  it("file is registered with vitest (sanity check)", () => {
    expect(true).toBe(true);
  });
});
