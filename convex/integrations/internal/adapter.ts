import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { BATCH_SIZE } from "./config";
import type { ChannelAdapter } from "../_shared/channelAdapter";
import type { ChannelSaleEvent } from "../_shared/channelSaleEvent";

// ─── ChannelAdapter: normalize() + adapter export (Phase 74.5.1 Plan 06) ─────
//
// NOTE (D74.5.1-L2): the `internal` feature flag stays permanent-OFF in
// 74.5.1/2. reserveStockForOrderInternal remains the authoritative internal
// stock deduction path. The events produced by internalNormalize() are
// recorded as externalRevenueItems rows via the existing saveRevenueItems
// path; deduction is NOT dispatched because channelDeductionEnabled.internal
// is false. This adapter export exists for shape uniformity across the 8
// sources and for Plan 05's gated dispatch hook (which will correctly skip).
//
// The live sync-action projection at lines 157-181 stays inline (byte-
// identical) to avoid any regression on the Phase 80.2 self-heal path.
// internalNormalize() is a PARALLEL pure export for tests + future 74.5.2
// cutover — it does NOT replace the inline projection.

export interface InternalRawOrder {
  readonly orderId: string;
  readonly completedAt: number;
  readonly outletId?: string;
  readonly items: ReadonlyArray<{
    readonly menuProductId?: string;
    readonly productName?: string;
    readonly quantity: number;
    readonly unitPrice: number;
    readonly totalPrice: number;
  }>;
}

export interface InternalRawBatch {
  readonly orders: ReadonlyArray<InternalRawOrder>;
}

/**
 * Pure projection: internal orders → ChannelSaleEvent[].
 *
 * Mirrors the item shape constructed inline at :163-180 of this adapter,
 * using `{orderId}-{itemIndex}` as externalItemId to preserve the existing
 * dedup key semantics.
 */
export function internalNormalize(
  payload: InternalRawBatch
): ChannelSaleEvent[] {
  if (!payload || !payload.orders || payload.orders.length === 0) return [];

  const events: ChannelSaleEvent[] = [];
  for (const order of payload.orders) {
    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      events.push({
        source: "internal" as const,
        occurredAt: order.completedAt,
        externalTransactionId: order.orderId,
        externalItemId: `${order.orderId}-${i}`,
        outletId: order.outletId as Id<"externalOutlets"> | undefined,
        menuProductId: item.menuProductId as Id<"menuProducts"> | undefined,
        externalProductName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      });
    }
  }
  return events;
}

export const internalAdapter: ChannelAdapter<InternalRawBatch> = {
  source: "internal",
  normalize: internalNormalize,
};

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
      // Phase 74.5.1 Plan 06 (R9): per-sync counters. The `internal` flag stays
      // permanent-OFF (D74.5.1-L2), so itemsDeducted == 0 and itemsSkipped ==
      // itemsInserted every sync. The counters are still recorded for
      // observability (syncLog dashboards).
      let itemsDeducted = 0;
      let itemsSkipped = 0;

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
            // Phase 74.5.1 Plan 06 (R9): migrated to saveRevenueItemsWithCounts
            // (Option A) to read `deducted` + `skipped` counters for syncLog
            // wiring. Behavior-preserving — item shape byte-identical, and the
            // Phase 80.2 existence-based guard above (lines 222-228) is kept
            // verbatim. `internal` flag is permanent-OFF so deducted stays 0.
            const itemsResult: {
              ids: Id<"externalRevenueItems">[];
              inserted: number;
              deducted: number;
              skipped: number;
            } = await ctx.runMutation(
              internal.externalData.mutations.saveRevenueItemsWithCounts,
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
            itemsDeducted += itemsResult.deducted;
            itemsSkipped += itemsResult.skipped;
          }
        }
      }

      // 5. Update sync log with success
      // Phase 74.5.1 Plan 06 (R9): wire itemsDeducted + itemsSkipped.
      await ctx.runMutation(
        internal.externalData.mutations.updateSyncLog,
        {
          logId: syncLogId,
          status: "success",
          productsCount: orders.length,
          durationMs: Date.now() - startTime,
          itemsDeducted,
          itemsSkipped,
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
