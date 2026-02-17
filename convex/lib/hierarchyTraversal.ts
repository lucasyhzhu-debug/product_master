/**
 * Hierarchy traversal utilities for production component BOM.
 *
 * Supports up to 3 tiers of nesting with circular reference detection.
 * Used to compute COGS by walking the component tree down to leaf ingredients.
 *
 * Tier examples:
 *   Mid Ball -> Marshmallow Mix -> Sugar, Gelatin, Water
 *   Mid Ball -> Chocolate Coating -> Cocoa Powder, Butter
 */

import { Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { calculateLineCost } from "./costCalculator";

const MAX_DEPTH = 3;

export interface IngredientUsage {
  ingredientId: Id<"ingredients">;
  ingredientName: string;
  totalQuantity: number;
  unit: string;
  unitCost: number; // costPerBaseUnit from ingredients table
  lineCost: number; // calculated via calculateLineCost
}

type Ctx = QueryCtx | MutationCtx;

/**
 * Check if adding childId as a sub-component of parentId would create a cycle.
 *
 * Algorithm: if parentId === childId, return true immediately.
 * Then DFS from childId's descendants checking if parentId appears.
 */
export async function wouldCreateCycle(
  ctx: Ctx,
  parentId: Id<"componentTypes">,
  childId: Id<"componentTypes">,
  maxDepth: number = MAX_DEPTH
): Promise<boolean> {
  if (parentId === childId) {
    return true;
  }

  // DFS: check if parentId appears anywhere in childId's descendant tree
  const visited = new Set<string>();

  async function dfs(currentId: Id<"componentTypes">, depth: number): Promise<boolean> {
    if (depth <= 0) {
      return false; // Stop searching beyond max depth
    }
    if (visited.has(currentId)) {
      return false; // Already checked this branch
    }
    visited.add(currentId);

    const children = await ctx.db
      .query("productionComponentLinks")
      .withIndex("by_parent", (q) => q.eq("parentComponentId", currentId))
      .collect();

    for (const link of children) {
      if (link.childComponentId === parentId) {
        return true; // Found the parent in descendants -- would create cycle
      }
      if (await dfs(link.childComponentId, depth - 1)) {
        return true;
      }
    }

    return false;
  }

  return dfs(childId, maxDepth);
}

/**
 * Recursively traverse a component's hierarchy, collecting all leaf ingredient usages.
 *
 * For each sub-component, calculates child units using batchSize conversion:
 * - If child has batchSize > 0: childUnits = (quantityPerUnit * quantityMultiplier) / batchSize
 * - Otherwise: childUnits = quantityPerUnit * quantityMultiplier
 *
 * @param ctx - Convex query or mutation context
 * @param componentTypeId - The component to traverse
 * @param quantityMultiplier - Multiplier for quantities (1 for top-level)
 * @param visited - Set of already-visited component IDs (for cycle detection)
 * @param maxDepth - Maximum remaining depth (throws if exceeded)
 * @returns Array of ingredient usages with costs
 */
export async function traverseHierarchy(
  ctx: Ctx,
  componentTypeId: Id<"componentTypes">,
  quantityMultiplier: number,
  visited: Set<string>,
  maxDepth: number
): Promise<IngredientUsage[]> {
  if (maxDepth <= 0) {
    throw new Error(`Maximum nesting depth (${MAX_DEPTH}) exceeded`);
  }

  if (visited.has(componentTypeId)) {
    throw new Error(`Circular reference detected: ${componentTypeId}`);
  }

  // Add current to visited (use a new Set per branch to avoid cross-branch false positives)
  const currentVisited = new Set(visited);
  currentVisited.add(componentTypeId);

  const results: IngredientUsage[] = [];

  // 1. Fetch direct ingredients
  const directIngredients = await ctx.db
    .query("productionComponentIngredients")
    .withIndex("by_component", (q) => q.eq("componentTypeId", componentTypeId))
    .collect();

  for (const entry of directIngredients) {
    const ingredient = await ctx.db.get(entry.ingredientId);
    if (!ingredient) continue;

    const totalQuantity = entry.quantityPerUnit * quantityMultiplier;
    const unitCost = ingredient.costPerBaseUnit;
    const lineCost = calculateLineCost(unitCost, totalQuantity, entry.unit);

    results.push({
      ingredientId: entry.ingredientId,
      ingredientName: ingredient.name,
      totalQuantity,
      unit: entry.unit,
      unitCost,
      lineCost,
    });
  }

  // 2. Fetch sub-components and recurse
  const subComponents = await ctx.db
    .query("productionComponentLinks")
    .withIndex("by_parent", (q) => q.eq("parentComponentId", componentTypeId))
    .collect();

  for (const link of subComponents) {
    const childComponent = await ctx.db.get(link.childComponentId);
    if (!childComponent) continue;

    // Calculate child units using batchSize conversion
    let childUnits: number;
    if (childComponent.batchSize && childComponent.batchSize > 0) {
      childUnits = (link.quantityPerUnit * quantityMultiplier) / childComponent.batchSize;
    } else {
      childUnits = link.quantityPerUnit * quantityMultiplier;
    }

    const childResults = await traverseHierarchy(
      ctx,
      link.childComponentId,
      childUnits,
      currentVisited,
      maxDepth - 1
    );

    results.push(...childResults);
  }

  return results;
}

/**
 * Convenience wrapper: collect all leaf ingredients for a component.
 * Starts traversal with quantityMultiplier=1, empty visited set, maxDepth=3.
 */
export async function collectLeafIngredients(
  ctx: Ctx,
  componentTypeId: Id<"componentTypes">
): Promise<IngredientUsage[]> {
  return traverseHierarchy(ctx, componentTypeId, 1, new Set(), MAX_DEPTH);
}
