import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List all packaging materials with optional pagination.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const materials = await ctx.db
      .query("packagingMaterials")
      .order("desc")
      .take(limit);
    return materials;
  },
});

/**
 * Get a single packaging material by ID.
 */
export const get = query({
  args: { id: v.id("packagingMaterials") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Search packaging materials by name or brand.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const searchLower = args.query.toLowerCase();

    const all = await ctx.db.query("packagingMaterials").collect();

    const filtered = all.filter((mat) => {
      const nameMatch = mat.name.toLowerCase().includes(searchLower);
      const brandMatch = mat.brand?.toLowerCase().includes(searchLower) ?? false;
      return nameMatch || brandMatch;
    });

    return filtered.slice(0, limit);
  },
});
