import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List all WhatsApp templates.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("whatsappTemplates").collect();
  },
});

/**
 * Get a template by its code.
 */
export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("whatsappTemplates")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});
