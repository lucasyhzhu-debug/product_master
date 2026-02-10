/**
 * Production Targets Queries
 *
 * Queries for daily production goals per production unit type.
 * Targets are auto-calculated from confirmed orders and can be manually overridden.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get all production targets for a specific date.
 * Returns raw target records for the given date.
 */
export const getByDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productionTargets")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();
  },
});

/**
 * Get production summary: targets enriched with unit type info and effective totals.
 * This will be expanded in Wave 3j with actual progress data.
 */
export const getProductionSummary = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const targets = await ctx.db
      .query("productionTargets")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    // Enrich with production unit type info
    const enriched = await Promise.all(
      targets.map(async (target) => {
        const unitType = await ctx.db.get(target.productionUnitTypeId);
        return {
          ...target,
          unitTypeName: unitType?.name ?? "Unknown",
          unitTypeCode: unitType?.code ?? "UNKNOWN",
          effectiveTarget:
            target.autoTargetQuantity + (target.manualOverride ?? 0),
        };
      })
    );

    return enriched;
  },
});
