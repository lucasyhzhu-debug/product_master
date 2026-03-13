/**
 * Account Queries — Chart of Accounts list and detail.
 *
 * Queries for GL account management (PSAK-aligned 1xxx-7xxx).
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List all accounts, optionally filtered to active-only.
 * Sorted by code ascending for natural PSAK ordering (1xxx, 2xxx, ..., 7xxx).
 */
export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let accounts;
    if (args.activeOnly) {
      accounts = await ctx.db
        .query("accounts")
        .withIndex("by_active_type", (q) => q.eq("isActive", true))
        .collect();
    } else {
      accounts = await ctx.db.query("accounts").collect();
    }
    // Sort by code ascending (natural PSAK ordering: 1xxx, 2xxx, ..., 7xxx)
    return accounts.sort((a, b) => a.code.localeCompare(b.code));
  },
});

/**
 * Get a single account by ID.
 */
export const getById = query({
  args: {
    id: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
