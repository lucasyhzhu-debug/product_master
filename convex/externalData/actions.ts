/**
 * On-demand fetch actions for external data queries.
 * Converts bandwidth-heavy reactive subscriptions to one-shot fetches.
 *
 * Phase 20: Bandwidth optimization — subscription-to-fetch conversion.
 */
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

// Inline period preset validator to avoid circular type reference with queries.ts
const periodPresetValidator = v.union(
  v.literal("past24hours"),
  v.literal("today"),
  v.literal("yesterday"),
  v.literal("thisWeek"),
  v.literal("last7days"),
  v.literal("last30days"),
  v.literal("thisMonth"),
  v.literal("allTime")
);

export const fetchDashboardSummaryByPeriod = action({
  args: { preset: periodPresetValidator },
  handler: async (ctx, args): Promise<unknown> => {
    return await ctx.runQuery(
      internal.externalData.queries.getDashboardSummaryByPeriodInternal,
      { preset: args.preset }
    );
  },
});

export const fetchRestockOverview = action({
  args: {},
  handler: async (ctx): Promise<unknown> => {
    return await ctx.runQuery(
      internal.externalData.queries.getRestockOverviewInternal,
      {}
    );
  },
});
