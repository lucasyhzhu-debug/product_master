/**
 * GoBiz Legacy Cleanup - Remove old daily summary rows
 *
 * The old GoBiz adapter (pre-journal sync) created one aggregate row per day
 * via the dashboard API (proxy/63). These rows have:
 *   - source: "gobiz"
 *   - NO externalTransactionId (null/undefined)
 *   - NO gobizOrderNumber (null/undefined)
 *
 * The new journal-level adapter creates per-transaction rows that always have
 * both externalTransactionId and gobizOrderNumber set.
 *
 * This migration deletes the old summary rows and their associated sync logs.
 *
 * Run: npx convex run migrations/gobizCleanupLegacySummaries:cleanup
 */

import { mutation } from "../_generated/server";

export const cleanup = mutation({
  args: {},
  handler: async (ctx) => {
    const summary = {
      legacyRevenueDeleted: 0,
      legacyRevenueItemsDeleted: 0,
      legacySyncLogsDeleted: 0,
      journalRowsKept: 0,
      k3martRowsUntouched: 0,
    };

    // 1. Find all gobiz revenue rows
    const allGobizRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source", (q) => q.eq("source", "gobiz"))
      .collect();

    const legacySyncLogIds = new Set<string>();

    for (const row of allGobizRevenue) {
      if (!row.externalTransactionId && !row.gobizOrderNumber) {
        // Legacy daily summary row — delete it
        // First delete any associated revenue items
        const items = await ctx.db
          .query("externalRevenueItems")
          .withIndex("by_revenue", (q) => q.eq("revenueId", row._id))
          .collect();
        for (const item of items) {
          await ctx.db.delete(item._id);
          summary.legacyRevenueItemsDeleted++;
        }

        // Track sync log for cleanup
        if (row.syncLogId) {
          legacySyncLogIds.add(row.syncLogId);
        }

        await ctx.db.delete(row._id);
        summary.legacyRevenueDeleted++;
      } else {
        summary.journalRowsKept++;
      }
    }

    // 2. Delete orphaned sync logs (only if ALL their revenue rows were legacy)
    for (const syncLogId of legacySyncLogIds) {
      // Check if any journal-level rows still reference this sync log
      const remainingRefs = allGobizRevenue.filter(
        (r) =>
          r.syncLogId === syncLogId &&
          (r.externalTransactionId || r.gobizOrderNumber)
      );
      if (remainingRefs.length === 0) {
        const syncLog = await ctx.db.get(syncLogId as any);
        if (syncLog) {
          await ctx.db.delete(syncLog._id);
          summary.legacySyncLogsDeleted++;
        }
      }
    }

    // 3. Count K3Mart rows (just for reporting, never touched)
    const k3martRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .collect();
    summary.k3martRowsUntouched = k3martRevenue.length;

    return summary;
  },
});

/**
 * Dry run - preview what would be deleted without actually deleting.
 *
 * Run: npx convex run migrations/gobizCleanupLegacySummaries:preview
 */
export const preview = mutation({
  args: {},
  handler: async (ctx) => {
    const allGobizRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source", (q) => q.eq("source", "gobiz"))
      .collect();

    const legacy = allGobizRevenue.filter(
      (r) => !r.externalTransactionId && !r.gobizOrderNumber
    );
    const journal = allGobizRevenue.filter(
      (r) => r.externalTransactionId || r.gobizOrderNumber
    );

    return {
      totalGobizRows: allGobizRevenue.length,
      legacyRowsToDelete: legacy.length,
      journalRowsToKeep: journal.length,
      legacyRows: legacy.map((r) => ({
        id: r._id,
        periodStart: new Date(r.periodStart).toISOString(),
        periodEnd: new Date(r.periodEnd).toISOString(),
        revenueGross: r.revenueGross,
        revenueNet: r.revenueNet,
        transactionCount: r.transactionCount,
      })),
    };
  },
});
