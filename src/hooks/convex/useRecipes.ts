/**
 * Convex hooks for recipes.
 * These replace the React Query + Axios hooks.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

// ============================================
// Types
// ============================================

export interface ComponentIngredientInput {
  ingredientId: Id<"ingredients">;
  sortOrder?: number;
  unit: string;
  quantity: number;
}

export interface RecipeComponentInput {
  sortOrder?: number;
  componentName: string;
  linkedRecipeVersionId?: Id<"recipeVersions">;
  ingredients: ComponentIngredientInput[];
}

export interface RecipeVersionInput {
  versionName: string;
  description?: string;
  estimatedYieldGrams?: number;
  isReusableComponent?: boolean;
  components: RecipeComponentInput[];
}

export interface RecipeCreateInput {
  name: string;
  tagIds?: Id<"tags">[];
  firstVersion: RecipeVersionInput;
  createdBy?: string;
}

// ============================================
// Query Hooks
// ============================================

/**
 * List all recipes with versions and tags.
 */
export function useConvexRecipes(limit?: number) {
  return useQuery(api.recipes.queries.list, { limit });
}

/**
 * Get a single recipe by ID.
 */
export function useConvexRecipe(id: Id<"recipes"> | undefined) {
  return useQuery(api.recipes.queries.get, id ? { id } : "skip");
}

/**
 * Get a recipe version with full details (components, ingredients, costs).
 */
export function useConvexRecipeVersion(
  versionId: Id<"recipeVersions"> | undefined
) {
  return useQuery(
    api.recipes.queries.getVersion,
    versionId ? { versionId } : "skip"
  );
}

/**
 * Get all reusable recipe components.
 */
export function useConvexReusableComponents() {
  return useQuery(api.recipes.queries.getReusableComponents, {});
}

/**
 * Get recipes that use a specific version as a linked component.
 */
export function useConvexRecipesUsingComponent(
  linkedVersionId: Id<"recipeVersions"> | undefined
) {
  return useQuery(
    api.recipes.queries.getRecipesUsingComponent,
    linkedVersionId ? { linkedVersionId } : "skip"
  );
}

/**
 * Search recipes by name.
 */
export function useConvexRecipeSearch(query: string, limit?: number) {
  return useQuery(
    api.recipes.queries.search,
    query ? { query, limit } : "skip"
  );
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Create a new recipe with first version.
 */
export function useConvexCreateRecipe() {
  const mutation = useMutation(api.recipes.mutations.create);

  return {
    mutate: async (data: RecipeCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Recipe created successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to create recipe");
        throw error;
      }
    },
    mutateAsync: async (data: RecipeCreateInput) => {
      try {
        const id = await mutation(data);
        toast.success("Recipe created successfully");
        return id;
      } catch (error: any) {
        toast.error(error.message || "Failed to create recipe");
        throw error;
      }
    },
  };
}

/**
 * Copy a recipe version.
 */
export function useConvexCopyRecipeVersion() {
  const mutation = useMutation(api.recipes.mutations.copyVersion);

  return {
    mutate: async (data: {
      recipeId: Id<"recipes">;
      copyFromVersionId: Id<"recipeVersions">;
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
      recipeId: Id<"recipes">;
      copyFromVersionId: Id<"recipeVersions">;
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
export function useConvexCreateRecipeVersion() {
  const mutation = useMutation(api.recipes.mutations.createVersion);

  return {
    mutate: async (data: {
      recipeId: Id<"recipes">;
      versionData: RecipeVersionInput;
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
      recipeId: Id<"recipes">;
      versionData: RecipeVersionInput;
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
 * Update recipe tags.
 */
export function useConvexUpdateRecipeTags() {
  const mutation = useMutation(api.recipes.mutations.updateTags);

  return {
    mutate: async (data: { recipeId: Id<"recipes">; tagIds: Id<"tags">[] }) => {
      try {
        await mutation(data);
        toast.success("Tags updated successfully");
      } catch (error: any) {
        toast.error(error.message || "Failed to update tags");
        throw error;
      }
    },
    mutateAsync: async (data: {
      recipeId: Id<"recipes">;
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
 * Update recipe name.
 */
export function useConvexUpdateRecipeName() {
  const mutation = useMutation(api.recipes.mutations.updateName);

  return {
    mutate: async (data: { recipeId: Id<"recipes">; name: string }) => {
      try {
        await mutation(data);
        toast.success("Recipe name updated");
      } catch (error: any) {
        toast.error(error.message || "Failed to update name");
        throw error;
      }
    },
    mutateAsync: async (data: { recipeId: Id<"recipes">; name: string }) => {
      try {
        await mutation(data);
        toast.success("Recipe name updated");
      } catch (error: any) {
        toast.error(error.message || "Failed to update name");
        throw error;
      }
    },
  };
}

/**
 * Delete a recipe.
 */
export function useConvexDeleteRecipe() {
  const mutation = useMutation(api.recipes.mutations.remove);

  return {
    mutate: async (recipeId: Id<"recipes">) => {
      try {
        await mutation({ recipeId });
        toast.success("Recipe deleted successfully");
        return true;
      } catch (error: any) {
        toast.error(error.message || "Failed to delete recipe");
        throw error;
      }
    },
    mutateAsync: async (recipeId: Id<"recipes">) => {
      try {
        await mutation({ recipeId });
        toast.success("Recipe deleted successfully");
        return true;
      } catch (error: any) {
        toast.error(error.message || "Failed to delete recipe");
        throw error;
      }
    },
  };
}

/**
 * Recalculate costs for a recipe version.
 */
export function useConvexRecalculateRecipeCosts() {
  const mutation = useMutation(api.recipes.mutations.recalculateCosts);

  return {
    mutate: async (versionId: Id<"recipeVersions">) => {
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
