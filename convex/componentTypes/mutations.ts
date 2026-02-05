/**
 * Component Types Mutations
 *
 * CRUD operations for component types with dependency checking.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new component type
 */
export const create = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    category: v.union(
      v.literal("production"),
      v.literal("direct_packaging"),
      v.literal("indirect_packaging")
    ),
    unitCostIdr: v.number(),
    unit: v.string(),
    gramsPerUnit: v.optional(v.number()),
    trackInventory: v.boolean(),
    reorderPoint: v.optional(v.number()),
    reorderQuantity: v.optional(v.number()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate: code must be unique
    const existingCode = await ctx.db
      .query("componentTypes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (existingCode) {
      throw new Error(`Component code "${args.code}" already exists`);
    }

    // Validate: production components must have gramsPerUnit
    if (args.category === "production" && !args.gramsPerUnit) {
      throw new Error("Production components must have gramsPerUnit");
    }

    // Validate: packaging components must track inventory
    if (
      (args.category === "direct_packaging" ||
        args.category === "indirect_packaging") &&
      !args.trackInventory
    ) {
      throw new Error("Packaging components must track inventory");
    }

    // Validate: production components should NOT track inventory
    if (args.category === "production" && args.trackInventory) {
      throw new Error("Production components should not track inventory (made to order)");
    }

    // Get max sortOrder if not provided
    let sortOrder = args.sortOrder;
    if (sortOrder === undefined) {
      const allComponents = await ctx.db.query("componentTypes").collect();
      const maxSort = Math.max(...allComponents.map((c) => c.sortOrder), 0);
      sortOrder = maxSort + 1;
    }

    const componentId = await ctx.db.insert("componentTypes", {
      code: args.code,
      name: args.name,
      category: args.category,
      unitCostIdr: args.unitCostIdr,
      unit: args.unit,
      gramsPerUnit: args.gramsPerUnit,
      trackInventory: args.trackInventory,
      reorderPoint: args.reorderPoint,
      reorderQuantity: args.reorderQuantity,
      color: args.color,
      sortOrder,
      isActive: args.isActive ?? true,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    return componentId;
  },
});

/**
 * Update an existing component type
 */
export const update = mutation({
  args: {
    id: v.id("componentTypes"),
    name: v.optional(v.string()),
    unitCostIdr: v.optional(v.number()),
    unit: v.optional(v.string()),
    gramsPerUnit: v.optional(v.number()),
    reorderPoint: v.optional(v.number()),
    reorderQuantity: v.optional(v.number()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const component = await ctx.db.get(args.id);
    if (!component) {
      throw new Error("Component not found");
    }

    // Build update object (omit id)
    const { id, ...updates } = args;

    // Validate: production components must have gramsPerUnit
    if (
      component.category === "production" &&
      updates.gramsPerUnit !== undefined &&
      !updates.gramsPerUnit
    ) {
      throw new Error("Production components must have gramsPerUnit");
    }

    await ctx.db.patch(args.id, updates);

    return args.id;
  },
});

/**
 * Delete a component type (with dependency check)
 */
export const remove = mutation({
  args: {
    id: v.id("componentTypes"),
  },
  handler: async (ctx, args) => {
    const component = await ctx.db.get(args.id);
    if (!component) {
      throw new Error("Component not found");
    }

    // Check if used in menuProductComponents
    // Note: Using by_production_type index until schema migration renames it
    const usedInProducts = await ctx.db
      .query("menuProductComponents")
      .withIndex("by_production_type", (q) => q.eq("productionUnitTypeId", args.id))
      .first();

    if (usedInProducts) {
      const menuProduct = await ctx.db.get(usedInProducts.menuProductId);
      throw new Error(
        `Cannot delete: component is used in menu product "${menuProduct?.name || "unknown"}"`
      );
    }

    // Check if has inventory batches
    const hasBatches = await ctx.db
      .query("inventoryBatches")
      .withIndex("by_component", (q) => q.eq("componentTypeId", args.id))
      .first();

    if (hasBatches) {
      throw new Error(
        `Cannot delete: component has inventory batches. Set isActive=false instead.`
      );
    }

    // Check if has stock records
    const hasStock = await ctx.db
      .query("componentStock")
      .withIndex("by_component", (q) => q.eq("componentTypeId", args.id))
      .first();

    if (hasStock) {
      throw new Error(
        `Cannot delete: component has stock records. Set isActive=false instead.`
      );
    }

    await ctx.db.delete(args.id);

    return true;
  },
});
