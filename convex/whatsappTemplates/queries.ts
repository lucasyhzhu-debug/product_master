import { query } from "../_generated/server";
import { v } from "convex/values";
import { listAll } from "../lib/queryHelpers";

/**
 * List all WhatsApp templates.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await listAll(ctx, "whatsappTemplates");
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
