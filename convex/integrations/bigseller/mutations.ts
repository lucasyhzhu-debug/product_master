/**
 * BigSeller sync state mutations.
 *
 * Separated from sync.ts because Convex requires mutations to run in the
 * default (V8) runtime, not the Node.js runtime. sync.ts uses "use node"
 * for fetch() calls, so mutations must live in a separate file.
 */

import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

/**
 * Upsert the bigsellerSyncState singleton document.
 * Called by sync actions to update reactive progress for the frontend.
 */
export const updateSyncStage = internalMutation({
  args: {
    stage: v.union(
      v.literal("idle"),
      v.literal("triggering"),
      v.literal("polling"),
      v.literal("fetching"),
      v.literal("storing"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("retrying"),
    ),
    pollAttempt: v.number(),
    maxPolls: v.number(),
    attempt: v.number(),
    startDate: v.string(),
    endDate: v.string(),
    errorMessage: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    summary: v.optional(v.object({
      totalOrders: v.number(),
      newOrders: v.number(),
      updatedOrders: v.number(),
      totalRevenue: v.number(),
      unmappedSkus: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("bigsellerSyncState").first();
    const data = {
      stage: args.stage,
      pollAttempt: args.pollAttempt,
      maxPolls: args.maxPolls,
      attempt: args.attempt,
      startDate: args.startDate,
      endDate: args.endDate,
      startedAt: existing?.startedAt ?? Date.now(),
      errorMessage: args.errorMessage,
      completedAt: args.completedAt,
      summary: args.summary,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("bigsellerSyncState", {
        ...data,
        startedAt: Date.now(),
      });
    }
  },
});
