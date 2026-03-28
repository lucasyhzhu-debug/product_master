import { protectedMutation } from "../lib/functions";
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
    await ctx.db.delete(args.id);
    return true;
  },
});

/**
 * Bulk update prices for multiple packaging materials.
 * Each item includes the material ID and new price fields.
 * Recalculates costPerBaseUnit for each changed item.
 * Requires manager or admin role.
 */
export const bulkUpdatePrices = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    updates: v.array(
      v.object({
        id: v.id("packagingMaterials"),
        volumePurchased: v.number(),
        priceExclShipping: v.number(),
        shippingCost: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const update of args.updates) {
      const current = await ctx.db.get(update.id);
      if (!current) {
        results.push({ id: update.id, success: false, error: "Not found" });
        continue;
      }

      // Recalculate cost per base unit
      const { costPerUnit, baseUnit } = calculateCostPerBaseUnit(
        update.priceExclShipping,
        update.shippingCost,
        update.volumePurchased,
        current.unitType
      );

      // Log price changes before patching
      const now = Date.now();
      const changedBy = ctx.user.name;
      const fields: { field: string; old: number; new: number }[] = [];
      if (current.volumePurchased !== update.volumePurchased)
        fields.push({ field: "volumePurchased", old: current.volumePurchased, new: update.volumePurchased });
      if (current.priceExclShipping !== update.priceExclShipping)
        fields.push({ field: "priceExclShipping", old: current.priceExclShipping, new: update.priceExclShipping });
      if (current.shippingCost !== update.shippingCost)
        fields.push({ field: "shippingCost", old: current.shippingCost, new: update.shippingCost });
      for (const f of fields) {
        await ctx.db.insert("priceChangeLog", {
          entityType: "material",
          entityId: update.id,
          entityName: current.name,
          field: f.field,
          oldValue: f.old,
          newValue: f.new,
          changedBy,
          changedAt: now,
        });
      }

      await ctx.db.patch(update.id, {
        volumePurchased: update.volumePurchased,
        priceExclShipping: update.priceExclShipping,
        shippingCost: update.shippingCost,
        costPerBaseUnit: costPerUnit,
        baseUnit: baseUnit,
      });

      results.push({ id: update.id, success: true });
    }

    return { updated: results.filter((r) => r.success).length, results };
  },
});
