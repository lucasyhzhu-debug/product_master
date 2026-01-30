/**
 * Convex hooks for products.
 * These replace the React Query + Axios hooks.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

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

  return {
    mutate: async (data: ProductCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Product created successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to create product");
        throw error;
      }
    },
    mutateAsync: async (data: ProductCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Product created successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to create product");
        throw error;
      }
    },
  };
}

/**
 * Copy a product version.
 */
export function useConvexCopyProductVersion() {
  const mutation = useMutation(api.products.mutations.copyVersion);

  return {
    mutate: async (data: {
      productId: Id<"products">;
      copyFromVersionId: Id<"productVersions">;
      versionName: string;
      description?: string;
    }) => {
      try {
        const id = await mutation(data);
        toast.success("Version copied successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to copy version");
        throw error;
      }
    },
    mutateAsync: async (data: {
      productId: Id<"products">;
      copyFromVersionId: Id<"productVersions">;
      versionName: string;
      description?: string;
    }) => {
      try {
        const id = await mutation(data);
        toast.success("Version copied successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to copy version");
        throw error;
      }
    },
  };
}

/**
 * Create a new version with provided data.
 */
export function useConvexCreateProductVersion() {
  const mutation = useMutation(api.products.mutations.createVersion);

  return {
    mutate: async (data: {
      productId: Id<"products">;
      versionData: ProductVersionInput;
    }) => {
      try {
        const id = await mutation(data);
        toast.success("Version created successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to create version");
        throw error;
      }
    },
    mutateAsync: async (data: {
      productId: Id<"products">;
      versionData: ProductVersionInput;
    }) => {
      try {
        const id = await mutation(data);
        toast.success("Version created successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to create version");
        throw error;
      }
    },
  };
}

/**
 * Update product tags.
 */
export function useConvexUpdateProductTags() {
  const mutation = useMutation(api.products.mutations.updateTags);

  return {
    mutate: async (data: { productId: Id<"products">; tagIds: Id<"tags">[] }) => {
      try {
        await mutation(data);
        toast.success("Tags updated successfully");
      } catch (error: any) {
        toast.error(error.message || "Failed to update tags");
        throw error;
      }
    },
    mutateAsync: async (data: {
      productId: Id<"products">;
      tagIds: Id<"tags">[];
    }) => {
      try {
        await mutation(data);
        toast.success("Tags updated successfully");
      } catch (error: any) {
        toast.error(error.message || "Failed to update tags");
        throw error;
      }
    },
  };
}

/**
 * Update product name.
 */
export function useConvexUpdateProductName() {
  const mutation = useMutation(api.products.mutations.updateName);

  return {
    mutate: async (data: { productId: Id<"products">; name: string }) => {
      try {
        await mutation(data);
        toast.success("Product name updated");
      } catch (error: any) {
        toast.error(error.message || "Failed to update name");
        throw error;
      }
    },
    mutateAsync: async (data: { productId: Id<"products">; name: string }) => {
      try {
        await mutation(data);
        toast.success("Product name updated");
      } catch (error: any) {
        toast.error(error.message || "Failed to update name");
        throw error;
      }
    },
  };
}

/**
 * Delete a product.
 */
export function useConvexDeleteProduct() {
  const mutation = useMutation(api.products.mutations.remove);

  return {
    mutate: async (productId: Id<"products">) => {
      try {
        await mutation({ productId });
        toast.success("Product deleted successfully");
        return true;
      } catch (error: any) {
        toast.error(error.message || "Failed to delete product");
        throw error;
      }
    },
    mutateAsync: async (productId: Id<"products">) => {
      try {
        await mutation({ productId });
        toast.success("Product deleted successfully");
        return true;
      } catch (error: any) {
        toast.error(error.message || "Failed to delete product");
        throw error;
      }
    },
  };
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
      } catch (error: any) {
        toast.error(error.message || "Failed to recalculate COGS");
        throw error;
      }
    },
  };
}
