/**
 * Production Recipe Hooks
 *
 * Wraps productionRecipes queries and mutations for the recipe editor modal.
 * Hooks for sub-component links, direct ingredients, COGS calculation,
 * and components-with-tiers listing.
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Get the full recipe (sub-components + ingredients) for a production component.
 * Returns undefined while loading, null-safe with skip.
 */
export function useProductionRecipe(
  componentTypeId: Id<"componentTypes"> | undefined
) {
  return useQuery(
    api.productionRecipes.queries.getRecipeForComponent,
    componentTypeId ? { componentTypeId } : "skip"
  );
}

/**
 * Calculate COGS for a production component (traverses hierarchy).
 * Returns { totalCogs, missingCount, breakdown }.
 */
export function useProductionCogs(
  componentTypeId: Id<"componentTypes"> | undefined
) {
  return useQuery(
    api.productionRecipes.queries.calculateCogs,
    componentTypeId ? { componentTypeId } : "skip"
  );
}

/**
 * Get all production components with computed tier depth.
 * Sorted by tier descending, then name alphabetically.
 */
export function useProductionComponentsWithTiers() {
  return useQuery(api.productionRecipes.queries.getComponentsWithTiers);
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/** Add a sub-component link (parent -> child). */
export function useAddSubComponent() {
  return useMutation(api.productionRecipes.mutations.addSubComponent);
}

/** Remove a sub-component link. */
export function useRemoveSubComponent() {
  return useMutation(api.productionRecipes.mutations.removeSubComponent);
}

/** Update quantity/unit on a sub-component link. */
export function useUpdateSubComponentQuantity() {
  return useMutation(api.productionRecipes.mutations.updateSubComponentQuantity);
}

/** Add a direct ingredient to a production component. */
export function useAddIngredient() {
  return useMutation(api.productionRecipes.mutations.addIngredient);
}

/** Remove a direct ingredient from a production component. */
export function useRemoveIngredient() {
  return useMutation(api.productionRecipes.mutations.removeIngredient);
}

/** Update quantity/unit on a direct ingredient link. */
export function useUpdateIngredientQuantity() {
  return useMutation(api.productionRecipes.mutations.updateIngredientQuantity);
}
