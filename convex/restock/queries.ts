import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Fetch all saved restock targets for a channel/outlet.
 */
export const getRestockTargets = query({
  args: {
    channel: v.string(),
    outletId: v.optional(v.id("externalOutlets")),
  },
  handler: async (ctx, args) => {
    if (args.outletId) {
      return await ctx.db
        .query("restockTargets")
        .withIndex("by_outlet_product", (q) =>
          q.eq("outletId", args.outletId!)
        )
        .collect();
    }

    return await ctx.db
      .query("restockTargets")
      .withIndex("by_channel", (q) => q.eq("channel", args.channel))
      .collect();
  },
});

/**
 * Fetch manual stock entries for a channel.
 */
export const getManualStock = query({
  args: {
    channel: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("manualStockEntries")
      .withIndex("by_channel", (q) => q.eq("channel", args.channel))
      .collect();
  },
});
