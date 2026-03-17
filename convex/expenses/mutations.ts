/**
 * Expense Mutations — CRUD operations for expense lifecycle.
 *
 * Covers: createDraft, updateDraft, submitExpense, generateUploadUrl (Phase 44),
 *         approveExpense, rejectExpense, voidExpense (Phase 45).
 *
 * Fraud controls:
 * - FRAUD-01: Soft duplicate warning (same amount + date within 7 days)
 * - FRAUD-02: Hard block on matching receipt hash
 * - FRAUD-03: Late submission flag (expenseDate + 14 days < submission time)
 * - FRAUD-04: Self-approval blocked
 * - FRAUD-05: DoA threshold enforcement
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { getNextNumber } from "../lib/counter";
import {
  requiresReceipt,
  validateExpenseAmount,
  isLateSubmission,
  checkDuplicateExpense,
  canApproveExpense,
  requiresApproverComment,
  getTargetStatusAfterApproval,
  isVoidableStatus,
} from "./helpers";
import { validateRequiredReason } from "../lib/validation";
import { ALL_ROLES, APPROVER_ROLES } from "./constants";
import {
  createJournalEntryWithLines,
  createReversalEntry,
  buildDebitLine,
  buildCreditLine,
} from "../lib/journalEngine";
import { recordStatusChange } from "./auditTrail";

// ---------------------------------------------------------------------------
// Payment method validator (matches schema exactly)
// ---------------------------------------------------------------------------

const paymentMethodValidator = v.union(
  v.literal("employee_paid"),
  v.literal("company_paid"),
  v.literal("payment_request")
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

// ---------------------------------------------------------------------------
// Phase 45: Approval / Rejection / Void mutations
// ---------------------------------------------------------------------------

/**
 * Approve a submitted expense.
 *
 * Enforces DoA (EXP-07/08), self-approval block (EXP-09/FRAUD-04),
 * comment requirement (EXP-11), creates journal entry (DR OpEx, CR based
 * on payment method), and transitions to approved or awaiting_payment.
 */
export const approveExpense = protectedMutation({
  roles: [...APPROVER_ROLES],
  args: {
    expenseId: v.id("expenses"),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) {
      throw new Error("Expense not found");
    }

    // Concurrency guard: must be in submitted status
    if (expense.status !== "submitted") {
      throw new Error("Expense has already been processed");
    }

    // Self-approval block (FRAUD-04)
    if (expense.submittedBy === ctx.user._id) {
      throw new Error("Cannot approve your own expense");
    }

    // DoA check (EXP-07/08/FRAUD-05)
    const doaResult = canApproveExpense(
      ctx.user.role,
      expense.amount,
      expense.submittedBy,
      ctx.user._id
    );
    if (!doaResult.allowed) {
      throw new Error(doaResult.reason!);
    }

    // Comment requirement for >= Rp 500K (EXP-11)
    if (requiresApproverComment(expense.amount) && !args.comment?.trim()) {
      throw new Error("Comment required for expenses >= Rp 500,000");
    }

    // Determine credit account based on payment method
    // company_paid/payment_request -> "1100" (Cash), employee_paid -> "2200" (Employee Reimbursements Payable)
    const creditCode = expense.paymentMethod === "employee_paid" ? "2200" : "1100";
    const creditAccount = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", creditCode))
      .unique();

    if (!creditAccount) {
      throw new Error(
        `Account ${creditCode} not found. Run accounts:seedDefaults first.`
      );
    }

    // Create journal entry (DR OpEx account, CR credit account)
    const journalEntryId = await createJournalEntryWithLines(ctx, {
      date: expense.expenseDate,
      description: `Expense ${expense.expenseNumber}: ${expense.description}`,
      sourceType: "expense_approval",
      sourceId: expense._id,
      createdBy: ctx.user._id,
      lines: [
        buildDebitLine(expense.accountId, expense.amount, expense.description),
        buildCreditLine(creditAccount._id, expense.amount),
      ],
    });

    // Determine target status based on payment method (EXP-14/15)
    const targetStatus = getTargetStatusAfterApproval(expense.paymentMethod);

    // Patch expense
    await ctx.db.patch(args.expenseId, {
      status: targetStatus,
      approvedBy: ctx.user._id,
      approvedAt: Date.now(),
      approverComment: args.comment,
      journalEntryId,
    });

    // Audit trail
    await recordStatusChange(
      ctx,
      args.expenseId,
      "submitted",
      targetStatus,
      ctx.user._id,
      args.comment
    );

    return { success: true, targetStatus, journalEntryId };
  },
});

/**
 * Reject a submitted expense.
 *
 * Requires a non-empty reason. Transitions to rejected status.
 * The submitter can create a revision via createDraft with previousExpenseId.
 */
export const rejectExpense = protectedMutation({
  roles: [...APPROVER_ROLES],
  args: {
    expenseId: v.id("expenses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) {
      throw new Error("Expense not found");
    }

    // Concurrency guard: must be in submitted status
    if (expense.status !== "submitted") {
      throw new Error("Expense has already been processed");
    }

    // Cannot reject own expense
    if (expense.submittedBy === ctx.user._id) {
      throw new Error("Cannot reject your own expense");
    }

    // Reason validation (shared validator with custom label)
    validateRequiredReason(args.reason, "Rejection reason");

    // Patch expense
    await ctx.db.patch(args.expenseId, {
      status: "rejected",
      rejectedBy: ctx.user._id,
      rejectedAt: Date.now(),
      rejectionReason: args.reason.trim(),
    });

    // Audit trail
    await recordStatusChange(
      ctx,
      args.expenseId,
      "submitted",
      "rejected",
      ctx.user._id,
      args.reason.trim()
    );

    return { success: true };
  },
});

/**
 * Void an expense (admin only).
 *
 * Blocks voiding reimbursed expenses (EXP-17).
 * Creates a reversing journal entry if the expense had a JE.
 * Transitions to voided status.
 */
export const voidExpense = protectedMutation({
  roles: ["admin"],
  args: {
    expenseId: v.id("expenses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) {
      throw new Error("Expense not found");
    }

    // Reason validation (shared validator, default "Void reason" label)
    validateRequiredReason(args.reason);

    // EXP-17: Reimbursed expenses cannot be voided directly
    if (expense.status === "reimbursed") {
      throw new Error(
        "Cannot void a reimbursed expense. Void the reimbursement batch instead."
      );
    }

    // Check voidable status
    if (!isVoidableStatus(expense.status)) {
      throw new Error(
        `Cannot void expense with status '${expense.status}'`
      );
    }

    // If expense has a journal entry (approved/awaiting_payment), create reversing JE
    if (expense.journalEntryId) {
      await createReversalEntry(
        ctx,
        expense.journalEntryId,
        "expense_void",
        ctx.user._id
      );
    }

    const previousStatus = expense.status;

    // Patch expense
    await ctx.db.patch(args.expenseId, {
      status: "voided",
      voidedBy: ctx.user._id,
      voidedAt: Date.now(),
      voidReason: args.reason.trim(),
    });

    // Audit trail
    await recordStatusChange(
      ctx,
      args.expenseId,
      previousStatus,
      "voided",
      ctx.user._id,
      args.reason.trim()
    );

    return { success: true };
  },
});
