import { query } from "../_generated/server";
import { v } from "convex/values";
import { listAll } from "../lib/queryHelpers";
import { normalizePhone, phoneMatches } from "../lib/phone";

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
 * Search customers by name, companyName, or phone/whatsapp/altPhone.
 *
 * Phone matching is digit-normalised so "+62 812-3456", "0812-3456", and
 * "081234..." are treated as one identity. companyName substring matching
 * enables B2B cafe lookups by trading name.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const q = args.query.trim();
    const lower = q.toLowerCase();
    const looksNumeric = normalizePhone(q).length >= 4;
    const all = await ctx.db.query("customers").collect();
    return all
      .filter((c) => {
        if (c.name?.toLowerCase().includes(lower)) return true;
        if (c.companyName?.toLowerCase().includes(lower)) return true;
        if (looksNumeric) {
          return (
            phoneMatches(q, c.phone) ||
            phoneMatches(q, c.whatsapp) ||
            phoneMatches(q, c.altPhone)
          );
        }
        return false;
      })
      .slice(0, args.limit ?? 20);
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
