/**
 * Convex hooks for products.
 * These replace the React Query + Axios hooks.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

// ============================================
// Types
// ============================================

export interface ProductVersionInput {
  versionName: string;
  description?: string;
  recipeVersionId: Id<"recipeVersions">;
  packagingVersionId: Id<"packagingVersions">;
  retailPriceIdr: number;
  numPieces: number;
  gramsPerPiece: number;
}

export interface ProductCreateInput {
  name: string;
  tagIds?: Id<"tags">[];
  firstVersion: ProductVersionInput;
  createdBy?: string;
}

// ============================================
// Query Hooks
// ============================================

/**
 * List all products with versions and tags.
 */
export function useConvexProducts(limit?: number) {
  return useQuery(api.products.queries.list, { limit });
}

/**
 * Get a single product by ID.
 */
export function useConvexProduct(id: Id<"products"> | undefined) {
  return useQuery(api.products.queries.get, id ? { id } : "skip");
}

/**
 * Get a product version with full COGS breakdown.
 */
export function useConvexProductVersion(
  versionId: Id<"productVersions"> | undefined
) {
  return useQuery(
    api.products.queries.getVersion,
    versionId ? { versionId } : "skip"
  );
}

/**
 * Get products using a specific recipe version.
 */
export function useConvexProductsUsingRecipe(
  recipeVersionId: Id<"recipeVersions"> | undefined
) {
  return useQuery(
    api.products.queries.getProductsUsingRecipe,
    recipeVersionId ? { recipeVersionId } : "skip"
  );
}

/**
 * Get products using a specific packaging version.
 */
export function useConvexProductsUsingPackaging(
  packagingVersionId: Id<"packagingVersions"> | undefined
) {
  return useQuery(
    api.products.queries.getProductsUsingPackaging,
    packagingVersionId ? { packagingVersionId } : "skip"
  );
}

/**
 * Search products by name.
 */
export function useConvexProductSearch(query: string, limit?: number) {
  return useQuery(
    api.products.queries.search,
    query ? { query, limit } : "skip"
  );
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Create a new product with first version.
 */
export function useConvexCreateProduct() {
  const mutation = useMutation(api.products.mutations.create);

  const execute = async (data: ProductCreateInput) => {
    try {
      const id = await mutation(data);
      toast.success("Product created successfully");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create product"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Copy a product version.
 */
export function useConvexCopyProductVersion() {
  const mutation = useMutation(api.products.mutations.copyVersion);

  const execute = async (data: {
    productId: Id<"products">;
    copyFromVersionId: Id<"productVersions">;
    versionName: string;
    description?: string;
  }) => {
    try {
      const id = await mutation(data);
      toast.success("Version copied successfully");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to copy version"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Create a new version with provided data.
 */
export function useConvexCreateProductVersion() {
  const mutation = useMutation(api.products.mutations.createVersion);

  const execute = async (data: {
    productId: Id<"products">;
    versionData: ProductVersionInput;
  }) => {
    try {
      const id = await mutation(data);
      toast.success("Version created successfully");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create version"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update product tags.
 */
export function useConvexUpdateProductTags() {
  const mutation = useMutation(api.products.mutations.updateTags);

  const execute = async (data: { productId: Id<"products">; tagIds: Id<"tags">[] }) => {
    try {
      await mutation(data);
      toast.success("Tags updated successfully");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update tags"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Update product name.
 */
export function useConvexUpdateProductName() {
  const mutation = useMutation(api.products.mutations.updateName);

  const execute = async (data: { productId: Id<"products">; name: string }) => {
    try {
      await mutation(data);
      toast.success("Product name updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update name"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Delete a product.
 */
export function useConvexDeleteProduct() {
  const mutation = useMutation(api.products.mutations.remove);

  const execute = async (productId: Id<"products">) => {
    try {
      await mutation({ productId });
      toast.success("Product deleted successfully");
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete product"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Recalculate COGS for a product version.
 */
export function useConvexRecalculateProductCogs() {
  const mutation = useMutation(api.products.mutations.recalculateCogs);

  return {
    mutate: async (versionId: Id<"productVersions">) => {
      try {
        const result = await mutation({ versionId });
        toast.success("COGS recalculated");
        return result;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to recalculate COGS"));
        throw error;
      }
    },
  };
}
