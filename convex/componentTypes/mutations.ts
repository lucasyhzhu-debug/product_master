/**
 * Component Types Mutations
 *
 * CRUD operations for component types with dependency checking.
 */

import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
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
      v.literal("packaging"),
      v.literal("direct_packaging"),   // Legacy compat
      v.literal("indirect_packaging")  // Legacy compat
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
    description: v.optional(v.string()),
    consumptionStage: v.optional(v.union(
      v.literal("production"),
      v.literal("boxing"),
      v.literal("labeling"),
      v.literal("none")
    )),
    alarmPercentage: v.optional(v.number()),
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

    // Map legacy category values to canonical values
    const resolvedCategory: "production" | "packaging" =
      args.category === "direct_packaging" || args.category === "indirect_packaging"
        ? "packaging"
        : args.category;

    // Validate: production components must have gramsPerUnit
    if (resolvedCategory === "production" && !args.gramsPerUnit) {
      throw new Error("Production components must have gramsPerUnit");
    }

    // Validate: packaging components must track inventory
    if (resolvedCategory === "packaging" && !args.trackInventory) {
      throw new Error("Packaging components must track inventory");
    }

    // Validate: production components should NOT track inventory
    if (resolvedCategory === "production" && args.trackInventory) {
      throw new Error("Production components should not track inventory (made to order)");
    }

    // Get max sortOrder if not provided
    let sortOrder = args.sortOrder;
    if (sortOrder === undefined) {
      const allComponents = await ctx.db.query("componentTypes").collect();
      const maxSort = Math.max(...allComponents.map((c) => c.sortOrder), 0);
      sortOrder = maxSort + 1;
    }

    // Default consumptionStage based on category
    const consumptionStage = args.consumptionStage ??
      (resolvedCategory === "packaging" ? "boxing" : "none");

    const componentId = await ctx.db.insert("componentTypes", {
      code: args.code,
      name: args.name,
      category: resolvedCategory,
      description: args.description,
      unitCostIdr: args.unitCostIdr,
      unit: args.unit,
      gramsPerUnit: args.gramsPerUnit,
      trackInventory: args.trackInventory,
      reorderPoint: args.reorderPoint,
      reorderQuantity: args.reorderQuantity,
      consumptionStage,
      alarmPercentage: args.alarmPercentage,
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
    description: v.optional(v.string()),
    consumptionStage: v.optional(v.union(
      v.literal("production"),
      v.literal("boxing"),
      v.literal("labeling"),
      v.literal("none")
    )),
    alarmPercentage: v.optional(v.number()),
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

    // COGS cascade: when unitCostIdr changes, mark affected menuProducts as stale
    // then schedule recalculation to update their cached unitCost
    if (args.unitCostIdr !== undefined) {
      // Find all menuProductComponents using this componentType
      const usages = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_component_type", (q) => q.eq("componentTypeId", args.id))
        .collect();

      // Get unique menuProduct IDs and mark each as stale
      const affectedIds = new Set(usages.map((u) => u.menuProductId));
      for (const menuProductId of affectedIds) {
        await ctx.db.patch(menuProductId, { unitCostStaleAt: Date.now() });
      }

      // Schedule async recalculation (clears stale marker when done)
      await ctx.scheduler.runAfter(
        0,
        internal.lib.costInvalidation.invalidateMenuProductCosts,
        { componentTypeId: args.id }
      );
    }

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
    const usedInProducts = await ctx.db
      .query("menuProductComponents")
      .withIndex("by_component_type", (q) => q.eq("componentTypeId", args.id))
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

/**
 * Quick-create a packaging component type.
 *
 * Minimal input (name only). Auto-generates code, sets sensible defaults.
 * Used for inline creation in ProductForm.
 */
export const createPackagingQuick = mutation({
  args: {
    name: v.string(),
    category: v.optional(v.union(
      v.literal("packaging"),
      v.literal("direct_packaging"),   // Legacy compat
      v.literal("indirect_packaging")  // Legacy compat
    )),
    consumptionStage: v.optional(v.union(
      v.literal("production"),
      v.literal("boxing"),
      v.literal("labeling"),
      v.literal("none")
    )),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Always resolve to "packaging" (this function only creates packaging components)
    const category: "packaging" = "packaging";

    // Auto-generate code from name
    const baseCode = `PKG_${args.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 30)}`;

    // Check for duplicate and append suffix if needed
    let code = baseCode;
    let suffix = 0;
    while (true) {
      const existing = await ctx.db
        .query("componentTypes")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!existing) break;
      suffix++;
      code = `${baseCode}_${suffix}`;
    }

    // Get max sortOrder
    const allComponents = await ctx.db.query("componentTypes").collect();
    const maxSort = Math.max(...allComponents.map((c) => c.sortOrder), 0);

    const componentId = await ctx.db.insert("componentTypes", {
      code,
      name: args.name,
      category,
      description: undefined,
      unitCostIdr: 0, // To be updated from inventory batches
      unit: "pcs",
      gramsPerUnit: undefined,
      trackInventory: true,
      reorderPoint: undefined,
      reorderQuantity: undefined,
      consumptionStage: args.consumptionStage ?? "boxing",
      alarmPercentage: undefined,
      color: undefined,
      sortOrder: maxSort + 1,
      isActive: true,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    return componentId;
  },
});
