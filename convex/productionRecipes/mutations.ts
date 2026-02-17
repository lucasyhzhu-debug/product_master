/**
 * Production Recipe Mutations
 *
 * CRUD for sub-component links and direct ingredient links on production components.
 * All user-facing mutations require manager/admin role via requireRole.
 * After any composition change, schedules COGS cache recalculation.
 */

import { mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";
import { wouldCreateCycle, traverseHierarchy } from "../lib/hierarchyTraversal";
import { calculateLineCost } from "../lib/costCalculator";

// ============================================
// SUB-COMPONENT MUTATIONS
// ============================================

/**
 * Add a sub-component link between two production components.
 * Validates: both are production, no self-reference, no cycle, max depth 3.
 */
export const addSubComponent = mutation({
  args: {
    token: v.string(),
    parentComponentId: v.id("componentTypes"),
    childComponentId: v.id("componentTypes"),
    quantityPerUnit: v.number(),
    unit: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    // Validate parent exists and is production
    const parent = await ctx.db.get(args.parentComponentId);
    if (!parent || parent.category !== "production") {
      throw new Error("Parent component must be a production component");
    }

    // Validate child exists and is production
    const child = await ctx.db.get(args.childComponentId);
    if (!child || child.category !== "production") {
      throw new Error("Child component must be a production component");
    }

    // No self-reference
    if (args.parentComponentId === args.childComponentId) {
      throw new Error("A component cannot be a sub-component of itself");
    }

    // Cycle detection
    const createsCycle = await wouldCreateCycle(
      ctx,
      args.parentComponentId,
      args.childComponentId
    );
    if (createsCycle) {
      throw new Error("Adding this sub-component would create a circular reference");
    }

    // Max depth check: traverse from parent's root to ensure adding this link won't exceed 3 tiers
    // We check by attempting to traverse the child hierarchy and seeing if total depth from parent exceeds 3
    const parentDepth = await getComponentDepthFromRoot(ctx, args.parentComponentId);
    const childMaxDepth = await getMaxDepthBelow(ctx, args.childComponentId);
    if (parentDepth + 1 + childMaxDepth > 3) {
      throw new Error("Adding this sub-component would exceed maximum nesting depth of 3 tiers");
    }

    // Get next sortOrder
    const existingLinks = await ctx.db
      .query("productionComponentLinks")
      .withIndex("by_parent", (q) => q.eq("parentComponentId", args.parentComponentId))
      .collect();
    const maxSortOrder = existingLinks.reduce((max, link) => Math.max(max, link.sortOrder), 0);

    const linkId = await ctx.db.insert("productionComponentLinks", {
      parentComponentId: args.parentComponentId,
      childComponentId: args.childComponentId,
      quantityPerUnit: args.quantityPerUnit,
      unit: args.unit,
      sortOrder: maxSortOrder + 1,
    });

    // Schedule COGS recalculation
    await ctx.scheduler.runAfter(
      0,
      internal.productionRecipes.mutations.recalculateComponentCogs,
      { componentTypeId: args.parentComponentId }
    );

    return linkId;
  },
});

/**
 * Remove a sub-component link.
 */
export const removeSubComponent = mutation({
  args: {
    token: v.string(),
    linkId: v.id("productionComponentLinks"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const link = await ctx.db.get(args.linkId);
    if (!link) {
      throw new Error("Sub-component link not found");
    }

    const parentComponentId = link.parentComponentId;
    await ctx.db.delete(args.linkId);

    // Schedule COGS recalculation
    await ctx.scheduler.runAfter(
      0,
      internal.productionRecipes.mutations.recalculateComponentCogs,
      { componentTypeId: parentComponentId }
    );

    return true;
  },
});

/**
 * Update quantity/unit on a sub-component link.
 */
export const updateSubComponentQuantity = mutation({
  args: {
    token: v.string(),
    linkId: v.id("productionComponentLinks"),
    quantityPerUnit: v.number(),
    unit: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const link = await ctx.db.get(args.linkId);
    if (!link) {
      throw new Error("Sub-component link not found");
    }

    await ctx.db.patch(args.linkId, {
      quantityPerUnit: args.quantityPerUnit,
      unit: args.unit,
    });

    // Schedule COGS recalculation
    await ctx.scheduler.runAfter(
      0,
      internal.productionRecipes.mutations.recalculateComponentCogs,
      { componentTypeId: link.parentComponentId }
    );

    return args.linkId;
  },
});

// ============================================
// DIRECT INGREDIENT MUTATIONS
// ============================================

/**
 * Add a direct ingredient to a production component.
 */
export const addIngredient = mutation({
  args: {
    token: v.string(),
    componentTypeId: v.id("componentTypes"),
    ingredientId: v.id("ingredients"),
    quantityPerUnit: v.number(),
    unit: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    // Validate componentType exists and is production
    const component = await ctx.db.get(args.componentTypeId);
    if (!component || component.category !== "production") {
      throw new Error("Component must be a production component");
    }

    // Validate ingredient exists
    const ingredient = await ctx.db.get(args.ingredientId);
    if (!ingredient) {
      throw new Error("Ingredient not found");
    }

    // Check for duplicate (same componentTypeId + ingredientId)
    const existing = await ctx.db
      .query("productionComponentIngredients")
      .withIndex("by_component", (q) => q.eq("componentTypeId", args.componentTypeId))
      .collect();
    const duplicate = existing.find((e) => e.ingredientId === args.ingredientId);
    if (duplicate) {
      throw new Error("This ingredient is already linked to this component");
    }

    // Snapshot ingredient name
    const ingredientName = ingredient.name;

    // Calculate cached line cost
    const cachedLineCost = calculateLineCost(
      ingredient.costPerBaseUnit,
      args.quantityPerUnit,
      args.unit
    );

    // Get next sortOrder
    const maxSortOrder = existing.reduce((max, e) => Math.max(max, e.sortOrder), 0);

    const linkId = await ctx.db.insert("productionComponentIngredients", {
      componentTypeId: args.componentTypeId,
      ingredientId: args.ingredientId,
      quantityPerUnit: args.quantityPerUnit,
      unit: args.unit,
      sortOrder: maxSortOrder + 1,
      ingredientName,
      cachedLineCost,
    });

    // Schedule COGS recalculation
    await ctx.scheduler.runAfter(
      0,
      internal.productionRecipes.mutations.recalculateComponentCogs,
      { componentTypeId: args.componentTypeId }
    );

    return linkId;
  },
});

/**
 * Remove a direct ingredient from a production component.
 */
export const removeIngredient = mutation({
  args: {
    token: v.string(),
    linkId: v.id("productionComponentIngredients"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const link = await ctx.db.get(args.linkId);
    if (!link) {
      throw new Error("Ingredient link not found");
    }

    const componentTypeId = link.componentTypeId;
    await ctx.db.delete(args.linkId);

    // Schedule COGS recalculation
    await ctx.scheduler.runAfter(
      0,
      internal.productionRecipes.mutations.recalculateComponentCogs,
      { componentTypeId }
    );

    return true;
  },
});

/**
 * Update quantity/unit on a direct ingredient link.
 */
export const updateIngredientQuantity = mutation({
  args: {
    token: v.string(),
    linkId: v.id("productionComponentIngredients"),
    quantityPerUnit: v.number(),
    unit: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const link = await ctx.db.get(args.linkId);
    if (!link) {
      throw new Error("Ingredient link not found");
    }

    // Get ingredient to recalculate line cost
    const ingredient = await ctx.db.get(link.ingredientId);
    const cachedLineCost = ingredient
      ? calculateLineCost(ingredient.costPerBaseUnit, args.quantityPerUnit, args.unit)
      : undefined;

    await ctx.db.patch(args.linkId, {
      quantityPerUnit: args.quantityPerUnit,
      unit: args.unit,
      cachedLineCost,
    });

    // Schedule COGS recalculation
    await ctx.scheduler.runAfter(
      0,
      internal.productionRecipes.mutations.recalculateComponentCogs,
      { componentTypeId: link.componentTypeId }
    );

    return args.linkId;
  },
});

// ============================================
// INTERNAL: COGS RECALCULATION
// ============================================

/**
 * Recalculate and cache COGS for a production component.
 * Skips if cogsMode !== "calculated".
 * Traverses full hierarchy, sums leaf ingredient costs, caches result.
 */
export const recalculateComponentCogs = internalMutation({
  args: { componentTypeId: v.id("componentTypes") },
  handler: async (ctx, args) => {
    const component = await ctx.db.get(args.componentTypeId);
    if (!component) return;

    // Skip if not in calculated mode
    if (component.cogsMode !== "calculated") return;

    // Traverse hierarchy to collect all leaf ingredients
    const ingredients = await traverseHierarchy(
      ctx,
      args.componentTypeId,
      1,
      new Set(),
      3
    );

    // Sum total COGS and count missing
    let totalCogs = 0;
    let missingCount = 0;

    for (const ing of ingredients) {
      if (!ing.unitCost || ing.unitCost === 0) {
        missingCount++;
      }
      totalCogs += ing.lineCost;
    }

    const previousCogs = component.cachedCalculatedCogs;

    // Patch componentType with cached values
    const patch: Record<string, unknown> = {
      cachedCalculatedCogs: totalCogs,
      cogsCacheUpdatedAt: Date.now(),
      cogsMissingCount: missingCount,
    };

    // If no missing ingredients AND COGS changed, also update unitCostIdr
    // so menu product cost cascade works
    if (missingCount === 0 && totalCogs !== previousCogs) {
      patch.unitCostIdr = totalCogs;
    }

    await ctx.db.patch(args.componentTypeId, patch);

    // Schedule menu product cost invalidation for any products using this component
    await ctx.scheduler.runAfter(
      0,
      internal.lib.costInvalidation.invalidateMenuProductCosts,
      { componentTypeId: args.componentTypeId }
    );
  },
});

// ============================================
// HELPERS
// ============================================

/**
 * Get how deep a component is from the root (how many parents above it).
 * A root component returns 0, a child returns 1, etc.
 */
async function getComponentDepthFromRoot(
  ctx: any,
  componentTypeId: any
): Promise<number> {
  // Walk upward through parent links
  let depth = 0;
  let currentId = componentTypeId;

  while (depth < 3) {
    const parentLink = await ctx.db
      .query("productionComponentLinks")
      .withIndex("by_child", (q: any) => q.eq("childComponentId", currentId))
      .first();

    if (!parentLink) break;
    depth++;
    currentId = parentLink.parentComponentId;
  }

  return depth;
}

/**
 * Get the maximum depth below a component (how deep its descendants go).
 * A leaf returns 0, a component with one level of children returns 1, etc.
 */
async function getMaxDepthBelow(
  ctx: any,
  componentTypeId: any
): Promise<number> {
  const children = await ctx.db
    .query("productionComponentLinks")
    .withIndex("by_parent", (q: any) => q.eq("parentComponentId", componentTypeId))
    .collect();

  if (children.length === 0) return 0;

  let maxChildDepth = 0;
  for (const child of children) {
    const childDepth = await getMaxDepthBelow(ctx, child.childComponentId);
    maxChildDepth = Math.max(maxChildDepth, childDepth);
  }

  return 1 + maxChildDepth;
}
