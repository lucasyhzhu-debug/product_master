/**
 * On-demand fetch actions for external data queries.
 * Converts bandwidth-heavy reactive subscriptions to one-shot fetches.
 *
 * Phase 20: Bandwidth optimization — subscription-to-fetch conversion.
 */
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { periodPresetValidator } from "./queries";

export const fetchDashboardSummaryByPeriod = action({
  args: { preset: periodPresetValidator },
  handler: async (ctx, args) => {
    return await ctx.runQuery(
      internal.externalData.queries.getDashboardSummaryByPeriodInternal,
      { preset: args.preset }
    );
  },
});
