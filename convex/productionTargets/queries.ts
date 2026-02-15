/**
 * Production Targets Queries
 *
 * Three sources of production targets:
 * 1. Orders (auto-calculated from active orders due today/tomorrow)
 * 2. Consignment (manual per-product targets for K3 Mart / retail)
 * 3. GoFood (manual per-product targets for GoFood / online)
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get all production targets for a specific date.
 * Returns raw target records for the given date.
 */
export const getByDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productionTargets")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();
  },
});

/**
 * Get production summary: targets enriched with unit type info and effective totals.
 */
export const getProductionSummary = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const targets = await ctx.db
      .query("productionTargets")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    // Enrich with production unit type info
    const enriched = await Promise.all(
      targets.map(async (target) => {
        const unitType = await ctx.db.get(target.productionUnitTypeId);
        return {
          ...target,
          unitTypeName: unitType?.name ?? "Unknown",
          unitTypeCode: unitType?.code ?? "UNKNOWN",
          effectiveTarget:
            target.autoTargetQuantity + (target.manualOverride ?? 0),
        };
      })
    );

    return enriched;
  },
});

/**
 * Get per-product manual targets for a specific date, grouped by source.
 * Returns { menuProductId, source, quantity }[] for consignment and gofood.
 */
export const getProductTargets = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const targets = await ctx.db
      .query("productionProductTargets")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    return targets.map((t) => ({
      menuProductId: t.menuProductId,
      source: t.source,
      quantity: t.quantity,
    }));
  },
});

/**
 * Get per-product demand from active orders due today and tomorrow.
 * Scans Confirmed + InProduction orders with dueDate in the 2-day window.
 * Returns per-product quantities (read-only, auto-calculated).
 */
export const getOrderProductDemand = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    // Compute timestamp range: start of today → end of tomorrow (UTC)
    const todayStart = new Date(args.date + "T00:00:00Z").getTime();
    const dayAfterTomorrow = todayStart + 2 * 24 * 60 * 60 * 1000;

    // Query active orders by status, then filter by dueDate range
    const statuses = ["PaymentReceived", "BeingPrepared"] as const;
    const allOrders = [];

    for (const status of statuses) {
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      allOrders.push(...orders);
    }

    // Filter to orders due today or tomorrow
    const relevantOrders = allOrders.filter(
      (o) =>
        o.dueDate !== undefined &&
        o.dueDate >= todayStart &&
        o.dueDate < dayAfterTomorrow
    );

    // Aggregate product demand
    const demandMap = new Map<
      string,
      { menuProductId: string; quantity: number }
    >();

    for (const order of relevantOrders) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      for (const item of items) {
        if (!item.menuProductId || item.isCancelled) continue;
        const existing = demandMap.get(item.menuProductId);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          demandMap.set(item.menuProductId, {
            menuProductId: item.menuProductId,
            quantity: item.quantity,
          });
        }
      }
    }

    return Array.from(demandMap.values());
  },
});
