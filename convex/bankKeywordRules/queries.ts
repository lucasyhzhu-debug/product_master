/**
 * bankKeywordRules queries — admin-only.
 *
 * Both queries gate on `requireRole(ctx, token, ["admin"])` per D-19 — only
 * admins can inspect the classification rule set (rules reveal business taxonomy
 * of counterparties / descriptions, and edits have financial impact).
 *
 * Sort order for `list`: priority DESC, then ruleCode ASC — matches the match
 * engine's evaluation order so the UI reflects true precedence.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireRole } from "../lib/auth";

export const list = query({
  args: {
    token: v.string(),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    const rules = args.includeInactive
      ? await ctx.db.query("bankKeywordRules").collect()
      : await ctx.db
          .query("bankKeywordRules")
          .withIndex("by_active_priority", (q) => q.eq("isActive", true))
          .collect();
    return rules.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.ruleCode.localeCompare(b.ruleCode);
    });
  },
});

export const getById = query({
  args: {
    token: v.string(),
    id: v.id("bankKeywordRules"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    return await ctx.db.get(args.id);
  },
});
