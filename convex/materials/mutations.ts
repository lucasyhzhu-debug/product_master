import { protectedMutation } from "../lib/functions";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { calculateCostPerBaseUnit } from "../lib/costCalculator";

/**
 * Create a new packaging material.
 * Requires manager or admin role. createdBy derived from session user.
 */
export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    procurementSource: v.optional(v.string()),
    unitType: v.string(),
    volumePurchased: v.number(),
    priceExclShipping: v.number(),
    shippingCost: v.number(),
  },
  handler: async (ctx, args) => {
    // Calculate cost per base unit
    const { costPerUnit, baseUnit } = calculateCostPerBaseUnit(
      args.priceExclShipping,
      args.shippingCost,
      args.volumePurchased,
      args.unitType
    );

    const id = await ctx.db.insert("packagingMaterials", {
      name: args.name,
      brand: args.brand,
      procurementSource: args.procurementSource,
      unitType: args.unitType,
      volumePurchased: args.volumePurchased,
      priceExclShipping: args.priceExclShipping,
      shippingCost: args.shippingCost,
      createdBy: ctx.user.name,
      costPerBaseUnit: costPerUnit,
      baseUnit: baseUnit,
    });

    return id;
  },
});

/**
 * Update an existing packaging material.
 * Requires manager or admin role.
 */
export const update = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    id: v.id("packagingMaterials"),
    name: v.optional(v.string()),
    brand: v.optional(v.string()),
    procurementSource: v.optional(v.string()),
    unitType: v.optional(v.string()),
    volumePurchased: v.optional(v.number()),
    priceExclShipping: v.optional(v.number()),
    shippingCost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const current = await ctx.db.get(id);
    if (!current) {
      throw new Error("Packaging material not found");
    }

    // Merge updates with current values
    const merged = {
      name: updates.name ?? current.name,
      brand: updates.brand !== undefined ? updates.brand : current.brand,
      procurementSource:
        updates.procurementSource !== undefined
          ? updates.procurementSource
          : current.procurementSource,
      unitType: updates.unitType ?? current.unitType,
      volumePurchased: updates.volumePurchased ?? current.volumePurchased,
      priceExclShipping: updates.priceExclShipping ?? current.priceExclShipping,
      shippingCost: updates.shippingCost ?? current.shippingCost,
    };

    // Recalculate cost per base unit
    const { costPerUnit, baseUnit } = calculateCostPerBaseUnit(
      merged.priceExclShipping,
      merged.shippingCost,
      merged.volumePurchased,
      merged.unitType
    );

    await ctx.db.patch(id, {
      ...merged,
      costPerBaseUnit: costPerUnit,
      baseUnit: baseUnit,
    });

    // Invalidate affected packaging costs asynchronously
    await ctx.scheduler.runAfter(0, internal.lib.costInvalidation.invalidatePackagingCosts, {
      materialId: id,
    });

    return id;
  },
});

/**
 * Delete a packaging material.
 * Requires manager or admin role.
 */
export const remove = protectedMutation({
  roles: ["manager", "admin"],
  args: { id: v.id("packagingMaterials") },
  handler: async (ctx, args) => {
    // Check if material is used in any packaging components
    const usages = await ctx.db
      .query("packagingComponentMaterials")
      .withIndex("by_material", (q) => q.eq("packagingMaterialId", args.id))
      .first();

    if (usages) {
      throw new Error(
        "Cannot delete material: it is used in one or more packaging recipes"
      );
    }

    await ctx.db.delete(args.id);
    return true;
  },
});
