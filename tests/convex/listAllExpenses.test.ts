/**
 * Integration tests for listAllExpenses admin-only query.
 *
 * Verifies: admin access, non-admin rejection, status filtering,
 * submitterName join, and empty state handling.
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

async function seedExpense(
  t: TestContext,
  overrides: {
    submittedBy: Id<"users">;
    accountId: Id<"accounts">;
    amount: number;
    expenseDate: number;
    status:
      | "draft"
      | "submitted"
      | "approved"
      | "rejected"
      | "awaiting_payment"
      | "reimbursed"
      | "voided"
      | "recorded"
      | "paid";
    vendorName?: string;
    createdAt?: number;
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
      createdAt: overrides.createdAt ?? Date.now(),
    });
  });
}

// ─── Tests ───

describe("listAllExpenses", () => {
  test("admin sees expenses from all users", async () => {
    const t = convexTest(schema);
    const adminSession = await createTestSession(t, {
      role: "admin",
      name: "Admin User",
    });
    const accountId = await seedOpexAccount(t, "6100", "Office Supplies");

    // Create a second user (non-admin)
    const user2Id = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Staff Member",
        pinHash: "test:hash",
        role: "order_staff",
        isActive: true,
        failedAttempts: 0,
        createdAt: Date.now(),
      });
    });

    // Get admin userId from session
    const adminUserId = await t.run(async (ctx) => {
      const sessions = await ctx.db.query("sessions").collect();
      const session = sessions.find((s) => s.token === adminSession);
      return session!.userId;
    });

    await seedExpense(t, {
      submittedBy: adminUserId,
      accountId,
      amount: 100000,
      expenseDate: Date.now(),
      status: "submitted",
    });
    await seedExpense(t, {
      submittedBy: user2Id,
      accountId,
      amount: 200000,
      expenseDate: Date.now(),
      status: "approved",
    });

    const result = await t.query(api.expenses.queries.listAllExpenses, {
      sessionId: adminSession,
    });
    expect(result).toHaveLength(2);
  });

  test("non-admin roles are rejected", async () => {
    const t = convexTest(schema);

    for (const role of ["kitchen", "order_staff", "manager"] as const) {
      const sessionId = await createTestSession(t, { role });
      await expect(
        t.query(api.expenses.queries.listAllExpenses, { sessionId })
      ).rejects.toThrow(/Unauthorized/);
    }
  });

  test("status filter returns matching expenses only", async () => {
    const t = convexTest(schema);
    const adminSession = await createTestSession(t, { role: "admin" });
    const accountId = await seedOpexAccount(t, "6100", "Supplies");

    const userId = await t.run(async (ctx) => {
      const sessions = await ctx.db.query("sessions").collect();
      return sessions.find((s) => s.token === adminSession)!.userId;
    });

    const now = Date.now();
    await seedExpense(t, {
      submittedBy: userId,
      accountId,
      amount: 10000,
      expenseDate: now,
      status: "submitted",
      createdAt: now - 2000,
    });
    await seedExpense(t, {
      submittedBy: userId,
      accountId,
      amount: 20000,
      expenseDate: now,
      status: "approved",
      createdAt: now - 1000,
    });
    await seedExpense(t, {
      submittedBy: userId,
      accountId,
      amount: 30000,
      expenseDate: now,
      status: "voided",
      createdAt: now,
    });

    const result = await t.query(api.expenses.queries.listAllExpenses, {
      sessionId: adminSession,
      status: "submitted",
    });
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(10000);
  });

  test("unfiltered returns all expenses", async () => {
    const t = convexTest(schema);
    const adminSession = await createTestSession(t, { role: "admin" });
    const accountId = await seedOpexAccount(t, "6100", "Supplies");

    const userId = await t.run(async (ctx) => {
      const sessions = await ctx.db.query("sessions").collect();
      return sessions.find((s) => s.token === adminSession)!.userId;
    });

    const now = Date.now();
    await seedExpense(t, {
      submittedBy: userId,
      accountId,
      amount: 10000,
      expenseDate: now,
      status: "submitted",
      createdAt: now - 2000,
    });
    await seedExpense(t, {
      submittedBy: userId,
      accountId,
      amount: 20000,
      expenseDate: now,
      status: "approved",
      createdAt: now - 1000,
    });
    await seedExpense(t, {
      submittedBy: userId,
      accountId,
      amount: 30000,
      expenseDate: now,
      status: "voided",
      createdAt: now,
    });

    const result = await t.query(api.expenses.queries.listAllExpenses, {
      sessionId: adminSession,
    });
    expect(result).toHaveLength(3);
  });

  test("submitterName is populated from user name", async () => {
    const t = convexTest(schema);
    const adminSession = await createTestSession(t, {
      role: "admin",
      name: "Boss",
    });
    const accountId = await seedOpexAccount(t, "6100", "Supplies");

    const staffId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Alice Staff",
        pinHash: "test:hash",
        role: "order_staff",
        isActive: true,
        failedAttempts: 0,
        createdAt: Date.now(),
      });
    });

    await seedExpense(t, {
      submittedBy: staffId,
      accountId,
      amount: 50000,
      expenseDate: Date.now(),
      status: "submitted",
    });

    const result = await t.query(api.expenses.queries.listAllExpenses, {
      sessionId: adminSession,
    });
    expect(result).toHaveLength(1);
    expect(result[0].submitterName).toBe("Alice Staff");
  });

  test("empty table returns empty array", async () => {
    const t = convexTest(schema);
    const adminSession = await createTestSession(t, { role: "admin" });

    const result = await t.query(api.expenses.queries.listAllExpenses, {
      sessionId: adminSession,
    });
    expect(result).toEqual([]);
  });
});
