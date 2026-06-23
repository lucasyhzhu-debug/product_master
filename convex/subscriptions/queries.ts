import { v } from "convex/values";
import { protectedQuery } from "../lib/functions";
import { deriveCreditPool } from "./creditMath";

export const listSubscriptions = protectedQuery({
  roles: ["manager", "admin"],
  args: { customerId: v.optional(v.id("customers")) },
  handler: async (ctx, args) => {
    if (args.customerId) {
      return await ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .collect();
    }
    return await ctx.db.query("subscriptions").collect();
  },
});

export const getSubscription = protectedQuery({
  roles: ["manager", "admin"],
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => await ctx.db.get(args.subscriptionId),
});

export const getWeekPool = protectedQuery({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) return null;
    const entries = await ctx.db
      .query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId))
      .collect();
    return { week, pool: deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount }))), entries };
  },
});
