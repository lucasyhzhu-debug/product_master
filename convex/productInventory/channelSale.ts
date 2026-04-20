/**
 * Phase 74.5.1: Layer-4 channel-sale deduction core.
 *
 * Reuses Phase 78's `resolveSubstitutionPlan` + `createStockTracker` verbatim
 * (SPEC Constraint 1, RESEARCH §Don't Hand-Roll). Does NOT re-implement stock math.
 *
 * Contract (SPEC R4, RESEARCH §Code Example 2):
 *  - Does NOT write to externalRevenueItems — that's the caller's job.
 *  - Lets CHANNEL_ROUTING_NOT_CONFIGURED bubble up — caller's mutation rolls back.
 *  - createdAt === event.occurredAt (HISTORICAL — preserves backfill timestamps).
 *  - externalRef = externalTransactionId + (externalItemId ?? "").
 *  - Handles substitution plan (direct + substitute units as two ledger rows with same externalRef).
 */

import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { ChannelSaleEvent } from "../integrations/_shared/channelSaleEvent";
import { resolveChannelRoute } from "./channelRouting";
import { resolveSubstitutionPlan } from "./substitution";
import { createStockTracker, type StockTracker } from "./stockTracker";

export type ChannelSaleResult =
  | {
      deducted: true;
      locationId: Id<"storageLocations">;
      transactionId: Id<"productInventoryTransactions">;
    }
  | { deducted: false; skipReason: "unmapped_sku" | "zero_quantity" };

/**
 * Layer-4 deduction core. Reuses Phase 78 resolveSubstitutionPlan + createStockTracker verbatim.
 *
 * @param ctx Convex mutation context.
 * @param event Canonical sale event from an adapter's normalize().
 * @param tracker Optional shared StockTracker. If provided, caller is responsible for flush().
 *                If omitted, this function creates+flushes a local tracker.
 */
export async function processChannelSaleInternal(
  ctx: MutationCtx,
  event: ChannelSaleEvent,
  tracker?: StockTracker,
): Promise<ChannelSaleResult> {
  if (!event.menuProductId) return { deducted: false, skipReason: "unmapped_sku" };
  if (event.quantity <= 0) return { deducted: false, skipReason: "zero_quantity" };

  // Let CHANNEL_ROUTING_NOT_CONFIGURED bubble up — caller's mutation rolls back (atomicity).
  const locationId = await resolveChannelRoute(ctx, {
    source: event.source,
    outletId: event.outletId,
    menuProductId: event.menuProductId,
  });

  const local = tracker ?? createStockTracker(ctx);

  const menuProduct = await ctx.db.get(event.menuProductId);
  if (!menuProduct) return { deducted: false, skipReason: "unmapped_sku" };

  const directStock = await local.getStock(event.menuProductId, locationId);

  let sourceProduct: Doc<"menuProducts"> | null = null;
  let subStock: Awaited<ReturnType<StockTracker["getStock"]>> | null = null;
  if (menuProduct.fulfillFromProductId && menuProduct.fulfillMultiplier) {
    sourceProduct = await ctx.db.get(menuProduct.fulfillFromProductId);
    if (sourceProduct) {
      subStock = await local.getStock(menuProduct.fulfillFromProductId, locationId);
    }
  }

  const plan = resolveSubstitutionPlan(
    event.quantity,
    directStock.runningQty,
    menuProduct,
    sourceProduct,
  );

  const externalRef = `${event.externalTransactionId}${event.externalItemId ?? ""}`;
  let txId: Id<"productInventoryTransactions"> | undefined;

  if (plan.directUnits > 0) {
    const prev = directStock.runningQty;
    const next = prev - plan.directUnits;
    directStock.runningQty = next;
    txId = await ctx.db.insert("productInventoryTransactions", {
      menuProductId: event.menuProductId,
      locationId,
      transactionType: "channel_sale",
      source: event.source,
      quantity: -plan.directUnits,
      previousQuantity: prev,
      newQuantity: next,
      externalRef,
      performedBy: `system:${event.source}_sync`,
      createdAt: event.occurredAt,
    });
  }

  if (plan.needsSubstitution && plan.substituteUnits > 0 && sourceProduct && subStock) {
    const prev = subStock.runningQty;
    const next = prev - plan.substituteUnits;
    subStock.runningQty = next;
    const subTxId = await ctx.db.insert("productInventoryTransactions", {
      menuProductId: sourceProduct._id,
      locationId,
      transactionType: "channel_sale",
      source: event.source,
      quantity: -plan.substituteUnits,
      previousQuantity: prev,
      newQuantity: next,
      externalRef,
      performedBy: `system:${event.source}_sync`,
      createdAt: event.occurredAt,
    });
    // Return the first (direct) txId if it exists; otherwise the substitute-only txId.
    txId = txId ?? subTxId;
  }

  // Only flush if we own the tracker. Callers passing a shared tracker flush once at end.
  if (!tracker) await local.flush(event.occurredAt);

  if (!txId) {
    // plan.directUnits === 0 AND no substitution — nothing to deduct.
    return { deducted: false, skipReason: "zero_quantity" };
  }

  return { deducted: true, locationId, transactionId: txId };
}

/**
 * Build a ChannelSaleEvent from a revenue parent + item row.
 * Pure function (no ctx).
 *
 * occurredAt fallback chain per RESEARCH §Pitfall 1:
 *   revenue.transactionDate ?? revenue.periodStart ?? revenue._creationTime.
 */
export function buildEventFromRow(
  revenue: Doc<"externalRevenue">,
  item: Doc<"externalRevenueItems">,
): ChannelSaleEvent {
  const occurredAt =
    revenue.transactionDate ??
    revenue.periodStart ??
    revenue._creationTime;

  return {
    source: revenue.source,
    occurredAt,
    externalTransactionId: revenue.externalTransactionId ?? String(revenue._id),
    externalItemId: item.externalItemId,
    outletId: revenue.outletId,
    menuProductId: item.linkedMenuProductId,
    externalProductCode: revenue.externalProductCode,
    externalProductName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
  };
}
