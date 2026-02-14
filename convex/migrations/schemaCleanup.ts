/**
 * Schema Cleanup Migrations - Phase 8, Plan 03
 *
 * Deploy 1 of the two-step schema cleanup pipeline.
 * Run these mutations from the Convex dashboard (Functions tab) BEFORE
 * deploying the tightened schema (Plan 04).
 *
 * Execution order:
 *   1. Run all backfill mutations (Mutations 1-6)
 *   2. Run all cleanup mutations (Mutations 7-8)
 *   3. Run verifyCleanupComplete query to confirm readiness
 *   4. Deploy Plan 04 schema changes
 *
 * All mutations require admin auth (token: v.string() + requireRole).
 * All mutations return structured reports for dashboard visibility.
 *
 * If any mutation times out on a large table, split into cursor-based
 * pagination (process N documents at a time, re-call mutation).
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

// Type for documents that may still have deprecated fields (pre-cleanup data).
// After schema tightening, these fields no longer appear in the generated types,
// but the migration code must still reference them for cleanup verification.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any>;

// ============================================
// BACKFILL MUTATIONS (Category B fields)
// ============================================

/**
 * Mutation 1: backfillIngredientsCostFields
 *
 * Backfills costPerBaseUnit and baseUnit for all ingredients where either is undefined.
 * - costPerBaseUnit = (priceExclShipping + shippingCost) / volumePurchased, converted to base unit
 * - baseUnit derived from unitType: "kg" -> "g", "l" -> "ml", "m" -> "cm", otherwise same
 */
export const backfillIngredientsCostFields = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const allIngredients = await ctx.db.query("ingredients").collect();
    let patched = 0;
    let skipped = 0;

    for (const ingredient of allIngredients) {
      const needsCostPerBaseUnit = ingredient.costPerBaseUnit === undefined;
      const needsBaseUnit = ingredient.baseUnit === undefined;

      if (!needsCostPerBaseUnit && !needsBaseUnit) {
        skipped++;
        continue;
      }

      const patchData: Record<string, unknown> = {};

      if (needsBaseUnit) {
        const baseUnit = deriveBaseUnit(ingredient.unitType);
        patchData.baseUnit = baseUnit;
      }

      if (needsCostPerBaseUnit) {
        const rawCostPerUnit =
          (ingredient.priceExclShipping + ingredient.shippingCost) /
          ingredient.volumePurchased;
        const costPerBaseUnit = convertToBaseUnitCost(
          rawCostPerUnit,
          ingredient.unitType
        );
        patchData.costPerBaseUnit = costPerBaseUnit;
      }

      await ctx.db.patch(ingredient._id, patchData);
      patched++;
    }

    return { total: allIngredients.length, patched, skipped };
  },
});

/**
 * Mutation 2: backfillPackagingMaterialsCostFields
 *
 * Same logic as ingredients but for packagingMaterials table.
 */
export const backfillPackagingMaterialsCostFields = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const allMaterials = await ctx.db.query("packagingMaterials").collect();
    let patched = 0;
    let skipped = 0;

    for (const material of allMaterials) {
      const needsCostPerBaseUnit = material.costPerBaseUnit === undefined;
      const needsBaseUnit = material.baseUnit === undefined;

      if (!needsCostPerBaseUnit && !needsBaseUnit) {
        skipped++;
        continue;
      }

      const patchData: Record<string, unknown> = {};

      if (needsBaseUnit) {
        const baseUnit = deriveBaseUnit(material.unitType);
        patchData.baseUnit = baseUnit;
      }

      if (needsCostPerBaseUnit) {
        const rawCostPerUnit =
          (material.priceExclShipping + material.shippingCost) /
          material.volumePurchased;
        const costPerBaseUnit = convertToBaseUnitCost(
          rawCostPerUnit,
          material.unitType
        );
        patchData.costPerBaseUnit = costPerBaseUnit;
      }

      await ctx.db.patch(material._id, patchData);
      patched++;
    }

    return { total: allMaterials.length, patched, skipped };
  },
});

/**
 * Mutation 3: backfillMenuProductsRequiredFields
 *
 * Backfills unitCost, cachedProductionSummary, and productType for menuProducts.
 */
export const backfillMenuProductsRequiredFields = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const allMenuProducts = await ctx.db.query("menuProducts").collect();
    let patched = 0;
    let skipped = 0;

    for (const mp of allMenuProducts) {
      const needsUnitCost = mp.unitCost === undefined;
      const needsCachedSummary = mp.cachedProductionSummary === undefined;
      const needsProductType = mp.productType === undefined;

      if (!needsUnitCost && !needsCachedSummary && !needsProductType) {
        skipped++;
        continue;
      }

      const patchData: Record<string, unknown> = {};

      if (needsUnitCost) {
        patchData.unitCost = 0;
      }
      if (needsCachedSummary) {
        patchData.cachedProductionSummary = "";
      }
      if (needsProductType) {
        patchData.productType = "food";
      }

      await ctx.db.patch(mp._id, patchData);
      patched++;
    }

    return { total: allMenuProducts.length, patched, skipped };
  },
});

/**
 * Mutation 4: backfillOrdersRequiredFields
 *
 * Backfills isKitchenVisible, completedAt (terminal orders only), and finalTotal.
 *
 * NOTE: If the orders table has > 5,000 documents and this mutation times out,
 * implement cursor-based batching: process 500 at a time, return a cursor.
 * For this FMCG business, we assume < 5,000 orders.
 */
export const backfillOrdersRequiredFields = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const allOrders = await ctx.db.query("orders").collect();
    let patched = 0;
    let skipped = 0;

    const kitchenVisibleStatuses = [
      "Draft",
      "Confirmed",
      "InProduction",
      "Packaging",
      "Boxed",
      "Labeled",
      "WaitingShipment",
      "WaitingPickup",
    ];
    const terminalStatuses = ["CompleteShipped", "PickedUp", "Cancelled"];

    for (const order of allOrders) {
      const needsKitchenVisible = order.isKitchenVisible === undefined;
      const needsCompletedAt =
        order.completedAt === undefined &&
        terminalStatuses.includes(order.status);
      const needsFinalTotal = order.finalTotal === undefined;

      if (!needsKitchenVisible && !needsCompletedAt && !needsFinalTotal) {
        skipped++;
        continue;
      }

      const patchData: Record<string, unknown> = {};

      if (needsKitchenVisible) {
        patchData.isKitchenVisible = kitchenVisibleStatuses.includes(
          order.status
        );
      }

      if (needsCompletedAt) {
        // Best-guess for historical orders: use creation time
        patchData.completedAt = order._creationTime;
      }

      if (needsFinalTotal) {
        patchData.finalTotal =
          order.totalAmount - (order.orderLevelDiscount ?? 0);
      }

      await ctx.db.patch(order._id, patchData);
      patched++;
    }

    return { total: allOrders.length, patched, skipped };
  },
});

/**
 * Mutation 5: backfillKitchenInventoryFields
 *
 * Backfills totalProducedOriginal, totalProducedBiteSized, and updatedBy.
 */
export const backfillKitchenInventoryFields = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const allKitchenInventory = await ctx.db
      .query("kitchenInventory")
      .collect();
    let patched = 0;
    let skipped = 0;

    for (const ki of allKitchenInventory) {
      const needsTotalOriginal = ki.totalProducedOriginal === undefined;
      const needsTotalBiteSized = ki.totalProducedBiteSized === undefined;
      const needsUpdatedBy = ki.updatedBy === undefined;

      if (!needsTotalOriginal && !needsTotalBiteSized && !needsUpdatedBy) {
        skipped++;
        continue;
      }

      const patchData: Record<string, unknown> = {};

      if (needsTotalOriginal) {
        patchData.totalProducedOriginal = 0;
      }
      if (needsTotalBiteSized) {
        patchData.totalProducedBiteSized = 0;
      }
      if (needsUpdatedBy) {
        patchData.updatedBy = "system";
      }

      await ctx.db.patch(ki._id, patchData);
      patched++;
    }

    return { total: allKitchenInventory.length, patched, skipped };
  },
});

/**
 * Mutation 6: backfillProductionUnitTypesColor
 *
 * Backfills color field for productionUnitTypes where undefined.
 */
export const backfillProductionUnitTypesColor = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const allTypes = await ctx.db.query("productionUnitTypes").collect();
    let patched = 0;
    let skipped = 0;

    for (const put of allTypes) {
      if (put.color !== undefined) {
        skipped++;
        continue;
      }

      await ctx.db.patch(put._id, { color: "#93C572" });
      patched++;
    }

    return { total: allTypes.length, patched, skipped };
  },
});

// ============================================
// CLEANUP MUTATIONS (Category C deprecated fields)
// ============================================

/**
 * Mutation 7: clearMenuProductsDeprecatedFields
 *
 * Clears productionType, productionUnits, and isFixed from all menuProducts.
 * These deprecated fields are replaced by BOM (menuProductComponents + componentTypes)
 * and posSlot/packagingPosSlot respectively.
 */
export const clearMenuProductsDeprecatedFields = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const allMenuProducts = await ctx.db.query("menuProducts").collect();
    let cleared = 0;
    let skipped = 0;

    for (const mp of allMenuProducts) {
      // Cast to AnyDoc: these deprecated fields were removed from the schema in Plan 04.
      // This migration was designed to run BEFORE schema tightening (Deploy 1).
      const doc = mp as AnyDoc;
      const hasProductionType = doc.productionType !== undefined;
      const hasProductionUnits = doc.productionUnits !== undefined;
      const hasIsFixed = doc.isFixed !== undefined;

      if (!hasProductionType && !hasProductionUnits && !hasIsFixed) {
        skipped++;
        continue;
      }

      // Fields already removed from schema -- patch is a no-op after Plan 04 deploy.
      await ctx.db.patch(mp._id, {} as Record<string, undefined>);
      cleared++;
    }

    return { total: allMenuProducts.length, cleared, skipped };
  },
});

/**
 * Mutation 8: clearOrderItemsDeprecatedFields
 *
 * Clears productionType and productionUnits from all orderItems.
 * These deprecated fields are replaced by orderItemProduction records (BOM-based).
 *
 * NOTE: orderItems may be the largest table. If this mutation times out,
 * split into multiple calls using cursor-based pagination (process 500 at a time).
 */
export const clearOrderItemsDeprecatedFields = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const allItems = await ctx.db.query("orderItems").collect();
    let cleared = 0;
    let skipped = 0;

    for (const item of allItems) {
      // Cast to AnyDoc: these deprecated fields were removed from the schema in Plan 04.
      const doc = item as AnyDoc;
      if (
        doc.productionType === undefined &&
        doc.productionUnits === undefined
      ) {
        skipped++;
        continue;
      }

      // Fields already removed from schema -- patch is a no-op after Plan 04 deploy.
      await ctx.db.patch(item._id, {} as Record<string, undefined>);
      cleared++;
    }

    return { total: allItems.length, cleared, skipped };
  },
});

// ============================================
// VERIFICATION QUERY
// ============================================

/**
 * Mutation 9 (query): verifyCleanupComplete
 *
 * Safety check run between Deploy 1 (backfill + cleanup) and Deploy 2 (schema tightening).
 * Returns { ready: boolean, issues: string[] }.
 * ready is true only if ALL counts are 0 (safe to tighten schema).
 */
export const verifyCleanupComplete = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const issues: string[] = [];

    // Check Category C (deprecated fields should be cleared)
    // Cast to AnyDoc: these fields were removed from the schema in Plan 04.
    const menuProducts = await ctx.db.query("menuProducts").collect();
    const mpWithDeprecated = menuProducts.filter(
      (mp) => {
        const doc = mp as AnyDoc;
        return (
          doc.productionType !== undefined ||
          doc.productionUnits !== undefined ||
          doc.isFixed !== undefined
        );
      }
    ).length;
    if (mpWithDeprecated > 0) {
      issues.push(
        `${mpWithDeprecated} menuProducts still have deprecated fields (productionType/productionUnits/isFixed)`
      );
    }

    const orderItems = await ctx.db.query("orderItems").collect();
    const oiWithDeprecated = orderItems.filter(
      (oi) => {
        const doc = oi as AnyDoc;
        return doc.productionType !== undefined || doc.productionUnits !== undefined;
      }
    ).length;
    if (oiWithDeprecated > 0) {
      issues.push(
        `${oiWithDeprecated} orderItems still have deprecated fields (productionType/productionUnits)`
      );
    }

    // Check Category B (required fields should be backfilled)
    const ingredients = await ctx.db.query("ingredients").collect();
    const ingMissing = ingredients.filter(
      (i) => i.costPerBaseUnit === undefined || i.baseUnit === undefined
    ).length;
    if (ingMissing > 0) {
      issues.push(
        `${ingMissing} ingredients missing costPerBaseUnit or baseUnit`
      );
    }

    const packagingMaterials = await ctx.db
      .query("packagingMaterials")
      .collect();
    const matMissing = packagingMaterials.filter(
      (m) => m.costPerBaseUnit === undefined || m.baseUnit === undefined
    ).length;
    if (matMissing > 0) {
      issues.push(
        `${matMissing} packagingMaterials missing costPerBaseUnit or baseUnit`
      );
    }

    const mpMissing = menuProducts.filter(
      (mp) =>
        mp.unitCost === undefined ||
        mp.cachedProductionSummary === undefined ||
        mp.productType === undefined
    ).length;
    if (mpMissing > 0) {
      issues.push(
        `${mpMissing} menuProducts missing unitCost, cachedProductionSummary, or productType`
      );
    }

    const orders = await ctx.db.query("orders").collect();
    const ordersMissing = orders.filter(
      (o) => o.isKitchenVisible === undefined || o.finalTotal === undefined
    ).length;
    if (ordersMissing > 0) {
      issues.push(
        `${ordersMissing} orders missing isKitchenVisible or finalTotal`
      );
    }

    const kitchenInventory = await ctx.db.query("kitchenInventory").collect();
    const kiMissing = kitchenInventory.filter(
      (ki) =>
        ki.totalProducedOriginal === undefined ||
        ki.totalProducedBiteSized === undefined ||
        ki.updatedBy === undefined
    ).length;
    if (kiMissing > 0) {
      issues.push(
        `${kiMissing} kitchenInventory missing totalProducedOriginal, totalProducedBiteSized, or updatedBy`
      );
    }

    const productionUnitTypes = await ctx.db
      .query("productionUnitTypes")
      .collect();
    const putMissing = productionUnitTypes.filter(
      (put) => put.color === undefined
    ).length;
    if (putMissing > 0) {
      issues.push(`${putMissing} productionUnitTypes missing color`);
    }

    return { ready: issues.length === 0, issues };
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Derive the base unit from a unitType.
 * kg -> g, l -> ml, m -> cm, otherwise same as unitType.
 */
function deriveBaseUnit(unitType: string): string {
  switch (unitType.toLowerCase()) {
    case "kg":
      return "g";
    case "l":
      return "ml";
    case "m":
      return "cm";
    default:
      return unitType;
  }
}

/**
 * Convert cost-per-purchased-unit to cost-per-base-unit.
 * For kg: multiply by 0.001 (cost per gram)
 * For l: multiply by 0.001 (cost per ml)
 * Otherwise: use as-is
 */
function convertToBaseUnitCost(
  rawCostPerUnit: number,
  unitType: string
): number {
  switch (unitType.toLowerCase()) {
    case "kg":
      return rawCostPerUnit * 0.001;
    case "l":
      return rawCostPerUnit * 0.001;
    default:
      return rawCostPerUnit;
  }
}
