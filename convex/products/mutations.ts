import { mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

// ============================================
// Input Types
// ============================================

const productVersionInput = v.object({
  versionName: v.string(),
  description: v.optional(v.string()),
  recipeVersionId: v.id("recipeVersions"),
  packagingVersionId: v.id("packagingVersions"),
  retailPriceIdr: v.number(),
  numPieces: v.number(),
  gramsPerPiece: v.number(),
});

// ============================================
// Helper Functions
// ============================================

/**
 * COGSBreakdown for DB storage (uses undefined per Convex schema v.optional).
 * Note: queries.ts has its own COGSBreakdown that uses null for frontend consumption.
 */
interface COGSBreakdown {
  totalGrams: number;
  recipeCogs: number | undefined;
  packagingCogs: number | undefined;
  totalCogs: number | undefined;
  contributionMargin: number | undefined;
  contributionMarginPct: number | undefined;
}

async function calculateCOGS(
  ctx: MutationCtx,
  recipeVersionId: Id<"recipeVersions">,
  packagingVersionId: Id<"packagingVersions">,
  numPieces: number,
  gramsPerPiece: number,
  retailPriceIdr: number
): Promise<COGSBreakdown> {
  const totalGrams = numPieces * gramsPerPiece;

  const recipeVersion = await ctx.db.get(recipeVersionId);
  const packagingVersion = await ctx.db.get(packagingVersionId);

  // Recipe COGS
  let recipeCogs: number | undefined;
  if (recipeVersion?.cachedCostPerGram != null) {
    recipeCogs = recipeVersion.cachedCostPerGram * totalGrams;
  }

  // Packaging COGS
  const packagingCogs = packagingVersion?.cachedTotalCost ?? undefined;

  // Total COGS
  let totalCogs: number | undefined;
  if (recipeCogs != null && packagingCogs != null) {
    totalCogs = recipeCogs + packagingCogs;
  }

  // Contribution margin
  let contributionMargin: number | undefined;
  let contributionMarginPct: number | undefined;
  if (totalCogs != null && retailPriceIdr > 0) {
    contributionMargin = retailPriceIdr - totalCogs;
    contributionMarginPct = (contributionMargin / retailPriceIdr) * 100;
  }

  return {
    totalGrams,
    recipeCogs,
    packagingCogs,
    totalCogs,
    contributionMargin,
    contributionMarginPct,
  };
}

// ============================================
// Mutations
// ============================================

/**
 * Create a new product with its first version.
 */
export const create = mutation({
  args: {
    name: v.string(),
    tagIds: v.optional(v.array(v.id("tags"))),
    firstVersion: productVersionInput,
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate recipe and packaging versions exist
    const recipeVersion = await ctx.db.get(args.firstVersion.recipeVersionId);
    if (!recipeVersion) {
      throw new Error("Recipe version not found");
    }
    const recipe = await ctx.db.get(recipeVersion.recipeId);

    const packagingVersion = await ctx.db.get(
      args.firstVersion.packagingVersionId
    );
    if (!packagingVersion) {
      throw new Error("Packaging version not found");
    }
    const packaging = await ctx.db.get(packagingVersion.packagingRecipeId);

    // Create the product
    const productId = await ctx.db.insert("products", {
      name: args.name,
      tagIds: args.tagIds ?? [],
      createdBy: args.createdBy ?? "admin",
    });

    // Calculate COGS
    const cogs = await calculateCOGS(
      ctx,
      args.firstVersion.recipeVersionId,
      args.firstVersion.packagingVersionId,
      args.firstVersion.numPieces,
      args.firstVersion.gramsPerPiece,
      args.firstVersion.retailPriceIdr
    );

    // Create first version
    await ctx.db.insert("productVersions", {
      productId,
      versionNumber: 1,
      versionName: args.firstVersion.versionName,
      description: args.firstVersion.description,
      recipeVersionId: args.firstVersion.recipeVersionId,
      packagingVersionId: args.firstVersion.packagingVersionId,
      retailPriceIdr: args.firstVersion.retailPriceIdr,
      numPieces: args.firstVersion.numPieces,
      gramsPerPiece: args.firstVersion.gramsPerPiece,
      copiedFromVersionId: undefined,
      createdBy: args.createdBy ?? "admin",
      // Denormalized names
      recipeName: recipe?.name,
      recipeVersionName: recipeVersion.versionName,
      packagingName: packaging?.name,
      packagingVersionName: packagingVersion.versionName,
      // Cached COGS
      cachedCogs: cogs,
      cogsCacheUpdatedAt: Date.now(),
    });

    return productId;
  },
});

/**
 * Copy a product version.
 */
export const copyVersion = mutation({
  args: {
    productId: v.id("products"),
    copyFromVersionId: v.id("productVersions"),
    versionName: v.string(),
    description: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found");
    }

    const sourceVersion = await ctx.db.get(args.copyFromVersionId);
    if (!sourceVersion || sourceVersion.productId !== args.productId) {
      throw new Error(
        "Source version not found or belongs to different product"
      );
    }

    // Get next version number
    const versions = await ctx.db
      .query("productVersions")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    const maxVersion = Math.max(...versions.map((v) => v.versionNumber), 0);

    // Calculate COGS
    const cogs = await calculateCOGS(
      ctx,
      sourceVersion.recipeVersionId,
      sourceVersion.packagingVersionId,
      sourceVersion.numPieces,
      sourceVersion.gramsPerPiece,
      sourceVersion.retailPriceIdr
    );

    // Create new version
    const newVersionId = await ctx.db.insert("productVersions", {
      productId: args.productId,
      versionNumber: maxVersion + 1,
      versionName: args.versionName,
      description: args.description ?? sourceVersion.description,
      recipeVersionId: sourceVersion.recipeVersionId,
      packagingVersionId: sourceVersion.packagingVersionId,
      retailPriceIdr: sourceVersion.retailPriceIdr,
      numPieces: sourceVersion.numPieces,
      gramsPerPiece: sourceVersion.gramsPerPiece,
      copiedFromVersionId: args.copyFromVersionId,
      createdBy: args.createdBy ?? "admin",
      recipeName: sourceVersion.recipeName,
      recipeVersionName: sourceVersion.recipeVersionName,
      packagingName: sourceVersion.packagingName,
      packagingVersionName: sourceVersion.packagingVersionName,
      cachedCogs: cogs,
      cogsCacheUpdatedAt: Date.now(),
    });

    return newVersionId;
  },
});

/**
 * Create a new version with provided data.
 */
export const createVersion = mutation({
  args: {
    productId: v.id("products"),
    versionData: productVersionInput,
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found");
    }

    // Validate recipe and packaging versions
    const recipeVersion = await ctx.db.get(args.versionData.recipeVersionId);
    if (!recipeVersion) {
      throw new Error("Recipe version not found");
    }
    const recipe = await ctx.db.get(recipeVersion.recipeId);

    const packagingVersion = await ctx.db.get(
      args.versionData.packagingVersionId
    );
    if (!packagingVersion) {
      throw new Error("Packaging version not found");
    }
    const packaging = await ctx.db.get(packagingVersion.packagingRecipeId);

    // Get next version number
    const versions = await ctx.db
      .query("productVersions")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    const maxVersion = Math.max(...versions.map((v) => v.versionNumber), 0);

    // Calculate COGS
    const cogs = await calculateCOGS(
      ctx,
      args.versionData.recipeVersionId,
      args.versionData.packagingVersionId,
      args.versionData.numPieces,
      args.versionData.gramsPerPiece,
      args.versionData.retailPriceIdr
    );

    const versionId = await ctx.db.insert("productVersions", {
      productId: args.productId,
      versionNumber: maxVersion + 1,
      versionName: args.versionData.versionName,
      description: args.versionData.description,
      recipeVersionId: args.versionData.recipeVersionId,
      packagingVersionId: args.versionData.packagingVersionId,
      retailPriceIdr: args.versionData.retailPriceIdr,
      numPieces: args.versionData.numPieces,
      gramsPerPiece: args.versionData.gramsPerPiece,
      copiedFromVersionId: undefined,
      createdBy: args.createdBy ?? "admin",
      recipeName: recipe?.name,
      recipeVersionName: recipeVersion.versionName,
      packagingName: packaging?.name,
      packagingVersionName: packagingVersion.versionName,
      cachedCogs: cogs,
      cogsCacheUpdatedAt: Date.now(),
    });

    return versionId;
  },
});

/**
 * Update product tags.
 */
export const updateTags = mutation({
  args: {
    productId: v.id("products"),
    tagIds: v.array(v.id("tags")),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found");
    }

    await ctx.db.patch(args.productId, { tagIds: args.tagIds });
    return args.productId;
  },
});

/**
 * Update product name.
 */
export const updateName = mutation({
  args: {
    productId: v.id("products"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found");
    }

    await ctx.db.patch(args.productId, { name: args.name });
    return args.productId;
  },
});

/**
 * Delete a product and all its versions.
 */
export const remove = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found");
    }

    // Delete all versions
    const versions = await ctx.db
      .query("productVersions")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    for (const version of versions) {
      await ctx.db.delete(version._id);
    }

    // Delete product
    await ctx.db.delete(args.productId);
    return true;
  },
});

/**
 * Recalculate and update cached COGS for a product version.
 */
export const recalculateCogs = mutation({
  args: { versionId: v.id("productVersions") },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) {
      throw new Error("Product version not found");
    }

    const cogs = await calculateCOGS(
      ctx,
      version.recipeVersionId,
      version.packagingVersionId,
      version.numPieces,
      version.gramsPerPiece,
      version.retailPriceIdr
    );

    await ctx.db.patch(args.versionId, {
      cachedCogs: cogs,
      cogsCacheUpdatedAt: Date.now(),
    });

    return cogs;
  },
});
