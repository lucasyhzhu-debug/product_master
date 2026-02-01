import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List all production unit types.
 * Returns active types by default, sorted by sortOrder.
 */
export const list = query({
  args: {
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let types;

    if (args.includeInactive) {
      types = await ctx.db.query("productionUnitTypes").collect();
    } else {
      types = await ctx.db
        .query("productionUnitTypes")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }

    // Sort by sortOrder
    return types.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/**
 * Get a single production unit type by ID.
 */
export const getById = query({
  args: { id: v.id("productionUnitTypes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get a production unit type by code.
 */
export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});
