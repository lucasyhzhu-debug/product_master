import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Increment usage count for a channel.
 * PRD-7: Called when an order is created or channel is changed.
 * Creates the record if it doesn't exist.
 */
export const incrementUsage = mutation({
  args: {
    channel: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if record exists
    const existing = await ctx.db
      .query("channelUsage")
      .withIndex("by_channel", (q) => q.eq("channel", args.channel))
      .first();

    if (existing) {
      // Increment existing record
      await ctx.db.patch(existing._id, {
        usageCount: existing.usageCount + 1,
      });
      return existing._id;
    } else {
      // Create new record with count of 1
      return await ctx.db.insert("channelUsage", {
        channel: args.channel,
        usageCount: 1,
      });
    }
  },
});

/**
 * Decrement usage count for a channel.
 * PRD-7: Called when an order's channel is changed (decrement old, increment new).
 * Does not delete the record, just decrements to 0.
 */
export const decrementUsage = mutation({
  args: {
    channel: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("channelUsage")
      .withIndex("by_channel", (q) => q.eq("channel", args.channel))
      .first();

    if (existing && existing.usageCount > 0) {
      await ctx.db.patch(existing._id, {
        usageCount: existing.usageCount - 1,
      });
      return existing._id;
    }

    return null;
  },
});

/**
 * Seed initial channel usage data from existing orders.
 * PRD-7: Run once from Convex dashboard to populate usage counts.
 */
export const seedFromExistingOrders = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all orders with channels
    const orders = await ctx.db.query("orders").collect();

    // Count channel usage
    const channelCounts = new Map<string, number>();
    for (const order of orders) {
      if (order.channel) {
        const current = channelCounts.get(order.channel) || 0;
        channelCounts.set(order.channel, current + 1);
      }
    }

    // Clear existing usage records
    const existingRecords = await ctx.db.query("channelUsage").collect();
    for (const record of existingRecords) {
      await ctx.db.delete(record._id);
    }

    // Create new usage records
    const results: { channel: string; count: number }[] = [];
    for (const [channel, count] of channelCounts) {
      await ctx.db.insert("channelUsage", {
        channel,
        usageCount: count,
      });
      results.push({ channel, count });
    }

    return {
      message: `Seeded ${results.length} channel usage records`,
      channels: results,
    };
  },
});
