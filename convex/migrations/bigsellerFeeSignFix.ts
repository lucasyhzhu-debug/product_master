/**
 * Migration: Fix BigSeller fee sign convention in bigsellerOrders.
 *
 * Phase 64-03 normalized all fee values (commissionFee, sellerShippingFee,
 * otherFee) to POSITIVE at sync time. This migration patches existing records
 * that still have negative fee values from the old convention.
 *
 * Paginated: processes 500 records per batch. Call repeatedly until
 * hasMore === false.
 *
 * Safe to run multiple times (idempotent — only patches negative values).
 *
 * Deployment order:
 * 1. Deploy code changes (normalizePlatformFees now stores positive fees)
 * 2. Run this migration from Convex dashboard Functions tab
 * 3. Call repeatedly until hasMore === false
 * 4. Run bigsellerRevenueBackfill to update linked externalRevenue records
 */
import { internalMutation } from "../_generated/server";

export const fixBigSellerFeeSigns = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Fetch 501 to detect if there are more records beyond our batch of 500
    const orders = await ctx.db.query("bigsellerOrders").take(501);
    const hasMore = orders.length > 500;
    const batch = orders.slice(0, 500);

    let patched = 0;
    let skipped = 0;

    for (const order of batch) {
      const updates: Record<string, number> = {};

      if ((order.commissionFee ?? 0) < 0) {
        updates.commissionFee = Math.abs(order.commissionFee);
      }
      if ((order.sellerShippingFee ?? 0) < 0) {
        updates.sellerShippingFee = Math.abs(order.sellerShippingFee);
      }
      if ((order.otherFee ?? 0) < 0) {
        updates.otherFee = Math.abs(order.otherFee);
      }

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(order._id, updates);
        patched++;
      } else {
        skipped++;
      }
    }

    return {
      batchSize: batch.length,
      patched,
      skipped,
      hasMore,
      summary: `Patched ${patched}/${batch.length} records (${skipped} already positive)${hasMore ? " — more batches remaining" : " — DONE"}`,
    };
  },
});
