import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get top N most-used shipping agencies, sorted by usage count descending.
 * PRD-7: Used for "Top 4 as buttons" selector pattern.
 */
export const getTopAgencies = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 4;

    // Query all usage records, sorted by usage count descending
    const allUsage = await ctx.db
      .query("shippingAgencyUsage")
      .withIndex("by_usage")
      .order("desc")
      .take(limit);

    return allUsage;
  },
});

/**
 * Get all shipping agency usage records.
 * PRD-7: Used for dropdown with all agencies.
 */
export const getAllAgencyUsage = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("shippingAgencyUsage")
      .withIndex("by_usage")
      .order("desc")
      .collect();
  },
});

/**
 * Get usage for a specific shipping agency.
 */
export const getAgencyUsage = query({
  args: {
    agency: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shippingAgencyUsage")
      .withIndex("by_agency", (q) => q.eq("agency", args.agency))
      .first();
  },
});
