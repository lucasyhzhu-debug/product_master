import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";

const sourceValidator = v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal"));

// ─── INTERNAL QUERIES (called by platform adapter actions) ───

export const getActiveOutlets = internalQuery({
  args: { source: sourceValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", args.source))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

export const getLatestSnapshotBatch = internalQuery({
  args: { outletId: v.id("externalOutlets") },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("externalStockSnapshots")
      .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", args.outletId))
      .order("desc")
      .first();

    if (!latest) return null;

    // Get all products from this batch
    return await ctx.db
      .query("externalStockSnapshots")
      .withIndex("by_batch", (q) => q.eq("snapshotBatchId", latest.snapshotBatchId))
      .collect();
  },
});

export const getLatestSyncTimestamp = internalQuery({
  args: { source: sourceValidator },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", args.source))
      .filter((q) => q.eq(q.field("status"), "success"))
      .order("desc")
      .first();
    return latest?.timestamp ?? null;
  },
});

export const getOutletNameToIdMap = internalQuery({
  args: { source: sourceValidator },
  handler: async (ctx, args) => {
    const outlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", args.source))
      .collect();
    const map: Record<string, string> = {};
    for (const outlet of outlets) {
      map[outlet.name] = outlet._id;
    }
    return map;
  },
});

// ─── PUBLIC QUERIES (called from frontend) ───

export const listOutlets = query({
  args: {
    source: v.optional(sourceValidator),
  },
  handler: async (ctx, args) => {
    if (args.source) {
      return await ctx.db
        .query("externalOutlets")
        .withIndex("by_source", (q) => q.eq("source", args.source!))
        .collect();
    }
    return await ctx.db.query("externalOutlets").collect();
  },
});

export const getLatestSnapshots = query({
  args: {
    outletId: v.id("externalOutlets"),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("externalStockSnapshots")
      .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", args.outletId))
      .order("desc")
      .first();

    if (!latest) return [];

    return await ctx.db
      .query("externalStockSnapshots")
      .withIndex("by_batch", (q) => q.eq("snapshotBatchId", latest.snapshotBatchId))
      .collect();
  },
});

export const getRevenue = query({
  args: {
    source: v.optional(sourceValidator),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q;
    if (args.source && args.periodStart) {
      q = ctx.db
        .query("externalRevenue")
        .withIndex("by_source_period", (idx) =>
          idx.eq("source", args.source!).gte("periodStart", args.periodStart!)
        )
        .order("desc");
    } else if (args.source) {
      q = ctx.db
        .query("externalRevenue")
        .withIndex("by_source", (idx) => idx.eq("source", args.source!))
        .order("desc");
    } else {
      q = ctx.db.query("externalRevenue").withIndex("by_period").order("desc");
    }

    let results = await q.collect();

    if (args.periodEnd) {
      results = results.filter((r) => r.periodEnd <= args.periodEnd!);
    }

    return results;
  },
});

export const getSyncLogs = query({
  args: {
    source: v.optional(sourceValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.source) {
      return await ctx.db
        .query("externalSyncLogs")
        .withIndex("by_source", (q) => q.eq("source", args.source!))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit);
  },
});

export const getProductMappings = query({
  args: {
    source: v.optional(sourceValidator),
  },
  handler: async (ctx, args) => {
    if (args.source) {
      return await ctx.db
        .query("externalProductMappings")
        .withIndex("by_source_code", (q) => q.eq("source", args.source!))
        .collect();
    }
    return await ctx.db.query("externalProductMappings").collect();
  },
});

export const getDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    // Get all outlets grouped by source
    const outlets = await ctx.db.query("externalOutlets").collect();

    // Get latest sync logs per source
    const k3martLogs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .order("desc")
      .take(1);

    const gobizLogs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "gobiz"))
      .order("desc")
      .take(1);

    const internalLogs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "internal"))
      .order("desc")
      .take(1);

    // Get recent revenue (last 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_period")
      .filter((q) => q.gte(q.field("periodStart"), oneDayAgo))
      .collect();

    const totalGross = recentRevenue.reduce((sum, r) => sum + (r.revenueGross ?? 0), 0);
    const totalNet = recentRevenue.reduce((sum, r) => sum + (r.revenueNet ?? 0), 0);
    const totalTransactions = recentRevenue.reduce((sum, r) => sum + (r.transactionCount ?? 0), 0);

    return {
      platforms: {
        k3mart: {
          outletCount: outlets.filter((o) => o.source === "k3mart").length,
          activeOutlets: outlets.filter((o) => o.source === "k3mart" && o.isActive).length,
          lastSync: k3martLogs[0] ?? null,
        },
        gobiz: {
          outletCount: outlets.filter((o) => o.source === "gobiz").length,
          activeOutlets: outlets.filter((o) => o.source === "gobiz" && o.isActive).length,
          lastSync: gobizLogs[0] ?? null,
        },
        internal: {
          outletCount: 0,
          activeOutlets: 0,
          lastSync: internalLogs[0] ?? null,
        },
      },
      recentRevenue: {
        totalGross,
        totalNet,
        totalTransactions,
        periodLabel: "Last 24 hours",
      },
    };
  },
});
