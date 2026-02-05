/**
 * FIFO Inventory Consumption Logic
 *
 * First-In-First-Out batch consumption with actual COGS tracking.
 * Consumes from oldest batches first, tracking actual cost per batch.
 */

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getAvailableQuantity, isBatchExpired } from "./helpers";

/**
 * FIFO consumption result
 */
export interface FIFOConsumption {
  batchId: Id<"inventoryBatches">;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

/**
 * FIFO consumption summary
 */
export interface FIFOResult {
  consumptions: FIFOConsumption[];
  totalQuantity: number;
  totalCost: number;
  averageCost: number;
}

/**
 * Consume stock using FIFO logic
 *
 * Consumes from oldest batches first, filtering out expired batches.
 * Returns actual COGS breakdown by batch.
 *
 * @param ctx - Convex mutation context
 * @param componentTypeId - Component to consume
 * @param locationId - Location to consume from
 * @param quantity - Quantity to consume
 * @returns FIFO consumption result with actual costs
 * @throws Error if insufficient stock
 */
export async function consumeFromFIFO(
  ctx: MutationCtx,
  componentTypeId: Id<"componentTypes">,
  locationId: Id<"storageLocations">,
  quantity: number
): Promise<FIFOResult> {
  if (quantity <= 0) {
    throw new Error("Quantity must be positive");
  }

  // Get batches ordered by purchaseDate (oldest first)
  // Filter out expired batches
  const now = Date.now();
  const batches = await ctx.db
    .query("inventoryBatches")
    .withIndex("by_fifo", (q) =>
      q.eq("componentTypeId", componentTypeId).eq("locationId", locationId)
    )
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();

  // Filter out expired batches
  const activeBatches = batches.filter((batch) => !isBatchExpired(batch, now));

  // Sort by purchase date (FIFO)
  activeBatches.sort((a, b) => a.purchaseDate - b.purchaseDate);

  let remaining = quantity;
  const consumptions: FIFOConsumption[] = [];

  // Consume from batches FIFO
  for (const batch of activeBatches) {
    if (remaining <= 0) break;

    const available = getAvailableQuantity(batch);
    if (available <= 0) continue;

    const toConsume = Math.min(remaining, available);

    consumptions.push({
      batchId: batch._id,
      quantity: toConsume,
      unitCost: batch.unitCostIdr,
      totalCost: toConsume * batch.unitCostIdr,
    });

    remaining -= toConsume;
  }

  // Check if we have enough stock
  if (remaining > 0) {
    const available = consumptions.reduce((sum, c) => sum + c.quantity, 0);
    throw new Error(
      `Insufficient stock: requested ${quantity}, available ${available}, short ${remaining}`
    );
  }

  // Calculate totals
  const totalQuantity = consumptions.reduce((sum, c) => sum + c.quantity, 0);
  const totalCost = consumptions.reduce((sum, c) => sum + c.totalCost, 0);
  const averageCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;

  return {
    consumptions,
    totalQuantity,
    totalCost,
    averageCost,
  };
}

/**
 * Apply FIFO consumption to batches (mutation)
 *
 * Updates batch quantities and creates transaction records.
 * Should be called after consumeFromFIFO to actually apply the consumption.
 *
 * @param ctx - Convex mutation context
 * @param fifoResult - Result from consumeFromFIFO
 * @param orderId - Optional order ID for tracking
 * @param referenceNote - Optional reference note
 * @param createdBy - User who triggered consumption
 */
export async function applyFIFOConsumption(
  ctx: MutationCtx,
  fifoResult: FIFOResult,
  componentTypeId: Id<"componentTypes">,
  locationId: Id<"storageLocations">,
  orderId?: Id<"orders">,
  referenceNote?: string,
  createdBy = "system"
): Promise<void> {
  const now = Date.now();

  for (const consumption of fifoResult.consumptions) {
    const batch = await ctx.db.get(consumption.batchId);
    if (!batch) {
      throw new Error(`Batch ${consumption.batchId} not found`);
    }

    // Update batch quantity
    const newRemaining = batch.quantityRemaining - consumption.quantity;
    await ctx.db.patch(consumption.batchId, {
      quantityRemaining: newRemaining,
      status: newRemaining === 0 ? "depleted" : "active",
    });

    // Create transaction record
    await ctx.db.insert("componentTransactions", {
      componentTypeId,
      locationId,
      batchId: consumption.batchId,
      transactionType: "consume",
      quantity: -consumption.quantity, // Negative for consumption
      unitCostAtTime: consumption.unitCost,
      orderId,
      referenceNote,
      createdBy,
      createdAt: now,
    });
  }
}
