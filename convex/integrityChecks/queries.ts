import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get recent integrity check results for admin review.
 * Returns the most recent N check logs ordered by timestamp descending.
 */
export const getRecentChecks = query({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    if (args.limit <= 0) return [];

    return await ctx.db
      .query("integrityCheckLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(args.limit);
  },
});
