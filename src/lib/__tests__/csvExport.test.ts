/**
 * Phase 75 Wave 0 — Plan 00 Task 3
 *
 * Unit tests for `generateIncomeStatementCSV` covering the D-16 row additions
 * and canonical ordering:
 *   - CapEx (Fixed Asset Acquisitions)
 *   - Free Cash Flow
 *   - Depreciation & Amortization (extracted from OpEx)
 *   - Total Operating Expenses (excl. D/A)
 *   - Contribution Margin (renamed from Gross Profit at company level)
 *
 * RED-state expectation: authored during Wave 0 to run RED against the base
 * commit (csvExport.ts today emits "Gross Profit", "Total Operating Expenses",
 * and has no CapEx / FCF / D&A-split rows). Plan 03 will extend the generator
 * and these 4 tests flip green. If the parent branch has already executed
 * Plan 03, tests pass immediately — still locks D-16 acceptance into CI.
 */

import { describe, it, expect } from "vitest";
import {
  generateIncomeStatementCSV,
  type IncomeStatementData,
} from "../csvExport";

type WeekData = IncomeStatementData["current"];

/**
 * Build a minimal `IncomeStatementData` fixture. Every new field that Plan 01
 * Task 3 adds to `WeekData` is provided with a default of 0 so individual
 * tests can override only what they care about. Casts through `any` because
 * the production interface in csvExport.ts does not yet declare Phase-75
 * fields (`capExAmount`, `freeCashFlow`, `opexExcludingDA`,
 * `depreciationAmortization`, `fcfMarginPercent`); Plan 03 will add them.
 */
function buildFixture(overrides: Partial<WeekData> = {}): IncomeStatementData {
  const baseCurrent = {
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
    // Phase 75 new fields:
    opexExcludingDA: 0,
    ebit: 0,
    ebitMarginPercent: null,
    depreciationAmount: 0,
    amortizationAmount: 0,
    depreciationAmortization: 0,
    ebitda: 0,
    ebitdaMarginPercent: null,
    otherItems: [],
    totalOther: 0,
    netIncome: 0,
    netMarginPercent: null,
    capExAmount: 0,
    freeCashFlow: 0,
    fcfMarginPercent: null,
    ...overrides,
  } as unknown as WeekData;

  const zeroDeltas = {
    grossRevenue: { amount: 0, percent: null },
    netRevenue: { amount: 0, percent: null },
    totalCogs: { amount: 0, percent: null },
    grossProfit: { amount: 0, percent: null },
    grossMarginPp: null,
    totalOpEx: { amount: 0, percent: null },
    ebit: { amount: 0, percent: null },
    ebitMarginPp: null,
    ebitda: { amount: 0, percent: null },
    ebitdaMarginPp: null,
    totalOther: { amount: 0, percent: null },
    netIncome: { amount: 0, percent: null },
    netMarginPp: null,
  };

  return {
    weekStart: Date.UTC(2026, 2, 22, 17, 0, 0),
    weekEnd: Date.UTC(2026, 2, 29, 17, 0, 0),
    current: baseCurrent,
    previous: baseCurrent,
    deltas: zeroDeltas,
  };
}

// NB (R2): test-only naive CSV parser — assumes unquoted fields and no embedded commas.
// Do NOT reuse outside tests. Production code uses the proper generator in src/lib/csvExport.ts
// with the formula-injection sanitizer at src/lib/csvExport.ts:607-623.
function parseRows(csv: string): Array<Record<string, string>> {
  const lines = csv
    .split("\n")
    .filter((l) => l.trim().length > 0 && !l.startsWith("#"));
  const [header, ...rest] = lines;
  const cols = header.split(",").map((c) => c.replace(/"/g, ""));
  return rest.map((line) => {
    const vals = line.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? ""]));
  });
}

/**
 * Strip the formula-injection apostrophe prefix that csvExport.ts prepends to
 * cells starting with `-` / `=` / `+` / `@`. Needed because amount_idr values
 * like `-15000000` become `'-15000000` in the emitted CSV.
 */
function stripFormulaPrefix(cell: string): string {
  return cell.startsWith("'") ? cell.slice(1) : cell;
}

describe("generateIncomeStatementCSV — Phase 75 rows (D-16)", () => {
  it("CSV includes CapEx and Free Cash Flow rows", () => {
    const data = buildFixture({
      capExAmount: 15_000_000,
      freeCashFlow: 38_000_000,
      netIncome: 50_000_000,
      depreciationAmortization: 3_000_000,
    } as Partial<WeekData>);

    const csv = generateIncomeStatementCSV(data, "2026-W14");
    const rows = parseRows(csv);
    const lineItems = rows.map((r) => r.line_item);

    const capExRow = rows.find(
      (r) => r.line_item === "CapEx (Fixed Asset Acquisitions)",
    );
    expect(capExRow, `CapEx row missing. Line items: ${lineItems.join("|")}`)
      .toBeDefined();
    // CapEx is a cash outflow — emitted as a negative number in amount_idr.
    expect(stripFormulaPrefix(capExRow!.amount_idr)).toBe("-15000000");

    const fcfRow = rows.find((r) => r.line_item === "Free Cash Flow");
    expect(fcfRow, `Free Cash Flow row missing. Line items: ${lineItems.join("|")}`)
      .toBeDefined();
    expect(stripFormulaPrefix(fcfRow!.amount_idr)).toBe("38000000");
  });

  it("Row order: OpEx-excl-DA → EBITDA → D/A → EBIT → Net Income → CapEx → Free Cash Flow", () => {
    const data = buildFixture({
      totalOpEx: 10_000_000,
      opexExcludingDA: 7_000_000,
      depreciationAmount: 2_000_000,
      amortizationAmount: 1_000_000,
      depreciationAmortization: 3_000_000,
      ebitda: 25_000_000,
      ebit: 22_000_000,
      netIncome: 20_000_000,
      capExAmount: 5_000_000,
      freeCashFlow: 18_000_000,
    } as Partial<WeekData>);

    const csv = generateIncomeStatementCSV(data, "2026-W14");
    const rows = parseRows(csv);
    const lineItems = rows.map((r) => r.line_item);

    const idxOpexExDA = lineItems.indexOf(
      "Total Operating Expenses (excl. D/A)",
    );
    const idxEbitda = lineItems.indexOf("EBITDA");
    const idxDA = lineItems.indexOf("Depreciation & Amortization");
    const idxEbit = lineItems.indexOf("EBIT (Operating Profit)");
    const idxNetIncome = lineItems.indexOf("NET INCOME");
    const idxCapex = lineItems.indexOf("CapEx (Fixed Asset Acquisitions)");
    const idxFcf = lineItems.indexOf("Free Cash Flow");

    // All required rows must be present.
    expect(idxOpexExDA, "OpEx (excl. D/A) row missing").toBeGreaterThanOrEqual(
      0,
    );
    expect(idxEbitda, "EBITDA row missing").toBeGreaterThanOrEqual(0);
    expect(idxDA, "Depreciation & Amortization row missing").toBeGreaterThanOrEqual(
      0,
    );
    expect(idxEbit, "EBIT row missing").toBeGreaterThanOrEqual(0);
    expect(idxNetIncome, "NET INCOME row missing").toBeGreaterThanOrEqual(0);
    expect(idxCapex, "CapEx row missing").toBeGreaterThanOrEqual(0);
    expect(idxFcf, "Free Cash Flow row missing").toBeGreaterThanOrEqual(0);

    // Canonical order — D-07.
    expect(idxOpexExDA).toBeLessThan(idxEbitda);
    expect(idxEbitda).toBeLessThan(idxDA);
    expect(idxDA).toBeLessThan(idxEbit);
    expect(idxEbit).toBeLessThan(idxNetIncome);
    expect(idxNetIncome).toBeLessThan(idxCapex);
    expect(idxCapex).toBeLessThan(idxFcf);
  });

  it("Gross Profit row renamed to Contribution Margin at company level, per-channel columns blank below that", () => {
    const data = buildFixture({
      channels: [
        {
          source: "shopee",
          displayName: "Shopee",
          gross: 5_000_000,
          netRevenue: 4_500_000,
          discount: 100_000,
          commission: 400_000,
          adBurn: 0,
          promoBurn: 0,
          revShare: 0,
          confidence: "exact",
          cogs: { production: 1_000_000, packaging: 500_000, total: 1_500_000 },
        },
        {
          source: "gofood",
          displayName: "GoFood",
          gross: 3_000_000,
          netRevenue: 2_700_000,
          discount: 0,
          commission: 300_000,
          adBurn: 0,
          promoBurn: 0,
          revShare: 0,
          confidence: "exact",
          cogs: { production: 600_000, packaging: 300_000, total: 900_000 },
        },
      ],
      totalGross: 8_000_000,
      netRevenue: 7_200_000,
      totalProductionCogs: 1_600_000,
      totalPackagingCogs: 800_000,
      totalCogs: 2_400_000,
      grossProfit: 4_800_000,
    } as Partial<WeekData>);

    const csv = generateIncomeStatementCSV(data, "2026-W14");
    const rows = parseRows(csv);

    // Contribution Margin must appear at the company-total (channel="All") subtotal row.
    const contribRow = rows.find(
      (r) =>
        r.line_item === "Contribution Margin" ||
        r.line_item === "Gross Profit / Contribution Margin",
    );
    expect(
      contribRow,
      `Contribution Margin row missing. Line items: ${rows.map((r) => r.line_item).join("|")}`,
    ).toBeDefined();
    expect(contribRow!.channel).toBe("All");

    // All rows AFTER Contribution Margin must have channel === "All" (no per-
    // channel OpEx / D/A / EBIT / EBITDA / Net Income / CapEx / FCF rows).
    const contribIdx = rows.indexOf(contribRow!);
    const rowsAfter = rows.slice(contribIdx + 1);
    for (const r of rowsAfter) {
      expect(
        r.channel,
        `Row "${r.line_item}" has channel="${r.channel}" — must be "All" after Contribution Margin`,
      ).toBe("All");
    }
  });

  it("D/A extracted from OpEx: 6150/6160 lines do NOT appear in OpEx rows; appear once in D/A row", () => {
    // Post-Wave-1 shape: current.opex is pre-filtered to EXCLUDE 6150/6160;
    // depreciationAmortization carries the combined D+A total.
    const data = buildFixture({
      opex: [{ code: "6100", name: "Office Rent", total: 5_000_000 }],
      totalOpEx: 5_000_000,
      opexExcludingDA: 5_000_000,
      depreciationAmount: 2_000_000,
      amortizationAmount: 1_000_000,
      depreciationAmortization: 3_000_000,
    } as Partial<WeekData>);

    const csv = generateIncomeStatementCSV(data, "2026-W14");
    const rows = parseRows(csv);

    // No 6150 / 6160 OpEx lines.
    for (const r of rows) {
      expect(
        /^6150\s/.test(r.line_item),
        `Row "${r.line_item}" still contains a 6150 OpEx line; D/A must be stripped`,
      ).toBe(false);
      expect(
        /^6160\s/.test(r.line_item),
        `Row "${r.line_item}" still contains a 6160 OpEx line; D/A must be stripped`,
      ).toBe(false);
    }

    // Exactly one Depreciation & Amortization row with total = -3M.
    const daRows = rows.filter(
      (r) => r.line_item === "Depreciation & Amortization",
    );
    expect(daRows.length).toBe(1);
    expect(stripFormulaPrefix(daRows[0].amount_idr)).toBe("-3000000");
  });
});
