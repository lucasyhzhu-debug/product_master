import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { calculateLineCost } from "./costCalculator";
import type { Id } from "../_generated/dataModel";

/**
 * Invalidate and recalculate recipe costs when an ingredient's cost changes.
 * Scheduled via ctx.scheduler.runAfter(0, ...) from ingredients/mutations.ts
 *
 * Walk: ingredient -> componentIngredients (by_ingredient index)
 *    -> recipeComponents -> recipeVersions
 * Recalculate cachedLineCost on each componentIngredient,
 * cachedSubtotalCost on each recipeComponent,
 * cachedTotalCost + cachedCostPerGram on each recipeVersion.
 *
 * NOTE: Does NOT cascade to linked recipe consumers (depth 1 only).
 * Linked versions will correct when next viewed/saved.
 */
export const invalidateRecipeCosts = internalMutation({
  args: { ingredientId: v.id("ingredients") },
  handler: async (ctx, args) => {
    const ingredient = await ctx.db.get(args.ingredientId);
    if (!ingredient || ingredient.costPerBaseUnit == null) return;

    // Find all componentIngredients using this ingredient
    const usages = await ctx.db
      .query("componentIngredients")
      .withIndex("by_ingredient", (q) => q.eq("ingredientId", args.ingredientId))
      .collect();

    // Group by parent recipeComponent to batch recalculations
    const affectedComponentIds = new Set(usages.map((u) => u.recipeComponentId));

    for (const componentId of affectedComponentIds) {
      const component = await ctx.db.get(componentId);
      if (!component) continue;

      // Get ALL ingredients for this component (not just the changed one)
      const allIngredients = await ctx.db
        .query("componentIngredients")
        .withIndex("by_component", (q) => q.eq("recipeComponentId", componentId))
        .collect();

      let subtotal = 0;
      for (const ing of allIngredients) {
        const ingDoc = await ctx.db.get(ing.ingredientId);
        if (ingDoc?.costPerBaseUnit != null) {
          const lineCost = calculateLineCost(ingDoc.costPerBaseUnit, ing.quantity, ing.unit);
          if (ing.cachedLineCost !== lineCost) {
            await ctx.db.patch(ing._id, { cachedLineCost: lineCost });
          }
          subtotal += lineCost;
        }
      }

      // Update component subtotal
      if (component.cachedSubtotalCost !== subtotal) {
        await ctx.db.patch(componentId, { cachedSubtotalCost: subtotal });
      }

      // Update parent recipe version total
      const versionId = component.recipeVersionId;
      const version = await ctx.db.get(versionId);
      if (!version) continue;

      // Get ALL components for this version
      const allComponents = await ctx.db
        .query("recipeComponents")
        .withIndex("by_version", (q) => q.eq("recipeVersionId", versionId))
        .collect();

      let versionTotal = 0;
      for (const comp of allComponents) {
        // For linked components, use the linked version's cached cost
        if (comp.linkedRecipeVersionId) {
          const linkedVersion = await ctx.db.get(comp.linkedRecipeVersionId);
          versionTotal += linkedVersion?.cachedTotalCost ?? 0;
        } else {
          // Use freshly calculated subtotal for the affected component,
          // cached value for others
          versionTotal += comp._id === componentId
            ? subtotal
            : (comp.cachedSubtotalCost ?? 0);
        }
      }

      const costPerGram = version.estimatedYieldGrams
        ? versionTotal / version.estimatedYieldGrams
        : null;

      await ctx.db.patch(versionId, {
        cachedTotalCost: versionTotal,
        cachedCostPerGram: costPerGram ?? undefined,
        costCacheUpdatedAt: Date.now(),
      });
    }
  },
});

/**
 * Invalidate and recalculate packaging costs when a material's cost changes.
 * Scheduled via ctx.scheduler.runAfter(0, ...) from materials/mutations.ts
 *
 * Walk: material -> packagingComponentMaterials (by_material index)
 *    -> packagingComponents -> packagingVersions
 */
export const invalidatePackagingCosts = internalMutation({
  args: { materialId: v.id("packagingMaterials") },
  handler: async (ctx, args) => {
    const material = await ctx.db.get(args.materialId);
    if (!material || material.costPerBaseUnit == null) return;

    // Find all packagingComponentMaterials using this material
    const usages = await ctx.db
      .query("packagingComponentMaterials")
      .withIndex("by_material", (q) => q.eq("packagingMaterialId", args.materialId))
      .collect();

    const affectedComponentIds = new Set(usages.map((u) => u.packagingComponentId));

    for (const componentId of affectedComponentIds) {
      const component = await ctx.db.get(componentId);
      if (!component) continue;

      // Get ALL materials for this component
      const allMaterials = await ctx.db
        .query("packagingComponentMaterials")
        .withIndex("by_component", (q) => q.eq("packagingComponentId", componentId))
        .collect();

      let subtotal = 0;
      for (const mat of allMaterials) {
        const matDoc = await ctx.db.get(mat.packagingMaterialId);
        if (matDoc?.costPerBaseUnit != null) {
          const lineCost = calculateLineCost(matDoc.costPerBaseUnit, mat.quantity, mat.unit);
          if (mat.cachedLineCost !== lineCost) {
            await ctx.db.patch(mat._id, { cachedLineCost: lineCost });
          }
          subtotal += lineCost;
        }
      }

      if (component.cachedSubtotalCost !== subtotal) {
        await ctx.db.patch(componentId, { cachedSubtotalCost: subtotal });
      }

      // Update parent packaging version total
      const versionId = component.packagingVersionId;
      const version = await ctx.db.get(versionId);
      if (!version) continue;

      const allComponents = await ctx.db
        .query("packagingComponents")
        .withIndex("by_version", (q) => q.eq("packagingVersionId", versionId))
        .collect();

      let versionTotal = 0;
      for (const comp of allComponents) {
        versionTotal += comp._id === componentId
          ? subtotal
          : (comp.cachedSubtotalCost ?? 0);
      }

      await ctx.db.patch(versionId, {
        cachedTotalCost: versionTotal,
        costCacheUpdatedAt: Date.now(),
      });
    }
  },
});

/**
 * Invalidate and recalculate menu product COGS when a componentType's cost changes.
 * Scheduled via ctx.scheduler.runAfter(0, ...) from componentTypes/mutations.ts
 *
 * Walk: componentType -> menuProductComponents (by_component_type index)
 *    -> menuProducts
 * Recalculates production-only COGS (packaging excluded per user decision)
 * and stores it as menuProducts.unitCost.
 *
 * NOTE: Depth-1 cascade only — directly affected products, no deeper chains.
 */
export const invalidateMenuProductCosts = internalMutation({
  args: { componentTypeId: v.id("componentTypes") },
  handler: async (ctx, args) => {
    // Find all menuProductComponents using this componentType
    const usages = await ctx.db
      .query("menuProductComponents")
      .withIndex("by_component_type", (q) => q.eq("componentTypeId", args.componentTypeId))
      .collect();

    // Get unique menuProduct IDs
    const affectedMenuProductIds = new Set<Id<"menuProducts">>(
      usages.map((u) => u.menuProductId)
    );

    for (const menuProductId of affectedMenuProductIds) {
      const menuProduct = await ctx.db.get(menuProductId);
      if (!menuProduct) continue;

      // Fetch all components for this menu product
      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", menuProductId))
        .collect();

      // Calculate production-only COGS (packaging excluded per user decision)
      let productionCost = 0;
      for (const comp of components) {
        const componentType = await ctx.db.get(comp.componentTypeId);
        if (!componentType) continue;

        if (componentType.category === "production") {
          productionCost += componentType.unitCostIdr * comp.quantity;
        }
      }

      // Update unitCost and clear stale marker
      await ctx.db.patch(menuProductId, {
        unitCost: productionCost,
        unitCostStaleAt: undefined,
      });
    }
  },
});
