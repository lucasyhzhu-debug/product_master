import { mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * Create a new menu product component.
 */
export const create = mutation({
  args: {
    menuProductId: v.id("menuProducts"),
    productionUnitTypeId: v.id("productionUnitTypes"),
    quantity: v.number(),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Validate menu product exists
    const menuProduct = await ctx.db.get(args.menuProductId);
    if (!menuProduct) {
      throw new Error("Menu product not found");
    }

    // Validate production unit type exists
    const unitType = await ctx.db.get(args.productionUnitTypeId);
    if (!unitType) {
      throw new Error("Production unit type not found");
    }

    // Get max sortOrder if not provided
    let sortOrder = args.sortOrder;
    if (sortOrder === undefined) {
      const existingComponents = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.menuProductId))
        .collect();
      const maxSortOrder = existingComponents.reduce((max, c) => Math.max(max, c.sortOrder), 0);
      sortOrder = maxSortOrder + 1;
    }

    const id = await ctx.db.insert("menuProductComponents", {
      menuProductId: args.menuProductId,
      productionUnitTypeId: args.productionUnitTypeId,
      quantity: args.quantity,
      sortOrder,
    });

    // Update cached production summary on menu product
    await updateCachedProductionSummary(ctx, args.menuProductId);

    return id;
  },
});

/**
 * Update an existing menu product component.
 */
export const update = mutation({
  args: {
    id: v.id("menuProductComponents"),
    productionUnitTypeId: v.optional(v.id("productionUnitTypes")),
    quantity: v.optional(v.number()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const current = await ctx.db.get(id);
    if (!current) {
      throw new Error("Menu product component not found");
    }

    // Validate production unit type if updating
    if (updates.productionUnitTypeId) {
      const unitType = await ctx.db.get(updates.productionUnitTypeId);
      if (!unitType) {
        throw new Error("Production unit type not found");
      }
    }

    // Only include defined updates
    const patchData: Record<string, unknown> = {};
    if (updates.productionUnitTypeId !== undefined) patchData.productionUnitTypeId = updates.productionUnitTypeId;
    if (updates.quantity !== undefined) patchData.quantity = updates.quantity;
    if (updates.sortOrder !== undefined) patchData.sortOrder = updates.sortOrder;

    await ctx.db.patch(id, patchData);

    // Update cached production summary on menu product
    await updateCachedProductionSummary(ctx, current.menuProductId);

    return id;
  },
});

/**
 * Delete a menu product component.
 */
export const remove = mutation({
  args: { id: v.id("menuProductComponents") },
  handler: async (ctx, args) => {
    const component = await ctx.db.get(args.id);
    if (!component) {
      throw new Error("Menu product component not found");
    }

    await ctx.db.delete(args.id);

    // Update cached production summary on menu product
    await updateCachedProductionSummary(ctx, component.menuProductId);

    return true;
  },
});

/**
 * Set all components for a menu product at once.
 * Replaces existing components with new ones.
 */
export const setComponents = mutation({
  args: {
    menuProductId: v.id("menuProducts"),
    components: v.array(
      v.object({
        productionUnitTypeId: v.id("productionUnitTypes"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Validate menu product exists
    const menuProduct = await ctx.db.get(args.menuProductId);
    if (!menuProduct) {
      throw new Error("Menu product not found");
    }

    // Validate all production unit types exist
    for (const component of args.components) {
      const unitType = await ctx.db.get(component.productionUnitTypeId);
      if (!unitType) {
        throw new Error(`Production unit type not found: ${component.productionUnitTypeId}`);
      }
    }

    // Delete existing components
    const existingComponents = await ctx.db
      .query("menuProductComponents")
      .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.menuProductId))
      .collect();

    for (const existing of existingComponents) {
      await ctx.db.delete(existing._id);
    }

    // Create new components
    const createdIds = [];
    for (let i = 0; i < args.components.length; i++) {
      const component = args.components[i];
      const id = await ctx.db.insert("menuProductComponents", {
        menuProductId: args.menuProductId,
        productionUnitTypeId: component.productionUnitTypeId,
        quantity: component.quantity,
        sortOrder: i + 1,
      });
      createdIds.push(id);
    }

    // Update cached production summary on menu product
    await updateCachedProductionSummary(ctx, args.menuProductId);

    return createdIds;
  },
});

/**
 * Helper: Update the cached production summary on a menu product.
 */
async function updateCachedProductionSummary(
  ctx: MutationCtx,
  menuProductId: Id<"menuProducts">
) {
  // Get all components for this menu product
  const components = await ctx.db
    .query("menuProductComponents")
    .withIndex("by_menu_product", (q) => q.eq("menuProductId", menuProductId))
    .collect();

  if (components.length === 0) {
    await ctx.db.patch(menuProductId, { cachedProductionSummary: undefined });
    return;
  }

  // Build summary string
  const summaryParts = await Promise.all(
    components.map(async (component) => {
      const unitType = await ctx.db.get(component.productionUnitTypeId);
      const name = unitType?.name ?? "Unknown";
      return `${component.quantity} ${name}`;
    })
  );

  const summary = summaryParts.join(", ");
  await ctx.db.patch(menuProductId, { cachedProductionSummary: summary });
}

/**
 * Seed components for existing fixed menu products.
 * Run from Convex dashboard Functions tab: menuProductComponents:seedForFixedProducts
 *
 * Maps:
 * - ORIGINAL: 1 BIG_BALL
 * - BITE_SINGLE: 1 MID_BALL
 * - BITE_DOUBLE: 2 MID_BALL
 * - BITE_TRIPLE: 3 MID_BALL
 */
export const seedForFixedProducts = mutation({
  args: {},
  handler: async (ctx) => {
    // Get production unit types
    const bigBall = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_code", (q) => q.eq("code", "BIG_BALL"))
      .first();

    const midBall = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_code", (q) => q.eq("code", "MID_BALL"))
      .first();

    if (!bigBall || !midBall) {
      throw new Error("Production unit types not found. Run productionUnitTypes:seedDefaults first.");
    }

    // Define mappings
    const mappings = [
      { code: "ORIGINAL", components: [{ unitTypeId: bigBall._id, quantity: 1 }] },
      { code: "BITE_SINGLE", components: [{ unitTypeId: midBall._id, quantity: 1 }] },
      { code: "BITE_DOUBLE", components: [{ unitTypeId: midBall._id, quantity: 2 }] },
      { code: "BITE_TRIPLE", components: [{ unitTypeId: midBall._id, quantity: 3 }] },
    ];

    const results = [];

    for (const mapping of mappings) {
      // Get menu product by code
      const menuProduct = await ctx.db
        .query("menuProducts")
        .withIndex("by_code", (q) => q.eq("code", mapping.code))
        .first();

      if (!menuProduct) {
        results.push({ code: mapping.code, action: "skipped", reason: "Menu product not found" });
        continue;
      }

      // Check if components already exist
      const existingComponents = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", menuProduct._id))
        .collect();

      if (existingComponents.length > 0) {
        // Delete existing and recreate
        for (const existing of existingComponents) {
          await ctx.db.delete(existing._id);
        }
      }

      // Create new components
      for (let i = 0; i < mapping.components.length; i++) {
        const component = mapping.components[i];
        await ctx.db.insert("menuProductComponents", {
          menuProductId: menuProduct._id,
          productionUnitTypeId: component.unitTypeId,
          quantity: component.quantity,
          sortOrder: i + 1,
        });
      }

      // Update cached summary
      const summaryParts = mapping.components.map((c) => {
        const name = c.unitTypeId === bigBall._id ? "Big Ball" : "Mid Ball";
        return `${c.quantity} ${name}`;
      });
      await ctx.db.patch(menuProduct._id, {
        cachedProductionSummary: summaryParts.join(", "),
      });

      results.push({
        code: mapping.code,
        action: existingComponents.length > 0 ? "replaced" : "created",
        menuProductId: menuProduct._id,
        componentCount: mapping.components.length,
      });
    }

    return results;
  },
});
