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
  totalItems: number;
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
    forceFullSync: v.optional(v.boolean()),
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
      // 2. Get last successful sync timestamp (skip if forceFullSync)
      const lastSyncTimestamp = args.forceFullSync
        ? undefined
        : await ctx.runQuery(
            internal.externalData.queries.getLatestSyncTimestamp,
            { source: "internal" }
          );

      // 3. Fetch revenue-countable orders (incremental: since last sync)
      const orders = await ctx.runQuery(
        internal.integrations.internal.queries.getRevenueOrders,
        { sinceTimestamp: lastSyncTimestamp ?? undefined }
      );

      let newTransactions = 0;
      let skippedDuplicates = 0;
      let totalGross = 0;
      let totalNet = 0;
      let totalItems = 0;

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

        const batchResults = await ctx.runMutation(
          internal.externalData.mutations.saveRevenue,
          { records }
        );

        newTransactions += batchResults.filter((r: { isNew: boolean }) => r.isNew).length;
        skippedDuplicates += batchResults.filter((r: { isNew: boolean }) => !r.isNew).length;

        // Generate externalRevenueItems for COGS resolution (only for new records)
        const batchOrderNumbers = batch.map((o) => o.orderNumber);
        const orderItemsMap = await ctx.runQuery(
          internal.integrations.internal.queries.getOrderItemsByOrderNumbers,
          { orderNumbers: batchOrderNumbers }
        );

        for (let j = 0; j < batch.length; j++) {
          const order = batch[j];
          const { id: revenueId, isNew } = batchResults[j];
          // Phase 80.2 Wave 2: self-heal guard.
          //
          // Pre-fix behavior: an unconditional "skip-if-not-new" branch
          // skipped saveRevenueItems for any re-synced parent. Any Direct
          // parent synced BEFORE the saveRevenueItems emit path was added
          // (~2026-04-10) stayed permanently orphaned — zero children.
          // 219/262 prod Direct parents were affected (see
          // .planning/debug/unlinked-products-k3mart-direct.md).
          //
          // Post-fix behavior: only skip re-synced parents that ALREADY have
          // at least one externalRevenueItems child. Orphan re-syncs fall
          // through to the emit path below and backfill their children. The
          // (revenueId, externalItemId) dedup inside saveRevenueItems makes
          // this additionally safe against races.
          //
          // Invariant: after this guard, saveRevenueItems runs iff the parent
          // has zero children. saveRevenueItems dedups on
          // (revenueId, externalItemId) so re-entry is safe even if a race
          // somehow inserted a child between the check and the call.
          //
          // Failure-mode: if hasExternalRevenueItemsQuery throws, the error
          // propagates and halts the sync — DO NOT swallow. Halt-loud is
          // safer than silent skip (which would silently re-create the
          // orphan-creation bug we're fixing).
          if (!isNew) {
            const hasChildren = await ctx.runQuery(
              internal.externalData.queries.hasExternalRevenueItemsQuery,
              { revenueId: revenueId as Id<"externalRevenue"> },
            );
            if (hasChildren) continue;
          }
          const items = orderItemsMap[order.orderNumber] ?? [];

          if (items.length > 0) {
            totalItems += items.length;
            await ctx.runMutation(
              internal.externalData.mutations.saveRevenueItems,
              {
                revenueId: revenueId as Id<"externalRevenue">,
                items: items.map((item) => ({
                  externalItemId: `${order.orderNumber}-${item._id}`,
                  productName: item.productName,
                  unitPrice: item.unitPrice,
                  quantity: item.quantity,
                  totalPrice: item.lineTotal,
                  linkedMenuProductId: item.menuProductId
                    ? (item.menuProductId as Id<"menuProducts">)
                    : undefined,
                  isAutoMatched: !!item.menuProductId,
                  matchConfidence: (item.menuProductId ? "exact" : "none") as
                    | "exact"
                    | "none",
                })),
              }
            );
          }
        }
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
        totalItems,
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
