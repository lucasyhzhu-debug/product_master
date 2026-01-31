import { mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { calculateLineCost } from "../lib/costCalculator";

// ============================================
// Input Types
// ============================================

const packagingMaterialInput = v.object({
  packagingMaterialId: v.id("packagingMaterials"),
  sortOrder: v.optional(v.number()),
  unit: v.string(),
  quantity: v.number(),
});

const packagingComponentInput = v.object({
  sortOrder: v.optional(v.number()),
  componentName: v.string(),
  materials: v.array(packagingMaterialInput),
});

const packagingVersionInput = v.object({
  versionName: v.string(),
  description: v.optional(v.string()),
  components: v.array(packagingComponentInput),
});

// ============================================
// Helper Functions
// ============================================

async function calculateVersionCost(
  ctx: MutationCtx,
  versionId: Id<"packagingVersions">
): Promise<number | null> {
  const components = await ctx.db
    .query("packagingComponents")
    .withIndex("by_version", (q) => q.eq("packagingVersionId", versionId))
    .collect();

  let totalCost = 0;
  let hasNullCost = false;

  for (const comp of components) {
    const materials = await ctx.db
      .query("packagingComponentMaterials")
      .withIndex("by_component", (q) =>
        q.eq("packagingComponentId", comp._id)
      )
      .collect();

    for (const mat of materials) {
      const material = await ctx.db.get(mat.packagingMaterialId);
      if (material?.costPerBaseUnit != null) {
        totalCost += calculateLineCost(
          material.costPerBaseUnit,
          mat.quantity,
          mat.unit
        );
      } else {
        hasNullCost = true;
      }
    }
  }

  return hasNullCost ? null : totalCost;
}

// ============================================
// Mutations
// ============================================

/**
 * Create a new packaging recipe with its first version.
 */
export const create = mutation({
  args: {
    name: v.string(),
    tagIds: v.optional(v.array(v.id("tags"))),
    firstVersion: packagingVersionInput,
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Create the packaging recipe
    const packagingId = await ctx.db.insert("packagingRecipes", {
      name: args.name,
      tagIds: args.tagIds ?? [],
      createdBy: args.createdBy ?? "admin",
    });

    // Create first version
    const versionId = await ctx.db.insert("packagingVersions", {
      packagingRecipeId: packagingId,
      versionNumber: 1,
      versionName: args.firstVersion.versionName,
      description: args.firstVersion.description,
      copiedFromVersionId: undefined,
      createdBy: args.createdBy ?? "admin",
    });

    // Create components and materials
    for (
      let compIdx = 0;
      compIdx < args.firstVersion.components.length;
      compIdx++
    ) {
      const compData = args.firstVersion.components[compIdx];
      const componentId = await ctx.db.insert("packagingComponents", {
        packagingVersionId: versionId,
        sortOrder: compData.sortOrder ?? compIdx,
        componentName: compData.componentName,
      });

      // Create materials for this component
      for (let matIdx = 0; matIdx < compData.materials.length; matIdx++) {
        const matData = compData.materials[matIdx];
        const material = await ctx.db.get(matData.packagingMaterialId);

        await ctx.db.insert("packagingComponentMaterials", {
          packagingComponentId: componentId,
          packagingMaterialId: matData.packagingMaterialId,
          sortOrder: matData.sortOrder ?? matIdx,
          unit: matData.unit,
          quantity: matData.quantity,
          materialName: material?.name,
        });
      }
    }

    // Calculate and cache costs
    const totalCost = await calculateVersionCost(ctx, versionId);
    await ctx.db.patch(versionId, {
      cachedTotalCost: totalCost ?? undefined,
      costCacheUpdatedAt: Date.now(),
    });

    return packagingId;
  },
});

/**
 * Copy a packaging version.
 */
export const copyVersion = mutation({
  args: {
    packagingRecipeId: v.id("packagingRecipes"),
    copyFromVersionId: v.id("packagingVersions"),
    versionName: v.string(),
    description: v.optional(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packagingRecipeId);
    if (!pkg) {
      throw new Error("Packaging recipe not found");
    }

    const sourceVersion = await ctx.db.get(args.copyFromVersionId);
    if (
      !sourceVersion ||
      sourceVersion.packagingRecipeId !== args.packagingRecipeId
    ) {
      throw new Error(
        "Source version not found or belongs to different packaging"
      );
    }

    // Get next version number
    const versions = await ctx.db
      .query("packagingVersions")
      .withIndex("by_packaging", (q) =>
        q.eq("packagingRecipeId", args.packagingRecipeId)
      )
      .collect();
    const maxVersion = Math.max(...versions.map((v) => v.versionNumber), 0);

    // Create new version
    const newVersionId = await ctx.db.insert("packagingVersions", {
      packagingRecipeId: args.packagingRecipeId,
      versionNumber: maxVersion + 1,
      versionName: args.versionName,
      description: args.description ?? sourceVersion.description,
      copiedFromVersionId: args.copyFromVersionId,
      createdBy: args.createdBy ?? "admin",
    });

    // Deep copy components
    const sourceComponents = await ctx.db
      .query("packagingComponents")
      .withIndex("by_version", (q) =>
        q.eq("packagingVersionId", args.copyFromVersionId)
      )
      .collect();

    for (const srcComp of sourceComponents) {
      const newCompId = await ctx.db.insert("packagingComponents", {
        packagingVersionId: newVersionId,
        sortOrder: srcComp.sortOrder,
        componentName: srcComp.componentName,
      });

      // Copy materials
      const srcMaterials = await ctx.db
        .query("packagingComponentMaterials")
        .withIndex("by_component", (q) =>
          q.eq("packagingComponentId", srcComp._id)
        )
        .collect();

      for (const srcMat of srcMaterials) {
        await ctx.db.insert("packagingComponentMaterials", {
          packagingComponentId: newCompId,
          packagingMaterialId: srcMat.packagingMaterialId,
          sortOrder: srcMat.sortOrder,
          unit: srcMat.unit,
          quantity: srcMat.quantity,
          materialName: srcMat.materialName,
        });
      }
    }

    // Calculate and cache costs
    const totalCost = await calculateVersionCost(ctx, newVersionId);
    await ctx.db.patch(newVersionId, {
      cachedTotalCost: totalCost ?? undefined,
      costCacheUpdatedAt: Date.now(),
    });

    return newVersionId;
  },
});

/**
 * Create a new version with provided components.
 */
export const createVersion = mutation({
  args: {
    packagingRecipeId: v.id("packagingRecipes"),
    versionData: packagingVersionInput,
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packagingRecipeId);
    if (!pkg) {
      throw new Error("Packaging recipe not found");
    }

    // Get next version number
    const versions = await ctx.db
      .query("packagingVersions")
      .withIndex("by_packaging", (q) =>
        q.eq("packagingRecipeId", args.packagingRecipeId)
      )
      .collect();
    const maxVersion = Math.max(...versions.map((v) => v.versionNumber), 0);

    const versionId = await ctx.db.insert("packagingVersions", {
      packagingRecipeId: args.packagingRecipeId,
      versionNumber: maxVersion + 1,
      versionName: args.versionData.versionName,
      description: args.versionData.description,
      copiedFromVersionId: undefined,
      createdBy: args.createdBy ?? "admin",
    });

    // Create components and materials
    for (
      let compIdx = 0;
      compIdx < args.versionData.components.length;
      compIdx++
    ) {
      const compData = args.versionData.components[compIdx];
      const componentId = await ctx.db.insert("packagingComponents", {
        packagingVersionId: versionId,
        sortOrder: compData.sortOrder ?? compIdx,
        componentName: compData.componentName,
      });

      for (let matIdx = 0; matIdx < compData.materials.length; matIdx++) {
        const matData = compData.materials[matIdx];
        const material = await ctx.db.get(matData.packagingMaterialId);

        await ctx.db.insert("packagingComponentMaterials", {
          packagingComponentId: componentId,
          packagingMaterialId: matData.packagingMaterialId,
          sortOrder: matData.sortOrder ?? matIdx,
          unit: matData.unit,
          quantity: matData.quantity,
          materialName: material?.name,
        });
      }
    }

    // Calculate and cache costs
    const totalCost = await calculateVersionCost(ctx, versionId);
    await ctx.db.patch(versionId, {
      cachedTotalCost: totalCost ?? undefined,
      costCacheUpdatedAt: Date.now(),
    });

    return versionId;
  },
});

/**
 * Update packaging recipe tags.
 */
export const updateTags = mutation({
  args: {
    packagingRecipeId: v.id("packagingRecipes"),
    tagIds: v.array(v.id("tags")),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packagingRecipeId);
    if (!pkg) {
      throw new Error("Packaging recipe not found");
    }

    await ctx.db.patch(args.packagingRecipeId, { tagIds: args.tagIds });
    return args.packagingRecipeId;
  },
});

/**
 * Update packaging recipe name.
 */
export const updateName = mutation({
  args: {
    packagingRecipeId: v.id("packagingRecipes"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packagingRecipeId);
    if (!pkg) {
      throw new Error("Packaging recipe not found");
    }

    await ctx.db.patch(args.packagingRecipeId, { name: args.name });
    return args.packagingRecipeId;
  },
});

/**
 * Delete a packaging recipe and all its versions.
 */
export const remove = mutation({
  args: { packagingRecipeId: v.id("packagingRecipes") },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packagingRecipeId);
    if (!pkg) {
      throw new Error("Packaging recipe not found");
    }

    // Check if any version is used in products
    const versions = await ctx.db
      .query("packagingVersions")
      .withIndex("by_packaging", (q) =>
        q.eq("packagingRecipeId", args.packagingRecipeId)
      )
      .collect();

    for (const version of versions) {
      const usedInProduct = await ctx.db
        .query("productVersions")
        .withIndex("by_packaging_version", (q) =>
          q.eq("packagingVersionId", version._id)
        )
        .first();

      if (usedInProduct) {
        throw new Error(
          "Cannot delete packaging: it is used in one or more products"
        );
      }
    }

    // Delete all versions and their components
    for (const version of versions) {
      const components = await ctx.db
        .query("packagingComponents")
        .withIndex("by_version", (q) => q.eq("packagingVersionId", version._id))
        .collect();

      for (const comp of components) {
        // Delete materials
        const materials = await ctx.db
          .query("packagingComponentMaterials")
          .withIndex("by_component", (q) =>
            q.eq("packagingComponentId", comp._id)
          )
          .collect();

        for (const mat of materials) {
          await ctx.db.delete(mat._id);
        }

        await ctx.db.delete(comp._id);
      }

      await ctx.db.delete(version._id);
    }

    // Delete packaging recipe
    await ctx.db.delete(args.packagingRecipeId);
    return true;
  },
});

/**
 * Recalculate and update cached costs for a packaging version.
 */
export const recalculateCosts = mutation({
  args: { versionId: v.id("packagingVersions") },
  handler: async (ctx, args) => {
    const totalCost = await calculateVersionCost(ctx, args.versionId);

    await ctx.db.patch(args.versionId, {
      cachedTotalCost: totalCost ?? undefined,
      costCacheUpdatedAt: Date.now(),
    });

    return { totalCost };
  },
});
