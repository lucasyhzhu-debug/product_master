/**
 * Convex hooks for packaging recipes.
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

  const execute = async (data: PackagingCreateInput) => {
    try {
      const id = await mutation(data);
      toast.success("Packaging created successfully");
      return id;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to create packaging"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Copy a packaging version.
 */
export function useConvexCopyPackagingVersion() {
  const mutation = useMutation(api.packaging.mutations.copyVersion);

  const execute = async (data: {
    packagingRecipeId: Id<"packagingRecipes">;
    copyFromVersionId: Id<"packagingVersions">;
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
 * Create a new version with provided components.
 */
export function useConvexCreatePackagingVersion() {
  const mutation = useMutation(api.packaging.mutations.createVersion);

  const execute = async (data: {
    packagingRecipeId: Id<"packagingRecipes">;
    versionData: PackagingVersionInput;
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
 * Update packaging tags.
 */
export function useConvexUpdatePackagingTags() {
  const mutation = useMutation(api.packaging.mutations.updateTags);

  const execute = async (data: {
    packagingRecipeId: Id<"packagingRecipes">;
    tagIds: Id<"tags">[];
  }) => {
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
 * Update packaging name.
 */
export function useConvexUpdatePackagingName() {
  const mutation = useMutation(api.packaging.mutations.updateName);

  const execute = async (data: {
    packagingRecipeId: Id<"packagingRecipes">;
    name: string;
  }) => {
    try {
      await mutation(data);
      toast.success("Packaging name updated");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update name"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
}

/**
 * Delete a packaging recipe.
 */
export function useConvexDeletePackaging() {
  const mutation = useMutation(api.packaging.mutations.remove);

  const execute = async (packagingRecipeId: Id<"packagingRecipes">) => {
    try {
      await mutation({ packagingRecipeId });
      toast.success("Packaging deleted successfully");
      return true;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete packaging"));
      throw error;
    }
  };

  return { mutate: execute, mutateAsync: execute };
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
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Failed to recalculate costs"));
        throw error;
      }
    },
  };
}
