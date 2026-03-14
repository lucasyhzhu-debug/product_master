/**
 * Bank account queries -- read operations for company bank accounts.
 *
 * Used by the reimbursement UI to select a bank account for transfers.
 */

import { v } from "convex/values";
import { protectedQuery } from "../lib/functions";

/**
 * List company bank accounts.
 *
 * If activeOnly is true, returns only active accounts via the by_active index.
 * Otherwise, returns all accounts sorted by name ascending.
 */
export const list = protectedQuery({
  roles: ["admin"],
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.activeOnly) {
      return await ctx.db
        .query("bankAccounts")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }

    const all = await ctx.db.query("bankAccounts").collect();
    return all.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Get a single bank account by ID.
 */
export const getById = protectedQuery({
  roles: ["admin"],
  args: {
    bankAccountId: v.id("bankAccounts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.bankAccountId);
  },
});
