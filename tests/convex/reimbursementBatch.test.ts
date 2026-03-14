/**
 * Integration tests for reimbursement batch lifecycle.
 *
 * Uses convex-test to exercise createBatch, confirmBatch, voidBatch
 * end-to-end with actual DB reads to verify state transitions,
 * journal entries, and audit trails.
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
 * Seed the required system accounts (Cash 1100, Employee Reimb Payable 2200).
 * Also seeds a counter for "RMB" prefix to ensure getNextNumber works.
 */
async function seedSystemAccounts(t: TestContext) {
  return await t.run(async (ctx) => {
    const cashId = await ctx.db.insert("accounts", {
      code: "1100",
      name: "Cash",
      type: "asset",
      category: "Current Assets",
      isActive: true,
      isSystem: true,
    });
    const accruedId = await ctx.db.insert("accounts", {
      code: "2200",
      name: "Employee Reimbursements Payable",
      type: "liability",
      category: "Current Liabilities",
      isActive: true,
      isSystem: true,
    });
    return { cashId, accruedId };
  });
}

/**
 * Create a test expense in awaiting_payment status.
 */
async function createTestExpense(
  t: TestContext,
  userId: Id<"users">,
  overrides?: { amount?: number; status?: string; expenseNumber?: string }
): Promise<Id<"expenses">> {
  return await t.run(async (ctx) => {
    // We need an account for the expense
    let account = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", "6100"))
      .first();
    if (!account) {
      const accountId = await ctx.db.insert("accounts", {
        code: "6100",
        name: "General OpEx",
        type: "opex",
        category: "Operating Expenses",
        isActive: true,
        isSystem: false,
      });
      account = await ctx.db.get(accountId);
    }

    return await ctx.db.insert("expenses", {
      expenseNumber:
        overrides?.expenseNumber ??
        `EXP-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      submittedBy: userId,
      amount: overrides?.amount ?? 50000,
      accountId: account!._id,
      expenseDate: Date.now(),
      description: "Test expense",
      vendorName: "Test Vendor",
      paymentMethod: "personal_cash",
      status: (overrides?.status as never) ?? "awaiting_payment",
      lateSubmission: false,
      createdAt: Date.now(),
    });
  });
}

/**
 * Create a test bank account.
 */
async function createTestBankAccount(
  t: TestContext,
  userId: Id<"users">,
  overrides?: { isActive?: boolean }
): Promise<Id<"bankAccounts">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("bankAccounts", {
      name: "Company BCA Account",
      bankName: "BCA",
      accountNumber: "1234567890",
      isActive: overrides?.isActive ?? true,
      createdBy: userId,
      createdAt: Date.now(),
    });
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

/**
 * Create a second test user (employee) for batch operations.
 */
async function createEmployeeUser(t: TestContext): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Test Employee",
      pinHash: "test:hash",
      role: "order_staff",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
  });
}

// ---------------------------------------------------------------------------
// describe("createBatch")
// ---------------------------------------------------------------------------

describe("createBatch", () => {
  test("creates batch with valid expenses", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const employeeId = await createEmployeeUser(t);

    const exp1 = await createTestExpense(t, employeeId, { amount: 50000 });
    const exp2 = await createTestExpense(t, employeeId, { amount: 75000 });

    const result = await t.mutation(
      api.reimbursements.mutations.createBatch,
      {
        sessionId,
        employeeUserId: employeeId,
        expenseIds: [exp1, exp2],
      }
    );

    expect(result.batchId).toBeDefined();
    expect(result.batchNumber).toMatch(/^RMB-/);
    expect(result.totalAmount).toBe(125000);

    // Verify DB state
    await t.run(async (ctx) => {
      const batch = await ctx.db.get(result.batchId);
      expect(batch).not.toBeNull();
      expect(batch!.status).toBe("pending");
      expect(batch!.totalAmount).toBe(125000);

      const items = await ctx.db
        .query("reimbursementBatchItems")
        .withIndex("by_batch", (q) => q.eq("batchId", result.batchId))
        .collect();
      expect(items).toHaveLength(2);
    });
  });

  test("rejects expense not in awaiting_payment status", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const employeeId = await createEmployeeUser(t);

    const exp = await createTestExpense(t, employeeId, {
      status: "approved",
    });

    await expect(
      t.mutation(api.reimbursements.mutations.createBatch, {
        sessionId,
        employeeUserId: employeeId,
        expenseIds: [exp],
      })
    ).rejects.toThrow("not awaiting payment");
  });

  test("rejects double-batching (expense already in pending batch)", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const employeeId = await createEmployeeUser(t);

    const exp = await createTestExpense(t, employeeId, { amount: 50000 });

    // Create first batch
    await t.mutation(api.reimbursements.mutations.createBatch, {
      sessionId,
      employeeUserId: employeeId,
      expenseIds: [exp],
    });

    // Try to create second batch with same expense
    await expect(
      t.mutation(api.reimbursements.mutations.createBatch, {
        sessionId,
        employeeUserId: employeeId,
        expenseIds: [exp],
      })
    ).rejects.toThrow("already in a pending batch");
  });

  test("rejects expense belonging to different employee", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const employeeA = await createEmployeeUser(t);
    const employeeB = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Employee B",
        pinHash: "test:hash",
        role: "order_staff",
        isActive: true,
        failedAttempts: 0,
        createdAt: Date.now(),
      });
    });

    const exp = await createTestExpense(t, employeeA);

    await expect(
      t.mutation(api.reimbursements.mutations.createBatch, {
        sessionId,
        employeeUserId: employeeB,
        expenseIds: [exp],
      })
    ).rejects.toThrow("does not belong to this employee");
  });
});

// ---------------------------------------------------------------------------
// describe("confirmBatch")
// ---------------------------------------------------------------------------

describe("confirmBatch", () => {
  test("confirms batch, creates JE, and marks expenses reimbursed", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const adminId = await getUserIdForSession(t, sessionId);
    const employeeId = await createEmployeeUser(t);
    await seedSystemAccounts(t);

    const exp = await createTestExpense(t, employeeId, { amount: 100000 });
    const bankAccountId = await createTestBankAccount(t, adminId);
    const transferDate = Date.now();

    const { batchId } = await t.mutation(
      api.reimbursements.mutations.createBatch,
      {
        sessionId,
        employeeUserId: employeeId,
        expenseIds: [exp],
      }
    );

    await t.mutation(api.reimbursements.mutations.confirmBatch, {
      sessionId,
      batchId,
      bankAccountId,
      bankReference: "BCA-TRF-001",
      transferDate,
    });

    // Verify batch state
    await t.run(async (ctx) => {
      const batch = await ctx.db.get(batchId);
      expect(batch!.status).toBe("confirmed");
      expect(batch!.bankReference).toBe("BCA-TRF-001");
      expect(batch!.transferDate).toBe(transferDate);
      expect(batch!.journalEntryId).toBeDefined();

      // Verify expense changed to reimbursed
      const expense = await ctx.db.get(exp);
      expect(expense!.status).toBe("reimbursed");

      // Verify journal entry exists
      const je = await ctx.db.get(batch!.journalEntryId!);
      expect(je).not.toBeNull();
      expect(je!.sourceType).toBe("reimbursement");
      expect(je!.date).toBe(transferDate);

      // Verify JE lines (2 lines: DR 2200, CR 1100)
      const lines = await ctx.db
        .query("journalEntryLines")
        .withIndex("by_journal_entry", (q) =>
          q.eq("journalEntryId", batch!.journalEntryId!)
        )
        .collect();
      expect(lines).toHaveLength(2);

      const debitLine = lines.find((l) => l.debitAmount > 0);
      const creditLine = lines.find((l) => l.creditAmount > 0);
      expect(debitLine!.debitAmount).toBe(100000);
      expect(creditLine!.creditAmount).toBe(100000);

      // Verify audit trail
      const history = await ctx.db
        .query("expenseStatusHistory")
        .withIndex("by_expense", (q) => q.eq("expenseId", exp))
        .collect();
      const reimbursedEntry = history.find(
        (h) => h.toStatus === "reimbursed"
      );
      expect(reimbursedEntry).toBeDefined();
    });
  });

  test("rejects confirming a non-pending batch", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const adminId = await getUserIdForSession(t, sessionId);
    const employeeId = await createEmployeeUser(t);
    await seedSystemAccounts(t);

    const exp = await createTestExpense(t, employeeId, { amount: 50000 });
    const bankAccountId = await createTestBankAccount(t, adminId);

    const { batchId } = await t.mutation(
      api.reimbursements.mutations.createBatch,
      {
        sessionId,
        employeeUserId: employeeId,
        expenseIds: [exp],
      }
    );

    // Confirm first time
    await t.mutation(api.reimbursements.mutations.confirmBatch, {
      sessionId,
      batchId,
      bankAccountId,
      bankReference: "REF-001",
      transferDate: Date.now(),
    });

    // Try to confirm again
    await expect(
      t.mutation(api.reimbursements.mutations.confirmBatch, {
        sessionId,
        batchId,
        bankAccountId,
        bankReference: "REF-002",
        transferDate: Date.now(),
      })
    ).rejects.toThrow("Batch is not pending");
  });

  test("rejects inactive bank account", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const adminId = await getUserIdForSession(t, sessionId);
    const employeeId = await createEmployeeUser(t);
    await seedSystemAccounts(t);

    const exp = await createTestExpense(t, employeeId, { amount: 50000 });
    const inactiveBankId = await createTestBankAccount(t, adminId, {
      isActive: false,
    });

    const { batchId } = await t.mutation(
      api.reimbursements.mutations.createBatch,
      {
        sessionId,
        employeeUserId: employeeId,
        expenseIds: [exp],
      }
    );

    await expect(
      t.mutation(api.reimbursements.mutations.confirmBatch, {
        sessionId,
        batchId,
        bankAccountId: inactiveBankId,
        bankReference: "REF-001",
        transferDate: Date.now(),
      })
    ).rejects.toThrow("Bank account is not active");
  });
});

// ---------------------------------------------------------------------------
// describe("voidBatch")
// ---------------------------------------------------------------------------

describe("voidBatch", () => {
  test("voids confirmed batch, creates reversal JE, returns expenses to awaiting_payment", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const adminId = await getUserIdForSession(t, sessionId);
    const employeeId = await createEmployeeUser(t);
    await seedSystemAccounts(t);

    const exp = await createTestExpense(t, employeeId, { amount: 80000 });
    const bankAccountId = await createTestBankAccount(t, adminId);

    const { batchId } = await t.mutation(
      api.reimbursements.mutations.createBatch,
      {
        sessionId,
        employeeUserId: employeeId,
        expenseIds: [exp],
      }
    );

    await t.mutation(api.reimbursements.mutations.confirmBatch, {
      sessionId,
      batchId,
      bankAccountId,
      bankReference: "BCA-TRF-002",
      transferDate: Date.now(),
    });

    await t.mutation(api.reimbursements.mutations.voidBatch, {
      sessionId,
      batchId,
      reason: "Wrong transfer amount",
    });

    // Verify batch state
    await t.run(async (ctx) => {
      const batch = await ctx.db.get(batchId);
      expect(batch!.status).toBe("voided");
      expect(batch!.voidReason).toBe("Wrong transfer amount");

      // Verify expense returned to awaiting_payment
      const expense = await ctx.db.get(exp);
      expect(expense!.status).toBe("awaiting_payment");

      // Verify reversal JE exists
      const reversalEntries = await ctx.db
        .query("journalEntries")
        .collect();
      const reversalJE = reversalEntries.find(
        (je) => je.sourceType === "reimbursement_void"
      );
      expect(reversalJE).toBeDefined();

      // Verify audit trail has the return-to-awaiting_payment entry
      const history = await ctx.db
        .query("expenseStatusHistory")
        .withIndex("by_expense", (q) => q.eq("expenseId", exp))
        .collect();
      const returnEntry = history.find(
        (h) =>
          h.toStatus === "awaiting_payment" &&
          h.fromStatus === "reimbursed"
      );
      expect(returnEntry).toBeDefined();
    });
  });

  test("rejects voiding a non-confirmed batch", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const employeeId = await createEmployeeUser(t);

    const exp = await createTestExpense(t, employeeId, { amount: 50000 });

    const { batchId } = await t.mutation(
      api.reimbursements.mutations.createBatch,
      {
        sessionId,
        employeeUserId: employeeId,
        expenseIds: [exp],
      }
    );

    await expect(
      t.mutation(api.reimbursements.mutations.voidBatch, {
        sessionId,
        batchId,
        reason: "Test reason",
      })
    ).rejects.toThrow("Only confirmed batches can be voided");
  });
});

// ---------------------------------------------------------------------------
// describe("bankAccounts remove referential integrity")
// ---------------------------------------------------------------------------

describe("bankAccounts remove referential integrity", () => {
  test("rejects deleting bank account referenced by confirmed batch", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const adminId = await getUserIdForSession(t, sessionId);
    const employeeId = await createEmployeeUser(t);
    await seedSystemAccounts(t);

    const exp = await createTestExpense(t, employeeId, { amount: 50000 });
    const bankAccountId = await createTestBankAccount(t, adminId);

    const { batchId } = await t.mutation(
      api.reimbursements.mutations.createBatch,
      {
        sessionId,
        employeeUserId: employeeId,
        expenseIds: [exp],
      }
    );

    await t.mutation(api.reimbursements.mutations.confirmBatch, {
      sessionId,
      batchId,
      bankAccountId,
      bankReference: "REF-001",
      transferDate: Date.now(),
    });

    // Try to delete the bank account
    await expect(
      t.mutation(api.bankAccounts.mutations.remove, {
        sessionId,
        bankAccountId,
      })
    ).rejects.toThrow(
      "Cannot delete bank account referenced by active reimbursement batches."
    );
  });

  test("allows deleting bank account with only voided batches", async () => {
    const t = convexTest(schema);
    const sessionId = await createTestSession(t, { role: "admin" });
    const adminId = await getUserIdForSession(t, sessionId);
    const employeeId = await createEmployeeUser(t);
    await seedSystemAccounts(t);

    const exp = await createTestExpense(t, employeeId, { amount: 50000 });
    const bankAccountId = await createTestBankAccount(t, adminId);

    const { batchId } = await t.mutation(
      api.reimbursements.mutations.createBatch,
      {
        sessionId,
        employeeUserId: employeeId,
        expenseIds: [exp],
      }
    );

    await t.mutation(api.reimbursements.mutations.confirmBatch, {
      sessionId,
      batchId,
      bankAccountId,
      bankReference: "REF-001",
      transferDate: Date.now(),
    });

    // Void the batch first
    await t.mutation(api.reimbursements.mutations.voidBatch, {
      sessionId,
      batchId,
      reason: "Test void",
    });

    // Now deleting should succeed
    await t.mutation(api.bankAccounts.mutations.remove, {
      sessionId,
      bankAccountId,
    });

    // Verify bank account is deleted
    await t.run(async (ctx) => {
      const bankAccount = await ctx.db.get(bankAccountId);
      expect(bankAccount).toBeNull();
    });
  });
});
