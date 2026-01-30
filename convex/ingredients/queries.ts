import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List all ingredients with optional pagination.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const ingredients = await ctx.db
      .query("ingredients")
      .order("desc")
      .take(limit);
    return ingredients;
  },
});

/**
 * Get a single ingredient by ID.
 */
export const get = query({
  args: { id: v.id("ingredients") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Search ingredients by name or brand.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const searchLower = args.query.toLowerCase();

    // Get all ingredients and filter in memory
    // For production, consider using a search index
    const all = await ctx.db.query("ingredients").collect();

    const filtered = all.filter((ing) => {
      const nameMatch = ing.name.toLowerCase().includes(searchLower);
      const brandMatch = ing.brand?.toLowerCase().includes(searchLower) ?? false;
      return nameMatch || brandMatch;
    });

    return filtered.slice(0, limit);
  },
});
