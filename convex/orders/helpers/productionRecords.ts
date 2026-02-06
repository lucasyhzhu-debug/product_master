/**
 * Production Record Helpers
 *
 * Helpers for working with orderItemProduction records.
 * These track production progress per unit type per order item.
 */

import type { MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

// ============================================
// Types
// ============================================

export interface ItemWithProduction extends Doc<"orderItems"> {
  productionRecords: Doc<"orderItemProduction">[];
}

// ============================================
// Query Helpers
// ============================================

/**
 * Fetch all items for an order with their production records.
 */
export async function getOrderItemsWithProduction(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<ItemWithProduction[]> {
  const items = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();

  return await Promise.all(
    items.map(async (item) => {
      const productionRecords = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();
      return { ...item, productionRecords };
    })
  );
}

/**
 * Fetch production records for a single item.
 */
export async function getProductionRecordsForItem(
  ctx: MutationCtx,
  itemId: Id<"orderItems">
): Promise<Doc<"orderItemProduction">[]> {
  return await ctx.db
    .query("orderItemProduction")
    .withIndex("by_order_item", (q) => q.eq("orderItemId", itemId))
    .collect();
}

// ============================================
// Update Helpers
// ============================================

/**
 * Cancel all production records for an order item.
 * Sets isCancelled: true on each record.
 */
export async function cancelProductionRecords(
  ctx: MutationCtx,
  itemId: Id<"orderItems">
): Promise<void> {
  const records = await getProductionRecordsForItem(ctx, itemId);

  for (const record of records) {
    await ctx.db.patch(record._id, { isCancelled: true });
  }
}

/**
 * Cancel all production records for all items in an order.
 */
export async function cancelOrderProductionRecords(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<void> {
  const items = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();

  for (const item of items) {
    await cancelProductionRecords(ctx, item._id);
  }
}

/**
 * Mark all items in an order as production complete.
 * Updates both the isProductionComplete flag and the production records.
 */
export async function markOrderProductionComplete(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<void> {
  const items = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();

  for (const item of items) {
    // Mark item as complete
    await ctx.db.patch(item._id, { isProductionComplete: true });

    // Update all production records to complete
    const records = await getProductionRecordsForItem(ctx, item._id);
    for (const record of records) {
      await ctx.db.patch(record._id, {
        unitsCompleted: record.unitsRequired,
        unitsRemaining: 0,
      });
    }
  }
}

/**
 * Reset all items in an order to not production complete.
 * Used when reverting an order back to Confirmed status.
 */
export async function resetOrderProductionComplete(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<void> {
  const items = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();

  for (const item of items) {
    // Mark item as not complete
    await ctx.db.patch(item._id, { isProductionComplete: false });

    // Reset all production records
    const records = await getProductionRecordsForItem(ctx, item._id);
    for (const record of records) {
      await ctx.db.patch(record._id, {
        unitsCompleted: 0,
        unitsRemaining: record.unitsRequired,
      });
    }
  }
}

/**
 * Create production records for a new order item based on menu product components.
 * Uses componentType → productionUnitType bridge (required by orderItemProduction schema).
 */
export async function createProductionRecordsForItem(
  ctx: MutationCtx,
  orderItemId: Id<"orderItems">,
  menuProductId: Id<"menuProducts">,
  quantity: number
): Promise<void> {
  // Fetch menu product components
  const components = await ctx.db
    .query("menuProductComponents")
    .withIndex("by_menu_product", (q) => q.eq("menuProductId", menuProductId))
    .collect();

  // Create production records for each component
  for (const component of components) {
    // Get componentType (skip if not set - legacy records without componentTypeId)
    if (!component.componentTypeId) continue;
    const componentType = await ctx.db.get(component.componentTypeId);
    if (!componentType) continue;

    // Only create records for production components (not packaging)
    if (componentType.category !== "production") continue;

    const unitsRequired = component.quantity * quantity;

    // Bridge: Find productionUnitType by matching code
    // This bridge MUST stay because orderItemProduction.productionUnitTypeId is REQUIRED (v.id, not optional)
    const productionUnitType = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_code", (q) => q.eq("code", componentType.code))
      .first();

    if (!productionUnitType) {
      console.warn(
        `No productionUnitType found for componentType "${componentType.code}". Skipping production record.`
      );
      continue;
    }

    await ctx.db.insert("orderItemProduction", {
      orderItemId,
      productionUnitTypeId: productionUnitType._id,
      productionUnitCode: componentType.code,
      productionUnitName: componentType.name,
      unitsRequired,
      unitsCompleted: 0,
      unitsRemaining: unitsRequired,
    });
  }
}

/**
 * Update production records when an order item quantity changes.
 * Recalculates unitsRequired and adjusts unitsRemaining accordingly.
 */
export async function updateProductionRecordsForQuantityChange(
  ctx: MutationCtx,
  orderItemId: Id<"orderItems">,
  menuProductId: Id<"menuProducts">,
  newQuantity: number
): Promise<void> {
  // Get menu product components to recalculate
  const components = await ctx.db
    .query("menuProductComponents")
    .withIndex("by_menu_product", (q) => q.eq("menuProductId", menuProductId))
    .collect();

  // Create a map of productionUnitTypeId to quantity
  // We need to map componentType → productionUnitType to match orderItemProduction records
  const componentMap = new Map<string, number>();
  for (const comp of components) {
    if (!comp.componentTypeId) continue;
    const componentType = await ctx.db.get(comp.componentTypeId);
    if (!componentType || componentType.category !== "production") continue;

    // Find matching productionUnitType by code
    const productionUnitType = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_code", (q) => q.eq("code", componentType.code))
      .first();

    if (productionUnitType) {
      componentMap.set(productionUnitType._id.toString(), comp.quantity);
    }
  }

  // Get existing production records
  const records = await getProductionRecordsForItem(ctx, orderItemId);

  // Update each production record
  for (const record of records) {
    const componentQty = componentMap.get(record.productionUnitTypeId.toString()) ?? 0;
    const newUnitsRequired = componentQty * newQuantity;
    // Recalculate remaining (keep completed the same, adjust remaining)
    const newUnitsRemaining = Math.max(0, newUnitsRequired - record.unitsCompleted);

    await ctx.db.patch(record._id, {
      unitsRequired: newUnitsRequired,
      unitsRemaining: newUnitsRemaining,
    });
  }
}

/**
 * Delete all production records for an order item.
 * Used when removing an item from an order.
 */
export async function deleteProductionRecordsForItem(
  ctx: MutationCtx,
  itemId: Id<"orderItems">
): Promise<void> {
  const records = await getProductionRecordsForItem(ctx, itemId);

  for (const record of records) {
    await ctx.db.delete(record._id);
  }
}
