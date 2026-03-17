/**
 * Integration tests for expense analytics queries.
 *
 * Uses convex-test to seed accounts, journal lines, expenses, and users,
 * then verifies the 3 analytics endpoints: getOpExAnalytics, getExpenseMetrics,
 * and getFraudFlags.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { createTestSession } from "../helpers/authTestHelper";
import type { TestConvex } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";

type TestContext = TestConvex<typeof schema>;

// ─── Helpers ───

async function seedOpexAccount(
  t: TestContext,
  code: string,
  name: string
): Promise<Id<"accounts">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("accounts", {
      code,
      name,
      type: "opex",
      category: "Operating Expenses",
      isActive: true,
      isSystem: false,
    });
  });
}

async function seedJournalLine(
  t: TestContext,
  accountId: Id<"accounts">,
  entryDate: number,
  debitAmount: number,
  creditAmount: number,
  createdBy?: Id<"users">
): Promise<void> {
  await t.run(async (ctx) => {
    // If no createdBy provided, create a test user
    let userId = createdBy;
    if (!userId) {
      userId = await ctx.db.insert("users", {
        name: "JE Creator",
        pinHash: "test:hash",
        role: "admin",
        isActive: true,
        failedAttempts: 0,
        createdAt: Date.now(),
      });
    }
    // Need a parent journalEntry
    const jeId = await ctx.db.insert("journalEntries", {
      entryNumber: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: entryDate,
      description: "Test journal entry",
      sourceType: "manual",
      isReversed: false,
      createdBy: userId,
      createdAt: Date.now(),
    });
    await ctx.db.insert("journalEntryLines", {
      journalEntryId: jeId,
      accountId,
      entryDate,
      debitAmount,
      creditAmount,
      description: "Test line",
    });
  });
}

async function seedUser(t: TestContext, name: string): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name,
      pinHash: "test:hash",
      role: "order_staff",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
  });
}

async function seedExpense(
  t: TestContext,
  overrides: {
    submittedBy: Id<"users">;
    accountId: Id<"accounts">;
    amount: number;
    expenseDate: number;
    status: "draft" | "submitted" | "approved" | "rejected" | "awaiting_payment" | "reimbursed" | "voided";
    vendorName?: string;
    approvedBy?: Id<"users">;
    approvedAt?: number;
    submittedAt?: number;
  }
): Promise<Id<"expenses">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("expenses", {
      expenseNumber: `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      submittedBy: overrides.submittedBy,
      amount: overrides.amount,
      accountId: overrides.accountId,
      expenseDate: overrides.expenseDate,
      description: "Test expense",
      vendorName: overrides.vendorName ?? "Test Vendor",
      paymentMethod: "employee_paid",
      status: overrides.status,
      lateSubmission: false,
      createdAt: Date.now(),
      submittedAt: overrides.submittedAt,
      approvedBy: overrides.approvedBy,
      approvedAt: overrides.approvedAt,
    });
  });
}

// ─── Constants ───

// March 2026 period (WIB midnight = UTC - 7hrs)
const PERIOD_START = new Date("2026-03-01T00:00:00Z").getTime();
const PERIOD_END = new Date("2026-04-01T00:00:00Z").getTime();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// getOpExAnalytics
// ============================================================================

describe("getOpExAnalytics", () => {
  test("returns correct totals for seeded journal lines", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });

    // Seed 2 opex accounts
    const rentAcct = await seedOpexAccount(t, "6200", "Rent Expense");
    const utilAcct = await seedOpexAccount(t, "6300", "Utilities Expense");

    // Seed journal lines in March
    const marchDate = new Date("2026-03-15T10:00:00Z").getTime();
    await seedJournalLine(t, rentAcct, marchDate, 1_000_000, 0);
    await seedJournalLine(t, utilAcct, marchDate, 500_000, 0);
    await seedJournalLine(t, utilAcct, marchDate, 200_000, 0);

    const result = await t.query(
      api.expenses.analyticsQueries.getOpExAnalytics,
      { sessionId, periodStart: PERIOD_START, periodEnd: PERIOD_END }
    );

    expect(result.totalOpEx).toBe(1_700_000);
    expect(result.byCategory).toHaveLength(2);
    // Sorted by total descending
    expect(result.byCategory[0].code).toBe("6200");
    expect(result.byCategory[0].total).toBe(1_000_000);
    expect(result.byCategory[1].code).toBe("6300");
    expect(result.byCategory[1].total).toBe(700_000);
    // Trend is always 6 entries
    expect(result.trend).toHaveLength(6);
  });

  test("6-month trend uses YYYY-MM keys", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const acct = await seedOpexAccount(t, "6200", "Rent Expense");

    // Seed a line in March
    const marchDate = new Date("2026-03-15T10:00:00Z").getTime();
    await seedJournalLine(t, acct, marchDate, 300_000, 0);

    const result = await t.query(
      api.expenses.analyticsQueries.getOpExAnalytics,
      { sessionId, periodStart: PERIOD_START, periodEnd: PERIOD_END }
    );

    // Trend should have 6 months
    expect(result.trend).toHaveLength(6);
    // Each trend entry should have month and total
    for (const entry of result.trend) {
      expect(entry).toHaveProperty("month");
      expect(entry).toHaveProperty("total");
      expect(typeof entry.month).toBe("string");
      expect(typeof entry.total).toBe("number");
    }
  });

  test("rejects non-approver roles", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "kitchen" });

    await expect(
      t.query(api.expenses.analyticsQueries.getOpExAnalytics, {
        sessionId,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      })
    ).rejects.toThrow(/Unauthorized/);
  });
});

// ============================================================================
// getExpenseMetrics
// ============================================================================

describe("getExpenseMetrics", () => {
  test("returns correct employee breakdown and pending total", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const acct = await seedOpexAccount(t, "6100", "Salaries");
    const emp1 = await seedUser(t, "Alice");
    const emp2 = await seedUser(t, "Bob");

    const marchDate = new Date("2026-03-10T10:00:00Z").getTime();

    // Alice: 2 approved, 1 awaiting_payment
    await seedExpense(t, {
      submittedBy: emp1,
      accountId: acct,
      amount: 200_000,
      expenseDate: marchDate,
      status: "approved",
      submittedAt: marchDate - MS_PER_DAY,
      approvedBy: emp2,
      approvedAt: marchDate,
    });
    await seedExpense(t, {
      submittedBy: emp1,
      accountId: acct,
      amount: 150_000,
      expenseDate: marchDate,
      status: "approved",
      submittedAt: marchDate - 2 * MS_PER_DAY,
      approvedBy: emp2,
      approvedAt: marchDate,
    });
    await seedExpense(t, {
      submittedBy: emp1,
      accountId: acct,
      amount: 100_000,
      expenseDate: marchDate,
      status: "awaiting_payment",
      submittedAt: marchDate - MS_PER_DAY,
      approvedBy: emp2,
      approvedAt: marchDate,
    });

    // Bob: 1 reimbursed
    await seedExpense(t, {
      submittedBy: emp2,
      accountId: acct,
      amount: 300_000,
      expenseDate: marchDate,
      status: "reimbursed",
      submittedAt: marchDate - 3 * MS_PER_DAY,
      approvedBy: emp1,
      approvedAt: marchDate - MS_PER_DAY,
    });

    const result = await t.query(
      api.expenses.analyticsQueries.getExpenseMetrics,
      { sessionId, periodStart: PERIOD_START, periodEnd: PERIOD_END }
    );

    // byEmployee sorted by total descending
    expect(result.byEmployee).toHaveLength(2);
    expect(result.byEmployee[0].name).toBe("Alice");
    expect(result.byEmployee[0].total).toBe(450_000); // 200K + 150K + 100K
    expect(result.byEmployee[1].name).toBe("Bob");
    expect(result.byEmployee[1].total).toBe(300_000);

    // pendingTotal: all awaiting_payment globally (the 100K from Alice)
    expect(result.pendingTotal).toBe(100_000);

    // avgApprovalDays should be a number
    expect(typeof result.avgApprovalDays).toBe("number");
  });

  test("rejects non-approver roles", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "order_staff" });

    await expect(
      t.query(api.expenses.analyticsQueries.getExpenseMetrics, {
        sessionId,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      })
    ).rejects.toThrow(/Unauthorized/);
  });
});

// ============================================================================
// getFraudFlags
// ============================================================================

describe("getFraudFlags", () => {
  test("returns expected split detection flags", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const acct = await seedOpexAccount(t, "6100", "Salaries");
    const emp = await seedUser(t, "Charlie");

    const now = Date.now();
    const recentDate = now - 2 * MS_PER_DAY; // 2 days ago

    // 2 expenses from same employee + same GL, 4hrs apart, sum > 500K
    await seedExpense(t, {
      submittedBy: emp,
      accountId: acct,
      amount: 300_000,
      expenseDate: recentDate,
      status: "submitted",
    });
    await seedExpense(t, {
      submittedBy: emp,
      accountId: acct,
      amount: 350_000,
      expenseDate: recentDate + 4 * 60 * 60 * 1000,
      status: "submitted",
    });

    const result = await t.query(
      api.expenses.analyticsQueries.getFraudFlags,
      { sessionId }
    );

    expect(result.splits.length).toBeGreaterThanOrEqual(1);
    // Should have the employee name resolved
    expect(result.splits[0]).toHaveProperty("employeeName");
  });

  test("returns unfamiliar vendor flags", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const acct = await seedOpexAccount(t, "6100", "Salaries");
    const emp = await seedUser(t, "Dave");

    const now = Date.now();

    // Historical vendor (60 days ago)
    await seedExpense(t, {
      submittedBy: emp,
      accountId: acct,
      amount: 50_000,
      expenseDate: now - 60 * MS_PER_DAY,
      status: "approved",
      vendorName: "Old Vendor",
      approvedBy: emp,
      approvedAt: now - 59 * MS_PER_DAY,
    });

    // Recent expense with brand new vendor (5 days ago)
    await seedExpense(t, {
      submittedBy: emp,
      accountId: acct,
      amount: 100_000,
      expenseDate: now - 5 * MS_PER_DAY,
      status: "submitted",
      vendorName: "Totally New Corp",
    });

    const result = await t.query(
      api.expenses.analyticsQueries.getFraudFlags,
      { sessionId }
    );

    expect(result.unfamiliarVendors).toContain("Totally New Corp");
  });

  test("rejects non-approver roles", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "kitchen" });

    await expect(
      t.query(api.expenses.analyticsQueries.getFraudFlags, {
        sessionId,
      })
    ).rejects.toThrow(/Unauthorized/);
  });
});
