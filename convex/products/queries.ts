import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

// ============================================
// Helper Types
// ============================================

interface COGSBreakdown {
  totalGrams: number;
  recipeCogs: number | null;
  packagingCogs: number | null;
  totalCogs: number | null;
  contributionMargin: number | null;
  contributionMarginPct: number | null;
}

interface ProductVersionDetail extends Doc<"productVersions"> {
  recipe: {
    _id: Id<"recipes">;
    name: string;
  } | null;
  recipeVersion: Doc<"recipeVersions"> | null;
  packaging: {
    _id: Id<"packagingRecipes">;
    name: string;
  } | null;
  packagingVersion: Doc<"packagingVersions"> | null;
  cogs: COGSBreakdown;
}

// ============================================
// Queries
// ============================================

/**
 * List all products with their versions and tags.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const products = await ctx.db.query("products").order("desc").take(limit);

    const result = await Promise.all(
      products.map(async (product) => {
        const versions = await ctx.db
          .query("productVersions")
          .withIndex("by_product", (q) => q.eq("productId", product._id))
          .collect();

        const tags = await Promise.all(
          product.tagIds.map((tagId) => ctx.db.get(tagId))
        );

        const latestVersion = versions.sort(
          (a, b) => b.versionNumber - a.versionNumber
        )[0];

        return {
          ...product,
          versions: versions.sort((a, b) => a.versionNumber - b.versionNumber),
          tags: tags.filter((t) => t !== null),
          latestCogs: latestVersion?.cachedCogs ?? null,
        };
      })
    );

    return result;
  },
});

/**
 * Get a single product by ID with versions and tags.
 */
export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) return null;

    const versions = await ctx.db
      .query("productVersions")
      .withIndex("by_product", (q) => q.eq("productId", product._id))
      .collect();

    const tags = await Promise.all(
      product.tagIds.map((tagId) => ctx.db.get(tagId))
    );

    return {
      ...product,
      versions: versions.sort((a, b) => a.versionNumber - b.versionNumber),
      tags: tags.filter((t) => t !== null),
    };
  },
});

/**
 * Get a product version with full COGS breakdown.
 */
export const getVersion = query({
  args: { versionId: v.id("productVersions") },
  handler: async (ctx, args): Promise<ProductVersionDetail | null> => {
    const version = await ctx.db.get(args.versionId);
    if (!version) return null;

    // Get recipe info
    const recipeVersion = await ctx.db.get(version.recipeVersionId);
    let recipe = null;
    if (recipeVersion) {
      recipe = await ctx.db.get(recipeVersion.recipeId);
    }

    // Get packaging info
    const packagingVersion = await ctx.db.get(version.packagingVersionId);
    let packaging = null;
    if (packagingVersion) {
      packaging = await ctx.db.get(packagingVersion.packagingRecipeId);
    }

    // Calculate COGS (fresh calculation)
    const totalGrams = version.numPieces * version.gramsPerPiece;

    // Recipe COGS
    let recipeCogs: number | null = null;
    if (recipeVersion?.cachedCostPerGram != null) {
      recipeCogs = recipeVersion.cachedCostPerGram * totalGrams;
    }

    // Packaging COGS
    const packagingCogs = packagingVersion?.cachedTotalCost ?? null;

    // Total COGS
    let totalCogs: number | null = null;
    if (recipeCogs != null && packagingCogs != null) {
      totalCogs = recipeCogs + packagingCogs;
    }

    // Contribution margin
    let contributionMargin: number | null = null;
    let contributionMarginPct: number | null = null;
    if (totalCogs != null && version.retailPriceIdr > 0) {
      contributionMargin = version.retailPriceIdr - totalCogs;
      contributionMarginPct = (contributionMargin / version.retailPriceIdr) * 100;
    }

    const cogs: COGSBreakdown = {
      totalGrams,
      recipeCogs,
      packagingCogs,
      totalCogs,
      contributionMargin,
      contributionMarginPct,
    };

    return {
      ...version,
      recipe: recipe ? { _id: recipe._id, name: recipe.name } : null,
      recipeVersion,
      packaging: packaging
        ? { _id: packaging._id, name: packaging.name }
        : null,
      packagingVersion,
      cogs,
    };
  },
});

/**
 * Get products that use a specific recipe version.
 */
export const getProductsUsingRecipe = query({
  args: { recipeVersionId: v.id("recipeVersions") },
  handler: async (ctx, args) => {
    const productVersions = await ctx.db
      .query("productVersions")
      .withIndex("by_recipe_version", (q) =>
        q.eq("recipeVersionId", args.recipeVersionId)
      )
      .collect();

    const result = await Promise.all(
      productVersions.map(async (pv) => {
        const product = await ctx.db.get(pv.productId);
        return {
          productId: pv.productId,
          productName: product?.name ?? "Unknown",
          versionNumber: pv.versionNumber,
        };
      })
    );

    return result;
  },
});

/**
 * Get products that use a specific packaging version.
 */
export const getProductsUsingPackaging = query({
  args: { packagingVersionId: v.id("packagingVersions") },
  handler: async (ctx, args) => {
    const productVersions = await ctx.db
      .query("productVersions")
      .withIndex("by_packaging_version", (q) =>
        q.eq("packagingVersionId", args.packagingVersionId)
      )
      .collect();

    const result = await Promise.all(
      productVersions.map(async (pv) => {
        const product = await ctx.db.get(pv.productId);
        return {
          productId: pv.productId,
          productName: product?.name ?? "Unknown",
          versionNumber: pv.versionNumber,
        };
      })
    );

    return result;
  },
});

/**
 * Search products by name.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const searchLower = args.query.toLowerCase();

    const all = await ctx.db.query("products").collect();

    const filtered = all.filter((product) =>
      product.name.toLowerCase().includes(searchLower)
    );

    return filtered.slice(0, limit);
  },
});
