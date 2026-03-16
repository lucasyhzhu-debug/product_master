/**
 * Migration: Backfill BigSeller externalRevenue records from linked bigsellerOrders.
 *
 * Fixes two issues caused by saveRevenue's old skip-on-dedup behavior:
 * 1. revenueGross used pre-Phase54 saleAmount instead of orderAmount
 * 2. transactionCount was never set (undefined)
 *
 * For each bigsellerOrder with a linkedRevenueId, patches the externalRevenue
 * record with corrected values derived from bigsellerOrders (which were already
 * updated by upsertOrders on re-sync).
 *
 * Safe to run multiple times (idempotent — always patches to current values).
 * Run from Convex dashboard Functions tab.
 */
import { internalMutation } from "../_generated/server";

export const backfillBigSellerRevenue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("bigsellerOrders").collect();

    let patched = 0;
    let skippedNoLink = 0;
    let skippedNotFound = 0;

    for (const order of orders) {
      if (!order.linkedRevenueId) {
        skippedNoLink++;
        continue;
      }

      const revenue = await ctx.db.get(order.linkedRevenueId);
      if (!revenue) {
        skippedNotFound++;
        continue;
      }

      // Compute corrected values from bigsellerOrders (authoritative source)
      const correctedGross = order.orderAmount ?? order.saleAmount;
      const correctedNet = order.platformIncome;
      const correctedCommission = Math.abs(order.commissionFee);

      await ctx.db.patch(revenue._id, {
        revenueGross: correctedGross,
        revenueNet: correctedNet,
        commission: correctedCommission,
        transactionCount: 1,
        // Fix source if it was misclassified as "shopee" for TikTok orders (BUG-02)
        source: order.platform as "shopee" | "tiktok",
      });
      patched++;
    }

    return {
      total: orders.length,
      patched,
      skippedNoLink,
      skippedNotFound,
    };
  },
});
