/**
 * Reimbursement queries -- pending queue, batch history, batch details, search.
 *
 * All admin-only. Provides the data layer for the reimbursement UI (Plan 02).
 */

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { protectedQuery } from "../lib/functions";

// ---------------------------------------------------------------------------
// listAwaitingPayment -- pending queue grouped by employee (RMB-01)
// ---------------------------------------------------------------------------

/**
 * List expenses awaiting payment, grouped by employee.
 *
 * For each employee, includes:
 * - User name and bank details
 * - List of expenses sorted by expenseDate ascending
 * - Total amount and expense count
 *
 * Sorted by totalAmount descending (highest first).
 */
export const listAwaitingPayment = protectedQuery({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "awaiting_payment"))
      .collect();

    // Group by employee (submittedBy)
    const byEmployee = new Map<
      string,
      {
        userId: string;
        expenses: typeof expenses;
        totalAmount: number;
      }
    >();

    for (const expense of expenses) {
      const key = expense.submittedBy;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          userId: key,
          expenses: [],
          totalAmount: 0,
        });
      }
      const group = byEmployee.get(key)!;
      group.expenses.push(expense);
      group.totalAmount += expense.amount;
    }

    // Fetch all unique users in parallel
    const uniqueUserIds = [...byEmployee.keys()];
    const users = await Promise.all(
      uniqueUserIds.map((id) => ctx.db.get(id as Id<"users">))
    );
    const userLookup = new Map<string, { name: string; bankAccountNumber: string | null; bankName: string | null }>();
    for (const user of users) {
      if (user) {
        userLookup.set(user._id as string, {
          name: user.name ?? "Unknown User",
          bankAccountNumber: user.bankAccountNumber ?? null,
          bankName: user.bankName ?? null,
        });
      }
    }

    // Enrich with user details and format
    const result = [];
    for (const group of byEmployee.values()) {
      const userInfo = userLookup.get(group.userId);
      const userName = userInfo?.name ?? "Unknown User";
      const bankAccountNumber = userInfo?.bankAccountNumber ?? null;
      const bankName = userInfo?.bankName ?? null;

      // Sort expenses by expenseDate ascending
      const sortedExpenses = group.expenses.sort(
        (a, b) => a.expenseDate - b.expenseDate
      );

      result.push({
        userId: group.userId,
        userName,
        bankAccountNumber,
        bankName,
        expenses: sortedExpenses,
        totalAmount: group.totalAmount,
        expenseCount: group.expenses.length,
      });
    }

    // Sort by totalAmount descending
    return result.sort((a, b) => b.totalAmount - a.totalAmount);
  },
});

// ---------------------------------------------------------------------------
// listBatches -- batch history with optional status filter and search (RMB-06)
// ---------------------------------------------------------------------------

/**
 * List reimbursement batches with optional status filter and search.
 *
 * Search matches against batchNumber or bankReference (case-insensitive).
 * Results capped at 100 (I3 fix) and sorted by createdAt descending.
 */
export const listBatches = protectedQuery({
  roles: ["admin"],
  args: {
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("voided")
      )
    ),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let batches;
    if (args.status) {
      batches = await ctx.db
        .query("reimbursementBatches")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(100);
    } else {
      // Exclude soft-deleted batches from the "All" view
      batches = (
        await ctx.db
          .query("reimbursementBatches")
          .order("desc")
          .take(100)
      ).filter((b) => b.status !== "deleted");
    }

    // Apply search filter if provided
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      batches = batches.filter(
        (b) =>
          b.batchNumber.toLowerCase().includes(searchLower) ||
          (b.bankReference &&
            b.bankReference.toLowerCase().includes(searchLower))
      );
    }

    // Enrich with employee name and sort by createdAt descending
    const enriched = await Promise.all(
      batches.map(async (batch) => {
        const user = await ctx.db.get(batch.employeeUserId);
        return {
          ...batch,
          employeeName: user?.name ?? "Unknown User",
        };
      })
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ---------------------------------------------------------------------------
// getBatchById -- batch detail with items and employee/bank info
// ---------------------------------------------------------------------------

/**
 * Get a single batch by ID with full details.
 *
 * Includes:
 * - Employee name and bank details
 * - All batch items with expense details
 * - Bank account name (if set)
 */
export const getBatchById = protectedQuery({
  roles: ["admin"],
  args: {
    batchId: v.id("reimbursementBatches"),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) return null;

    // Fetch employee
    const employee = await ctx.db.get(batch.employeeUserId);

    // Fetch batch items with expenses
    const batchItems = await ctx.db
      .query("reimbursementBatchItems")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();

    const items = await Promise.all(
      batchItems.map(async (item) => {
        const expense = await ctx.db.get(item.expenseId);
        return {
          ...item,
          expense,
        };
      })
    );

    // Fetch bank account if set
    let bankAccountName: string | null = null;
    if (batch.bankAccountId) {
      const bankAccount = await ctx.db.get(batch.bankAccountId);
      bankAccountName = bankAccount?.name ?? null;
    }

    return {
      ...batch,
      employeeName: employee?.name ?? "Unknown User",
      employeeBankAccountNumber: employee?.bankAccountNumber ?? null,
      employeeBankName: employee?.bankName ?? null,
      bankAccountName,
      items,
    };
  },
});

// ---------------------------------------------------------------------------
// getBatchItems -- expense list for a batch
// ---------------------------------------------------------------------------

/**
 * Get expenses for a batch.
 */
export const getBatchItems = protectedQuery({
  roles: ["admin"],
  args: {
    batchId: v.id("reimbursementBatches"),
  },
  handler: async (ctx, args) => {
    const batchItems = await ctx.db
      .query("reimbursementBatchItems")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .collect();

    const expenses = await Promise.all(
      batchItems.map(async (item) => {
        return await ctx.db.get(item.expenseId);
      })
    );

    return expenses.filter(Boolean);
  },
});

// ---------------------------------------------------------------------------
// getPendingBatchForEmployee -- check for existing pending batch
// ---------------------------------------------------------------------------

/**
 * Get the pending batch for an employee (if any).
 *
 * Used by the frontend to offer "add to existing batch" when creating a new one.
 * Returns null if no pending batch exists.
 */
export const getPendingBatchForEmployee = protectedQuery({
  roles: ["admin"],
  args: {
    employeeUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const pendingBatch = await ctx.db
      .query("reimbursementBatches")
      .withIndex("by_employee_status", (q) =>
        q.eq("employeeUserId", args.employeeUserId).eq("status", "pending")
      )
      .first();

    if (!pendingBatch) return null;

    // Get existing batch items count and total
    const batchItems = await ctx.db
      .query("reimbursementBatchItems")
      .withIndex("by_batch", (q) => q.eq("batchId", pendingBatch._id))
      .collect();

    return {
      _id: pendingBatch._id,
      batchNumber: pendingBatch.batchNumber,
      totalAmount: pendingBatch.totalAmount,
      expenseCount: batchItems.length,
    };
  },
});
