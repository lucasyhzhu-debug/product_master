import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { protectedMutation } from "../lib/functions";
import { computeLineTotal } from "./creditMath";
import type { PlannedDay } from "./types";

const DAY_MS = 86400000;

export function buildPlannedDays(args: {
  weekStart: number;
  template: { dayOfWeek: number; items: { menuProductId: Id<"menuProducts">; qty: number }[] }[];
  unitPrice: number;
  deliverByTime: string;
  productNames: Record<string, string>;
}): PlannedDay[] {
  return [...args.template]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((t) => ({
      date: args.weekStart + t.dayOfWeek * DAY_MS,
      deliverByTime: args.deliverByTime,
      locked: false,
      items: t.items.map((it) => ({
        menuProductId: it.menuProductId,
        productName: args.productNames[it.menuProductId as unknown as string] ?? "Unknown",
        qty: it.qty,
        unitPrice: args.unitPrice,
        lineTotal: computeLineTotal(it.qty, args.unitPrice),
      })),
    }));
}

export const seedWeek = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionId: v.id("subscriptions"), weekStart: v.number() },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");

    // Idempotency: one week row per (subscription, weekStart).
    const existing = await ctx.db
      .query("subscriptionWeeks")
      .withIndex("by_subscription_weekStart", (q) =>
        q.eq("subscriptionId", args.subscriptionId).eq("weekStart", args.weekStart),
      )
      .first();
    if (existing) return existing._id;

    const productIds = [...new Set(sub.scheduleTemplate.flatMap((t) => t.items.map((i) => i.menuProductId)))];
    const productNames: Record<string, string> = {};
    for (const pid of productIds) {
      const p = await ctx.db.get(pid);
      if (p) productNames[pid as unknown as string] = p.name;
    }

    const plannedDays = buildPlannedDays({
      weekStart: args.weekStart,
      template: sub.scheduleTemplate,
      unitPrice: sub.unitPrice,
      deliverByTime: sub.deliverByTime,
      productNames,
    });

    return await ctx.db.insert("subscriptionWeeks", {
      subscriptionId: args.subscriptionId,
      weekStart: args.weekStart,
      weekEnd: args.weekStart + 7 * DAY_MS - 1,
      status: "planned",
      plannedDays,
      creditIssued: 0,
      creditConsumed: 0,
      creditRemaining: 0,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    });
  },
});
