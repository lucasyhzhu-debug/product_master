import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  calculateCostPerBaseUnit,
  calculateLineCost,
} from "../lib/costCalculator";

// ============================================
// Input Types
// ============================================

const componentIngredientInput = v.object({
  ingredientId: v.id("ingredients"),
  sortOrder: v.optional(v.number()),
  unit: v.string(),
  quantity: v.number(),
});

const recipeComponentInput = v.object({
  sortOrder: v.optional(v.number()),
  componentName: v.string(),
  linkedRecipeVersionId: v.optional(v.id("recipeVersions")),
  ingredients: v.array(componentIngredientInput),
});

const recipeVersionInput = v.object({
  versionName: v.string(),
  description: v.optional(v.string()),
  estimatedYieldGrams: v.optional(v.number()),
  isReusableComponent: v.optional(v.boolean()),
  components: v.array(recipeComponentInput),
});

// ============================================
// Helper Functions
// ============================================

async function calculateVersionCost(
  ctx: any,
  versionId: Id<"recipeVersions">
): Promise<{ totalCost: number | null; costPerGram: number | null }> {
  const version = await ctx.db.get(versionId);
  if (!version) return { totalCost: null, costPerGram: null };

  const components = await ctx.db
    .query("recipeComponents")
    .withIndex("by_version", (q: any) => q.eq("recipeVersionId", versionId))
    .collect();

  let totalCost = 0;
  let hasNullCost = false;

  for (const comp of components) {
    if (comp.linkedRecipeVersionId) {
      // Get cost from linked recipe version
      const linkedVersion = await ctx.db.get(comp.linkedRecipeVersionId);
      if (linkedVersion?.cachedTotalCost != null) {
        totalCost += linkedVersion.cachedTotalCost;
      } else {
        hasNullCost = true;
      }
    } else {
      // Sum ingredient costs
      const ingredients = await ctx.db
        .query("componentIngredients")
        .withIndex("by_component", (q: any) =>
          q.eq("recipeComponentId", comp._id)
        )
        .collect();

      for (const ing of ingredients) {
        const ingredient = await ctx.db.get(ing.ingredientId);
        if (ingredient?.costPerBaseUnit != null) {
          totalCost += calculateLineCost(
            ingredient.costPerBaseUnit,
            ing.quantity,
            ing.unit
          );
        } else {
          hasNullCost = true;
        }
      }
    }
  }

  if (hasNullCost) {
    return { totalCost: null, costPerGram: null };
  }

  const costPerGram = version.estimatedYieldGrams
    ? totalCost / version.estimatedYieldGrams
    : null;

  return { totalCost, costPerGram };
}

// ============================================
// Mutations
// ============================================

/**
 * Create a new recipe with its first version.
 */
export const create = mutation({
  args: {
    name: v.string(),
    tagIds: v.optional(v.array(v.id("tags"))),
    firstVersion: recipeVersionInput,
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Create the recipe
    const recipeId = await ctx.db.insert("recipes", {
      name: args.name,
      tagIds: args.tagIds ?? [],
      createdBy: args.createdBy ?? "admin",
    });

    // Create first version
    const isSingleComponent = args.firstVersion.components.length === 1;
    const versionId = await ctx.db.insert("recipeVersions", {
      recipeId,
      versionNumber: 1,
      versionName: args.firstVersion.versionName,
      description: args.firstVersion.description,
      estimatedYieldGrams: args.firstVersion.estimatedYieldGrams,
      isSingleComponent,
      isReusableComponent:
        (args.firstVersion.isReusableComponent ?? false) && isSingleComponent,
      copiedFromVersionId: undefined,
      createdBy: args.createdBy ?? "admin",
    });

    // Create components and ingredients
    for (let compIdx = 0; compIdx < args.firstVersion.components.length; compIdx++) {
      const compData = args.firstVersion.components[compIdx];
      const componentId = await ctx.db.insert("recipeComponents", {
        recipeVersionId: versionId,
        sortOrder: compData.sortOrder ?? compIdx,
        componentName: compData.componentName,
        linkedRecipeVersionId: compData.linkedRecipeVersionId,
      });

      // Create ingredients for this component
      for (let ingIdx = 0; ingIdx < compData.ingredients.length; ingIdx++) {
        const ingData = compData.ingredients[ingIdx];
        const ingredient = await ctx.db.get(ingData.ingredientId);

        await ctx.db.insert("componentIngredients", {
          recipeComponentId: componentId,
          ingredientId: ingData.ingredientId,
          sortOrder: ingData.sortOrder ?? ingIdx,
          unit: ingData.unit,
          quantity: ingData.quantity,
          ingredientName: ingredient?.name,
        });
      }
    }

    // Calculate and cache costs
    const { totalCost, costPerGram } = await calculateVersionCost(ctx, versionId);
    await ctx.db.patch(versionId, {
      cachedTotalCost: totalCost ?? undefined,
      cachedCostPerGram: costPerGram ?? undefined,
      costCacheUpdatedAt: Date.now(),
    });

    return recipeId;
  },
});

/**
 * Create a new version by copying from an existing version.
 */
export const copyVersion = mutation({
  args: {
    recipeId: v.id("recipes"),
    copyFromVersionId: v.id("recipeVersions"),
    versionName: v.string(),
    description: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) {
      throw new Error("Recipe not found");
    }

    const sourceVersion = await ctx.db.get(args.copyFromVersionId);
    if (!sourceVersion || sourceVersion.recipeId !== args.recipeId) {
      throw new Error("Source version not found or belongs to different recipe");
    }

    // Get next version number
    const versions = await ctx.db
      .query("recipeVersions")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .collect();
    const maxVersion = Math.max(...versions.map((v) => v.versionNumber), 0);

    // Create new version
    const newVersionId = await ctx.db.insert("recipeVersions", {
      recipeId: args.recipeId,
      versionNumber: maxVersion + 1,
      versionName: args.versionName,
      description: args.description ?? sourceVersion.description,
      estimatedYieldGrams: sourceVersion.estimatedYieldGrams,
      isSingleComponent: sourceVersion.isSingleComponent,
      isReusableComponent: sourceVersion.isReusableComponent,
      copiedFromVersionId: args.copyFromVersionId,
      createdBy: args.createdBy ?? "admin",
    });

    // Deep copy components
    const sourceComponents = await ctx.db
      .query("recipeComponents")
      .withIndex("by_version", (q) =>
        q.eq("recipeVersionId", args.copyFromVersionId)
      )
      .collect();

    for (const srcComp of sourceComponents) {
      const newCompId = await ctx.db.insert("recipeComponents", {
        recipeVersionId: newVersionId,
        sortOrder: srcComp.sortOrder,
        componentName: srcComp.componentName,
        linkedRecipeVersionId: srcComp.linkedRecipeVersionId,
      });

      // Copy ingredients
      const srcIngredients = await ctx.db
        .query("componentIngredients")
        .withIndex("by_component", (q) => q.eq("recipeComponentId", srcComp._id))
        .collect();

      for (const srcIng of srcIngredients) {
        await ctx.db.insert("componentIngredients", {
          recipeComponentId: newCompId,
          ingredientId: srcIng.ingredientId,
          sortOrder: srcIng.sortOrder,
          unit: srcIng.unit,
          quantity: srcIng.quantity,
          ingredientName: srcIng.ingredientName,
        });
      }
    }

    // Calculate and cache costs
    const { totalCost, costPerGram } = await calculateVersionCost(ctx, newVersionId);
    await ctx.db.patch(newVersionId, {
      cachedTotalCost: totalCost ?? undefined,
      cachedCostPerGram: costPerGram ?? undefined,
      costCacheUpdatedAt: Date.now(),
    });

    return newVersionId;
  },
});

/**
 * Create a completely new version with provided components.
 */
export const createVersion = mutation({
  args: {
    recipeId: v.id("recipes"),
    versionData: recipeVersionInput,
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) {
      throw new Error("Recipe not found");
    }

    // Get next version number
    const versions = await ctx.db
      .query("recipeVersions")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .collect();
    const maxVersion = Math.max(...versions.map((v) => v.versionNumber), 0);

    const isSingleComponent = args.versionData.components.length === 1;
    const versionId = await ctx.db.insert("recipeVersions", {
      recipeId: args.recipeId,
      versionNumber: maxVersion + 1,
      versionName: args.versionData.versionName,
      description: args.versionData.description,
      estimatedYieldGrams: args.versionData.estimatedYieldGrams,
      isSingleComponent,
      isReusableComponent:
        (args.versionData.isReusableComponent ?? false) && isSingleComponent,
      copiedFromVersionId: undefined,
      createdBy: args.createdBy ?? "admin",
    });

    // Create components and ingredients
    for (let compIdx = 0; compIdx < args.versionData.components.length; compIdx++) {
      const compData = args.versionData.components[compIdx];
      const componentId = await ctx.db.insert("recipeComponents", {
        recipeVersionId: versionId,
        sortOrder: compData.sortOrder ?? compIdx,
        componentName: compData.componentName,
        linkedRecipeVersionId: compData.linkedRecipeVersionId,
      });

      for (let ingIdx = 0; ingIdx < compData.ingredients.length; ingIdx++) {
        const ingData = compData.ingredients[ingIdx];
        const ingredient = await ctx.db.get(ingData.ingredientId);

        await ctx.db.insert("componentIngredients", {
          recipeComponentId: componentId,
          ingredientId: ingData.ingredientId,
          sortOrder: ingData.sortOrder ?? ingIdx,
          unit: ingData.unit,
          quantity: ingData.quantity,
          ingredientName: ingredient?.name,
        });
      }
    }

    // Calculate and cache costs
    const { totalCost, costPerGram } = await calculateVersionCost(ctx, versionId);
    await ctx.db.patch(versionId, {
      cachedTotalCost: totalCost ?? undefined,
      cachedCostPerGram: costPerGram ?? undefined,
      costCacheUpdatedAt: Date.now(),
    });

    return versionId;
  },
});

/**
 * Update recipe tags.
 */
export const updateTags = mutation({
  args: {
    recipeId: v.id("recipes"),
    tagIds: v.array(v.id("tags")),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) {
      throw new Error("Recipe not found");
    }

    await ctx.db.patch(args.recipeId, { tagIds: args.tagIds });
    return args.recipeId;
  },
});

/**
 * Update recipe name.
 */
export const updateName = mutation({
  args: {
    recipeId: v.id("recipes"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) {
      throw new Error("Recipe not found");
    }

    await ctx.db.patch(args.recipeId, { name: args.name });
    return args.recipeId;
  },
});

/**
 * Delete a recipe and all its versions.
 */
export const remove = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) {
      throw new Error("Recipe not found");
    }

    // Check if any version is used in products
    const versions = await ctx.db
      .query("recipeVersions")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .collect();

    for (const version of versions) {
      const usedInProduct = await ctx.db
        .query("productVersions")
        .withIndex("by_recipe_version", (q) =>
          q.eq("recipeVersionId", version._id)
        )
        .first();

      if (usedInProduct) {
        throw new Error(
          "Cannot delete recipe: it is used in one or more products"
        );
      }

      // Check if used as linked component
      const usedAsComponent = await ctx.db
        .query("recipeComponents")
        .withIndex("by_linked_version", (q) =>
          q.eq("linkedRecipeVersionId", version._id)
        )
        .first();

      if (usedAsComponent) {
        throw new Error(
          "Cannot delete recipe: it is used as a component in other recipes"
        );
      }
    }

    // Delete all versions and their components
    for (const version of versions) {
      const components = await ctx.db
        .query("recipeComponents")
        .withIndex("by_version", (q) => q.eq("recipeVersionId", version._id))
        .collect();

      for (const comp of components) {
        // Delete ingredients
        const ingredients = await ctx.db
          .query("componentIngredients")
          .withIndex("by_component", (q) => q.eq("recipeComponentId", comp._id))
          .collect();

        for (const ing of ingredients) {
          await ctx.db.delete(ing._id);
        }

        await ctx.db.delete(comp._id);
      }

      await ctx.db.delete(version._id);
    }

    // Delete recipe
    await ctx.db.delete(args.recipeId);
    return true;
  },
});

/**
 * Recalculate and update cached costs for a recipe version.
 * Use this after ingredient prices change.
 */
export const recalculateCosts = mutation({
  args: { versionId: v.id("recipeVersions") },
  handler: async (ctx, args) => {
    const { totalCost, costPerGram } = await calculateVersionCost(
      ctx,
      args.versionId
    );

    await ctx.db.patch(args.versionId, {
      cachedTotalCost: totalCost ?? undefined,
      cachedCostPerGram: costPerGram ?? undefined,
      costCacheUpdatedAt: Date.now(),
    });

    return { totalCost, costPerGram };
  },
});
