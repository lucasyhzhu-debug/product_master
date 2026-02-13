import { query } from "../_generated/server";
import { v } from "convex/values";
import { listAll } from "../lib/queryHelpers";

/**
 * List all tags (ascending order).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await listAll(ctx, "tags", { order: "asc", limit: 1000 });
  },
});

/**
 * Get a single tag by ID.
 */
export const get = query({
  args: { id: v.id("tags") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get multiple tags by IDs.
 */
export const getMany = query({
  args: { ids: v.array(v.id("tags")) },
  handler: async (ctx, args) => {
    const tags = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return tags.filter((t) => t !== null);
  },
});
