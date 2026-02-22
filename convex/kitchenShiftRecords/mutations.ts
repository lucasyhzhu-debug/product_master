/**
 * Kitchen Shift Records Mutations
 *
 * Core production recording mechanism for end-of-shift production and waste tracking.
 * Integrates with Finished Goods Inventory (productInventory) at the Kitchen location.
 *
 * Mutations:
 *   submitShiftRecord  — All roles: record produced quantities + waste; auto-updates productInventory.
 *   updateShiftRecord  — Manager/admin only: edit a submitted record with delta inventory adjustment.
 */

import { mutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireRole } from "../lib/auth";
import { deductIngredientsForShift, restoreIngredientsForShift } from "./ingredientDeduction";

/**
 * submitShiftRecord — End-of-shift production recording.
 *
 * Roles: kitchen, order_staff, manager, admin.
 * - Validates waste cannot exceed produced for any product.
 * - Upserts productInventory at Kitchen location for each produced item.
 * - Deducts waste from productInventory.
 * - Logs productInventoryTransactions for every inventory change.
 * - Inserts kitchenShiftRecord with full audit trail.
 *
 * After updating Finished Goods inventory, deducts raw ingredients consumed by produced
 * ball quantities via FIFO (same pattern as BeingPrepared order fulfillment). Insufficient
 * ingredient stock warns but does NOT block shift submission (soft failure).
 * Returns ingredientWarnings for optional UI display.
 */
export const submitShiftRecord = mutation({
  args: {
    token: v.string(),
    date: v.string(), // YYYY-MM-DD
    produced: v.array(
      v.object({
        menuProductId: v.id("menuProducts"),
        quantity: v.number(),
      })
    ),
    waste: v.array(
      v.object({
        menuProductId: v.id("menuProducts"),
        reason: v.union(
          v.literal("qa_testing"),
          v.literal("spoilage"),
          v.literal("waste")
        ),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // 1. Auth: all roles can submit shift records
    const user = await requireRole(ctx, args.token, [
      "kitchen",
      "order_staff",
      "manager",
      "admin",
    ]);

    // 2. Find Kitchen storage location
    const kitchenLocation = await ctx.db
      .query("storageLocations")
      .withIndex("by_type", (q) => q.eq("locationType", "kitchen"))
      .first();

    if (!kitchenLocation) {
      throw new ConvexError(
        "Kitchen storage location not found. Please run the seed function first."
      );
    }

    // 3. Validate: waste cannot exceed produced for same product
    const producedMap = new Map<string, number>();
    for (const item of args.produced) {
      if (item.quantity > 0) {
        producedMap.set(String(item.menuProductId), item.quantity);
      }
    }

    for (const wasteItem of args.waste) {
      if (wasteItem.quantity <= 0) continue;
      const producedQty = producedMap.get(String(wasteItem.menuProductId)) ?? 0;
      if (wasteItem.quantity > producedQty) {
        // Look up product name for friendly error message
        const menuProduct = await ctx.db.get(wasteItem.menuProductId);
        const productName = menuProduct?.name ?? String(wasteItem.menuProductId);
        throw new ConvexError(
          `Waste cannot exceed produced quantity for ${productName}`
        );
      }
    }

    const now = Date.now();
    const inventoryUpdates: Array<{
      menuProductId: (typeof args.produced)[number]["menuProductId"];
      locationId: typeof kitchenLocation._id;
      delta: number;
      previousQuantity: number;
      newQuantity: number;
    }> = [];

    // 4. Add produced quantities to productInventory (upsert pattern from productInventory/mutations.ts)
    for (const item of args.produced) {
      if (item.quantity <= 0) continue;

      const existing = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q
            .eq("menuProductId", item.menuProductId)
            .eq("locationId", kitchenLocation._id)
        )
        .first();

      const previousQuantity = existing?.quantity ?? 0;
      const newQuantity = previousQuantity + item.quantity;

      if (existing) {
        await ctx.db.patch(existing._id, {
          quantity: newQuantity,
          lastUpdated: now,
        });
      } else {
        await ctx.db.insert("productInventory", {
          menuProductId: item.menuProductId,
          locationId: kitchenLocation._id,
          quantity: newQuantity,
          lastUpdated: now,
        });
      }

      // Log transaction
      await ctx.db.insert("productInventoryTransactions", {
        menuProductId: item.menuProductId,
        locationId: kitchenLocation._id,
        transactionType: "add",
        quantity: item.quantity,
        previousQuantity,
        newQuantity,
        performedBy: user.name,
        reason: "End-of-shift production",
        createdAt: now,
      });

      inventoryUpdates.push({
        menuProductId: item.menuProductId,
        locationId: kitchenLocation._id,
        delta: item.quantity,
        previousQuantity,
        newQuantity,
      });
    }

    // 5. Deduct waste quantities from productInventory
    for (const wasteItem of args.waste) {
      if (wasteItem.quantity <= 0) continue;

      // Re-query to get the latest quantity (may have been updated in step 4)
      const existing = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q
            .eq("menuProductId", wasteItem.menuProductId)
            .eq("locationId", kitchenLocation._id)
        )
        .first();

      const previousQuantity = existing?.quantity ?? 0;
      const newQuantity = previousQuantity - wasteItem.quantity;

      if (existing) {
        await ctx.db.patch(existing._id, {
          quantity: newQuantity,
          lastUpdated: now,
        });
      } else {
        await ctx.db.insert("productInventory", {
          menuProductId: wasteItem.menuProductId,
          locationId: kitchenLocation._id,
          quantity: newQuantity,
          lastUpdated: now,
        });
      }

      // Log waste transaction
      await ctx.db.insert("productInventoryTransactions", {
        menuProductId: wasteItem.menuProductId,
        locationId: kitchenLocation._id,
        transactionType: "adjust",
        quantity: -wasteItem.quantity,
        previousQuantity,
        newQuantity,
        performedBy: user.name,
        reason: `End-of-shift waste (${wasteItem.reason})`,
        createdAt: now,
      });

      inventoryUpdates.push({
        menuProductId: wasteItem.menuProductId,
        locationId: kitchenLocation._id,
        delta: -wasteItem.quantity,
        previousQuantity,
        newQuantity,
      });
    }

    // 6. Insert the shift record
    const recordId = await ctx.db.insert("kitchenShiftRecords", {
      date: args.date,
      submittedAt: now,
      submittedBy: user.name,
      submittedByUserId: user._id,
      produced: args.produced.filter((item) => item.quantity > 0),
      waste: args.waste.filter((item) => item.quantity > 0),
      inventoryUpdates,
    });

    // 7. Deduct raw ingredients consumed by produced ball quantities.
    // Waste items are NOT passed — waste does not consume additional ingredients.
    // Soft failure: warnings are returned but do not block shift submission.
    const producedItems = args.produced.filter((p) => p.quantity > 0);
    let ingredientWarnings: string[] = [];
    if (producedItems.length > 0) {
      try {
        const result = await deductIngredientsForShift(
          ctx,
          producedItems,
          args.date,
          user.name
        );
        ingredientWarnings = result.warnings;
      } catch {
        // Unexpected error in ingredient deduction — shift record already written.
        // Do not roll back; log warning but continue.
        ingredientWarnings = [
          "Ingredient deduction encountered an unexpected error. Raw ingredient stock may need manual adjustment.",
        ];
      }
    }

    return { recordId, ingredientWarnings };
  },
});

/**
 * updateShiftRecord — Edit a submitted shift record.
 *
 * Roles: manager, admin only.
 * - Computes net inventory delta (new - old) per product.
 * - Applies adjustment transactions for any delta !== 0.
 * - Records editedAt, editedBy, editNote for full audit trail.
 */
export const updateShiftRecord = mutation({
  args: {
    token: v.string(),
    recordId: v.id("kitchenShiftRecords"),
    produced: v.array(
      v.object({
        menuProductId: v.id("menuProducts"),
        quantity: v.number(),
      })
    ),
    waste: v.array(
      v.object({
        menuProductId: v.id("menuProducts"),
        reason: v.union(
          v.literal("qa_testing"),
          v.literal("spoilage"),
          v.literal("waste")
        ),
        quantity: v.number(),
      })
    ),
    editNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Auth: only managers and admins can edit shift records
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    // 2. Get the existing record
    const existingRecord = await ctx.db.get(args.recordId);
    if (!existingRecord) {
      throw new ConvexError("Shift record not found");
    }

    // 3. Find Kitchen storage location
    const kitchenLocation = await ctx.db
      .query("storageLocations")
      .withIndex("by_type", (q) => q.eq("locationType", "kitchen"))
      .first();

    if (!kitchenLocation) {
      throw new ConvexError(
        "Kitchen storage location not found. Please run the seed function first."
      );
    }

    // 4. Compute inventory delta per product
    // Build maps for old and new net quantities (produced - waste)
    const oldNetMap = new Map<string, number>();
    const newNetMap = new Map<string, number>();

    // Old produced
    for (const item of existingRecord.produced) {
      const key = String(item.menuProductId);
      oldNetMap.set(key, (oldNetMap.get(key) ?? 0) + item.quantity);
    }
    // Old waste (subtract)
    for (const item of existingRecord.waste) {
      const key = String(item.menuProductId);
      oldNetMap.set(key, (oldNetMap.get(key) ?? 0) - item.quantity);
    }

    // New produced
    for (const item of args.produced) {
      if (item.quantity <= 0) continue;
      const key = String(item.menuProductId);
      newNetMap.set(key, (newNetMap.get(key) ?? 0) + item.quantity);
    }
    // New waste (subtract)
    for (const item of args.waste) {
      if (item.quantity <= 0) continue;
      const key = String(item.menuProductId);
      newNetMap.set(key, (newNetMap.get(key) ?? 0) - item.quantity);
    }

    // Collect all unique product IDs across old and new
    const allProductIds = new Set([...oldNetMap.keys(), ...newNetMap.keys()]);

    const now = Date.now();
    const adjustmentUpdates: Array<{
      menuProductId: (typeof args.produced)[number]["menuProductId"];
      locationId: typeof kitchenLocation._id;
      delta: number;
      previousQuantity: number;
      newQuantity: number;
    }> = [];

    for (const productIdStr of allProductIds) {
      const oldNet = oldNetMap.get(productIdStr) ?? 0;
      const newNet = newNetMap.get(productIdStr) ?? 0;
      const delta = newNet - oldNet;

      if (delta === 0) continue;

      // Apply the delta adjustment to productInventory
      const menuProductId = productIdStr as (typeof args.produced)[number]["menuProductId"];

      const existing = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q
            .eq("menuProductId", menuProductId)
            .eq("locationId", kitchenLocation._id)
        )
        .first();

      const previousQuantity = existing?.quantity ?? 0;
      const newQuantity = previousQuantity + delta;

      if (existing) {
        await ctx.db.patch(existing._id, {
          quantity: newQuantity,
          lastUpdated: now,
        });
      } else {
        await ctx.db.insert("productInventory", {
          menuProductId,
          locationId: kitchenLocation._id,
          quantity: newQuantity,
          lastUpdated: now,
        });
      }

      // Log the adjustment transaction
      await ctx.db.insert("productInventoryTransactions", {
        menuProductId,
        locationId: kitchenLocation._id,
        transactionType: "adjust",
        quantity: delta,
        previousQuantity,
        newQuantity,
        performedBy: user.name,
        reason: `Shift record edit by ${user.name}`,
        createdAt: now,
      });

      adjustmentUpdates.push({
        menuProductId,
        locationId: kitchenLocation._id,
        delta,
        previousQuantity,
        newQuantity,
      });
    }

    // 5. Adjust raw ingredient consumption for the production diff.
    // Only produced quantities affect ingredient consumption — waste is ignored here.
    // Compute per-product produced diff: new - old (from the produced arrays, not net maps).
    const oldProducedMap = new Map<string, number>(
      existingRecord.produced.map((p) => [p.menuProductId as string, p.quantity])
    );
    const newProducedMap = new Map<string, number>(
      args.produced
        .filter((p) => p.quantity > 0)
        .map((p) => [p.menuProductId as string, p.quantity])
    );

    const allProducedIds = new Set([...oldProducedMap.keys(), ...newProducedMap.keys()]);

    // Positive diff: produced MORE than before → deduct additional ingredients
    const addedProduction: Array<{ menuProductId: (typeof args.produced)[number]["menuProductId"]; quantity: number }> =
      [];
    // Negative diff: produced LESS than before → restore ingredients
    const removedProduction: Array<{ menuProductId: (typeof args.produced)[number]["menuProductId"]; quantity: number }> =
      [];

    for (const productIdStr of allProducedIds) {
      const oldQty = oldProducedMap.get(productIdStr) ?? 0;
      const newQty = newProducedMap.get(productIdStr) ?? 0;
      const diff = newQty - oldQty;
      const menuProductId = productIdStr as (typeof args.produced)[number]["menuProductId"];

      if (diff > 0) {
        addedProduction.push({ menuProductId, quantity: diff });
      } else if (diff < 0) {
        removedProduction.push({ menuProductId, quantity: -diff }); // store as positive
      }
    }

    try {
      // Deduct ingredients for additional production (new > old)
      if (addedProduction.length > 0) {
        await deductIngredientsForShift(ctx, addedProduction, existingRecord.date, user.name);
      }

      // Restore ingredients for reduced production (new < old)
      if (removedProduction.length > 0) {
        await restoreIngredientsForShift(
          ctx,
          removedProduction,
          existingRecord.date,
          user.name
        );
      }
    } catch {
      // Unexpected error in ingredient adjustment — shift record will still be patched.
      // Do not roll back productInventory changes already applied above.
    }

    // 6. Build new inventoryUpdates array (original + adjustments)
    const newInventoryUpdates = [...existingRecord.inventoryUpdates, ...adjustmentUpdates];

    // 7. Patch the record with updated data and audit trail
    await ctx.db.patch(args.recordId, {
      produced: args.produced.filter((item) => item.quantity > 0),
      waste: args.waste.filter((item) => item.quantity > 0),
      inventoryUpdates: newInventoryUpdates,
      editedAt: now,
      editedBy: user.name,
      ...(args.editNote !== undefined ? { editNote: args.editNote } : {}),
    });

    return { success: true, adjustments: adjustmentUpdates.length };
  },
});
