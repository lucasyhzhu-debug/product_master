/**
 * Convex hooks for packaging materials.
 * Query hooks + factory-generated mutation hooks.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createMutationHook } from "./createMutationHook";

// Types that match the Convex schema
export interface ConvexPackagingMaterial {
  _id: Id<"packagingMaterials">;
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

export interface MaterialCreateInput {
  name: string;
  brand?: string;
  procurementSource?: string;
  unitType: string;
  volumePurchased: number;
  priceExclShipping: number;
  shippingCost: number;
}

/** List all packaging materials. */
export function useConvexMaterials(limit?: number) {
  return useQuery(api.materials.queries.list, { limit });
}

/** Get a single packaging material by ID. */
export function useConvexMaterial(id: Id<"packagingMaterials"> | undefined) {
  return useQuery(api.materials.queries.get, id ? { id } : "skip");
}

/** Search packaging materials by name or brand. */
export function useConvexMaterialSearch(query: string, limit?: number) {
  return useQuery(
    api.materials.queries.search,
    query ? { query, limit } : "skip"
  );
}

/** Create packaging material mutation with toast notifications. */
export const useConvexCreateMaterial = createMutationHook(
  api.materials.mutations.create,
  { successMessage: "Packaging material created successfully", errorMessage: "Failed to create packaging material" }
);

/** Update packaging material mutation with toast notifications. */
export const useConvexUpdateMaterial = createMutationHook(
  api.materials.mutations.update,
  { successMessage: "Packaging material updated successfully", errorMessage: "Failed to update packaging material" }
);

/** Delete packaging material mutation with toast notifications. */
export const useConvexDeleteMaterial = createMutationHook(
  api.materials.mutations.remove,
  { successMessage: "Packaging material deleted successfully", errorMessage: "Failed to delete packaging material" }
);
