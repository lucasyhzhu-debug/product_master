/**
 * Phase 75 Wave 0 — Plan 00 Task 2
 *
 * Unit tests for the D-15 `missingReversals` gap check.
 *
 * The gap check (Plan 01 Task 4) finds expenses that were converted to fixed
 * assets (Phase 71 Direction A) whose ORIGINAL journal entry was not reversed.
 * That leaks a phantom OpEx line on the P&L alongside the asset's CapEx line —
 * a double-count.
 *
 * Direction B — `reclassifyToExpense` creates an expense with `sourceAssetId`
 * and NO `convertedToAssetId`. That path is NOT a failed reversal and MUST NOT
 * appear in `missingReversals`. Test 3 locks that scope.
 *
 * RED-state expectation: authored during Wave 0 to run RED against the base
 * commit; tests flip GREEN once Plan 01 Task 4 ships the
 * `gapAnalysis.missingReversals` field. If the parent branch has already
 * executed Plan 01, these tests pass immediately — still serves as a CI-locked
 * contract for FIN-01 acceptance.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

const PERIOD_START = Date.UTC(2026, 2, 22, 17, 0, 0);
const PERIOD_END = Date.UTC(2026, 2, 29, 17, 0, 0);
const IN_PERIOD = Date.UTC(2026, 2, 25, 17, 0, 0);

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

async function seedJournalEntry(
  t: TestT,
  userId: Id<"users">,
  opts: {
    sourceType:
      | "expense_approval"
      | "manual"
      | "depreciation"
      | "asset_acquisition";
    isReversed: boolean;
    reversedByEntryId?: Id<"journalEntries">;
    entryDate?: number;
  },
): Promise<Id<"journalEntries">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("journalEntries", {
      entryNumber: `JE-TEST-${Math.random().toString(36).slice(2, 9)}`,
      date: opts.entryDate ?? IN_PERIOD,
      description: "Test JE",
      sourceType: opts.sourceType,
      isReversed: opts.isReversed,
      ...(opts.reversedByEntryId
        ? { reversedByEntryId: opts.reversedByEntryId }
        : {}),
      createdBy: userId,
      createdAt: Date.now(),
    }),
  );
}

async function seedFixedAsset(
  t: TestT,
  userId: Id<"users">,
  opts: {
    acquisitionDate?: number;
    cost?: number;
    sourceExpenseId?: Id<"expenses">;
    suffix?: string;
  } = {},
): Promise<Id<"fixedAssets">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("fixedAssets", {
      assetNumber: `FA-KIT-TEST-${opts.suffix ?? Math.random().toString(36).slice(2, 8)}`,
      name: "Test Mixer",
      category: "mesin_produksi",
      acquisitionDate: opts.acquisitionDate ?? IN_PERIOD,
      cost: opts.cost ?? 10_000_000,
      salvageValue: 0,
      usefulLifeMonths: 96,
      characteristics: [],
      attachmentIds: [],
      status: "active",
      monthlyDepreciation: 0,
      accumulatedDepreciation: 0,
      ...(opts.sourceExpenseId
        ? { sourceExpenseId: opts.sourceExpenseId }
        : {}),
      createdBy: userId,
      createdAt: Date.now(),
    }),
  );
}

async function seedExpense(
  t: TestT,
  userId: Id<"users">,
  accountId: Id<"accounts">,
  opts: {
    amount: number;
    journalEntryId: Id<"journalEntries">;
    convertedToAssetId?: Id<"fixedAssets">;
    sourceAssetId?: Id<"fixedAssets">;
    expenseDate?: number;
  },
): Promise<Id<"expenses">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("expenses", {
      expenseNumber: `EXP-TEST-${Math.random().toString(36).slice(2, 9)}`,
      submittedBy: userId,
      amount: opts.amount,
      accountId,
      expenseDate: opts.expenseDate ?? IN_PERIOD,
      description: "Test expense",
      vendorName: "Test Vendor",
      paymentMethod: "company_paid",
      status: "recorded",
      lateSubmission: false,
      journalEntryId: opts.journalEntryId,
      ...(opts.convertedToAssetId
        ? { convertedToAssetId: opts.convertedToAssetId }
        : {}),
      ...(opts.sourceAssetId ? { sourceAssetId: opts.sourceAssetId } : {}),
      createdAt: Date.now(),
    }),
  );
}

describe("incomeStatement — missingReversals gap (D-15)", () => {
  it("Healthy state: converted expense with reversed JE produces empty missingReversals", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);
    const opexAccountId = await seedOpexAccount(t, "6100", "Office Rent");

    // Healthy Direction A: expense → asset, and the original JE is reversed.
    const originalJeId = await seedJournalEntry(t, userId, {
      sourceType: "expense_approval",
      isReversed: true,
    });
    const assetId = await seedFixedAsset(t, userId, { suffix: "HEALTHY" });
    await seedExpense(t, userId, opexAccountId, {
      amount: 12_500_000,
      journalEntryId: originalJeId,
      convertedToAssetId: assetId,
    });

    const stmt = await t.query(
      api.reports.incomeStatement.getIncomeStatement,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END },
    );

    // Array-shape check — guards against undefined returns (field must exist).
    expect(Array.isArray(stmt.current.gapAnalysis.missingReversals)).toBe(true);
    expect(stmt.current.gapAnalysis.missingReversals.length).toBe(0);
  });

  it("Broken state: converted expense with un-reversed JE shows up in missingReversals", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);
    const opexAccountId = await seedOpexAccount(t, "6100", "Office Rent");

    // Broken Direction A: expense → asset, but original JE was NEVER reversed.
    // This is the exact failure mode D-15 guards against — the expense's OpEx
    // lines still hit the P&L even though the asset is also on the balance
    // sheet, causing double-counting.
    const originalJeId = await seedJournalEntry(t, userId, {
      sourceType: "expense_approval",
      isReversed: false,
    });
    const assetId = await seedFixedAsset(t, userId, { suffix: "BROKEN" });
    const expenseId = await seedExpense(t, userId, opexAccountId, {
      amount: 8_750_000,
      journalEntryId: originalJeId,
      convertedToAssetId: assetId,
    });

    const stmt = await t.query(
      api.reports.incomeStatement.getIncomeStatement,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END },
    );

    expect(stmt.current.gapAnalysis.missingReversals.length).toBe(1);
    expect(stmt.current.gapAnalysis.missingReversals[0].expenseId).toBe(
      expenseId,
    );
    expect(stmt.current.gapAnalysis.missingReversals[0].journalEntryId).toBe(
      originalJeId,
    );
  });

  it("Direction-B reclassification (sourceAssetId) does NOT trigger missingReversals", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);
    const opexAccountId = await seedOpexAccount(t, "6100", "Office Rent");

    // Direction B: reclassifyToExpense output — asset → expense.
    // The expense has sourceAssetId (NOT convertedToAssetId). D-15 must
    // scope narrowly to Direction A only; this expense must NOT appear in
    // missingReversals even though its JE is not reversed.
    const assetId = await seedFixedAsset(t, userId, { suffix: "DIR-B-ASSET" });
    const jeId = await seedJournalEntry(t, userId, {
      sourceType: "manual",
      isReversed: false,
    });
    await seedExpense(t, userId, opexAccountId, {
      amount: 6_000_000,
      journalEntryId: jeId,
      sourceAssetId: assetId,
      // convertedToAssetId intentionally left undefined — this is the key
      // distinction between Direction B (asset→expense) and Direction A
      // (expense→asset). Any future change that loosens the D-15 filter
      // to include `sourceAssetId` rows will fail this assertion.
    });

    const stmt = await t.query(
      api.reports.incomeStatement.getIncomeStatement,
      { periodStart: PERIOD_START, periodEnd: PERIOD_END },
    );

    // Strong array check — see test 1 comment for rationale.
    expect(Array.isArray(stmt.current.gapAnalysis.missingReversals)).toBe(true);
    expect(stmt.current.gapAnalysis.missingReversals.length).toBe(0);
  });
});
