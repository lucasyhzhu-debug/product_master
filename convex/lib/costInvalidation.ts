import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { calculateLineCost } from "./costCalculator";
import type { Id } from "../_generated/dataModel";

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

/**
 * Phase 20: Invalidate production component costs when an ingredient's cost changes.
 * Scheduled via ctx.scheduler.runAfter(0, ...) from ingredients/mutations.ts
 *
 * Walk: ingredient -> productionComponentIngredients (by_ingredient index)
 *    -> componentTypes (update cachedLineCost, mark stale)
 *    -> walk productionComponentLinks.by_child to find parent components (cascade up)
 *    -> schedule recalculateComponentCogs for affected calculated-mode components
 */
export const invalidateProductionComponentCosts = internalMutation({
  args: { ingredientId: v.id("ingredients") },
  handler: async (ctx, args) => {
    const ingredient = await ctx.db.get(args.ingredientId);
    if (!ingredient) return;

    // Find all productionComponentIngredients using this ingredient
    const usages = await ctx.db
      .query("productionComponentIngredients")
      .withIndex("by_ingredient", (q) => q.eq("ingredientId", args.ingredientId))
      .collect();

    if (usages.length === 0) return;

    // Track all affected componentType IDs (direct + parent cascade)
    const affectedComponentIds = new Set<Id<"componentTypes">>();

    // 1. Update cachedLineCost on each ingredient link and mark component stale
    for (const usage of usages) {
      // Recalculate line cost
      const newLineCost = calculateLineCost(
        ingredient.costPerBaseUnit,
        usage.quantityPerUnit,
        usage.unit
      );

      if (usage.cachedLineCost !== newLineCost) {
        await ctx.db.patch(usage._id, { cachedLineCost: newLineCost });
      }

      // Mark the component as stale
      affectedComponentIds.add(usage.componentTypeId);
      await ctx.db.patch(usage.componentTypeId, {
        cogsCacheUpdatedAt: undefined, // stale marker
      });
    }

    // 2. Cascade upward: find parent components that use affected components as sub-components
    const toProcess = [...affectedComponentIds];
    const processed = new Set<string>();

    while (toProcess.length > 0) {
      const currentId = toProcess.pop()!;
      if (processed.has(currentId)) continue;
      processed.add(currentId);

      // Find parents that use this component as a child
      const parentLinks = await ctx.db
        .query("productionComponentLinks")
        .withIndex("by_child", (q) => q.eq("childComponentId", currentId))
        .collect();

      for (const link of parentLinks) {
        if (!affectedComponentIds.has(link.parentComponentId)) {
          affectedComponentIds.add(link.parentComponentId);
          // Mark parent as stale too
          await ctx.db.patch(link.parentComponentId, {
            cogsCacheUpdatedAt: undefined,
          });
        }
        toProcess.push(link.parentComponentId);
      }
    }

    // 3. Schedule recalculateComponentCogs for all affected calculated-mode components
    for (const componentId of affectedComponentIds) {
      const component = await ctx.db.get(componentId);
      if (component?.cogsMode === "calculated") {
        await ctx.scheduler.runAfter(
          0,
          internal.productionRecipes.mutations.recalculateComponentCogs,
          { componentTypeId: componentId }
        );
      }
    }
  },
});
