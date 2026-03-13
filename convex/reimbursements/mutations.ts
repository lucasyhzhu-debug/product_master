/**
 * Reimbursement batch mutations -- create, confirm, void.
 *
 * Covers:
 * - createBatch: group awaiting_payment expenses for one employee
 * - confirmBatch: atomically creates JE, marks expenses reimbursed
 * - voidBatch: creates reversing JE, returns expenses to awaiting_payment
 *
 * All mutations are admin-only and record full audit trails.
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { getNextNumber } from "../lib/counter";
import {
  createJournalEntryWithLines,
  createReversalEntry,
  buildDebitLine,
  buildCreditLine,
} from "../lib/journalEngine";
import { recordStatusChange } from "../expenses/auditTrail";
import {
  validateBankReference,
  validateTransferDate,
  validateVoidReason,
} from "./helpers";

// ---------------------------------------------------------------------------
// createBatch -- group awaiting_payment expenses for one employee
// ---------------------------------------------------------------------------

/**
 * Create a pending reimbursement batch for a single employee.
 *
 * Validates:
 * - At least one expense
 * - All expenses exist and belong to the employee
 * - All expenses are in awaiting_payment status
 * - No expense is already in another pending batch (double-batching guard)
 */
export const createBatch = protectedMutation({
  roles: ["admin"],
  args: {
    employeeUserId: v.id("users"),
    expenseIds: v.array(v.id("expenses")),
  },
  handler: async (ctx, args) => {
    if (args.expenseIds.length === 0) {
      throw new Error("At least one expense is required");
    }

    // Verify employee exists
    const employee = await ctx.db.get(args.employeeUserId);
    if (!employee) {
      throw new Error("Employee not found");
    }

    let totalAmount = 0;

    for (const expenseId of args.expenseIds) {
      const expense = await ctx.db.get(expenseId);
      if (!expense) {
        throw new Error("Expense not found");
      }

      // Must be awaiting_payment
      if (expense.status !== "awaiting_payment") {
        throw new Error(
          `Expense ${expense.expenseNumber} is not awaiting payment`
        );
      }

      // Must belong to the specified employee
      if (expense.submittedBy !== args.employeeUserId) {
        throw new Error(
          `Expense ${expense.expenseNumber} does not belong to this employee`
        );
      }

      // Double-batching guard: check if expense is already in a pending batch
      const existingItems = await ctx.db
        .query("reimbursementBatchItems")
        .withIndex("by_expense", (q) => q.eq("expenseId", expenseId))
        .collect();

      for (const item of existingItems) {
        const existingBatch = await ctx.db.get(item.batchId);
        if (existingBatch && existingBatch.status === "pending") {
          throw new Error(
            `Expense ${expense.expenseNumber} is already in a pending batch (${existingBatch.batchNumber})`
          );
        }
      }

      totalAmount += expense.amount;
    }

    // Generate batch number
    const batchNumber = await getNextNumber(ctx, "RMB");

    // Insert batch record
    const batchId = await ctx.db.insert("reimbursementBatches", {
      batchNumber,
      employeeUserId: args.employeeUserId,
      totalAmount,
      status: "pending",
      createdBy: ctx.user._id,
      createdAt: Date.now(),
    });

    // Insert batch items
    for (const expenseId of args.expenseIds) {
      await ctx.db.insert("reimbursementBatchItems", {
        batchId,
        expenseId,
      });
    }

    return { batchId, batchNumber, totalAmount };
  },
});

// ---------------------------------------------------------------------------
// confirmBatch -- atomically creates JE and marks expenses reimbursed
// ---------------------------------------------------------------------------

/**
 * Confirm a pending reimbursement batch.
 *
 * Atomically:
 * 1. Creates a journal entry (DR 2200 Employee Reimb Payable, CR 1100 Cash)
 * 2. Marks all linked expenses as "reimbursed"
 * 3. Records audit trail for each expense
 * 4. Updates batch status to "confirmed"
 *
 * Uses args.transferDate as the JE business date (NOT Date.now()).
 * Convex serialized mutations prevent concurrent confirmation of the same batch.
 */
export const confirmBatch = protectedMutation({
  roles: ["admin"],
  args: {
    batchId: v.id("reimbursementBatches"),
    bankAccountId: v.id("bankAccounts"),
    bankReference: v.string(),
    transferDate: v.number(),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) {
      throw new Error("Batch not found");
    }

    if (batch.status !== "pending") {
      throw new Error("Batch is not pending");
    }

    // Validate inputs
    validateBankReference(args.bankReference);
    validateTransferDate(args.transferDate);

    // Validate bank account
    const bankAccount = await ctx.db.get(args.bankAccountId);
    if (!bankAccount) {
      throw new Error("Bank account not found");
    }
    if (!bankAccount.isActive) {
      throw new Error("Bank account is not active");
    }

    // Get batch items
    const batchItems = await ctx.db
      .query("reimbursementBatchItems")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();

    if (batchItems.length === 0) {
      throw new Error("Batch has no expenses");
    }

    // Look up accounts by code (NEVER hardcode IDs)
    const accrued = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", "2200"))
      .unique();

    const cash = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", "1100"))
      .unique();

    if (!accrued || !cash) {
      throw new Error(
        "System accounts 1100/2200 not found. Run accounts:seedDefaults."
      );
    }

    // Create journal entry -- use transferDate as business date (C1 staff review)
    const journalEntryId = await createJournalEntryWithLines(ctx, {
      date: args.transferDate,
      description: `Reimbursement ${batch.batchNumber}: bank transfer to employee`,
      sourceType: "reimbursement",
      sourceId: batch._id,
      createdBy: ctx.user._id,
      lines: [
        buildDebitLine(
          accrued._id,
          batch.totalAmount,
          `Reimburse ${batch.batchNumber}`
        ),
        buildCreditLine(
          cash._id,
          batch.totalAmount,
          `Reimburse ${batch.batchNumber}`
        ),
      ],
    });

    // Mark all linked expenses as reimbursed
    for (const item of batchItems) {
      const expense = await ctx.db.get(item.expenseId);
      if (!expense) continue;

      // Concurrency guard
      if (expense.status !== "awaiting_payment") {
        throw new Error(
          `Expense ${expense.expenseNumber} is no longer awaiting payment`
        );
      }

      await ctx.db.patch(item.expenseId, { status: "reimbursed" });
      await recordStatusChange(
        ctx,
        item.expenseId,
        "awaiting_payment",
        "reimbursed",
        ctx.user._id,
        `Reimbursed via ${batch.batchNumber}`
      );
    }

    // Confirm batch
    await ctx.db.patch(args.batchId, {
      status: "confirmed",
      bankAccountId: args.bankAccountId,
      bankReference: args.bankReference.trim(),
      transferDate: args.transferDate,
      confirmedBy: ctx.user._id,
      confirmedAt: Date.now(),
      journalEntryId,
    });
  },
});

// ---------------------------------------------------------------------------
// voidBatch -- creates reversing JE and returns expenses to awaiting_payment
// ---------------------------------------------------------------------------

/**
 * Void a confirmed reimbursement batch.
 *
 * Atomically:
 * 1. Creates a reversing journal entry (uses original JE date per JE-03)
 * 2. Returns all linked expenses to "awaiting_payment"
 * 3. Records audit trail for each expense
 * 4. Updates batch status to "voided"
 */
export const voidBatch = protectedMutation({
  roles: ["admin"],
  args: {
    batchId: v.id("reimbursementBatches"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) {
      throw new Error("Batch not found");
    }

    if (batch.status !== "confirmed") {
      throw new Error("Only confirmed batches can be voided");
    }

    validateVoidReason(args.reason);

    // Create reversing JE if batch has a journal entry
    if (batch.journalEntryId) {
      await createReversalEntry(
        ctx,
        batch.journalEntryId,
        "reimbursement_void",
        ctx.user._id
      );
    }

    // Return linked expenses to awaiting_payment
    const batchItems = await ctx.db
      .query("reimbursementBatchItems")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();

    for (const item of batchItems) {
      const expense = await ctx.db.get(item.expenseId);
      if (!expense) continue;

      if (expense.status !== "reimbursed") {
        throw new Error(
          `Expense ${expense.expenseNumber} is not in reimbursed status`
        );
      }

      await ctx.db.patch(item.expenseId, { status: "awaiting_payment" });
      await recordStatusChange(
        ctx,
        item.expenseId,
        "reimbursed",
        "awaiting_payment",
        ctx.user._id,
        `Batch ${batch.batchNumber} voided: ${args.reason.trim()}`
      );
    }

    // Void batch
    await ctx.db.patch(args.batchId, {
      status: "voided",
      voidedBy: ctx.user._id,
      voidedAt: Date.now(),
      voidReason: args.reason.trim(),
    });
  },
});
