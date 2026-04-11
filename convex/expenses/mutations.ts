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
import { RECEIPT_HASH_EXCLUDED_STATUSES } from "./helpers";
import {
  ASSET_CATEGORIES,
  calculateMonthlyDepreciation,
  getAssetAccountCode,
} from "../fixedAssets/helpers";
import { getNextAssetNumber } from "../fixedAssets/mutations";
import { resolveAccount } from "../lib/accountUtils";

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
    transactionReference: v.optional(v.string()),
    sharedReceiptAcknowledged: v.optional(v.boolean()),
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
      ...(args.transactionReference !== undefined && { transactionReference: args.transactionReference }),
      ...(args.sharedReceiptAcknowledged && { sharedReceiptAcknowledged: true }),
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
    transactionReference: v.optional(v.string()),
    sharedReceiptAcknowledged: v.optional(v.boolean()),
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
    if (args.transactionReference !== undefined) patch.transactionReference = args.transactionReference;
    if (args.sharedReceiptAcknowledged === true) patch.sharedReceiptAcknowledged = true;

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

    // EXP-03: Receipt enforcement: always required for company money, threshold for employee_paid
    const receiptRequired = requiresReceipt(expense.amount, expense.paymentMethod);
    if (receiptRequired && expense.receiptFileId === undefined) {
      const msg = expense.paymentMethod === "employee_paid"
        ? "Receipt is required for expenses over Rp 50,000"
        : "Receipt is required for company-paid expenses";
      throw new Error(msg);
    }

    // FRAUD-02: Receipt hash duplicate check
    // Hard block UNLESS user explicitly acknowledged the shared receipt (e.g., one
    // physical receipt covering multiple expense line items in different categories).
    // Exclude voided/rejected/draft expenses — they should not block legitimate resubmissions.
    if (expense.receiptImageHash) {
      const candidates = await ctx.db
        .query("expenses")
        .withIndex("by_receipt_hash", (q) =>
          q.eq("receiptImageHash", expense.receiptImageHash)
        )
        .collect();

      const hashMatch = candidates.find(
        (e) => !RECEIPT_HASH_EXCLUDED_STATUSES.has(e.status) && e._id !== expense._id
      );

      if (hashMatch) {
        if (!expense.sharedReceiptAcknowledged) {
          throw new Error(
            `Duplicate receipt detected. This receipt was already used in expense ${hashMatch.expenseNumber}. If this receipt covers multiple expense items, edit the draft and confirm receipt sharing.`
          );
        }
        // User acknowledged — flag for approver review
        await ctx.db.patch(args.expenseId, { flaggedForReview: true });
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

    // Branch on payment method for status transition and JE creation
    if (expense.paymentMethod === "company_paid") {
      // Auto-create JE: DR expense GL, CR 1100 Cash (money already left bank)
      // createdBy = ctx.user._id (the submitter) because the submitter is recording a transaction
      // that already happened. This differs from approveExpense where createdBy is the approver,
      // because in that flow the approver is the one authorizing the accounting entry.
      const cashAccount = await ctx.db
        .query("accounts")
        .withIndex("by_code", (q) => q.eq("code", "1100"))
        .unique();
      if (!cashAccount) throw new Error("Account 1100 not found. Run accounts:seedDefaults first.");

      const journalEntryId = await createJournalEntryWithLines(ctx, {
        date: expense.expenseDate,
        description: `Expense ${expense.expenseNumber} [Company Paid]: ${expense.description}`,
        sourceType: "expense_approval",
        sourceId: args.expenseId,
        createdBy: ctx.user._id, // Submitter -- recording an already-occurred transaction
        lines: [
          buildDebitLine(expense.accountId, expense.amount, expense.description),
          buildCreditLine(cashAccount._id, expense.amount),
        ],
      });

      await ctx.db.patch(args.expenseId, {
        status: "recorded",
        submittedAt: now,
        journalEntryId,
        lateSubmission,
        duplicateWarning: duplicateWarning ?? undefined,
      });
      await recordStatusChange(ctx, args.expenseId, "draft", "recorded", ctx.user._id);
    } else {
      // employee_paid and payment_request: standard submit to "submitted"
      await ctx.db.patch(args.expenseId, {
        status: "submitted",
        submittedAt: now,
        lateSubmission,
        duplicateWarning: duplicateWarning ?? undefined,
      });
      await recordStatusChange(ctx, args.expenseId, "draft", "submitted", ctx.user._id);
    }

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

    // FIRST: company_paid expenses must use the acknowledge flow, not standard approval.
    // This check is placed before the status check so that a company_paid expense
    // in "recorded" status gets a helpful error ("use acknowledgeExpense") rather than
    // the generic "Only submitted expenses can be approved" error.
    if (expense.paymentMethod === "company_paid") {
      throw new Error("Company-paid expenses cannot be approved via standard flow. Use acknowledgeExpense instead.");
    }

    // Concurrency guard: must be in submitted status
    if (expense.status !== "submitted") {
      throw new Error("Only submitted expenses can be approved");
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

    // payment_request: approval is authorization only, NO JE yet (JE created at markAsPaid)
    if (expense.paymentMethod === "payment_request") {
      const targetStatus = "approved";
      await ctx.db.patch(args.expenseId, {
        status: targetStatus,
        approvedBy: ctx.user._id,
        approvedAt: Date.now(),
        approverComment: args.comment,
      });
      await recordStatusChange(ctx, args.expenseId, "submitted", targetStatus, ctx.user._id, args.comment);
      return { success: true, targetStatus, journalEntryId: undefined };
    }

    // SAFETY: Only employee_paid should reach this point.
    // company_paid is caught at the top (must use acknowledge flow).
    // payment_request is caught above (approval has no JE, JE created at markAsPaid).
    // If a new payment method is added and reaches here without handling, this assertion
    // will catch it rather than silently creating a JE with the wrong credit account.
    if (expense.paymentMethod !== "employee_paid") {
      throw new Error(`Unexpected payment method '${expense.paymentMethod}' in approveExpense JE block. Add explicit handling for this payment method.`);
    }

    // employee_paid: create JE (DR OpEx, CR 2200 Employee Reimbursements Payable)
    // createdBy = ctx.user._id (the approver) because the approver is authorizing
    // the accounting recognition of the reimbursement obligation.
    const creditAccount = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", "2200"))
      .unique();
    if (!creditAccount) throw new Error("Account 2200 not found. Run accounts:seedDefaults first.");

    // Create journal entry (DR OpEx account, CR 2200)
    const journalEntryId = await createJournalEntryWithLines(ctx, {
      date: expense.expenseDate,
      description: `Expense ${expense.expenseNumber} [Employee Paid]: ${expense.description}`,
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
      throw new Error("Only submitted expenses can be rejected");
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

// ---------------------------------------------------------------------------
// acknowledgeExpense — manager/admin confirms a company_paid recorded expense
// ---------------------------------------------------------------------------

/**
 * Acknowledge a company_paid expense that is in "recorded" status.
 *
 * Unlike standard approval, acknowledgment does NOT create a JE (already
 * created at submit time) and does NOT enforce DoA thresholds (the money
 * already left the bank -- this is a review confirmation, not a spend
 * authorization).
 */
export const acknowledgeExpense = protectedMutation({
  roles: [...APPROVER_ROLES],
  args: {
    expenseId: v.id("expenses"),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    if (expense.status !== "recorded") throw new Error("Only recorded expenses can be acknowledged");
    if (expense.paymentMethod !== "company_paid") throw new Error("Only company_paid expenses use acknowledge flow");

    // NOTE: DoA (Delegation of Authority) does NOT apply to acknowledge.
    // Acknowledgment is not an approval -- the money already left the bank.
    // The admin is confirming they have reviewed it, not authorizing a spend.
    // Any manager or admin can acknowledge regardless of amount.

    await ctx.db.patch(args.expenseId, {
      status: "approved",
      approvedBy: ctx.user._id,
      approvedAt: Date.now(),
      approverComment: args.comment,
    });

    await recordStatusChange(ctx, args.expenseId, "recorded", "approved", ctx.user._id, args.comment);
    return { success: true };
  },
});

// ---------------------------------------------------------------------------
// flagExpense — flag a recorded expense for review (no status change)
// ---------------------------------------------------------------------------

/**
 * Flag a recorded company_paid expense for additional review.
 *
 * Sets flag metadata fields but does NOT change status -- the expense
 * remains in "recorded" status and still appears in the approval queue.
 */
export const flagExpense = protectedMutation({
  roles: [...APPROVER_ROLES],
  args: {
    expenseId: v.id("expenses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    if (expense.status !== "recorded") throw new Error("Only recorded expenses can be flagged for review");
    validateRequiredReason(args.reason, "Flag reason");

    await ctx.db.patch(args.expenseId, {
      flaggedForReview: true,
      flaggedBy: ctx.user._id,
      flaggedAt: Date.now(),
      flagReason: args.reason.trim(),
    });

    // Status does NOT change -- remains "recorded"
    return { success: true };
  },
});

// ---------------------------------------------------------------------------
// markAsPaid — complete payment_request flow with JE creation
// ---------------------------------------------------------------------------

/**
 * Mark an approved payment_request expense as paid.
 *
 * Creates the JE at this point (money leaves bank now), stores the
 * transaction reference for audit trail, and transitions to "paid" status.
 */
export const markAsPaid = protectedMutation({
  roles: [...APPROVER_ROLES],
  args: {
    expenseId: v.id("expenses"),
    transactionReference: v.string(),
    paidAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    if (expense.status !== "approved") throw new Error("Only approved expenses can be marked as paid");
    if (expense.paymentMethod !== "payment_request") throw new Error("Only payment_request expenses use mark-as-paid flow");
    if (!args.transactionReference.trim()) throw new Error("Transaction reference is required");

    const paidAt = args.paidAt ?? Date.now();

    // Create JE now (money leaves bank at this point)
    // createdBy = ctx.user._id (the person marking as paid) because they are
    // the one confirming the bank transfer happened and triggering the accounting entry.
    const cashAccount = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", "1100"))
      .unique();
    if (!cashAccount) throw new Error("Account 1100 not found. Run accounts:seedDefaults first.");

    const journalEntryId = await createJournalEntryWithLines(ctx, {
      date: paidAt,
      description: `Expense ${expense.expenseNumber} [Payment Request]: ${expense.description}`,
      sourceType: "expense_approval",
      sourceId: expense._id,
      createdBy: ctx.user._id, // Person who confirmed the bank transfer
      lines: [
        buildDebitLine(expense.accountId, expense.amount, expense.description),
        buildCreditLine(cashAccount._id, expense.amount),
      ],
    });

    await ctx.db.patch(args.expenseId, {
      status: "paid",
      journalEntryId,
      transactionReference: args.transactionReference.trim(),
      paidAt,
      paidBy: ctx.user._id, // Audit: who executed the bank transfer
    });

    await recordStatusChange(ctx, args.expenseId, "approved", "paid", ctx.user._id);
    return { success: true, journalEntryId };
  },
});

// ---------------------------------------------------------------------------
// convertToCapex — expense-to-fixed-asset conversion (admin only)
// ---------------------------------------------------------------------------

/**
 * Convert an expense to a fixed asset (CapEx).
 *
 * Atomically:
 * 1. Voids the expense (reversal JE if it had one)
 * 2. Creates a fixed asset record with PSAK categorization
 * 3. Creates an acquisition JE (DR 1500, CR original credit account)
 *
 * Receipt attachments are carried over from the expense to the asset.
 * Credit account determined by original payment method:
 * - employee_paid: CR 2200 (Employee Reimbursements Payable)
 * - company_paid / payment_request: CR 1100 (Cash)
 */
/** Statuses that allow expense-to-CapEx conversion */
const CAPEX_CONVERTIBLE_STATUSES = new Set([
  "submitted", "recorded", "approved", "awaiting_payment", "paid",
]);

export const convertToCapex = protectedMutation({
  roles: ["admin"],
  args: {
    expenseId: v.id("expenses"),
    category: v.string(), // AssetCategoryKey from ASSET_CATEGORIES
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");

    // Only allow conversion from statuses where the expense has been recorded
    if (!CAPEX_CONVERTIBLE_STATUSES.has(expense.status)) {
      throw new Error(
        `Cannot convert expense with status '${expense.status}'. Must be submitted, recorded, approved, awaiting_payment, or paid.`
      );
    }

    // Validate category
    const categoryConfig = ASSET_CATEGORIES.find((c) => c.key === args.category);
    if (!categoryConfig) {
      throw new Error(
        `Invalid category: "${args.category}". Must be one of: ${ASSET_CATEGORIES.map((c) => c.key).join(", ")}`
      );
    }

    // --- Step 1: Void the expense (reversal JE if it had one) ---

    if (expense.journalEntryId) {
      await createReversalEntry(
        ctx,
        expense.journalEntryId,
        "expense_void",
        ctx.user._id
      );
    }

    // Credit account: employee_paid → 2200 (Reimbursements Payable), else → 1100 (Cash)
    const creditAccountCode = expense.paymentMethod === "employee_paid" ? "2200" : "1100";

    // --- Step 2: Create fixed asset ---

    const salvageValue = Math.round(expense.amount * (categoryConfig.salvagePercent / 100));
    const usefulLifeMonths = categoryConfig.usefulLifeYears !== null
      ? categoryConfig.usefulLifeYears * 12
      : 0;
    const monthlyDepreciation = categoryConfig.depreciable
      ? calculateMonthlyDepreciation(expense.amount, salvageValue, usefulLifeMonths)
      : 0;

    // Generate asset number (reuse shared helper from fixedAssets)
    const assetNumber = await getNextAssetNumber(ctx, categoryConfig.abbr, expense.expenseDate);

    // Carry over receipt attachment from expense
    const attachmentIds = expense.receiptFileId ? [expense.receiptFileId] : [];

    const assetId = await ctx.db.insert("fixedAssets", {
      assetNumber,
      name: expense.description,
      category: args.category,
      acquisitionDate: expense.expenseDate,
      cost: expense.amount,
      salvageValue,
      usefulLifeMonths,
      location: undefined,
      characteristics: [],
      attachmentIds,
      status: "active",
      monthlyDepreciation,
      accumulatedDepreciation: 0,
      lastDepreciationMonth: undefined,
      sourceExpenseId: args.expenseId,
      createdBy: ctx.user._id,
      createdAt: Date.now(),
    });

    // --- Step 3: Create acquisition JE (DR asset account, CR credit account) ---

    const assetAccountCode = getAssetAccountCode(categoryConfig);
    const [fixedAssetAccount, creditAccount] = await Promise.all([
      resolveAccount(ctx, assetAccountCode),
      resolveAccount(ctx, creditAccountCode),
    ]);

    const acquisitionJeId = await createJournalEntryWithLines(ctx, {
      date: expense.expenseDate,
      description: `Asset Acquisition: ${expense.description} (from ${expense.expenseNumber})`,
      sourceType: "asset_acquisition",
      sourceId: assetId as string,
      createdBy: ctx.user._id,
      lines: [
        buildDebitLine(fixedAssetAccount._id, expense.amount, `Equipment purchase: ${expense.description}`),
        buildCreditLine(creditAccount._id, expense.amount),
      ],
    });

    // Store JE reference on asset
    await ctx.db.patch(assetId, { acquisitionJeId });

    // --- Step 4: Update expense record ---
    // Employee-paid expenses stay in the reimbursement pipeline (awaiting_payment)
    // since the employee still needs to be reimbursed for the equipment purchase.
    // Company-paid / payment_request expenses are voided (no reimbursement needed).

    const previousStatus = expense.status;
    const isEmployeePaid = expense.paymentMethod === "employee_paid";

    if (isEmployeePaid) {
      // Keep expense reimbursable -- transition to awaiting_payment if not already there
      const patchFields: Record<string, unknown> = {
        convertedToAssetId: assetId,
      };
      if (previousStatus !== "awaiting_payment") {
        patchFields.status = "awaiting_payment";
      }
      await ctx.db.patch(args.expenseId, patchFields);

      if (previousStatus !== "awaiting_payment") {
        await recordStatusChange(
          ctx,
          args.expenseId,
          previousStatus,
          "awaiting_payment",
          ctx.user._id,
          `Converted to fixed asset: ${assetNumber} (employee-paid, kept for reimbursement)`
        );
      }
    } else {
      // Company-paid / payment_request: void as before
      await ctx.db.patch(args.expenseId, {
        status: "voided",
        convertedToAssetId: assetId,
        voidedBy: ctx.user._id,
        voidedAt: Date.now(),
        voidReason: `Converted to fixed asset: ${assetNumber}`,
      });

      await recordStatusChange(
        ctx,
        args.expenseId,
        previousStatus,
        "voided",
        ctx.user._id,
        `Converted to fixed asset: ${assetNumber}`
      );
    }

    return {
      assetId,
      assetNumber,
      acquisitionJeId,
      monthlyDepreciation,
      salvageValue,
      usefulLifeMonths,
    };
  },
});
