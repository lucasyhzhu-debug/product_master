/**
 * Convex hooks for ingredients.
 * Query hooks + factory-generated mutation hooks.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createMutationHook } from "./createMutationHook";

// Types that match the Convex schema
export interface ConvexIngredient {
  _id: Id<"ingredients">;
  _creationTime: number;
  name: string;
  brand?: string;
  procurementSource?: string;
  unitType: string;
  volumePurchased: number;
  priceExclShipping: number;
  shippingCost: number;
  createdBy: string;
  costPerBaseUnit?: number;
  baseUnit?: string;
}

export interface IngredientCreateInput {
  name: string;
  brand?: string;
  procurementSource?: string;
  unitType: string;
  volumePurchased: number;
  priceExclShipping: number;
  shippingCost: number;
}

/** List all ingredients. */
export function useConvexIngredients(limit?: number) {
  return useQuery(api.ingredients.queries.list, { limit });
}

/** Get a single ingredient by ID. */
export function useConvexIngredient(id: Id<"ingredients"> | undefined) {
  return useQuery(api.ingredients.queries.get, id ? { id } : "skip");
}

/** Search ingredients by name or brand. */
export function useConvexIngredientSearch(query: string, limit?: number) {
  return useQuery(
    api.ingredients.queries.search,
    query ? { query, limit } : "skip"
  );
}

/** Create ingredient mutation with toast notifications. */
export const useConvexCreateIngredient = createMutationHook(
  api.ingredients.mutations.create,
  { successMessage: "Ingredient created successfully", errorMessage: "Failed to create ingredient" }
);

/** Update ingredient mutation with toast notifications. */
export const useConvexUpdateIngredient = createMutationHook(
  api.ingredients.mutations.update,
  { successMessage: "Ingredient updated successfully", errorMessage: "Failed to update ingredient" }
);

/** Delete ingredient mutation with toast notifications. */
export const useConvexDeleteIngredient = createMutationHook(
  api.ingredients.mutations.remove,
  { successMessage: "Ingredient deleted successfully", errorMessage: "Failed to delete ingredient" }
);

/** Link ingredient to an existing componentType for inventory tracking. */
export function useLinkIngredientToComponentType() {
  return useMutation(api.ingredients.mutations.linkIngredientToComponentType);
}
