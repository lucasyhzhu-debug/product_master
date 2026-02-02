import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get top N most-used channels, sorted by usage count descending.
 * PRD-7: Used for "Top 4 as buttons" selector pattern.
 */
export const getTopChannels = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 4;

    // Query all usage records, sorted by usage count descending
    const allUsage = await ctx.db
      .query("channelUsage")
      .withIndex("by_usage")
      .order("desc")
      .take(limit);

    return allUsage;
  },
});

/**
 * Get all channel usage records.
 * PRD-7: Used for dropdown with all channels.
 */
export const getAllChannelUsage = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("channelUsage")
      .withIndex("by_usage")
      .order("desc")
      .collect();
  },
});

/**
 * Get usage for a specific channel.
 */
export const getChannelUsage = query({
  args: {
    channel: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("channelUsage")
      .withIndex("by_channel", (q) => q.eq("channel", args.channel))
      .first();
  },
});
