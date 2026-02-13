import { query } from "../_generated/server";
import { v } from "convex/values";
import { listAll, textSearch } from "../lib/queryHelpers";

/**
 * List all ingredients with optional pagination.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await listAll(ctx, "ingredients", { limit: args.limit ?? 100 });
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
    return await textSearch(ctx, "ingredients", args.query, ["name", "brand"], args.limit ?? 20);
  },
});
