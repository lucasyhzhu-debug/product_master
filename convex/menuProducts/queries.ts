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
 * Excludes packaging-type products (which use packagingPosSlot instead).
 */
export const listPosProducts = query({
  args: {},
  handler: async (ctx) => {
    // Get all products with posSlot defined (1-4)
    const products = await ctx.db
      .query("menuProducts")
      .collect();

    // Filter for products with posSlot (exclude packaging type) and sort by slot
    const posProducts = products
      .filter((p) => p.posSlot !== undefined && p.productType !== "packaging")
      .sort((a, b) => (a.posSlot ?? 0) - (b.posSlot ?? 0));

    return posProducts;
  },
});

/**
 * List available products (not assigned to any POS slot).
 * Returns products without posSlot AND without packagingPosSlot.
 * Renamed from listLegacyProducts in Wave 3 BOM improvements.
 */
export const listAvailableProducts = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db
      .query("menuProducts")
      .collect();

    // Exclude products on either food POS or packaging POS
    return products.filter(
      (p) => p.posSlot === undefined && p.packagingPosSlot === undefined
    );
  },
});

/**
 * @deprecated Use listAvailableProducts instead.
 * Kept for backward compatibility with existing API references.
 */
export const listLegacyProducts = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db
      .query("menuProducts")
      .collect();

    // Same as listAvailableProducts
    return products.filter(
      (p) => p.posSlot === undefined && p.packagingPosSlot === undefined
    );
  },
});

/**
 * List products assigned to packaging POS slots (1-4), sorted by slot.
 * Returns packaging products with packagingPosSlot 1-4 in slot order.
 */
export const listPackagingPosProducts = query({
  args: {},
  handler: async (ctx) => {
    // Get all products with packagingPosSlot defined (1-4)
    const products = await ctx.db
      .query("menuProducts")
      .collect();

    // Filter for products with packagingPosSlot and sort by slot
    const packagingPosProducts = products
      .filter((p) => p.packagingPosSlot !== undefined)
      .sort((a, b) => (a.packagingPosSlot ?? 0) - (b.packagingPosSlot ?? 0));

    return packagingPosProducts;
  },
});
