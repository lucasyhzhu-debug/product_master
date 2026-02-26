import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireRole } from "../lib/auth";

/**
 * List GrabFood orders with optional outlet and date range filters.
 * Orders returned in descending time order (newest first).
 */
export const listOrders = query({
  args: {
    token: v.string(),
    outletId: v.optional(v.id("externalOutlets")),
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    const maxResults = args.limit ?? 100;

    let q;
    if (args.outletId) {
      q = ctx.db
        .query("grabfoodOrders")
        .withIndex("by_outlet", (idx) => idx.eq("outletId", args.outletId));
    } else {
      q = ctx.db
        .query("grabfoodOrders")
        .withIndex("by_time");
    }

    // Collect all then filter + sort in memory
    // (Convex index queries don't support arbitrary range filtering inline)
    const allOrders = await q.order("desc").collect();

    let filtered = allOrders;
    if (args.fromMs) {
      filtered = filtered.filter((o) => o.orderTimeMs >= args.fromMs!);
    }
    if (args.toMs) {
      filtered = filtered.filter((o) => o.orderTimeMs <= args.toMs!);
    }

    return filtered.slice(0, maxResults);
  },
});

/**
 * Get aggregate stats for GrabFood orders.
 * Returns total count and last sync timestamp.
 */
export const getOrderStats = query({
  args: {
    token: v.string(),
    outletId: v.optional(v.id("externalOutlets")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    let q;
    if (args.outletId) {
      q = ctx.db
        .query("grabfoodOrders")
        .withIndex("by_outlet", (idx) => idx.eq("outletId", args.outletId));
    } else {
      q = ctx.db.query("grabfoodOrders");
    }

    const orders = await q.collect();
    const totalOrders = orders.length;

    // Find the most recent createdAt (last sync time)
    let lastSyncedAt: number | null = null;
    for (const order of orders) {
      if (!lastSyncedAt || order.createdAt > lastSyncedAt) {
        lastSyncedAt = order.createdAt;
      }
    }

    return { totalOrders, lastSyncedAt };
  },
});
