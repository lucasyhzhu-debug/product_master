/**
 * Production Recipe Hooks
 *
 * Wraps productionRecipes queries and mutations for the recipe editor modal.
 * Hooks for sub-component links, direct ingredients, COGS calculation,
 * and components-with-tiers listing.
 */

import { useQuery } from "convex/react";
import { useSessionMutation } from "convex-helpers/react/sessions";
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

/** Add a sub-component link (parent -> child). Uses protectedMutation (admin/manager only). */
export function useAddSubComponent() {
  return useSessionMutation(api.productionRecipes.mutations.addSubComponent);
}

/** Remove a sub-component link. Uses protectedMutation (admin/manager only). */
export function useRemoveSubComponent() {
  return useSessionMutation(api.productionRecipes.mutations.removeSubComponent);
}

/** Update quantity/unit on a sub-component link. Uses protectedMutation (admin/manager only). */
export function useUpdateSubComponentQuantity() {
  return useSessionMutation(api.productionRecipes.mutations.updateSubComponentQuantity);
}

/** Add a direct ingredient to a production component. Uses protectedMutation (admin/manager only). */
export function useAddIngredient() {
  return useSessionMutation(api.productionRecipes.mutations.addIngredient);
}

/** Remove a direct ingredient from a production component. Uses protectedMutation (admin/manager only). */
export function useRemoveIngredient() {
  return useSessionMutation(api.productionRecipes.mutations.removeIngredient);
}

/** Update quantity/unit on a direct ingredient link. Uses protectedMutation (admin/manager only). */
export function useUpdateIngredientQuantity() {
  return useSessionMutation(api.productionRecipes.mutations.updateIngredientQuantity);
}
