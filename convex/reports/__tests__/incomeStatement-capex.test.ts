/**
 * Phase 75 Wave 0 — Plan 00 Task 1
 *
 * RED-state unit tests for CapEx aggregation + Free Cash Flow formula + D/A
 * extraction on the weekly income statement. Assert on fields that do NOT yet
 * exist on the `WeekData` return shape today:
 *   - current.capExAmount
 *   - current.freeCashFlow
 *   - current.depreciationAmortization
 *   - current.opexExcludingDA
 *
 * Until Plan 01 Task 3 ships, every one of these 6 `it(...)` blocks MUST fail
 * (numeric `toBe` against `undefined`). After Plan 01 ships, all 6 flip green
 * and lock FIN-01 acceptance into CI.
 *
 * Covers: D-01 (in-period sum), D-04 (reclassified still counted),
 *         D-05 (half-open interval), D-06 (original expenseDate on converted
 *         assets), D-13 (FCF formula), D-14 (zero-CapEx period).
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

// Period: Monday 2026-03-23 00:00 WIB through Monday 2026-03-30 00:00 WIB (exclusive).
// WIB = UTC+7, so 00:00 WIB = 17:00 UTC previous day.
const PERIOD_START = Date.UTC(2026, 2, 22, 17, 0, 0); // 2026-03-23 00:00 WIB
const PERIOD_END = Date.UTC(2026, 2, 29, 17, 0, 0); // 2026-03-30 00:00 WIB (exclusive)
const IN_PERIOD = Date.UTC(2026, 2, 25, 17, 0, 0); // Thursday inside period
const BEFORE_PERIOD = Date.UTC(2026, 2, 15, 17, 0, 0);
const AFTER_PERIOD = Date.UTC(2026, 3, 5, 17, 0, 0);

async function seedUser(t: TestT): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Test Admin",
      pinHash: "salt:hash",
      role: "admin",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    }),
  );
}

async function seedOpexAccount(
  t: TestT,
  code: string,
  name: string,
): Promise<Id<"accounts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("accounts", {
      code,
      name,
      type: "opex",
      category: "operating_expense",
      isActive: true,
      isSystem: true,
    }),
  );
}

async function seedFixedAsset(
  t: TestT,
  userId: Id<"users">,
  overrides: {
    acquisitionDate?: number;
    cost?: number;
    disposalType?: "sold" | "scrapped" | "written_off" | "reclassify_to_expense";
    sourceExpenseId?: Id<"expenses">;
    assetNumberSuffix?: string;
  } = {},
): Promise<Id<"fixedAssets">> {
  const suffix =
    overrides.assetNumberSuffix ??
    Math.random().toString(36).slice(2, 8).toUpperCase();
  return await t.run(async (ctx) =>
    ctx.db.insert("fixedAssets", {
      assetNumber: `FA-KIT-TEST-${suffix}`,
      name: "Test Mixer",
      category: "mesin_produksi",
      acquisitionDate: overrides.acquisitionDate ?? IN_PERIOD,
      cost: overrides.cost ?? 10_000_000,
      salvageValue: 0,
      usefulLifeMonths: 96,
      characteristics: [],
      attachmentIds: [],
      status: "active",
      monthlyDepreciation: 0,
      accumulatedDepreciation: 0,
      ...(overrides.disposalType
        ? { disposalType: overrides.disposalType, disposalDate: IN_PERIOD }
        : {}),
      ...(overrides.sourceExpenseId
        ? { sourceExpenseId: overrides.sourceExpenseId }
        : {}),
      createdBy: userId,
      createdAt: Date.now(),
    }),
  );
}

/**
 * Post a simple single-account journal entry with a debit line against the
 * provided expense account. Used to simulate a real OpEx line hitting the
 * P&L for depreciation/amortization periods.
 */
async function seedJournalDebit(
  t: TestT,
  userId: Id<"users">,
  accountId: Id<"accounts">,
  amount: number,
  entryDate: number,
  sourceType: "depreciation" | "manual" = "depreciation",
): Promise<Id<"journalEntries">> {
  return await t.run(async (ctx) => {
    const jeId = await ctx.db.insert("journalEntries", {
      entryNumber: `JE-TEST-${Math.random().toString(36).slice(2, 9)}`,
      date: entryDate,
      description: "Test JE",
      sourceType,
      isReversed: false,
      createdBy: userId,
      createdAt: Date.now(),
    });
    // Debit the expense account — this is what getIncomeStatement aggregates
    // via journalEntryLines.by_entryDate into opex.items.
    await ctx.db.insert("journalEntryLines", {
      journalEntryId: jeId,
      accountId,
      entryDate,
      debitAmount: amount,
      creditAmount: 0,
    });
    return jeId;
  });
}

describe("incomeStatement — CapEx and FCF (FIN-01)", () => {
  it("CapEx sums fixedAssets.cost in-period", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // Three assets, one before / one inside / one after the period window.
    await seedFixedAsset(t, userId, {
      acquisitionDate: BEFORE_PERIOD,
      cost: 5_000_000,
      assetNumberSuffix: "BEFORE",
    });
    await seedFixedAsset(t, userId, {
      acquisitionDate: IN_PERIOD,
      cost: 10_000_000,
      assetNumberSuffix: "INSIDE",
    });
    await seedFixedAsset(t, userId, {
      acquisitionDate: AFTER_PERIOD,
      cost: 7_500_000,
      assetNumberSuffix: "AFTER",
    });

    const stmt = await t.query(
      api.reports.incomeStatement.getIncomeStatement,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END },
    );

    // RED: capExAmount does not yet exist on WeekData → `undefined` → fails.
    expect(stmt.current.capExAmount).toBe(10_000_000);
  });

  it("CapEx uses original expenseDate for Phase-71 converted assets (D-06)", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // Seed a minimal expense with expenseDate inside period. The fixedAsset
    // row's acquisitionDate MUST be the expense.expenseDate (not Date.now),
    // which is what convertToCapex stamps at convex/expenses/mutations.ts:846.
    const opexAccountId = await seedOpexAccount(t, "6100", "Office Rent");
    const expenseId = await t.run(async (ctx) =>
      ctx.db.insert("expenses", {
        expenseNumber: "EXP-TEST-0001",
        submittedBy: userId,
        amount: 12_500_000,
        accountId: opexAccountId,
        expenseDate: IN_PERIOD,
        description: "Mixer purchase (converted to CapEx)",
        vendorName: "Mixer Vendor",
        paymentMethod: "company_paid",
        status: "recorded",
        lateSubmission: false,
        createdAt: Date.now(),
      }),
    );

    await seedFixedAsset(t, userId, {
      acquisitionDate: IN_PERIOD, // ← must match expense.expenseDate per D-06
      cost: 12_500_000,
      sourceExpenseId: expenseId,
      assetNumberSuffix: "CONVERTED",
    });

    const stmt = await t.query(
      api.reports.incomeStatement.getIncomeStatement,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END },
    );

    expect(stmt.current.capExAmount).toBe(12_500_000);
  });

  it("Reclassified asset still counted in CapEx (D-04)", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    await seedFixedAsset(t, userId, {
      acquisitionDate: IN_PERIOD,
      cost: 8_000_000,
      disposalType: "reclassify_to_expense",
      assetNumberSuffix: "RECLASSIFIED",
    });

    const stmt = await t.query(
      api.reports.incomeStatement.getIncomeStatement,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END },
    );

    // D-04: a reclassified asset MUST still count in CapEx — the reclassify
    // flow reverses the asset separately and creates a paired expense; double-
    // removal would under-report CapEx.
    expect(stmt.current.capExAmount).toBe(8_000_000);
  });

  it("FCF = netIncome + depreciationAmortization − capExAmount (D-13)", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // Seed D/A OpEx journal entries so depreciationAmortization = 3_000_000.
    const depAccountId = await seedOpexAccount(t, "6150", "Depreciation");
    const amortAccountId = await seedOpexAccount(t, "6160", "Amortization");
    await seedJournalDebit(t, userId, depAccountId, 2_000_000, IN_PERIOD, "depreciation");
    await seedJournalDebit(
      t,
      userId,
      amortAccountId,
      1_000_000,
      IN_PERIOD,
      "depreciation",
    );

    // Seed CapEx asset of 15_000_000 in period.
    await seedFixedAsset(t, userId, {
      acquisitionDate: IN_PERIOD,
      cost: 15_000_000,
      assetNumberSuffix: "FCF-CAPEX",
    });

    const stmt = await t.query(
      api.reports.incomeStatement.getIncomeStatement,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END },
    );

    // depreciationAmortization = 2M + 1M = 3M
    expect(stmt.current.depreciationAmortization).toBe(3_000_000);

    // opexExcludingDA = totalOpEx − 3M (D/A stripped from operating expenses).
    expect(stmt.current.opexExcludingDA).toBe(
      stmt.current.totalOpEx - 3_000_000,
    );

    // capExAmount picked up from fixedAssets in-period.
    expect(stmt.current.capExAmount).toBe(15_000_000);

    // FCF = netIncome + D/A − CapEx.
    expect(stmt.current.freeCashFlow).toBe(
      stmt.current.netIncome + 3_000_000 - 15_000_000,
    );
  });

  it("Zero CapEx period: capExAmount === 0, freeCashFlow === netIncome + DA (D-14)", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // D/A only, no fixedAssets — zero-CapEx guard.
    const depAccountId = await seedOpexAccount(t, "6150", "Depreciation");
    await seedJournalDebit(t, userId, depAccountId, 500_000, IN_PERIOD, "depreciation");

    const stmt = await t.query(
      api.reports.incomeStatement.getIncomeStatement,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END },
    );

    expect(stmt.current.capExAmount).toBe(0);
    expect(stmt.current.freeCashFlow).toBe(
      stmt.current.netIncome + stmt.current.depreciationAmortization,
    );
  });

  it("Period boundary: asset at periodStart counts, at periodEnd does NOT count", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // Half-open interval [periodStart, periodEnd) — D-05.
    await seedFixedAsset(t, userId, {
      acquisitionDate: PERIOD_START, // inclusive → counts
      cost: 4_000_000,
      assetNumberSuffix: "BOUNDARY-START",
    });
    await seedFixedAsset(t, userId, {
      acquisitionDate: PERIOD_END, // exclusive → excluded
      cost: 9_999_999,
      assetNumberSuffix: "BOUNDARY-END",
    });

    const stmt = await t.query(
      api.reports.incomeStatement.getIncomeStatement,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END },
    );

    expect(stmt.current.capExAmount).toBe(4_000_000);
  });
});
