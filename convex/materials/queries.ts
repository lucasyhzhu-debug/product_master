import { query } from "../_generated/server";
import { v } from "convex/values";
import { listAll, textSearch } from "../lib/queryHelpers";

/**
 * List all packaging materials with optional pagination.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await listAll(ctx, "packagingMaterials", { limit: args.limit ?? 100 });
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
    return await textSearch(ctx, "packagingMaterials", args.query, ["name", "brand"], args.limit ?? 20);
  },
});
