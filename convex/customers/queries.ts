import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List all customers.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const customers = await ctx.db
      .query("customers")
      .order("desc")
      .take(limit);
    return customers;
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
    const limit = args.limit ?? 20;
    const searchLower = args.query.toLowerCase();

    const all = await ctx.db.query("customers").collect();

    const filtered = all.filter((customer) => {
      const nameMatch = customer.name.toLowerCase().includes(searchLower);
      const phoneMatch =
        customer.phone?.toLowerCase().includes(searchLower) ?? false;
      return nameMatch || phoneMatch;
    });

    return filtered.slice(0, limit);
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
