import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List all menu products.
 */
export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.activeOnly) {
      return await ctx.db
        .query("menuProducts")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    return await ctx.db.query("menuProducts").collect();
  },
});

/**
 * Get a single menu product by ID.
 */
export const get = query({
  args: { id: v.id("menuProducts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get a menu product by code.
 */
export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuProducts")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});

/**
 * PRD-8: List products assigned to POS slots (1-4), sorted by slot.
 * Returns products with posSlot 1-4 in slot order.
 */
export const listPosProducts = query({
  args: {},
  handler: async (ctx) => {
    // Get all products with posSlot defined (1-4)
    const products = await ctx.db
      .query("menuProducts")
      .collect();

    // Filter for products with posSlot and sort by slot
    const posProducts = products
      .filter((p) => p.posSlot !== undefined)
      .sort((a, b) => (a.posSlot ?? 0) - (b.posSlot ?? 0));

    return posProducts;
  },
});

/**
 * PRD-8: List legacy products (not on POS).
 * Returns products with posSlot null/undefined.
 */
export const listLegacyProducts = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db
      .query("menuProducts")
      .collect();

    // Filter for products without posSlot
    const legacyProducts = products.filter((p) => p.posSlot === undefined);

    return legacyProducts;
  },
});
