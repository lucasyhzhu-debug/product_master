import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  calculateLineCost,
} from "../lib/costCalculator";

// ============================================
// Helper Types
// ============================================

interface ComponentIngredientWithCost {
  _id: Id<"componentIngredients">;
  ingredientId: Id<"ingredients">;
  ingredientName: string | undefined;
  sortOrder: number;
  unit: string;
  quantity: number;
  cost: number | null;
}

interface RecipeComponentWithCost {
  _id: Id<"recipeComponents">;
  sortOrder: number;
  componentName: string;
  linkedRecipeVersionId: Id<"recipeVersions"> | undefined;
  ingredients: ComponentIngredientWithCost[];
  subtotalCost: number | null;
}

interface RecipeVersionDetail extends Doc<"recipeVersions"> {
  components: RecipeComponentWithCost[];
  totalCost: number | null;
  costPerGram: number | null;
}

// ============================================
// Queries
// ============================================

/**
 * List all recipes with their versions and tags.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const recipes = await ctx.db.query("recipes").order("desc").take(limit);

    // Fetch versions and tags for each recipe
    const result = await Promise.all(
      recipes.map(async (recipe) => {
        const versions = await ctx.db
          .query("recipeVersions")
          .withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id))
          .collect();

        // Fetch tag names
        const tags = await Promise.all(
          recipe.tagIds.map((tagId) => ctx.db.get(tagId))
        );

        // Get latest version cost
        const latestVersion = versions.sort(
          (a, b) => b.versionNumber - a.versionNumber
        )[0];

        return {
          ...recipe,
          versions: versions.sort((a, b) => a.versionNumber - b.versionNumber),
          tags: tags.filter((t) => t !== null),
          latestVersionCost: latestVersion?.cachedTotalCost ?? null,
          latestCostPerGram: latestVersion?.cachedCostPerGram ?? null,
        };
      })
    );

    return result;
  },
});

/**
 * Get a single recipe by ID with versions and tags.
 */
export const get = query({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.id);
    if (!recipe) return null;

    const versions = await ctx.db
      .query("recipeVersions")
      .withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id))
      .collect();

    const tags = await Promise.all(
      recipe.tagIds.map((tagId) => ctx.db.get(tagId))
    );

    return {
      ...recipe,
      versions: versions.sort((a, b) => a.versionNumber - b.versionNumber),
      tags: tags.filter((t) => t !== null),
    };
  },
});

/**
 * Get a recipe version with full component and ingredient details.
 * Calculates costs on the fly (for accurate display).
 */
export const getVersion = query({
  args: { versionId: v.id("recipeVersions") },
  handler: async (ctx, args): Promise<RecipeVersionDetail | null> => {
    const version = await ctx.db.get(args.versionId);
    if (!version) return null;

    // Get all components for this version
    const components = await ctx.db
      .query("recipeComponents")
      .withIndex("by_version", (q) => q.eq("recipeVersionId", version._id))
      .collect();

    // Build component details with costs
    const componentsWithCosts: RecipeComponentWithCost[] = await Promise.all(
      components
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(async (comp) => {
          // If linked component, get cost from linked recipe
          if (comp.linkedRecipeVersionId) {
            const linkedVersion = await ctx.db.get(comp.linkedRecipeVersionId);
            return {
              _id: comp._id,
              sortOrder: comp.sortOrder,
              componentName: comp.componentName,
              linkedRecipeVersionId: comp.linkedRecipeVersionId,
              ingredients: [],
              subtotalCost: linkedVersion?.cachedTotalCost ?? null,
            };
          }

          // Get ingredients for this component
          const ingredients = await ctx.db
            .query("componentIngredients")
            .withIndex("by_component", (q) =>
              q.eq("recipeComponentId", comp._id)
            )
            .collect();

          // Calculate ingredient costs
          const ingredientsWithCosts: ComponentIngredientWithCost[] =
            await Promise.all(
              ingredients
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(async (ing) => {
                  const ingredient = await ctx.db.get(ing.ingredientId);
                  let cost: number | null = null;

                  if (ingredient && ingredient.costPerBaseUnit) {
                    cost = calculateLineCost(
                      ingredient.costPerBaseUnit,
                      ing.quantity,
                      ing.unit
                    );
                  }

                  return {
                    _id: ing._id,
                    ingredientId: ing.ingredientId,
                    ingredientName: ingredient?.name ?? ing.ingredientName,
                    sortOrder: ing.sortOrder,
                    unit: ing.unit,
                    quantity: ing.quantity,
                    cost,
                  };
                })
            );

          // Sum component cost
          const subtotalCost = ingredientsWithCosts.reduce(
            (sum, ing) => sum + (ing.cost ?? 0),
            0
          );

          return {
            _id: comp._id,
            sortOrder: comp.sortOrder,
            componentName: comp.componentName,
            linkedRecipeVersionId: comp.linkedRecipeVersionId,
            ingredients: ingredientsWithCosts,
            subtotalCost: ingredientsWithCosts.some((i) => i.cost === null)
              ? null
              : subtotalCost,
          };
        })
    );

    // Calculate total cost
    const totalCost = componentsWithCosts.reduce(
      (sum, comp) => sum + (comp.subtotalCost ?? 0),
      0
    );
    const hasNullCosts = componentsWithCosts.some(
      (c) => c.subtotalCost === null
    );

    // Calculate cost per gram
    let costPerGram: number | null = null;
    if (!hasNullCosts && version.estimatedYieldGrams) {
      costPerGram = totalCost / version.estimatedYieldGrams;
    }

    return {
      ...version,
      components: componentsWithCosts,
      totalCost: hasNullCosts ? null : totalCost,
      costPerGram,
    };
  },
});

/**
 * Get a recipe version by recipe ID and version number.
 */
export const getVersionByNumber = query({
  args: {
    recipeId: v.id("recipes"),
    versionNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const version = await ctx.db
      .query("recipeVersions")
      .withIndex("by_recipe_version", (q) =>
        q.eq("recipeId", args.recipeId).eq("versionNumber", args.versionNumber)
      )
      .first();

    if (!version) return null;

    // Reuse getVersion logic by calling it internally
    // For now, return basic version info
    return version;
  },
});

/**
 * Get all reusable recipe versions (for component selection).
 */
export const getReusableComponents = query({
  args: {},
  handler: async (ctx) => {
    const versions = await ctx.db
      .query("recipeVersions")
      .withIndex("by_reusable", (q) => q.eq("isReusableComponent", true))
      .collect();

    // Fetch recipe names
    const result = await Promise.all(
      versions.map(async (version) => {
        const recipe = await ctx.db.get(version.recipeId);
        return {
          ...version,
          recipeName: recipe?.name ?? "Unknown",
        };
      })
    );

    return result;
  },
});

/**
 * Get all recipes/versions that use a specific recipe version as a linked component.
 */
export const getRecipesUsingComponent = query({
  args: { linkedVersionId: v.id("recipeVersions") },
  handler: async (ctx, args) => {
    const components = await ctx.db
      .query("recipeComponents")
      .withIndex("by_linked_version", (q) =>
        q.eq("linkedRecipeVersionId", args.linkedVersionId)
      )
      .collect();

    const result = await Promise.all(
      components.map(async (comp) => {
        const version = await ctx.db.get(comp.recipeVersionId);
        if (!version) return null;
        const recipe = await ctx.db.get(version.recipeId);
        return {
          recipeId: version.recipeId,
          recipeName: recipe?.name ?? "Unknown",
          versionNumber: version.versionNumber,
        };
      })
    );

    return result.filter((r) => r !== null);
  },
});

/**
 * Search recipes by name.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const searchLower = args.query.toLowerCase();

    const all = await ctx.db.query("recipes").collect();

    const filtered = all.filter((recipe) =>
      recipe.name.toLowerCase().includes(searchLower)
    );

    return filtered.slice(0, limit);
  },
});
