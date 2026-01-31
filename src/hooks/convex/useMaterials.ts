/**
 * Convex hooks for packaging materials.
 * These replace the React Query + Axios hooks.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

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
  createdBy?: string;
}

/**
 * List all packaging materials.
 */
export function useConvexMaterials(limit?: number) {
  return useQuery(api.materials.queries.list, { limit });
}

/**
 * Get a single packaging material by ID.
 */
export function useConvexMaterial(id: Id<"packagingMaterials"> | undefined) {
  return useQuery(api.materials.queries.get, id ? { id } : "skip");
}

/**
 * Search packaging materials by name or brand.
 */
export function useConvexMaterialSearch(query: string, limit?: number) {
  return useQuery(
    api.materials.queries.search,
    query ? { query, limit } : "skip"
  );
}

/**
 * Create packaging material mutation with toast notifications.
 */
export function useConvexCreateMaterial() {
  const mutation = useMutation(api.materials.mutations.create);

  return {
    mutate: async (data: MaterialCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Packaging material created successfully");
        return id;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to create packaging material"));
        throw error;
      }
    },
    mutateAsync: async (data: MaterialCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Packaging material created successfully");
        return id;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to create packaging material"));
        throw error;
      }
    },
  };
}

/**
 * Update packaging material mutation with toast notifications.
 */
export function useConvexUpdateMaterial() {
  const mutation = useMutation(api.materials.mutations.update);

  return {
    mutate: async (data: { id: Id<"packagingMaterials"> } & Partial<MaterialCreateInput>) => {
      try {
        const id = await mutation(data);
        toast.success("Packaging material updated successfully");
        return id;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to update packaging material"));
        throw error;
      }
    },
    mutateAsync: async (data: { id: Id<"packagingMaterials"> } & Partial<MaterialCreateInput>) => {
      try {
        const id = await mutation(data);
        toast.success("Packaging material updated successfully");
        return id;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to update packaging material"));
        throw error;
      }
    },
  };
}

/**
 * Delete packaging material mutation with toast notifications.
 */
export function useConvexDeleteMaterial() {
  const mutation = useMutation(api.materials.mutations.remove);

  return {
    mutate: async (id: Id<"packagingMaterials">) => {
      try {
        await mutation({ id });
        toast.success("Packaging material deleted successfully");
        return true;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to delete packaging material"));
        throw error;
      }
    },
    mutateAsync: async (id: Id<"packagingMaterials">) => {
      try {
        await mutation({ id });
        toast.success("Packaging material deleted successfully");
        return true;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to delete packaging material"));
        throw error;
      }
    },
  };
}
