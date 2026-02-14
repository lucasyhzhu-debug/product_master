import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new production unit type.
 */
export const create = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    gramsPerUnit: v.number(),
    unitCostIdr: v.number(),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate code
    const existing = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (existing) {
      throw new Error(`Production unit type with code "${args.code}" already exists`);
    }

    // Get max sortOrder if not provided
    let sortOrder = args.sortOrder;
    if (sortOrder === undefined) {
      const allTypes = await ctx.db.query("productionUnitTypes").collect();
      const maxSortOrder = allTypes.reduce((max, t) => Math.max(max, t.sortOrder), 0);
      sortOrder = maxSortOrder + 1;
    }

    const id = await ctx.db.insert("productionUnitTypes", {
      code: args.code,
      name: args.name,
      gramsPerUnit: args.gramsPerUnit,
      unitCostIdr: args.unitCostIdr,
      color: args.color ?? "#93C572",
      sortOrder,
      isActive: args.isActive ?? true,
    });

    return id;
  },
});

/**
 * Update an existing production unit type.
 */
export const update = mutation({
  args: {
    id: v.id("productionUnitTypes"),
    code: v.optional(v.string()),
    name: v.optional(v.string()),
    gramsPerUnit: v.optional(v.number()),
    unitCostIdr: v.optional(v.number()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const current = await ctx.db.get(id);
    if (!current) {
      throw new Error("Production unit type not found");
    }

    // Check for duplicate code if updating code
    if (updates.code !== undefined && updates.code !== current.code) {
      const existing = await ctx.db
        .query("productionUnitTypes")
        .withIndex("by_code", (q) => q.eq("code", updates.code!))
        .first();

      if (existing) {
        throw new Error(`Production unit type with code "${updates.code}" already exists`);
      }
    }

    // Only include defined updates
    const patchData: Record<string, unknown> = {};
    if (updates.code !== undefined) patchData.code = updates.code;
    if (updates.name !== undefined) patchData.name = updates.name;
    if (updates.gramsPerUnit !== undefined) patchData.gramsPerUnit = updates.gramsPerUnit;
    if (updates.unitCostIdr !== undefined) patchData.unitCostIdr = updates.unitCostIdr;
    if (updates.color !== undefined) patchData.color = updates.color;
    if (updates.sortOrder !== undefined) patchData.sortOrder = updates.sortOrder;
    if (updates.isActive !== undefined) patchData.isActive = updates.isActive;

    await ctx.db.patch(id, patchData);
    return id;
  },
});

/**
 * Toggle active status of a production unit type.
 */
export const toggleActive = mutation({
  args: { id: v.id("productionUnitTypes") },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current) {
      throw new Error("Production unit type not found");
    }

    await ctx.db.patch(args.id, { isActive: !current.isActive });
    return !current.isActive;
  },
});

/**
 * Delete a production unit type.
 * Will fail if referenced by menu product components or order item production.
 */
export const remove = mutation({
  args: { id: v.id("productionUnitTypes") },
  handler: async (ctx, args) => {
    // Check if used in order item production
    const allOrderProduction = await ctx.db.query("orderItemProduction").collect();
    const orderProduction = allOrderProduction.find(
      (p) => p.productionUnitTypeId === args.id
    );

    if (orderProduction) {
      throw new Error("Cannot delete: Production unit type is used in order production records");
    }

    await ctx.db.delete(args.id);
    return true;
  },
});

/**
 * Seed default production unit types.
 * Run from Convex dashboard Functions tab: productionUnitTypes:seedDefaults
 *
 * Default types:
 * - BIG_BALL: 80g, Rp 19,231 (red)
 * - MID_BALL: 45g, Rp 12,422 (yellow)
 */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const defaultTypes = [
      {
        code: "BIG_BALL",
        name: "Big Ball",
        gramsPerUnit: 80,
        unitCostIdr: 19231,
        color: "#EF4444", // red
        sortOrder: 1,
        isActive: true,
      },
      {
        code: "MID_BALL",
        name: "Mid Ball",
        gramsPerUnit: 45,
        unitCostIdr: 12422,
        color: "#EAB308", // yellow
        sortOrder: 2,
        isActive: true,
      },
    ];

    const results = [];

    for (const unitType of defaultTypes) {
      // Check if already exists
      const existing = await ctx.db
        .query("productionUnitTypes")
        .withIndex("by_code", (q) => q.eq("code", unitType.code))
        .first();

      if (existing) {
        // Update existing
        await ctx.db.patch(existing._id, {
          name: unitType.name,
          gramsPerUnit: unitType.gramsPerUnit,
          unitCostIdr: unitType.unitCostIdr,
          color: unitType.color,
          sortOrder: unitType.sortOrder,
          isActive: unitType.isActive,
        });
        results.push({ code: unitType.code, action: "updated", id: existing._id });
      } else {
        // Create new
        const id = await ctx.db.insert("productionUnitTypes", unitType);
        results.push({ code: unitType.code, action: "created", id });
      }
    }

    return results;
  },
});
