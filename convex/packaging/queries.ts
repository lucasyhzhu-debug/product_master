import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { calculateLineCost } from "../lib/costCalculator";

// ============================================
// Helper Types
// ============================================

interface PackagingMaterialWithCost {
  _id: Id<"packagingComponentMaterials">;
  packagingMaterialId: Id<"packagingMaterials">;
  materialName: string | undefined;
  sortOrder: number;
  unit: string;
  quantity: number;
  cost: number | null;
}

interface PackagingComponentWithCost {
  _id: Id<"packagingComponents">;
  sortOrder: number;
  componentName: string;
  materials: PackagingMaterialWithCost[];
  subtotalCost: number | null;
}

interface PackagingVersionDetail extends Doc<"packagingVersions"> {
  components: PackagingComponentWithCost[];
  totalCost: number | null;
}

// ============================================
// Queries
// ============================================

/**
 * List all packaging recipes with their versions and tags.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const packagingRecipes = await ctx.db
      .query("packagingRecipes")
      .order("desc")
      .take(limit);

    const result = await Promise.all(
      packagingRecipes.map(async (pkg) => {
        const versions = await ctx.db
          .query("packagingVersions")
          .withIndex("by_packaging", (q) => q.eq("packagingRecipeId", pkg._id))
          .collect();

        const tags = await Promise.all(
          pkg.tagIds.map((tagId) => ctx.db.get(tagId))
        );

        const latestVersion = versions.sort(
          (a, b) => b.versionNumber - a.versionNumber
        )[0];

        return {
          ...pkg,
          versions: versions.sort((a, b) => a.versionNumber - b.versionNumber),
          tags: tags.filter((t) => t !== null),
          latestVersionCost: latestVersion?.cachedTotalCost ?? null,
        };
      })
    );

    return result;
  },
});

/**
 * Get a single packaging recipe by ID with versions and tags.
 */
export const get = query({
  args: { id: v.id("packagingRecipes") },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.id);
    if (!pkg) return null;

    const versions = await ctx.db
      .query("packagingVersions")
      .withIndex("by_packaging", (q) => q.eq("packagingRecipeId", pkg._id))
      .collect();

    const tags = await Promise.all(
      pkg.tagIds.map((tagId) => ctx.db.get(tagId))
    );

    return {
      ...pkg,
      versions: versions.sort((a, b) => a.versionNumber - b.versionNumber),
      tags: tags.filter((t) => t !== null),
    };
  },
});

/**
 * Get a packaging version with full component and material details.
 */
export const getVersion = query({
  args: { versionId: v.id("packagingVersions") },
  handler: async (ctx, args): Promise<PackagingVersionDetail | null> => {
    const version = await ctx.db.get(args.versionId);
    if (!version) return null;

    const components = await ctx.db
      .query("packagingComponents")
      .withIndex("by_version", (q) => q.eq("packagingVersionId", version._id))
      .collect();

    const componentsWithCosts: PackagingComponentWithCost[] = await Promise.all(
      components
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(async (comp) => {
          const materials = await ctx.db
            .query("packagingComponentMaterials")
            .withIndex("by_component", (q) =>
              q.eq("packagingComponentId", comp._id)
            )
            .collect();

          const materialsWithCosts: PackagingMaterialWithCost[] =
            await Promise.all(
              materials
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(async (mat) => {
                  const material = await ctx.db.get(mat.packagingMaterialId);
                  let cost: number | null = null;

                  if (material && material.costPerBaseUnit) {
                    cost = calculateLineCost(
                      material.costPerBaseUnit,
                      mat.quantity,
                      mat.unit
                    );
                  }

                  return {
                    _id: mat._id,
                    packagingMaterialId: mat.packagingMaterialId,
                    materialName: material?.name ?? mat.materialName,
                    sortOrder: mat.sortOrder,
                    unit: mat.unit,
                    quantity: mat.quantity,
                    cost,
                  };
                })
            );

          const subtotalCost = materialsWithCosts.reduce(
            (sum, mat) => sum + (mat.cost ?? 0),
            0
          );

          return {
            _id: comp._id,
            sortOrder: comp.sortOrder,
            componentName: comp.componentName,
            materials: materialsWithCosts,
            subtotalCost: materialsWithCosts.some((m) => m.cost === null)
              ? null
              : subtotalCost,
          };
        })
    );

    const totalCost = componentsWithCosts.reduce(
      (sum, comp) => sum + (comp.subtotalCost ?? 0),
      0
    );
    const hasNullCosts = componentsWithCosts.some(
      (c) => c.subtotalCost === null
    );

    return {
      ...version,
      components: componentsWithCosts,
      totalCost: hasNullCosts ? null : totalCost,
    };
  },
});

/**
 * Search packaging recipes by name.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const searchLower = args.query.toLowerCase();

    const all = await ctx.db.query("packagingRecipes").collect();

    const filtered = all.filter((pkg) =>
      pkg.name.toLowerCase().includes(searchLower)
    );

    return filtered.slice(0, limit);
  },
});
