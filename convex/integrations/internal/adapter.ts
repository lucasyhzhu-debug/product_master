import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { BATCH_SIZE } from "./config";

type SyncResult = {
  success: true;
  syncLogId: Id<"externalSyncLogs">;
  totalOrders: number;
  newTransactions: number;
  skippedDuplicates: number;
  totalGross: number;
  totalNet: number;
  durationMs: number;
} | {
  success: false;
  error: string;
  syncLogId: Id<"externalSyncLogs">;
  durationMs: number;
};

/**
 * Sync revenue from our own Convex orders database.
 *
 * Flow:
 * 1. Create sync log (started)
 * 2. Get last successful sync timestamp for incremental sync
 * 3. Fetch revenue-countable orders (since last sync)
 * 4. Map orders to revenue records, batch-save with dedup by orderNumber
 * 5. Update sync log (success/error)
 */
export const syncInternalOrders = action({
  args: {
    triggeredBy: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SyncResult> => {
    const startTime = Date.now();

    // 1. Create sync log
    const syncLogId: Id<"externalSyncLogs"> = await ctx.runMutation(
      internal.externalData.mutations.createSyncLog,
      {
        source: "internal",
        syncType: "manual",
        status: "started",
        triggeredBy: args.triggeredBy ?? "manual",
        timestamp: startTime,
      }
    );

    try {
      // 2. Fetch all revenue-countable orders (dedup handled downstream by orderNumber)
      const orders = await ctx.runQuery(
        internal.integrations.internal.queries.getRevenueOrders,
        {}
      );

      let newTransactions = 0;
      let skippedDuplicates = 0;
      let totalGross = 0;
      let totalNet = 0;

      // 4. Process in batches
      for (let i = 0; i < orders.length; i += BATCH_SIZE) {
        const batch = orders.slice(i, i + BATCH_SIZE);

        const records = batch.map((order) => {
          const gross = order.totalAmount;
          const net = order.finalTotal ?? order.totalAmount;
          totalGross += gross;
          totalNet += net;

          // Use payment confirmation date for revenue recognition;
          // fall back to orderDate for historical orders without confirmedAt
          const revenueDate = order.confirmedAt ?? order.orderDate;

          return {
            source: "internal" as const,
            productName: `Order ${order.orderNumber}`,
            quantitySold: order.itemCount,
            transactionCount: 1,
            revenueGross: gross,
            revenueNet: net,
            costOfGoods: order.totalCost,
            periodStart: revenueDate,
            periodEnd: revenueDate,
            transactionDate: revenueDate,
            transactionType: "sales" as const,
            externalTransactionId: order.orderNumber,
            dataOrigin: "db_query" as const,
            confidence: "exact" as const,
            syncLogId,
          };
        });

        const insertedIds = await ctx.runMutation(
          internal.externalData.mutations.saveRevenue,
          { records }
        );

        newTransactions += insertedIds.length;
        skippedDuplicates += batch.length - insertedIds.length;
      }

      // 5. Update sync log with success
      await ctx.runMutation(
        internal.externalData.mutations.updateSyncLog,
        {
          logId: syncLogId,
          status: "success",
          productsCount: orders.length,
          durationMs: Date.now() - startTime,
        }
      );

      return {
        success: true,
        syncLogId,
        totalOrders: orders.length,
        newTransactions,
        skippedDuplicates,
        totalGross,
        totalNet,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await ctx.runMutation(
        internal.externalData.mutations.updateSyncLog,
        {
          logId: syncLogId,
          status: "error",
          errorMessage: errorMsg,
          durationMs: Date.now() - startTime,
        }
      );

      return {
        success: false,
        error: errorMsg,
        syncLogId,
        durationMs: Date.now() - startTime,
      };
    }
  },
});
