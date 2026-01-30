import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new menu product.
 */
export const create = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    grams: v.number(),
    defaultPrice: v.number(),
    productionType: v.string(),
    productionUnits: v.number(),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate code
    const existing = await ctx.db
      .query("menuProducts")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (existing) {
      throw new Error(`Menu product with code "${args.code}" already exists`);
    }

    const id = await ctx.db.insert("menuProducts", {
      code: args.code,
      name: args.name,
      grams: args.grams,
      defaultPrice: args.defaultPrice,
      productionType: args.productionType,
      productionUnits: args.productionUnits,
      isActive: args.isActive ?? true,
    });

    return id;
  },
});

/**
 * Update an existing menu product.
 */
export const update = mutation({
  args: {
    id: v.id("menuProducts"),
    code: v.optional(v.string()),
    name: v.optional(v.string()),
    grams: v.optional(v.number()),
    defaultPrice: v.optional(v.number()),
    productionType: v.optional(v.string()),
    productionUnits: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const current = await ctx.db.get(id);
    if (!current) {
      throw new Error("Menu product not found");
    }

    // Check for duplicate code if updating code
    if (updates.code !== undefined && updates.code !== current.code) {
      const newCode = updates.code; // TypeScript narrowing
      const existing = await ctx.db
        .query("menuProducts")
        .withIndex("by_code", (q) => q.eq("code", newCode))
        .first();

      if (existing) {
        throw new Error(`Menu product with code "${newCode}" already exists`);
      }
    }

    // Only include defined updates
    const patchData: Record<string, unknown> = {};
    if (updates.code !== undefined) patchData.code = updates.code;
    if (updates.name !== undefined) patchData.name = updates.name;
    if (updates.grams !== undefined) patchData.grams = updates.grams;
    if (updates.defaultPrice !== undefined) patchData.defaultPrice = updates.defaultPrice;
    if (updates.productionType !== undefined) patchData.productionType = updates.productionType;
    if (updates.productionUnits !== undefined) patchData.productionUnits = updates.productionUnits;
    if (updates.isActive !== undefined) patchData.isActive = updates.isActive;

    await ctx.db.patch(id, patchData);
    return id;
  },
});

/**
 * Delete a menu product.
 */
export const remove = mutation({
  args: { id: v.id("menuProducts") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return true;
  },
});

/**
 * Toggle active status of a menu product.
 */
export const toggleActive = mutation({
  args: { id: v.id("menuProducts") },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current) {
      throw new Error("Menu product not found");
    }

    await ctx.db.patch(args.id, { isActive: !current.isActive });
    return !current.isActive;
  },
});
