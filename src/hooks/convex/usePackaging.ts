/**
 * Convex hooks for packaging recipes.
 * These replace the React Query + Axios hooks.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

// ============================================
// Types
// ============================================

export interface PackagingMaterialInput {
  packagingMaterialId: Id<"packagingMaterials">;
  sortOrder?: number;
  unit: string;
  quantity: number;
}

export interface PackagingComponentInput {
  sortOrder?: number;
  componentName: string;
  materials: PackagingMaterialInput[];
}

export interface PackagingVersionInput {
  versionName: string;
  description?: string;
  components: PackagingComponentInput[];
}

export interface PackagingCreateInput {
  name: string;
  tagIds?: Id<"tags">[];
  firstVersion: PackagingVersionInput;
  createdBy?: string;
}

// ============================================
// Query Hooks
// ============================================

/**
 * List all packaging recipes with versions and tags.
 */
export function useConvexPackagingList(limit?: number) {
  return useQuery(api.packaging.queries.list, { limit });
}

/**
 * Get a single packaging recipe by ID.
 */
export function useConvexPackaging(id: Id<"packagingRecipes"> | undefined) {
  return useQuery(api.packaging.queries.get, id ? { id } : "skip");
}

/**
 * Get a packaging version with full details (components, materials, costs).
 */
export function useConvexPackagingVersion(
  versionId: Id<"packagingVersions"> | undefined
) {
  return useQuery(
    api.packaging.queries.getVersion,
    versionId ? { versionId } : "skip"
  );
}

/**
 * Search packaging recipes by name.
 */
export function useConvexPackagingSearch(query: string, limit?: number) {
  return useQuery(
    api.packaging.queries.search,
    query ? { query, limit } : "skip"
  );
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Create a new packaging recipe with first version.
 */
export function useConvexCreatePackaging() {
  const mutation = useMutation(api.packaging.mutations.create);

  return {
    mutate: async (data: PackagingCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Packaging created successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to create packaging");
        throw error;
      }
    },
    mutateAsync: async (data: PackagingCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Packaging created successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to create packaging");
        throw error;
      }
    },
  };
}

/**
 * Copy a packaging version.
 */
export function useConvexCopyPackagingVersion() {
  const mutation = useMutation(api.packaging.mutations.copyVersion);

  return {
    mutate: async (data: {
      packagingRecipeId: Id<"packagingRecipes">;
      copyFromVersionId: Id<"packagingVersions">;
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
      packagingRecipeId: Id<"packagingRecipes">;
      copyFromVersionId: Id<"packagingVersions">;
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
 * Create a new version with provided components.
 */
export function useConvexCreatePackagingVersion() {
  const mutation = useMutation(api.packaging.mutations.createVersion);

  return {
    mutate: async (data: {
      packagingRecipeId: Id<"packagingRecipes">;
      versionData: PackagingVersionInput;
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
      packagingRecipeId: Id<"packagingRecipes">;
      versionData: PackagingVersionInput;
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
 * Update packaging tags.
 */
export function useConvexUpdatePackagingTags() {
  const mutation = useMutation(api.packaging.mutations.updateTags);

  return {
    mutate: async (data: {
      packagingRecipeId: Id<"packagingRecipes">;
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
    mutateAsync: async (data: {
      packagingRecipeId: Id<"packagingRecipes">;
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
 * Update packaging name.
 */
export function useConvexUpdatePackagingName() {
  const mutation = useMutation(api.packaging.mutations.updateName);

  return {
    mutate: async (data: {
      packagingRecipeId: Id<"packagingRecipes">;
      name: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Packaging name updated");
      } catch (error: any) {
        toast.error(error.message || "Failed to update name");
        throw error;
      }
    },
    mutateAsync: async (data: {
      packagingRecipeId: Id<"packagingRecipes">;
      name: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Packaging name updated");
      } catch (error: any) {
        toast.error(error.message || "Failed to update name");
        throw error;
      }
    },
  };
}

/**
 * Delete a packaging recipe.
 */
export function useConvexDeletePackaging() {
  const mutation = useMutation(api.packaging.mutations.remove);

  return {
    mutate: async (packagingRecipeId: Id<"packagingRecipes">) => {
      try {
        await mutation({ packagingRecipeId });
        toast.success("Packaging deleted successfully");
        return true;
      } catch (error: any) {
        toast.error(error.message || "Failed to delete packaging");
        throw error;
      }
    },
    mutateAsync: async (packagingRecipeId: Id<"packagingRecipes">) => {
      try {
        await mutation({ packagingRecipeId });
        toast.success("Packaging deleted successfully");
        return true;
      } catch (error: any) {
        toast.error(error.message || "Failed to delete packaging");
        throw error;
      }
    },
  };
}

/**
 * Recalculate costs for a packaging version.
 */
export function useConvexRecalculatePackagingCosts() {
  const mutation = useMutation(api.packaging.mutations.recalculateCosts);

  return {
    mutate: async (versionId: Id<"packagingVersions">) => {
      try {
        const result = await mutation({ versionId });
        toast.success("Costs recalculated");
        return result;
      } catch (error: any) {
        toast.error(error.message || "Failed to recalculate costs");
        throw error;
      }
    },
  };
}
