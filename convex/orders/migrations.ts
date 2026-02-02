/**
 * Data Migration and Verification Utilities
 *
 * Pre-Flight verification for Orders & Kitchen refactor
 */

import { query } from "../_generated/server";

/**
 * Verify current production tracking state
 *
 * Checks:
 * 1. How many orderItems have orderItemProduction records
 * 2. Data consistency between OLD (ballsRemaining) and NEW (unitsRemaining) systems
 * 3. Current coverage of production tracking
 */
export const verifyProduction = query({
  args: {},
  handler: async (ctx) => {
    // Fetch all order items
    const allItems = await ctx.db.query("orderItems").collect();

    // Fetch all production records
    const allProduction = await ctx.db
      .query("orderItemProduction")
      .collect();

    // Group production records by orderItemId
    const productionByItem = new Map<string, typeof allProduction>();
    for (const record of allProduction) {
      const key = record.orderItemId.toString();
      if (!productionByItem.has(key)) {
        productionByItem.set(key, []);
      }
      productionByItem.get(key)!.push(record);
    }

    // Analysis
    let itemsWithProduction = 0;
    let itemsWithoutProduction = 0;
    let itemsWithProductionType = 0;
    let matched = 0;
    let mismatched = 0;
    const mismatchDetails: string[] = [];

    for (const item of allItems) {
      // Skip cancelled items
      if (item.isCancelled) continue;

      const hasProductionType = item.productionType !== undefined && item.productionType !== null;
      if (hasProductionType) {
        itemsWithProductionType++;
      }

      const productionRecords = productionByItem.get(item._id.toString()) || [];

      if (productionRecords.length > 0) {
        itemsWithProduction++;

        // Compare OLD vs NEW system
        const oldRemaining = item.ballsRemaining ?? 0;
        const newRemaining = productionRecords
          .filter(r => !r.isCancelled)
          .reduce((sum, r) => sum + r.unitsRemaining, 0);

        if (oldRemaining === newRemaining) {
          matched++;
        } else {
          mismatched++;
          if (mismatchDetails.length < 10) {
            mismatchDetails.push(
              `Item ${item._id}: OLD=${oldRemaining}, NEW=${newRemaining}, product=${item.productName}`
            );
          }
        }
      } else {
        itemsWithoutProduction++;
      }
    }

    const totalActive = allItems.filter(item => !item.isCancelled).length;
    const coveragePercent = totalActive > 0
      ? ((itemsWithProduction / totalActive) * 100).toFixed(2)
      : "0.00";

    const matchRate = (itemsWithProduction > 0)
      ? ((matched / itemsWithProduction) * 100).toFixed(2)
      : "100.00";

    return {
      timestamp: Date.now(),
      summary: {
        totalItems: allItems.length,
        totalActiveItems: totalActive,
        itemsWithProductionType,
        itemsWithProduction,
        itemsWithoutProduction,
        productionCoverage: `${coveragePercent}%`,
      },
      consistency: {
        matched,
        mismatched,
        matchRate: `${matchRate}%`,
        mismatchSample: mismatchDetails,
      },
      production: {
        totalProductionRecords: allProduction.length,
        activeRecords: allProduction.filter(r => !r.isCancelled).length,
        cancelledRecords: allProduction.filter(r => r.isCancelled).length,
      },
      verdict: mismatched === 0
        ? "✅ PASS - All data consistent"
        : mismatched <= totalActive * 0.1
        ? `⚠️ WARNING - ${mismatched} mismatches (${((mismatched/totalActive)*100).toFixed(1)}%)`
        : `❌ FAIL - ${mismatched} mismatches (${((mismatched/totalActive)*100).toFixed(1)}%)`
    };
  },
});

/**
 * Get kitchen query performance baseline
 *
 * Returns timing info for kitchen queries to establish baseline metrics
 */
export const getPerformanceBaseline = query({
  args: {},
  handler: async (ctx) => {
    const startTime = Date.now();

    // Simulate kitchen orders query
    const confirmedOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Confirmed"))
      .collect();

    const inProductionOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "InProduction"))
      .collect();

    const ordersFetchTime = Date.now() - startTime;

    // Fetch items (simulating N+1 pattern)
    const itemsStart = Date.now();
    const allOrders = [...confirmedOrders, ...inProductionOrders];
    const itemPromises = allOrders.map(order =>
      ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect()
    );
    await Promise.all(itemPromises);
    const itemsFetchTime = Date.now() - itemsStart;

    const totalTime = Date.now() - startTime;

    return {
      timestamp: Date.now(),
      orders: {
        count: allOrders.length,
        fetchTimeMs: ordersFetchTime,
      },
      items: {
        queries: allOrders.length,
        fetchTimeMs: itemsFetchTime,
        avgPerQueryMs: allOrders.length > 0 ? (itemsFetchTime / allOrders.length).toFixed(2) : "0",
      },
      total: {
        queriesExecuted: 2 + allOrders.length, // 2 status queries + N item queries
        totalTimeMs: totalTime,
      },
      verdict: totalTime < 1000 ? "✅ GOOD" : totalTime < 2000 ? "⚠️ ACCEPTABLE" : "❌ SLOW"
    };
  },
});
