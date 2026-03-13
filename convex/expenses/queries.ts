/**
 * Expense Queries — personal expense listing and audit trail.
 *
 * All queries use protectedQuery with ALL_ROLES (any authenticated user).
 * Phase 44 scope: users can only see their own expenses.
 * Phase 45 will add approver access.
 */

import { v } from "convex/values";
import { protectedQuery } from "../lib/functions";

const ALL_ROLES = ["kitchen", "order_staff", "manager", "admin"] as const;

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
 * Phase 44: only the owner can view their own expenses.
 * Phase 45 will extend access to approvers.
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

    // Phase 44: owner-only access
    if (expense.submittedBy !== ctx.user._id) {
      return null;
    }

    return expense;
  },
});

// ---------------------------------------------------------------------------
// getStatusHistory — audit trail for an expense
// ---------------------------------------------------------------------------

/**
 * Get the status change history for an expense.
 * Returns entries sorted by changedAt ascending (chronological order).
 */
export const getStatusHistory = protectedQuery({
  roles: [...ALL_ROLES],
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    // Phase 44: owner-only access — verify expense belongs to current user
    const expense = await ctx.db.get(args.expenseId);
    if (!expense || expense.submittedBy !== ctx.user._id) {
      return [];
    }

    const entries = await ctx.db
      .query("expenseStatusHistory")
      .withIndex("by_expense", (q) => q.eq("expenseId", args.expenseId))
      .collect();

    // Sort chronologically
    return entries.sort((a, b) => a.changedAt - b.changedAt);
  },
});
