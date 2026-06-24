import { v, ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { protectedMutation } from "../lib/functions";
import { computeLineTotal } from "./creditMath";
import type { PlannedDay } from "./types";
import { computeWeekBounds } from "./weekBounds";
import { makeScheduleLine } from "./scheduleLine";

const DAY_MS = 86400000;

export function buildPlannedDays(args: {
  weekStart: number;
  template: { dayOfWeek: number; items: { menuProductId: Id<"menuProducts">; qty: number }[] }[];
  unitPrice: number;
  deliverByTime: string;
  productNames: Record<Id<"menuProducts">, string>;
}): PlannedDay[] {
  return [...args.template]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((t) => ({
      date: args.weekStart + t.dayOfWeek * DAY_MS,
      deliverByTime: args.deliverByTime,
      locked: false,
      items: t.items.map((it) => ({
        menuProductId: it.menuProductId,
        productName: args.productNames[it.menuProductId] ?? "Unknown",
        qty: it.qty,
        unitPrice: args.unitPrice,
        lineTotal: computeLineTotal(it.qty, args.unitPrice),
      })),
    }));
}

export const seedWeek = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    subscriptionId: v.id("subscriptions"),
    weekStart: v.number(),
    source: v.optional(v.union(v.literal("template"), v.literal("previousWeek"), v.literal("blank"))),
  },
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

    const source = args.source ?? "template";
    const { weekEnd } = computeWeekBounds(args.weekStart);

    let plannedDays: PlannedDay[];

    if (source === "blank") {
      plannedDays = [];
    } else if (source === "previousWeek") {
      const prev = await ctx.db
        .query("subscriptionWeeks")
        .withIndex("by_subscription_weekStart", (q) =>
          q.eq("subscriptionId", args.subscriptionId).lt("weekStart", args.weekStart),
        )
        .order("desc")
        .first();

      if (!prev) {
        // No prior week — fall back to template path.
        const productIds = [...new Set(sub.scheduleTemplate.flatMap((t) => t.items.map((i) => i.menuProductId)))];
        const productNames: Record<Id<"menuProducts">, string> = {};
        const products = await Promise.all(productIds.map((pid) => ctx.db.get(pid)));
        products.forEach((p, i) => {
          if (p) productNames[productIds[i]] = p.name;
        });
        plannedDays = buildPlannedDays({
          weekStart: args.weekStart,
          template: sub.scheduleTemplate,
          unitPrice: sub.unitPrice,
          deliverByTime: sub.deliverByTime,
          productNames,
        });
      } else {
        // Re-date onto the new week by ordinal position; re-price at live unitPrice.
        plannedDays = prev.plannedDays.map((d, i) => ({
          date: args.weekStart + i * DAY_MS,
          deliverByTime: sub.deliverByTime,
          locked: false,
          items: d.items.map((it) =>
            makeScheduleLine(it.menuProductId, it.productName, it.qty, sub.unitPrice),
          ),
        }));
      }
    } else {
      // source === "template" (default)
      const productIds = [...new Set(sub.scheduleTemplate.flatMap((t) => t.items.map((i) => i.menuProductId)))];
      const productNames: Record<Id<"menuProducts">, string> = {};
      const products = await Promise.all(productIds.map((pid) => ctx.db.get(pid)));
      products.forEach((p, i) => {
        if (p) productNames[productIds[i]] = p.name;
      });
      plannedDays = buildPlannedDays({
        weekStart: args.weekStart,
        template: sub.scheduleTemplate,
        unitPrice: sub.unitPrice,
        deliverByTime: sub.deliverByTime,
        productNames,
      });
    }

    return await ctx.db.insert("subscriptionWeeks", {
      subscriptionId: args.subscriptionId,
      weekStart: args.weekStart,
      weekEnd,
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
