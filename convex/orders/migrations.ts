/**
 * Data Migration and Verification Utilities
 *
 * Pre-Flight verification for Orders & Kitchen refactor
 */

import { query } from "../_generated/server";

// Type for documents that may still have deprecated fields (pre-cleanup data).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any>;

/**
 * Verify current production tracking state (NEW system only)
 *
 * Checks:
 * 1. How many orderItems have orderItemProduction records
 * 2. Current coverage of production tracking
 * 3. Data integrity (all items with productionType have records)
 *
 * Note: OLD system (ballsRemaining) removed in Phase 4.
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
    const itemsMissingRecords: string[] = [];

    for (const item of allItems) {
      // Skip cancelled items
      if (item.isCancelled) continue;

      // Cast to AnyDoc: deprecated fields removed from schema in Plan 04.
      const doc = item as AnyDoc;
      const hasProductionType = doc.productionType !== undefined && doc.productionType !== null;
      if (hasProductionType) {
        itemsWithProductionType++;
      }

      const productionRecords = productionByItem.get(item._id.toString()) || [];

      if (productionRecords.length > 0) {
        itemsWithProduction++;
      } else {
        itemsWithoutProduction++;
        // Log items with productionType but no records (data integrity issue)
        if (hasProductionType && itemsMissingRecords.length < 10) {
          itemsMissingRecords.push(
            `Item ${item._id}: ${item.productName} (type: ${doc.productionType})`
          );
        }
      }
    }

    const totalActive = allItems.filter(item => !item.isCancelled).length;
    const coveragePercent = totalActive > 0
      ? ((itemsWithProduction / totalActive) * 100).toFixed(2)
      : "0.00";

    const integrityCheck = itemsWithProductionType === itemsWithProduction;

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
      integrity: {
        allItemsHaveRecords: integrityCheck,
        itemsMissingRecords: itemsWithProductionType - itemsWithProduction,
        sampleMissing: itemsMissingRecords,
      },
      production: {
        totalProductionRecords: allProduction.length,
        activeRecords: allProduction.filter(r => !r.isCancelled).length,
        cancelledRecords: allProduction.filter(r => r.isCancelled).length,
      },
      verdict: integrityCheck
        ? "✅ PASS - All items with productionType have records"
        : itemsWithProductionType - itemsWithProduction <= totalActive * 0.1
        ? `⚠️ WARNING - ${itemsWithProductionType - itemsWithProduction} items missing records`
        : `❌ FAIL - ${itemsWithProductionType - itemsWithProduction} items missing records`
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

    // Simulate kitchen orders query (Phase 14: single status)
    const beingPreparedOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "BeingPrepared"))
      .collect();

    const ordersFetchTime = Date.now() - startTime;

    // Fetch items (simulating N+1 pattern)
    const itemsStart = Date.now();
    const allOrders = [...beingPreparedOrders];
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
