/**
 * Production Recipe Queries
 *
 * Read operations for production component recipes, COGS calculation,
 * and tier computation. No auth required for queries.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { collectLeafIngredients } from "../lib/hierarchyTraversal";

/**
 * Get the full recipe (sub-components + direct ingredients) for a production component.
 * Joins linked entities for display data.
 */
export const getRecipeForComponent = query({
  args: { componentTypeId: v.id("componentTypes") },
  handler: async (ctx, args) => {
    // Fetch sub-component links
    const subComponentLinks = await ctx.db
      .query("productionComponentLinks")
      .withIndex("by_parent", (q) => q.eq("parentComponentId", args.componentTypeId))
      .collect();

    // Join with child componentType for display data
    const subComponents = await Promise.all(
      subComponentLinks
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(async (link) => {
          const child = await ctx.db.get(link.childComponentId);
          return {
            _id: link._id,
            childComponentId: link.childComponentId,
            quantityPerUnit: link.quantityPerUnit,
            unit: link.unit,
            sortOrder: link.sortOrder,
            // Joined from child componentType
            childName: child?.name ?? "Unknown",
            childCode: child?.code ?? "UNKNOWN",
            childBatchSize: child?.batchSize,
            childUnitCostIdr: child?.unitCostIdr ?? 0,
          };
        })
    );

    // Fetch direct ingredient links
    const ingredientLinks = await ctx.db
      .query("productionComponentIngredients")
      .withIndex("by_component", (q) => q.eq("componentTypeId", args.componentTypeId))
      .collect();

    // Join with ingredient for display data
    const ingredients = await Promise.all(
      ingredientLinks
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(async (link) => {
          const ingredient = await ctx.db.get(link.ingredientId);
          return {
            _id: link._id,
            ingredientId: link.ingredientId,
            quantityPerUnit: link.quantityPerUnit,
            unit: link.unit,
            sortOrder: link.sortOrder,
            ingredientName: link.ingredientName ?? ingredient?.name ?? "Unknown",
            cachedLineCost: link.cachedLineCost,
            // Joined from ingredient
            costPerBaseUnit: ingredient?.costPerBaseUnit ?? 0,
            baseUnit: ingredient?.baseUnit ?? "g",
          };
        })
    );

    return { subComponents, ingredients };
  },
});

/**
 * Calculate COGS for a production component by traversing its full hierarchy.
 * Returns total cost, missing ingredient count, and breakdown.
 */
export const calculateCogs = query({
  args: { componentTypeId: v.id("componentTypes") },
  handler: async (ctx, args) => {
    const leafIngredients = await collectLeafIngredients(ctx, args.componentTypeId);

    let totalCogs = 0;
    let missingCount = 0;
    const breakdown = leafIngredients.map((ing) => {
      if (!ing.unitCost || ing.unitCost === 0) {
        missingCount++;
      }
      totalCogs += ing.lineCost;

      return {
        ingredientId: ing.ingredientId,
        ingredientName: ing.ingredientName,
        totalQuantity: ing.totalQuantity,
        unit: ing.unit,
        unitCost: ing.unitCost,
        lineCost: ing.lineCost,
      };
    });

    return { totalCogs, missingCount, breakdown };
  },
});

/**
 * Get all production component types with their computed tier depth.
 * Tier = max nesting depth (0 = leaf, 1 = has direct children, etc.)
 * Sorted by tier descending, then by name alphabetically.
 */
export const getComponentsWithTiers = query({
  args: {},
  handler: async (ctx) => {
    // Fetch all production component types
    const allComponents = await ctx.db
      .query("componentTypes")
      .withIndex("by_category", (q) => q.eq("category", "production"))
      .collect();

    // Compute tier for each component
    const componentsWithTiers = await Promise.all(
      allComponents.map(async (component) => {
        const tier = await computeTier(ctx, component._id, new Set(), 3);
        return { ...component, tier };
      })
    );

    // Sort: tier descending, then name alphabetically
    componentsWithTiers.sort((a, b) => {
      if (b.tier !== a.tier) return b.tier - a.tier;
      return a.name.localeCompare(b.name);
    });

    return componentsWithTiers;
  },
});

/**
 * Compute the tier (max depth below) for a component.
 * Leaf = 0, has children = 1+.
 */
async function computeTier(
  ctx: any,
  componentTypeId: any,
  visited: Set<string>,
  maxDepth: number
): Promise<number> {
  if (maxDepth <= 0 || visited.has(componentTypeId)) return 0;

  const currentVisited = new Set(visited);
  currentVisited.add(componentTypeId);

  const children = await ctx.db
    .query("productionComponentLinks")
    .withIndex("by_parent", (q: any) => q.eq("parentComponentId", componentTypeId))
    .collect();

  if (children.length === 0) return 0;

  let maxChildTier = 0;
  for (const child of children) {
    const childTier = await computeTier(
      ctx,
      child.childComponentId,
      currentVisited,
      maxDepth - 1
    );
    maxChildTier = Math.max(maxChildTier, childTier);
  }

  return 1 + maxChildTier;
}
