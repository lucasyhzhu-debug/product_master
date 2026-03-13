/**
 * Expense Mutations — CRUD operations for expense lifecycle.
 *
 * Covers: createDraft, updateDraft, submitExpense, generateUploadUrl.
 * All mutations use protectedMutation with ALL_ROLES (any authenticated user).
 *
 * Fraud controls:
 * - FRAUD-01: Soft duplicate warning (same amount + date within 7 days)
 * - FRAUD-02: Hard block on matching receipt hash
 * - FRAUD-03: Late submission flag (expenseDate + 14 days < submission time)
 */

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { protectedMutation } from "../lib/functions";
import { getNextNumber } from "../lib/counter";
import {
  requiresReceipt,
  validateExpenseAmount,
  isLateSubmission,
  checkDuplicateExpense,
} from "./helpers";

const ALL_ROLES = ["kitchen", "order_staff", "manager", "admin"] as const;

// ---------------------------------------------------------------------------
// Internal audit trail helper
// ---------------------------------------------------------------------------

async function recordStatusChange(
  ctx: { db: MutationCtx["db"] },
  expenseId: Id<"expenses">,
  fromStatus: string | undefined,
  toStatus: string,
  changedBy: Id<"users">,
  comment?: string
): Promise<void> {
  await ctx.db.insert("expenseStatusHistory", {
    expenseId,
    fromStatus,
    toStatus,
    changedBy,
    changedAt: Date.now(),
    comment,
  });
}

// ---------------------------------------------------------------------------
// Payment method validator (matches schema exactly)
// ---------------------------------------------------------------------------

const paymentMethodValidator = v.union(
  v.literal("personal_cash"),
  v.literal("personal_transfer"),
  v.literal("company_card")
);

// ---------------------------------------------------------------------------
// createDraft — create a new expense in draft status
// ---------------------------------------------------------------------------

/**
 * Create a new expense draft.
 * Generates expense number via counter, checks for soft duplicates (FRAUD-01).
 */
export const createDraft = protectedMutation({
  roles: [...ALL_ROLES],
  args: {
    description: v.string(),
    amount: v.number(),
    accountId: v.id("accounts"),
    expenseDate: v.number(),
    vendorName: v.string(),
    paymentMethod: paymentMethodValidator,
    receiptFileId: v.optional(v.id("_storage")),
    receiptImageHash: v.optional(v.string()),
    previousExpenseId: v.optional(v.id("expenses")),
  },
  handler: async (ctx, args) => {
    // Validate amount
    validateExpenseAmount(args.amount);

    // Generate expense number
    const expenseNumber = await getNextNumber(ctx, "EXP");

    // FRAUD-01: Soft duplicate warning
    // Query user's recent expenses to check for duplicates
    const userExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_submitter_status", (q) =>
        q.eq("submittedBy", ctx.user._id)
      )
      .collect();

    const duplicateWarning = checkDuplicateExpense(
      userExpenses.map((e) => ({
        amount: e.amount,
        expenseDate: e.expenseDate,
        expenseNumber: e.expenseNumber,
      })),
      args.amount,
      args.expenseDate
    );

    // Build expense record
    const expenseId = await ctx.db.insert("expenses", {
      expenseNumber,
      submittedBy: ctx.user._id,
      amount: args.amount,
      accountId: args.accountId,
      expenseDate: args.expenseDate,
      description: args.description,
      vendorName: args.vendorName,
      paymentMethod: args.paymentMethod,
      status: "draft",
      lateSubmission: false,
      createdAt: Date.now(),
      ...(duplicateWarning !== null && { duplicateWarning }),
      ...(args.receiptFileId !== undefined && { receiptFileId: args.receiptFileId }),
      ...(args.receiptImageHash !== undefined && { receiptImageHash: args.receiptImageHash }),
      ...(args.previousExpenseId !== undefined && { previousExpenseId: args.previousExpenseId }),
    });

    // Write audit trail
    await recordStatusChange(ctx, expenseId, undefined, "draft", ctx.user._id);

    return { expenseId, expenseNumber, duplicateWarning };
  },
});

// ---------------------------------------------------------------------------
// updateDraft — modify a draft expense
// ---------------------------------------------------------------------------

/**
 * Update a draft expense. Only drafts owned by the current user can be edited.
 */
export const updateDraft = protectedMutation({
  roles: [...ALL_ROLES],
  args: {
    expenseId: v.id("expenses"),
    description: v.optional(v.string()),
    amount: v.optional(v.number()),
    accountId: v.optional(v.id("accounts")),
    expenseDate: v.optional(v.number()),
    vendorName: v.optional(v.string()),
    paymentMethod: v.optional(paymentMethodValidator),
    receiptFileId: v.optional(v.id("_storage")),
    receiptImageHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) {
      throw new Error("Expense not found");
    }

    // Only drafts can be edited
    if (expense.status !== "draft") {
      throw new Error("Can only edit draft expenses");
    }

    // Only owner can edit
    if (expense.submittedBy !== ctx.user._id) {
      throw new Error("Can only edit your own expenses");
    }

    // Validate amount if provided
    if (args.amount !== undefined) {
      validateExpenseAmount(args.amount);
    }

    // Build patch object from provided fields only
    const patch: Record<string, unknown> = {};
    if (args.description !== undefined) patch.description = args.description;
    if (args.amount !== undefined) patch.amount = args.amount;
    if (args.accountId !== undefined) patch.accountId = args.accountId;
    if (args.expenseDate !== undefined) patch.expenseDate = args.expenseDate;
    if (args.vendorName !== undefined) patch.vendorName = args.vendorName;
    if (args.paymentMethod !== undefined) patch.paymentMethod = args.paymentMethod;
    if (args.receiptFileId !== undefined) patch.receiptFileId = args.receiptFileId;
    if (args.receiptImageHash !== undefined) patch.receiptImageHash = args.receiptImageHash;

    // Re-check soft duplicate if amount or expenseDate changed
    if (args.amount !== undefined || args.expenseDate !== undefined) {
      const checkAmount = args.amount ?? expense.amount;
      const checkDate = args.expenseDate ?? expense.expenseDate;

      const userExpenses = await ctx.db
        .query("expenses")
        .withIndex("by_submitter_status", (q) =>
          q.eq("submittedBy", ctx.user._id)
        )
        .collect();

      // Exclude the current expense from duplicate check
      const otherExpenses = userExpenses
        .filter((e) => e._id !== args.expenseId)
        .map((e) => ({
          amount: e.amount,
          expenseDate: e.expenseDate,
          expenseNumber: e.expenseNumber,
        }));

      const duplicateWarning = checkDuplicateExpense(
        otherExpenses,
        checkAmount,
        checkDate
      );

      // Always update: set warning or clear stale one
      patch.duplicateWarning = duplicateWarning ?? undefined;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.expenseId, patch);
    }
  },
});

// ---------------------------------------------------------------------------
// submitExpense — transition from draft to submitted
// ---------------------------------------------------------------------------

/**
 * Submit a draft expense for approval.
 * Enforces receipt requirement (EXP-03), receipt hash uniqueness (FRAUD-02),
 * computes late submission flag (FRAUD-03), and re-checks soft duplicate (FRAUD-01).
 */
export const submitExpense = protectedMutation({
  roles: [...ALL_ROLES],
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) {
      throw new Error("Expense not found");
    }

    // Only drafts can be submitted
    if (expense.status !== "draft") {
      throw new Error("Can only submit draft expenses");
    }

    // Only owner can submit
    if (expense.submittedBy !== ctx.user._id) {
      throw new Error("Can only submit your own expenses");
    }

    // EXP-03: Receipt enforcement for amounts > Rp 50,000
    if (requiresReceipt(expense.amount) && expense.receiptFileId === undefined) {
      throw new Error("Receipt is required for expenses over Rp 50,000");
    }

    // FRAUD-02: Receipt hash duplicate check (hard block)
    if (expense.receiptImageHash) {
      const hashMatch = await ctx.db
        .query("expenses")
        .withIndex("by_receipt_hash", (q) =>
          q.eq("receiptImageHash", expense.receiptImageHash)
        )
        .first();

      if (hashMatch && hashMatch._id !== expense._id) {
        throw new Error(
          `Duplicate receipt detected. This receipt was already used in expense ${hashMatch.expenseNumber}`
        );
      }
    }

    // FRAUD-03: Late submission flag
    const now = Date.now();
    const lateSubmission = isLateSubmission(expense.expenseDate, now);

    // FRAUD-01: Re-check soft duplicate at submit time
    const userExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_submitter_status", (q) =>
        q.eq("submittedBy", ctx.user._id)
      )
      .collect();

    const otherExpenses = userExpenses
      .filter((e) => e._id !== expense._id)
      .map((e) => ({
        amount: e.amount,
        expenseDate: e.expenseDate,
        expenseNumber: e.expenseNumber,
      }));

    const duplicateWarning = checkDuplicateExpense(
      otherExpenses,
      expense.amount,
      expense.expenseDate
    );

    // Patch expense to submitted status
    const patch: Record<string, unknown> = {
      status: "submitted",
      submittedAt: now,
      lateSubmission,
      // Always update: set warning or clear stale one
      duplicateWarning: duplicateWarning ?? undefined,
    };

    await ctx.db.patch(args.expenseId, patch);

    // Write audit trail
    await recordStatusChange(ctx, args.expenseId, "draft", "submitted", ctx.user._id);

    return { success: true };
  },
});

// ---------------------------------------------------------------------------
// generateUploadUrl — signed URL for receipt file upload
// ---------------------------------------------------------------------------

/**
 * Generate a signed upload URL for receipt file storage.
 */
export const generateUploadUrl = protectedMutation({
  roles: [...ALL_ROLES],
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
