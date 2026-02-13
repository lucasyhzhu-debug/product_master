/**
 * Convex hooks for ingredients.
 * Convex query/mutation hooks for ingredient management.
 */
import { useQuery } from "convex/react";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

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

/**
 * List all ingredients.
 */
export function useConvexIngredients(limit?: number) {
  return useQuery(api.ingredients.queries.list, { limit });
}

/**
 * Get a single ingredient by ID.
 */
export function useConvexIngredient(id: Id<"ingredients"> | undefined) {
  return useQuery(api.ingredients.queries.get, id ? { id } : "skip");
}

/**
 * Search ingredients by name or brand.
 */
export function useConvexIngredientSearch(query: string, limit?: number) {
  return useQuery(
    api.ingredients.queries.search,
    query ? { query, limit } : "skip"
  );
}

/**
 * Create ingredient mutation with toast notifications.
 * Uses useSessionMutation for automatic sessionId injection.
 */
export function useConvexCreateIngredient() {
  const mutation = useSessionMutation(api.ingredients.mutations.create);
  const execute = async (data: IngredientCreateInput) => {
    try {
      const id = await mutation(data);
      toast.success("Ingredient created successfully");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create ingredient"));
      throw error;
    }
  };
  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update ingredient mutation with toast notifications.
 */
export function useConvexUpdateIngredient() {
  const mutation = useSessionMutation(api.ingredients.mutations.update);
  const execute = async (data: { id: Id<"ingredients"> } & Partial<IngredientCreateInput>) => {
    try {
      const id = await mutation(data);
      toast.success("Ingredient updated successfully");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update ingredient"));
      throw error;
    }
  };
  return { mutate: execute, mutateAsync: execute };
}

/**
 * Delete ingredient mutation with toast notifications.
 */
export function useConvexDeleteIngredient() {
  const mutation = useSessionMutation(api.ingredients.mutations.remove);
  const execute = async (id: Id<"ingredients">) => {
    try {
      await mutation({ id });
      toast.success("Ingredient deleted successfully");
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete ingredient"));
      throw error;
    }
  };
  return { mutate: execute, mutateAsync: execute };
}
