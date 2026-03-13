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
  v.literal("voided")
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
    if (expense.submittedBy === ctx.user._id) {
      return expense;
    }

    // Manager/admin can see any expense (approval access)
    if (ctx.user.role === "manager" || ctx.user.role === "admin") {
      return expense;
    }

    return null;
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
 * List expenses pending approval for the current user.
 *
 * Returns submitted expenses excluding self-submitted ones.
 * Managers see only expenses within their DoA threshold (<= 500K).
 * Admins see all submitted expenses.
 * Sorted by submittedAt ascending (FIFO -- oldest first).
 */
export const listPendingForApproval = protectedQuery({
  roles: [...APPROVER_ROLES],
  args: {},
  handler: async (ctx) => {
    // Query all submitted expenses via by_status index
    const submitted = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "submitted"))
      .collect();

    // Filter out self-submitted
    let pending = submitted.filter((e) => e.submittedBy !== ctx.user._id);

    // For managers: also filter out expenses above DoA threshold
    if (ctx.user.role === "manager") {
      pending = pending.filter((e) => e.amount <= DOA_ADMIN_ONLY_THRESHOLD);
    }

    // Sort by submittedAt ascending (FIFO -- oldest first)
    return pending.sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
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

    let currentId: Id<"expenses"> | undefined = args.expenseId;
    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (currentId && iterations < MAX_ITERATIONS) {
      const expense: Doc<"expenses"> | null = await ctx.db.get(currentId);
      if (!expense) break;

      // Only include rejected entries in the chain (skip current/first expense)
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
