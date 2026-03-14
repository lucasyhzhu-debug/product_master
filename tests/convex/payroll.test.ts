/**
 * Integration tests for payroll mutations and queries.
 *
 * Uses convex-test to exercise create, voidEntry, list, and getById
 * end-to-end with actual DB reads to verify state transitions,
 * journal entries, and data enrichment.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { createTestSession } from "../helpers/authTestHelper";
import type { TestConvex } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";

type TestContext = TestConvex<typeof schema>;

// ---------------------------------------------------------------------------
// Test helpers -- seed data directly via t.run()
// ---------------------------------------------------------------------------

/**
 * Seed the required accounts: 6100 (Salaries & Wages) and 1100 (Cash).
 */
async function seedPayrollAccounts(t: TestContext) {
  return await t.run(async (ctx) => {
    const debitAccountId = await ctx.db.insert("accounts", {
      code: "6100",
      name: "Salaries & Wages",
      type: "opex",
      category: "Operating Expenses",
      isActive: true,
      isSystem: true,
    });
    const creditAccountId = await ctx.db.insert("accounts", {
      code: "1100",
      name: "Cash",
      type: "asset",
      category: "Current Assets",
      isActive: true,
      isSystem: true,
    });
    return { debitAccountId, creditAccountId };
  });
}

/**
 * Get the user ID for a session (for direct DB operations).
 */
async function getUserIdForSession(
  t: TestContext,
  sessionId: string
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", sessionId))
      .first();
    return session!.userId;
  });
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const PERIOD_START = new Date("2026-03-01").getTime();
const PERIOD_END = new Date("2026-03-15").getTime();

// ---------------------------------------------------------------------------
// describe("create")
// ---------------------------------------------------------------------------

describe("create", () => {
  test("creates payroll entry with correct JE lines", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    await seedPayrollAccounts(t);

    const result = await t.mutation(api.payroll.mutations.create, {
      sessionId,
      recipientName: "John Doe",
      employeeType: "contractor",
      frequency: "weekly",
      amount: 500000,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      description: "Weekly contractor payment",
    });

    // Assert result shape
    expect(result.payrollId).toBeDefined();
    expect(result.payrollNumber).toMatch(/^PAY-/);
    expect(result.journalEntryId).toBeDefined();

    // Verify DB state
    await t.run(async (ctx) => {
      // Payroll entry
      const entry = await ctx.db.get(result.payrollId);
      expect(entry).not.toBeNull();
      expect(entry!.status).toBe("active");
      expect(entry!.recipientName).toBe("John Doe");
      expect(entry!.amount).toBe(500000);
      expect(entry!.payrollNumber).toMatch(/^PAY-/);
      expect(entry!.journalEntryId).toBe(result.journalEntryId);

      // Journal entry
      const je = await ctx.db.get(result.journalEntryId);
      expect(je).not.toBeNull();
      expect(je!.sourceType).toBe("payroll");
      expect(je!.date).toBe(PERIOD_END); // Business date = periodEnd

      // JE lines
      const lines = await ctx.db
        .query("journalEntryLines")
        .withIndex("by_journal_entry", (q) =>
          q.eq("journalEntryId", result.journalEntryId)
        )
        .collect();
      expect(lines).toHaveLength(2);

      const debitLine = lines.find((l) => l.debitAmount > 0);
      const creditLine = lines.find((l) => l.creditAmount > 0);
      expect(debitLine!.debitAmount).toBe(500000);
      expect(creditLine!.creditAmount).toBe(500000);
    });
  });

  test("rejects non-positive amount", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    await seedPayrollAccounts(t);

    await expect(
      t.mutation(api.payroll.mutations.create, {
        sessionId,
        recipientName: "Jane Doe",
        employeeType: "staff",
        frequency: "monthly",
        amount: 0,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        description: "Monthly salary",
      })
    ).rejects.toThrow("positive integer");
  });

  test("rejects periodStart >= periodEnd", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    await seedPayrollAccounts(t);

    await expect(
      t.mutation(api.payroll.mutations.create, {
        sessionId,
        recipientName: "Jane Doe",
        employeeType: "staff",
        frequency: "monthly",
        amount: 500000,
        periodStart: PERIOD_END, // Start after end
        periodEnd: PERIOD_START,
        description: "Monthly salary",
      })
    ).rejects.toThrow("Period start must be before period end");
  });
});

// ---------------------------------------------------------------------------
// describe("voidEntry")
// ---------------------------------------------------------------------------

describe("voidEntry", () => {
  test("voids active entry and creates reversing JE", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    await seedPayrollAccounts(t);

    // Create entry first
    const { payrollId } = await t.mutation(api.payroll.mutations.create, {
      sessionId,
      recipientName: "John Doe",
      employeeType: "contractor",
      frequency: "weekly",
      amount: 500000,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      description: "Weekly contractor payment",
    });

    // Void it
    const result = await t.mutation(api.payroll.mutations.voidEntry, {
      sessionId,
      payrollId,
      reason: "  Duplicate entry  ",
    });

    expect(result.success).toBe(true);

    // Verify DB state
    await t.run(async (ctx) => {
      const entry = await ctx.db.get(payrollId);
      expect(entry!.status).toBe("voided");
      expect(entry!.voidReason).toBe("Duplicate entry"); // trimmed

      // Verify reversal JE exists
      const allJEs = await ctx.db.query("journalEntries").collect();
      const reversalJE = allJEs.find(
        (je) => je.sourceType === "payroll_void"
      );
      expect(reversalJE).toBeDefined();
    });
  });

  test("rejects voiding already-voided entry", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    await seedPayrollAccounts(t);

    // Create and void
    const { payrollId } = await t.mutation(api.payroll.mutations.create, {
      sessionId,
      recipientName: "John Doe",
      employeeType: "contractor",
      frequency: "weekly",
      amount: 500000,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      description: "Weekly contractor payment",
    });

    await t.mutation(api.payroll.mutations.voidEntry, {
      sessionId,
      payrollId,
      reason: "First void",
    });

    // Try to void again
    await expect(
      t.mutation(api.payroll.mutations.voidEntry, {
        sessionId,
        payrollId,
        reason: "Second void",
      })
    ).rejects.toThrow("Can only void active payroll entries");
  });
});

// ---------------------------------------------------------------------------
// describe("list")
// ---------------------------------------------------------------------------

describe("list", () => {
  test("filters by employee type", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    await seedPayrollAccounts(t);

    // Create contractor entry
    await t.mutation(api.payroll.mutations.create, {
      sessionId,
      recipientName: "Contractor A",
      employeeType: "contractor",
      frequency: "weekly",
      amount: 500000,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      description: "Contractor payment",
    });

    // Create staff entry
    await t.mutation(api.payroll.mutations.create, {
      sessionId,
      recipientName: "Staff B",
      employeeType: "staff",
      frequency: "monthly",
      amount: 800000,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      description: "Staff salary",
    });

    // Filter by contractor
    const contractors = await t.query(api.payroll.queries.list, {
      sessionId,
      employeeType: "contractor",
    });
    expect(contractors).toHaveLength(1);
    expect(contractors[0].recipientName).toBe("Contractor A");

    // No filter -- all entries
    const all = await t.query(api.payroll.queries.list, {
      sessionId,
    });
    expect(all).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// describe("getById")
// ---------------------------------------------------------------------------

describe("getById", () => {
  test("returns enriched entry with JE details", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    await seedPayrollAccounts(t);

    const { payrollId } = await t.mutation(api.payroll.mutations.create, {
      sessionId,
      recipientName: "John Doe",
      employeeType: "contractor",
      frequency: "weekly",
      amount: 500000,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      description: "Weekly contractor payment",
    });

    const result = await t.query(api.payroll.queries.getById, {
      sessionId,
      payrollId,
    });

    // Entry data
    expect(result.recipientName).toBe("John Doe");
    expect(result.amount).toBe(500000);
    expect(result.createdByName).toBeDefined();
    expect(result.createdByName).not.toBe("Unknown");

    // JE details
    expect(result.journalEntry).not.toBeNull();
    expect(result.journalLines).toHaveLength(2);

    // Verify account codes are resolved
    const debitLine = result.journalLines.find(
      (l: { debitAmount: number }) => l.debitAmount > 0
    );
    const creditLine = result.journalLines.find(
      (l: { creditAmount: number }) => l.creditAmount > 0
    );
    expect(debitLine!.accountCode).toBe("6100");
    expect(creditLine!.accountCode).toBe("1100");
  });
});
