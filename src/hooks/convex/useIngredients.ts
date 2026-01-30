/**
 * Convex hooks for ingredients.
 * These replace the React Query + Axios hooks.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

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
  createdBy?: string;
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
 */
export function useConvexCreateIngredient() {
  const mutation = useMutation(api.ingredients.mutations.create);

  return {
    mutate: async (data: IngredientCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Ingredient created successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to create ingredient");
        throw error;
      }
    },
    mutateAsync: async (data: IngredientCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Ingredient created successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to create ingredient");
        throw error;
      }
    },
  };
}

/**
 * Update ingredient mutation with toast notifications.
 */
export function useConvexUpdateIngredient() {
  const mutation = useMutation(api.ingredients.mutations.update);

  return {
    mutate: async (data: { id: Id<"ingredients"> } & Partial<IngredientCreateInput>) => {
      try {
        const id = await mutation(data);
        toast.success("Ingredient updated successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to update ingredient");
        throw error;
      }
    },
    mutateAsync: async (data: { id: Id<"ingredients"> } & Partial<IngredientCreateInput>) => {
      try {
        const id = await mutation(data);
        toast.success("Ingredient updated successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to update ingredient");
        throw error;
      }
    },
  };
}

/**
 * Delete ingredient mutation with toast notifications.
 */
export function useConvexDeleteIngredient() {
  const mutation = useMutation(api.ingredients.mutations.remove);

  return {
    mutate: async (id: Id<"ingredients">) => {
      try {
        await mutation({ id });
        toast.success("Ingredient deleted successfully");
        return true;
      } catch (error: any) {
        toast.error(error.message || "Failed to delete ingredient");
        throw error;
      }
    },
    mutateAsync: async (id: Id<"ingredients">) => {
      try {
        await mutation({ id });
        toast.success("Ingredient deleted successfully");
        return true;
      } catch (error: any) {
        toast.error(error.message || "Failed to delete ingredient");
        throw error;
      }
    },
  };
}
