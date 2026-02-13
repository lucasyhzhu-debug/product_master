import { query } from "../_generated/server";
import { v } from "convex/values";
import { listAll, textSearch } from "../lib/queryHelpers";

/**
 * List all customers.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await listAll(ctx, "customers", { limit: args.limit ?? 100 });
  },
});

/**
 * Get a single customer by ID.
 */
export const get = query({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Search customers by name or phone.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await textSearch(ctx, "customers", args.query, ["name", "phone"], args.limit ?? 20);
  },
});

/**
 * Get customer by phone number.
 */
export const getByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customers")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
  },
});
