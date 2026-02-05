import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get all components for a menu product.
 * Returns components with their componentType details.
 * Uses unified BOM via componentTypeId (required field).
 */
export const getByMenuProduct = query({
  args: { menuProductId: v.id("menuProducts") },
  handler: async (ctx, args) => {
    const components = await ctx.db
      .query("menuProductComponents")
      .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.menuProductId))
      .collect();

    // Enrich with component type details
    const enrichedComponents = await Promise.all(
      components.map(async (component) => {
        const componentType = await ctx.db.get(component.componentTypeId);
        return {
          ...component,
          componentType,
        };
      })
    );

    // Sort by sortOrder
    return enrichedComponents.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/**
 * Get all components for multiple menu products at once (batch).
 * Useful for order creation to fetch all components in one query.
 * Uses unified BOM via componentTypeId.
 */
export const getByMenuProductIds = query({
  args: { menuProductIds: v.array(v.id("menuProducts")) },
  handler: async (ctx, args) => {
    // Fetch all components for all menu products
    const allComponents = await Promise.all(
      args.menuProductIds.map(async (menuProductId) => {
        const components = await ctx.db
          .query("menuProductComponents")
          .withIndex("by_menu_product", (q) => q.eq("menuProductId", menuProductId))
          .collect();

        // Enrich with component type details
        const enrichedComponents = await Promise.all(
          components.map(async (component) => {
            const componentType = await ctx.db.get(component.componentTypeId);
            return {
              ...component,
              componentType,
            };
          })
        );

        return {
          menuProductId,
          components: enrichedComponents.sort((a, b) => a.sortOrder - b.sortOrder),
        };
      })
    );

    // Return as a map for easy lookup
    return Object.fromEntries(
      allComponents.map((item) => [item.menuProductId, item.components])
    );
  },
});

/**
 * Get a single component by ID.
 * Uses unified BOM via componentTypeId.
 */
export const getById = query({
  args: { id: v.id("menuProductComponents") },
  handler: async (ctx, args) => {
    const component = await ctx.db.get(args.id);
    if (!component) return null;

    const componentType = await ctx.db.get(component.componentTypeId);
    return {
      ...component,
      componentType,
    };
  },
});
