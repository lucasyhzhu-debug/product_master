import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List all menu products.
 */
export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.activeOnly) {
      return await ctx.db
        .query("menuProducts")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    return await ctx.db.query("menuProducts").collect();
  },
});

/**
 * Get a single menu product by ID.
 */
export const get = query({
  args: { id: v.id("menuProducts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get a menu product by code.
 */
export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuProducts")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});
