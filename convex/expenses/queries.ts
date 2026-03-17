/**
 * Expense Queries — personal expense listing, approval queue, and audit trail.
 *
 * Phase 44: personal expense listing (any role, owner-only).
 * Phase 45: approval queue, rejection chain, relaxed getById/getStatusHistory
 *           for manager/admin.
 */

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { protectedQuery } from "../lib/functions";
import { ALL_ROLES, APPROVER_ROLES } from "./constants";
import { DOA_ADMIN_ONLY_THRESHOLD } from "./helpers";

// Schema-aligned status validator for query args
const expenseStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("awaiting_payment"),
  v.literal("reimbursed"),
  v.literal("voided"),
  v.literal("recorded"),
  v.literal("paid")
);

// ---------------------------------------------------------------------------
// listMyExpenses — current user's expenses with optional status filter
// ---------------------------------------------------------------------------

/**
 * List the current user's expenses, optionally filtered by status.
 * Uses by_submitter_status index for efficient queries.
 * Returns newest first (sorted by createdAt descending).
 */
export const listMyExpenses = protectedQuery({
  roles: [...ALL_ROLES],
  args: {
    status: v.optional(expenseStatusValidator),
  },
  handler: async (ctx, args) => {
    let expenses;

    if (args.status !== undefined) {
      expenses = await ctx.db
        .query("expenses")
        .withIndex("by_submitter_status", (q) =>
          q.eq("submittedBy", ctx.user._id).eq("status", args.status!)
        )
        .collect();
    } else {
      expenses = await ctx.db
        .query("expenses")
        .withIndex("by_submitter_status", (q) =>
          q.eq("submittedBy", ctx.user._id)
        )
        .collect();
    }

    // Sort by createdAt descending (newest first)
    return expenses.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ---------------------------------------------------------------------------
// getById — single expense by ID (owner-only in Phase 44)
// ---------------------------------------------------------------------------

/**
 * Get a single expense by ID.
 * Owner can always see their own expense.
 * Manager/admin can see any expense (for approval workflow).
 */
export const getById = protectedQuery({
  roles: [...ALL_ROLES],
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);

    if (!expense) {
      return null;
    }

    // Owner can always see their own expense
    const isOwner = expense.submittedBy === ctx.user._id;
    // Manager/admin can see any expense (approval access)
    const isApprover = ctx.user.role === "manager" || ctx.user.role === "admin";

    if (!isOwner && !isApprover) {
      return null;
    }

    // Resolve receipt URL from storage
    const receiptUrl = expense.receiptFileId
      ? await ctx.storage.getUrl(expense.receiptFileId)
      : null;

    return { ...expense, receiptUrl };
  },
});

// ---------------------------------------------------------------------------
// getStatusHistory — audit trail for an expense
// ---------------------------------------------------------------------------

/**
 * Get the status change history for an expense.
 * Returns entries sorted by changedAt ascending (chronological order).
 * Owner or manager/admin can view.
 */
export const getStatusHistory = protectedQuery({
  roles: [...ALL_ROLES],
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) {
      return [];
    }

    // Owner or manager/admin can view status history
    const isOwner = expense.submittedBy === ctx.user._id;
    const isApprover = ctx.user.role === "manager" || ctx.user.role === "admin";
    if (!isOwner && !isApprover) {
      return [];
    }

    const entries = await ctx.db
      .query("expenseStatusHistory")
      .withIndex("by_expense", (q) => q.eq("expenseId", args.expenseId))
      .collect();

    // Sort chronologically (tiebreaker by _id for same-ms entries)
    return entries.sort(
      (a, b) => a.changedAt - b.changedAt || a._id.localeCompare(b._id)
    );
  },
});

// ---------------------------------------------------------------------------
// Phase 45: Approval queue and rejection chain queries
// ---------------------------------------------------------------------------

/**
 * List expenses pending action for the current user.
 *
 * Unified queue covering all 3 payment flows:
 * - submitted: employee_paid and payment_request needing approval
 * - recorded: company_paid needing acknowledgment
 * - approved (payment_request only): needing mark-as-paid
 *
 * Self-exclusion applies ONLY to submitted items (approval decisions).
 * DoA threshold applies ONLY to submitted items (approval decisions).
 * Recorded (acknowledge) and approved payment_request (mark-as-paid) are
 * administrative actions, not approval decisions.
 *
 * Sorted by submittedAt ascending (FIFO -- oldest first).
 */
export const listPendingForApproval = protectedQuery({
  roles: [...APPROVER_ROLES],
  args: {},
  handler: async (ctx) => {
    // Fetch submitted + recorded + approved in parallel
    const [submitted, recorded, approvedAll] = await Promise.all([
      ctx.db.query("expenses").withIndex("by_status", (q) => q.eq("status", "submitted")).collect(),
      ctx.db.query("expenses").withIndex("by_status", (q) => q.eq("status", "recorded")).collect(),
      ctx.db.query("expenses").withIndex("by_status", (q) => q.eq("status", "approved")).collect(),
    ]);

    // Filter approved to only payment_request that need mark-as-paid
    const approvedPaymentRequests = approvedAll.filter(
      (e) => e.paymentMethod === "payment_request"
    );

    // Self-exclusion: only for submitted items (approval decision).
    // Recorded items (acknowledge) and approved payment_request (mark-as-paid)
    // are administrative actions, not approval decisions -- no self-exclusion.
    const filteredSubmitted = submitted.filter((e) => e.submittedBy !== ctx.user._id);

    // For managers: DoA threshold applies ONLY to submitted items (approve decision).
    // Managers can always see recorded (acknowledge) and approved payment_request (mark-as-paid).
    let pendingSubmitted = filteredSubmitted;
    if (ctx.user.role === "manager") {
      pendingSubmitted = filteredSubmitted.filter((e) => e.amount <= DOA_ADMIN_ONLY_THRESHOLD);
    }

    // Combine all 3 sets
    const pending = [...pendingSubmitted, ...recorded, ...approvedPaymentRequests];

    // Sort by submittedAt ascending (FIFO -- oldest first)
    pending.sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));

    // Join submitter names for display
    const userIds = [...new Set(pending.map((e) => e.submittedBy))];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const nameMap = new Map<string, string>();
    for (const user of users) {
      if (user) nameMap.set(user._id, user.name);
    }

    // Resolve receipt URLs from storage
    return await Promise.all(
      pending.map(async (e) => ({
        ...e,
        submitterName: nameMap.get(e.submittedBy) ?? "Unknown",
        receiptUrl: e.receiptFileId
          ? await ctx.storage.getUrl(e.receiptFileId)
          : null,
      }))
    );
  },
});

/**
 * Get the rejection chain for an expense.
 *
 * Walks the previousExpenseId chain backward collecting rejected expenses.
 * Safety limit: max 20 iterations to prevent infinite loops.
 */
export const getRejectionChain = protectedQuery({
  roles: [...APPROVER_ROLES],
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const chain: Array<{
      expenseId: string;
      rejectionReason: string | undefined;
      rejectedAt: number | undefined;
      rejectedBy: string | undefined;
    }> = [];

    // Start from the previous expense (the current one is submitted, not rejected)
    const current = await ctx.db.get(args.expenseId);
    if (!current) return chain;

    let currentId: Id<"expenses"> | undefined = current.previousExpenseId;
    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (currentId && iterations < MAX_ITERATIONS) {
      const expense: Doc<"expenses"> | null = await ctx.db.get(currentId);
      if (!expense) break;

      if (expense.status === "rejected") {
        chain.push({
          expenseId: expense._id,
          rejectionReason: expense.rejectionReason,
          rejectedAt: expense.rejectedAt,
          rejectedBy: expense.rejectedBy,
        });
      }

      currentId = expense.previousExpenseId;
      iterations++;
    }

    return chain;
  },
});

// ---------------------------------------------------------------------------
// checkReceiptHash — early duplicate receipt detection for UX
// ---------------------------------------------------------------------------

/**
 * Check if a receipt image hash is already used by another expense.
 * Returns the matching expense number and ID if found, null otherwise.
 * Used by the frontend to warn users BEFORE submission rather than
 * failing at submit time with a hard error.
 */
export const checkReceiptHash = protectedQuery({
  roles: [...ALL_ROLES],
  args: {
    hash: v.string(),
    excludeExpenseId: v.optional(v.id("expenses")),
  },
  handler: async (ctx, args) => {
    if (!args.hash) return null;

    const match = await ctx.db
      .query("expenses")
      .withIndex("by_receipt_hash", (q) => q.eq("receiptImageHash", args.hash))
      .first();

    if (!match) return null;

    // Exclude current expense (editing a draft with same receipt is fine)
    if (args.excludeExpenseId && match._id === args.excludeExpenseId) return null;

    return {
      expenseId: match._id,
      expenseNumber: match.expenseNumber,
      description: match.description,
    };
  },
});
