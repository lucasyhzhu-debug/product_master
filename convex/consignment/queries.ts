/**
 * Consignment Settlement Queries
 *
 * Read queries for consignment outlet management with running totals
 * and settlement history per outlet.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get all consignment outlets with computed running totals.
 * Totals include: totalRevenue, totalRevShare, totalFrollie,
 * outstanding (pending payments), paidTotal, and settlementCount.
 */
export const getOutletsWithTotals = query({
  args: {
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Fetch outlets based on active status
    let outlets;
    if (args.includeArchived) {
      outlets = await ctx.db.query("consignmentOutlets").collect();
    } else {
      outlets = await ctx.db
        .query("consignmentOutlets")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }

    // Compute per-outlet totals
    const results = [];
    for (const outlet of outlets) {
      const settlements = await ctx.db
        .query("consignmentSettlements")
        .withIndex("by_outlet", (q) => q.eq("outletId", outlet._id))
        .collect();

      let totalRevenue = 0;
      let totalRevShare = 0;
      let totalFrollie = 0;
      let outstanding = 0;
      let paidTotal = 0;

      for (const s of settlements) {
        totalRevenue += s.totalRevenue;
        totalRevShare += s.revShareAmount;
        totalFrollie += s.frolliePayment;
        if (s.status === "pending") {
          outstanding += s.frolliePayment;
        } else if (s.status === "paid") {
          paidTotal += s.frolliePayment;
        }
      }

      results.push({
        ...outlet,
        totals: {
          totalRevenue,
          totalRevShare,
          totalFrollie,
          outstanding,
          paidTotal,
          settlementCount: settlements.length,
        },
      });
    }

    return results;
  },
});

/**
 * Get all settlements for a specific outlet, newest first.
 */
export const getSettlementsByOutlet = query({
  args: {
    outletId: v.id("consignmentOutlets"),
  },
  handler: async (ctx, args) => {
    const settlements = await ctx.db
      .query("consignmentSettlements")
      .withIndex("by_outlet", (q) => q.eq("outletId", args.outletId))
      .collect();

    // Sort by periodStart descending (newest first)
    settlements.sort((a, b) => b.periodStart - a.periodStart);

    return settlements;
  },
});

/**
 * Get global consignment summary across all active outlets.
 * Returns total revenue, outstanding, paid, and active outlet count.
 */
export const getGlobalSummary = query({
  args: {},
  handler: async (ctx) => {
    // Count active outlets
    const activeOutlets = await ctx.db
      .query("consignmentOutlets")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Sum across ALL settlements (not just active outlets)
    const allSettlements = await ctx.db
      .query("consignmentSettlements")
      .collect();

    let totalRevenue = 0;
    let totalOutstanding = 0;
    let totalPaid = 0;

    for (const s of allSettlements) {
      totalRevenue += s.totalRevenue;
      if (s.status === "pending") {
        totalOutstanding += s.frolliePayment;
      } else if (s.status === "paid") {
        totalPaid += s.frolliePayment;
      }
    }

    return {
      totalRevenue,
      totalOutstanding,
      totalPaid,
      activeOutletCount: activeOutlets.length,
    };
  },
});
