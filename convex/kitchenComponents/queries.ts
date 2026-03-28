/**
 * Kitchen Components Queries (Phase 69)
 *
 * Queries for kitchen pre-cursor ingredients (tracked in grams).
 *
 * Queries:
 *   list      — All components, optionally filtered to active only, sorted by sortOrder
 *   getByCode — Single component by its unique code
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List all kitchen components, optionally filtered to active only.
 * Sorted by sortOrder ascending.
 */
export const list = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let components;
    if (args.activeOnly) {
      components = await ctx.db
        .query("kitchenComponents")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    } else {
      components = await ctx.db.query("kitchenComponents").collect();
    }
    return components.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/**
 * Get a kitchen component by code.
 */
export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("kitchenComponents")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});
