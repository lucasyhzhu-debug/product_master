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
