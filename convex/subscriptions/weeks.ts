import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
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

/** Resolve product names from the subscription's scheduleTemplate and call buildPlannedDays. */
async function seedFromTemplate(
  ctx: MutationCtx,
  sub: Doc<"subscriptions">,
  weekStart: number,
): Promise<PlannedDay[]> {
  const productIds = [...new Set(sub.scheduleTemplate.flatMap((t) => t.items.map((i) => i.menuProductId)))];
  const productNames: Record<Id<"menuProducts">, string> = {};
  const products = await Promise.all(productIds.map((pid) => ctx.db.get(pid)));
  products.forEach((p, i) => {
    if (p) productNames[productIds[i]] = p.name;
  });
  return buildPlannedDays({
    weekStart,
    template: sub.scheduleTemplate,
    unitPrice: sub.unitPrice,
    deliverByTime: sub.deliverByTime,
    productNames,
  });
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
        plannedDays = await seedFromTemplate(ctx, sub, args.weekStart);
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
      plannedDays = await seedFromTemplate(ctx, sub, args.weekStart);
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

/**
 * saveWeekPlan — persist calendar edits for a planned week.
 *
 * args.days: one entry per day the caller wants to plan (days with no lines can be
 * omitted — they will be stored as empty PlannedDay rows; pass them all if you want
 * exact placement).  Each entry carries the day's epoch-ms date so we can derive
 * dayIndex = (date - weekStart) / DAY_MS, matching the client's LocalWeekPlan indexing.
 *
 * Price source: sub.unitPrice — same flat price seedWeek uses per makeScheduleLine.
 * productName: resolved via menuProducts lookup, same as buildPlannedDays.
 * deliverByTime: preserved from the existing week row (sub.deliverByTime fallback).
 * locked: preserved per-day from the existing PlannedDay if it exists, else false.
 *
 * Guard: only "planned" weeks are editable. Confirmed / invoiced / delivering / etc.
 * are locked server-side regardless of client state.
 *
 * Idempotent: calling with the same data twice produces the same result.
 */
export const saveWeekPlan = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    subscriptionWeekId: v.id("subscriptionWeeks"),
    days: v.array(
      v.object({
        date: v.number(),
        items: v.array(
          v.object({
            menuProductId: v.id("menuProducts"),
            qty: v.number(),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Subscription week not found");

    // Editable guard: only "planned" weeks may be modified.
    if (week.status !== "planned") {
      throw new ConvexError(
        `Week is "${week.status}" and can no longer be edited. Only planned weeks accept plan changes.`,
      );
    }

    const sub = await ctx.db.get(week.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");

    // Validate dates: each day must fall within [weekStart, weekEnd] and be unique.
    const seenDates = new Set<number>();
    for (const day of args.days) {
      if (day.date < week.weekStart || day.date > week.weekEnd) {
        throw new ConvexError(
          `Day date ${day.date} is outside the week range [${week.weekStart}, ${week.weekEnd}]`,
        );
      }
      if (seenDates.has(day.date)) {
        throw new ConvexError(`Duplicate day date ${day.date} in submitted plan`);
      }
      seenDates.add(day.date);
    }

    // Validate items: qty must be a positive integer.
    for (const day of args.days) {
      for (const it of day.items) {
        if (!Number.isInteger(it.qty) || it.qty <= 0) {
          throw new ConvexError(
            `qty must be a positive integer (date ${day.date}, product ${it.menuProductId})`,
          );
        }
      }
    }

    // Collect all distinct menuProductIds for a single-pass lookup.
    const productIdSet = new Set<Id<"menuProducts">>();
    for (const day of args.days) {
      for (const it of day.items) productIdSet.add(it.menuProductId);
    }
    const productRows = await Promise.all([...productIdSet].map((pid) => ctx.db.get(pid)));
    const productNames: Record<string, string> = {};
    for (const p of productRows) {
      if (p) productNames[p._id] = p.name;
    }

    // Build a lookup from existing plannedDays to preserve deliverByTime and locked.
    const existingByDate: Record<number, PlannedDay> = {};
    for (const d of week.plannedDays) existingByDate[d.date] = d;

    // Rebuild plannedDays from args.days, sorted by date ascending.
    const sortedDays = [...args.days].sort((a, b) => a.date - b.date);
    const plannedDays: PlannedDay[] = sortedDays.map((d) => {
      const existing = existingByDate[d.date];
      return {
        date: d.date,
        deliverByTime: existing?.deliverByTime ?? sub.deliverByTime,
        locked: existing?.locked ?? false,
        items: d.items.map((it) =>
          makeScheduleLine(
            it.menuProductId,
            productNames[it.menuProductId] ?? "Unknown",
            it.qty,
            sub.unitPrice, // flat partner price — same source as seedWeek / buildPlannedDays
          ),
        ),
      };
    });

    await ctx.db.patch(args.subscriptionWeekId, { plannedDays });
  },
});
