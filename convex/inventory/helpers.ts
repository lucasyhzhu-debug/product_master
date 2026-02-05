/**
 * Inventory Helper Functions
 *
 * Pure calculation and validation functions for inventory operations.
 * These helpers are used by mutations and queries.
 */

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Calculate weighted average cost from batches
 *
 * Formula: Σ(qty × cost) / Σ(qty)
 *
 * @param batches - Array of inventory batches
 * @returns Weighted average unit cost in IDR
 */
export function calculateWeightedAvgCost(
  batches: Array<{
    quantityRemaining: number;
    unitCostIdr: number;
  }>
): number {
  const totalValue = batches.reduce(
    (sum, batch) => sum + batch.quantityRemaining * batch.unitCostIdr,
    0
  );
  const totalQty = batches.reduce(
    (sum, batch) => sum + batch.quantityRemaining,
    0
  );

  if (totalQty === 0) return 0;

  return totalValue / totalQty;
}

/**
 * Update component stock aggregates from batches
 *
 * Recalculates totalStock, totalReserved, and weightedUnitCostIdr
 * from all active batches for a component at a location.
 *
 * @param ctx - Convex mutation context
 * @param componentTypeId - Component to update
 * @param locationId - Location to update
 */
export async function updateComponentStock(
  ctx: MutationCtx,
  componentTypeId: Id<"componentTypes">,
  locationId: Id<"storageLocations">
): Promise<void> {
  // Get all active batches for this component at this location
  const batches = await ctx.db
    .query("inventoryBatches")
    .withIndex("by_component_location", (q) =>
      q.eq("componentTypeId", componentTypeId).eq("locationId", locationId)
    )
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();

  // Calculate aggregates
  const totalStock = batches.reduce(
    (sum, batch) => sum + batch.quantityRemaining,
    0
  );
  const totalReserved = batches.reduce(
    (sum, batch) => sum + batch.quantityReserved,
    0
  );
  const weightedUnitCostIdr = calculateWeightedAvgCost(batches);

  // Get latest batch (LIFO) for reordering
  const latestBatch = batches.sort((a, b) => b.purchaseDate - a.purchaseDate)[0];

  // Check if stock record exists
  const existingStock = await ctx.db
    .query("componentStock")
    .withIndex("by_component_location", (q) =>
      q.eq("componentTypeId", componentTypeId).eq("locationId", locationId)
    )
    .first();

  if (existingStock) {
    // Update existing
    await ctx.db.patch(existingStock._id, {
      totalStock,
      totalReserved,
      weightedUnitCostIdr,
      latestSupplierName: latestBatch?.supplierName,
      latestPurchaseUrl: latestBatch?.purchaseUrl,
      latestUnitCostIdr: latestBatch?.unitCostIdr,
      lastUpdated: Date.now(),
    });
  } else if (totalStock > 0) {
    // Create new record
    await ctx.db.insert("componentStock", {
      componentTypeId,
      locationId,
      totalStock,
      totalReserved,
      weightedUnitCostIdr,
      latestSupplierName: latestBatch?.supplierName,
      latestPurchaseUrl: latestBatch?.purchaseUrl,
      latestUnitCostIdr: latestBatch?.unitCostIdr,
      lastUpdated: Date.now(),
    });
  }
}

/**
 * Validate stock adjustment to prevent negative available stock
 *
 * Available stock = quantityRemaining - quantityReserved
 * This validation ensures adjustments don't make available stock negative.
 *
 * @param batch - Current batch
 * @param quantityDelta - Proposed change (positive = add, negative = remove)
 * @throws Error if adjustment would result in negative available stock
 */
export function validateStockAdjustment(
  batch: Doc<"inventoryBatches">,
  quantityDelta: number
): void {
  const newRemaining = batch.quantityRemaining + quantityDelta;

  if (newRemaining < 0) {
    throw new Error(
      `Adjustment would create negative stock: ` +
        `${batch.quantityRemaining} current + ${quantityDelta} delta = ${newRemaining}`
    );
  }

  if (newRemaining < batch.quantityReserved) {
    throw new Error(
      `Adjustment would create negative available stock: ` +
        `${newRemaining} remaining - ${batch.quantityReserved} reserved = ` +
        `${newRemaining - batch.quantityReserved} available`
    );
  }
}

/**
 * Get available quantity for a batch
 *
 * Available = quantityRemaining - quantityReserved
 *
 * @param batch - Inventory batch
 * @returns Available quantity
 */
export function getAvailableQuantity(batch: Doc<"inventoryBatches">): number {
  return batch.quantityRemaining - batch.quantityReserved;
}

/**
 * Check if batch is expired
 *
 * @param batch - Inventory batch
 * @param now - Current timestamp (defaults to Date.now())
 * @returns True if expired
 */
export function isBatchExpired(
  batch: Doc<"inventoryBatches">,
  now = Date.now()
): boolean {
  return batch.expiryDate !== undefined && batch.expiryDate < now;
}
