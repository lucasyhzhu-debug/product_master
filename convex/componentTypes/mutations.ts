/**
 * Component Types Mutations
 *
 * CRUD operations for component types with dependency checking.
 */

import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { normalizeName } from "./helpers";

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
    // Phase 20: Batch size and COGS mode
    batchSize: v.optional(v.number()),
    batchSizeUnit: v.optional(v.string()),
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

    // Note: Production components CAN track inventory when they represent
    // ingredient-linked items (Phase 20). The trackInventory flag is explicitly
    // set at creation time, so no artificial constraint is needed.

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
      // Phase 20: Batch size and COGS mode
      batchSize: args.batchSize,
      batchSizeUnit: args.batchSizeUnit,
      cogsMode: resolvedCategory === "production" ? "manual" : undefined,
      manualUnitCostIdr: resolvedCategory === "production" ? args.unitCostIdr : undefined,
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
    // Phase 20: Batch size and COGS mode toggle
    batchSize: v.optional(v.number()),
    batchSizeUnit: v.optional(v.string()),
    cogsMode: v.optional(v.union(v.literal("manual"), v.literal("calculated"))),
    category: v.optional(v.union(v.literal("production"), v.literal("packaging"))),
  },
  handler: async (ctx, args) => {
    const component = await ctx.db.get(args.id);
    if (!component) {
      throw new Error("Component not found");
    }

    // Build update object (omit id and cogsMode -- handled separately)
    const { id, cogsMode: newCogsMode, ...updates } = args;

    // Validate: production components must have gramsPerUnit
    if (
      component.category === "production" &&
      updates.gramsPerUnit !== undefined &&
      !updates.gramsPerUnit
    ) {
      throw new Error("Production components must have gramsPerUnit");
    }

    // Phase 20: COGS mode toggle
    if (newCogsMode !== undefined && newCogsMode !== component.cogsMode) {
      if (newCogsMode === "calculated") {
        // Switching to calculated: save current unitCostIdr as manual fallback
        (updates as Record<string, unknown>).cogsMode = "calculated";
        (updates as Record<string, unknown>).manualUnitCostIdr =
          component.unitCostIdr;
      } else {
        // Switching to manual: restore from manualUnitCostIdr if available
        (updates as Record<string, unknown>).cogsMode = "manual";
        if (component.manualUnitCostIdr !== undefined) {
          (updates as Record<string, unknown>).unitCostIdr =
            component.manualUnitCostIdr;
        }
        (updates as Record<string, unknown>).cachedCalculatedCogs = undefined;
      }
    }

    await ctx.db.patch(args.id, updates);

    // COGS cascade: when unitCostIdr changes, mark affected menuProducts as stale
    // then schedule recalculation to update their cached unitCost
    if (args.unitCostIdr !== undefined || (newCogsMode === "manual" && component.manualUnitCostIdr !== undefined)) {
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

    // Phase 20: When switching to calculated mode, schedule COGS recalculation
    if (newCogsMode === "calculated" && newCogsMode !== component.cogsMode) {
      await ctx.scheduler.runAfter(
        0,
        internal.productionRecipes.mutations.recalculateComponentCogs,
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

/**
 * Create an ingredient-tracking component type.
 *
 * Links a food ingredient to the inventory/BOM system by creating a componentType
 * with category="production" and trackInventory=true. Updates the ingredient's
 * ingredientComponentTypeId field to complete the bidirectional link.
 *
 * Phase 20: Ingredient inventory tracking.
 */
export const createIngredientComponentType = mutation({
  args: {
    ingredientId: v.id("ingredients"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    // Authz: only admin or manager may wire ingredients to componentTypes.
    // Without this gate, any session token (kitchen, order_staff) could
    // create production componentTypes and patch ingredient FK pointers.
    await requireRole(ctx, args.token, ["admin", "manager"]);

    // Validate ingredient exists
    const ingredient = await ctx.db.get(args.ingredientId);
    if (!ingredient) {
      throw new Error("Ingredient not found");
    }

    // Check if ingredient already has a linked componentType
    if (ingredient.ingredientComponentTypeId) {
      const existing = await ctx.db.get(ingredient.ingredientComponentTypeId);
      if (existing) {
        return existing._id; // Already linked, return existing
      }
    }

    // Reuse an existing production componentType with a matching normalized
    // name before creating a new ING_* row. Prevents visual duplicates on the
    // Components page when a seed (e.g. FILLING_PISTACHIO) and an ingredient
    // (e.g. "Filling-Pistachio") would otherwise produce two rows with the
    // same display name.
    const normalizedIngredientName = normalizeName(ingredient.name);
    const allProduction = await ctx.db
      .query("componentTypes")
      .withIndex("by_category", (q) => q.eq("category", "production"))
      .collect();
    const nameMatch = allProduction.find(
      (c) => normalizeName(c.name) === normalizedIngredientName
    );
    if (nameMatch) {
      await ctx.db.patch(args.ingredientId, {
        ingredientComponentTypeId: nameMatch._id,
      });
      return nameMatch._id;
    }

    // Auto-generate code from ingredient name
    const baseCode = `ING_${ingredient.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 30)}`;

    // Check for duplicate code and append suffix if needed
    let code = baseCode;
    let suffix = 0;
    while (true) {
      const existingCode = await ctx.db
        .query("componentTypes")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (!existingCode) break;
      suffix++;
      code = `${baseCode}_${suffix}`;
    }

    // Get max sortOrder
    const allComponents = await ctx.db.query("componentTypes").collect();
    const maxSort = Math.max(...allComponents.map((c) => c.sortOrder), 0);

    // Resolve createdBy from token
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    const user = session?.userId ? await ctx.db.get(session.userId) : null;
    const createdBy = user?.name ?? "system";

    // Create the componentType
    const componentId = await ctx.db.insert("componentTypes", {
      code,
      name: ingredient.name,
      category: "production",
      trackInventory: true,
      unitCostIdr: ingredient.costPerBaseUnit,
      unit: ingredient.baseUnit,
      gramsPerUnit: undefined,
      reorderPoint: 0,
      reorderQuantity: undefined,
      consumptionStage: "production",
      alarmPercentage: undefined,
      color: undefined,
      sortOrder: maxSort + 1,
      isActive: true,
      createdBy,
      createdAt: Date.now(),
    });

    // Link ingredient to the new componentType
    await ctx.db.patch(args.ingredientId, {
      ingredientComponentTypeId: componentId,
    });

    return componentId;
  },
});
