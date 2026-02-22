/**
 * Ingredient Deduction Helper for Kitchen Shift Records
 *
 * Encapsulates BOM traversal + FIFO ingredient deduction logic so that
 * mutations.ts stays clean. Called after productInventory upserts in both
 * submitShiftRecord and updateShiftRecord.
 *
 * Pattern mirrors consumeIngredientMaterialsInternal from
 * convex/orders/mutations/inventoryIntegration.ts — same soft-failure approach.
 */

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { consumeFromFIFO, applyFIFOConsumption } from "../inventory/fifo";
import { updateComponentStock } from "../inventory/helpers";
import { collectLeafIngredients } from "../lib/hierarchyTraversal";

/**
 * Aggregate ingredient requirements from a produced items list via BOM traversal.
 *
 * For each produced item:
 *   1. Look up menuProductComponents for the menu product.
 *   2. Filter to production components that DON'T track inventory (BIG_BALL / MID_BALL).
 *   3. Traverse the ingredient hierarchy from each ball-type component downward.
 *   4. Accumulate total ingredient quantities across all products.
 *
 * @param ctx - Convex mutation context
 * @param produced - Items with positive quantities (must all be > 0)
 * @returns Map of ingredientId string -> aggregated need
 */
async function buildIngredientNeeds(
  ctx: MutationCtx,
  produced: Array<{ menuProductId: Id<"menuProducts">; quantity: number }>
): Promise<
  Map<
    string,
    { ingredientId: Id<"ingredients">; totalQuantity: number; unit: string; name: string }
  >
> {
  const ingredientNeeds = new Map<
    string,
    { ingredientId: Id<"ingredients">; totalQuantity: number; unit: string; name: string }
  >();

  for (const item of produced) {
    if (item.quantity <= 0) continue;

    // Get production BOM components for this menu product
    const menuProductComponents = await ctx.db
      .query("menuProductComponents")
      .withIndex("by_menu_product", (q) => q.eq("menuProductId", item.menuProductId))
      .collect();

    for (const comp of menuProductComponents) {
      if (!comp.componentTypeId) continue;

      const componentType = await ctx.db.get(comp.componentTypeId);
      if (!componentType) continue;

      // Only traverse production components that DON'T track inventory.
      // These are BIG_BALL / MID_BALL — the ball-type hierarchy roots.
      if (componentType.category !== "production" || componentType.trackInventory) continue;

      // Traverse the ingredient hierarchy from this ball type downward
      const leafIngredients = await collectLeafIngredients(ctx, comp.componentTypeId);

      for (const leaf of leafIngredients) {
        // Multiply: leaf quantity per ball × balls per product (comp.quantity) × products produced (item.quantity)
        const totalQty = leaf.totalQuantity * comp.quantity * item.quantity;
        const key = leaf.ingredientId as string;
        const existing = ingredientNeeds.get(key);
        if (existing) {
          existing.totalQuantity += totalQty;
        } else {
          ingredientNeeds.set(key, {
            ingredientId: leaf.ingredientId,
            totalQuantity: totalQty,
            unit: leaf.unit,
            name: leaf.ingredientName,
          });
        }
      }
    }
  }

  return ingredientNeeds;
}

/**
 * Deduct raw ingredients consumed by produced ball quantities at shift end.
 *
 * Called from submitShiftRecord AFTER productInventory upserts.
 * Only produced items are passed — waste does NOT consume additional ingredients.
 *
 * Soft failure: insufficient stock warns but does NOT block shift submission.
 * Consumes whatever is available via FIFO, then records a negative adjustment
 * for the shortfall (same pattern as consumeIngredientMaterialsInternal).
 *
 * @param ctx - Convex mutation context
 * @param produced - Items with quantity > 0 (filtered before calling)
 * @param shiftDate - YYYY-MM-DD, used in referenceNote
 * @param createdBy - user.name for componentTransactions.createdBy
 * @returns { consumed: number; warnings: string[] }
 */
export async function deductIngredientsForShift(
  ctx: MutationCtx,
  produced: Array<{ menuProductId: Id<"menuProducts">; quantity: number }>,
  shiftDate: string,
  createdBy: string
): Promise<{ consumed: number; warnings: string[] }> {
  const ingredientNeeds = await buildIngredientNeeds(ctx, produced);

  if (ingredientNeeds.size === 0) {
    return { consumed: 0, warnings: [] };
  }

  // Find the kitchen storage location
  const kitchenLocation = await ctx.db
    .query("storageLocations")
    .withIndex("by_type", (q) => q.eq("locationType", "kitchen"))
    .first();

  if (!kitchenLocation) {
    return {
      consumed: 0,
      warnings: ["Kitchen location not found — ingredient deduction skipped"],
    };
  }

  const kitchenLocationId = kitchenLocation._id;
  let consumedCount = 0;
  const warnings: string[] = [];
  const now = Date.now();
  const referenceNote = `Shift end ingredient consumption for ${shiftDate}`;

  for (const [, need] of ingredientNeeds) {
    // Find the linked componentType for this ingredient
    const ingredient = await ctx.db.get(need.ingredientId);
    if (!ingredient || !ingredient.ingredientComponentTypeId) continue;

    const componentType = await ctx.db.get(ingredient.ingredientComponentTypeId);
    if (!componentType || !componentType.trackInventory) continue;

    try {
      // Happy path: sufficient stock — consume via FIFO
      const fifoResult = await consumeFromFIFO(
        ctx,
        ingredient.ingredientComponentTypeId,
        kitchenLocationId,
        need.totalQuantity
      );
      await applyFIFOConsumption(
        ctx,
        fifoResult,
        ingredient.ingredientComponentTypeId,
        kitchenLocationId,
        undefined, // no orderId for shift records
        referenceNote,
        createdBy
      );
      await updateComponentStock(ctx, ingredient.ingredientComponentTypeId, kitchenLocationId);
      consumedCount++;
    } catch {
      // Insufficient stock: warn but do not block.
      // Consume whatever is available, then record a negative adjustment for the shortfall.
      const stockRecord = await ctx.db
        .query("componentStock")
        .withIndex("by_component_location", (q) =>
          q
            .eq("componentTypeId", ingredient.ingredientComponentTypeId!)
            .eq("locationId", kitchenLocationId)
        )
        .first();

      const available = stockRecord
        ? stockRecord.totalStock - stockRecord.totalReserved
        : 0;

      warnings.push(
        `Insufficient stock for ${need.name}: needed ${need.totalQuantity.toFixed(2)} ${need.unit}, available ${available.toFixed(2)}`
      );

      if (available > 0) {
        try {
          const partialResult = await consumeFromFIFO(
            ctx,
            ingredient.ingredientComponentTypeId,
            kitchenLocationId,
            available
          );
          await applyFIFOConsumption(
            ctx,
            partialResult,
            ingredient.ingredientComponentTypeId,
            kitchenLocationId,
            undefined,
            `Partial ${referenceNote}`,
            createdBy
          );
        } catch {
          // Partial also failed — skip
        }
      }

      // Negative adjustment for the shortfall
      const shortfall = need.totalQuantity - Math.max(available, 0);
      if (shortfall > 0) {
        await ctx.db.insert("componentTransactions", {
          componentTypeId: ingredient.ingredientComponentTypeId,
          locationId: kitchenLocationId,
          transactionType: "adjust",
          quantity: -shortfall,
          unitCostAtTime: componentType.unitCostIdr,
          referenceNote: `Negative adjustment: insufficient ingredient stock for shift ${shiftDate}`,
          createdBy,
          createdAt: now,
        });
      }

      await updateComponentStock(ctx, ingredient.ingredientComponentTypeId, kitchenLocationId);
      consumedCount++;
    }
  }

  return { consumed: consumedCount, warnings };
}

/**
 * Restore raw ingredients when a shift record edit reduces produced quantities.
 *
 * Called from updateShiftRecord for items where new produced < old produced.
 * Inserts positive componentTransactions adjustments and patches the latest
 * active batch (best-effort restore — exact batch accuracy is not required for edits).
 *
 * @param ctx - Convex mutation context
 * @param removedProduction - Items representing the POSITIVE reduction amount (new < old)
 * @param shiftDate - YYYY-MM-DD, used in referenceNote
 * @param createdBy - user.name for componentTransactions.createdBy
 */
export async function restoreIngredientsForShift(
  ctx: MutationCtx,
  removedProduction: Array<{ menuProductId: Id<"menuProducts">; quantity: number }>,
  shiftDate: string,
  createdBy: string
): Promise<void> {
  // Reuse the same BOM traversal to compute what to restore
  const ingredientNeeds = await buildIngredientNeeds(ctx, removedProduction);

  if (ingredientNeeds.size === 0) return;

  const kitchenLocation = await ctx.db
    .query("storageLocations")
    .withIndex("by_type", (q) => q.eq("locationType", "kitchen"))
    .first();

  if (!kitchenLocation) return;

  const now = Date.now();

  for (const [, need] of ingredientNeeds) {
    const ingredient = await ctx.db.get(need.ingredientId);
    if (!ingredient || !ingredient.ingredientComponentTypeId) continue;

    const componentType = await ctx.db.get(ingredient.ingredientComponentTypeId);
    if (!componentType || !componentType.trackInventory) continue;

    // Insert a positive adjustment transaction to restore ingredient stock
    await ctx.db.insert("componentTransactions", {
      componentTypeId: ingredient.ingredientComponentTypeId,
      locationId: kitchenLocation._id,
      transactionType: "adjust",
      quantity: need.totalQuantity, // Positive = restoring stock
      unitCostAtTime: componentType.unitCostIdr,
      referenceNote: `Ingredient restore: shift record edit reduced production for ${shiftDate}`,
      createdBy,
      createdAt: now,
    });

    // Add back to the most recently received active batch (best-effort)
    const batches = await ctx.db
      .query("inventoryBatches")
      .withIndex("by_fifo", (q) =>
        q
          .eq("componentTypeId", ingredient.ingredientComponentTypeId!)
          .eq("locationId", kitchenLocation._id)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    if (batches.length > 0) {
      // Add back to most recently received batch (newest)
      const latestBatch = batches.sort((a, b) => b.purchaseDate - a.purchaseDate)[0];
      await ctx.db.patch(latestBatch._id, {
        quantityRemaining: latestBatch.quantityRemaining + need.totalQuantity,
      });
    }

    await updateComponentStock(
      ctx,
      ingredient.ingredientComponentTypeId,
      kitchenLocation._id
    );
  }
}
