import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { requireRole } from "../lib/auth";

// Source validator reused across functions
const sourceValidator = v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal"));

// ─── INTERNAL MUTATIONS (called by platform adapter actions) ───

export const saveSnapshots = internalMutation({
  args: {
    outletId: v.id("externalOutlets"),
    snapshotBatchId: v.string(),
    snapshotAt: v.number(),
    products: v.array(v.object({
      externalProductId: v.string(),
      externalProductCode: v.string(),
      productName: v.string(),
      quantity: v.number(),
      price: v.number(),
      priceGrabfoodGofood: v.optional(v.number()),
      priceGrabmart: v.optional(v.number()),
      priceShopee: v.optional(v.number()),
      capital: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const product of args.products) {
      const id = await ctx.db.insert("externalStockSnapshots", {
        outletId: args.outletId,
        snapshotBatchId: args.snapshotBatchId,
        snapshotAt: args.snapshotAt,
        ...product,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const saveRevenue = internalMutation({
  args: {
    records: v.array(v.object({
      outletId: v.optional(v.id("externalOutlets")),
      source: sourceValidator,
      externalProductCode: v.optional(v.string()),
      productName: v.optional(v.string()),
      quantitySold: v.optional(v.number()),
      transactionCount: v.optional(v.number()),
      revenueGross: v.optional(v.number()),
      revenueNet: v.optional(v.number()),
      costOfGoods: v.optional(v.number()),
      periodStart: v.number(),
      periodEnd: v.number(),
      dataOrigin: v.union(
        v.literal("stock_delta"),
        v.literal("api_revenue"),
        v.literal("manual_entry"),
        v.literal("csv_upload"),
        v.literal("db_query")
      ),
      confidence: v.union(
        v.literal("exact"),
        v.literal("inferred"),
        v.literal("manual")
      ),
      syncLogId: v.optional(v.id("externalSyncLogs")),
      linkedMenuProductId: v.optional(v.id("menuProducts")),
      externalTransactionId: v.optional(v.string()),
      transactionDate: v.optional(v.number()),
      transactionType: v.optional(v.union(
        v.literal("sales"),
        v.literal("return"),
        v.literal("delta_inferred")
      )),
      commission: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const record of args.records) {
      // Dedup: skip if transaction already exists
      if (record.externalTransactionId) {
        const existing = await ctx.db
          .query("externalRevenue")
          .withIndex("by_source_txn", (q) =>
            q.eq("source", record.source)
             .eq("externalTransactionId", record.externalTransactionId)
          )
          .unique();
        if (existing) continue;
      }
      const id = await ctx.db.insert("externalRevenue", record);
      ids.push(id);
    }
    return ids;
  },
});

export const createSyncLog = internalMutation({
  args: {
    source: sourceValidator,
    outletId: v.optional(v.id("externalOutlets")),
    snapshotBatchId: v.optional(v.string()),
    syncType: v.union(v.literal("manual")),
    status: v.union(
      v.literal("started"), v.literal("success"), v.literal("error")
    ),
    productsCount: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    triggeredBy: v.optional(v.string()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("externalSyncLogs", args);
  },
});

export const updateSyncLog = internalMutation({
  args: {
    logId: v.id("externalSyncLogs"),
    status: v.union(
      v.literal("started"), v.literal("success"), v.literal("error")
    ),
    productsCount: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { logId, ...updates } = args;
    await ctx.db.patch(logId, updates);
  },
});

export const updateOutletSyncStatus = internalMutation({
  args: {
    outletId: v.id("externalOutlets"),
    lastSyncAt: v.number(),
    lastSyncStatus: v.union(
      v.literal("success"), v.literal("error"), v.literal("partial")
    ),
    lastSyncError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { outletId, ...updates } = args;
    await ctx.db.patch(outletId, updates);
  },
});

export const saveProductMappings = internalMutation({
  args: {
    mappings: v.array(v.object({
      source: sourceValidator,
      externalProductCode: v.string(),
      externalProductName: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    for (const mapping of args.mappings) {
      // Upsert: check if mapping already exists
      const existing = await ctx.db
        .query("externalProductMappings")
        .withIndex("by_source_code", (q) =>
          q.eq("source", mapping.source).eq("externalProductCode", mapping.externalProductCode)
        )
        .unique();

      if (!existing) {
        await ctx.db.insert("externalProductMappings", {
          ...mapping,
          isAutoMapped: false,
          createdAt: Date.now(),
        });
      } else if (existing.externalProductName !== mapping.externalProductName) {
        // Update name if changed
        await ctx.db.patch(existing._id, {
          externalProductName: mapping.externalProductName,
        });
      }
    }
  },
});

export const internalUpsertOutlet = internalMutation({
  args: {
    source: sourceValidator,
    externalId: v.string(),
    name: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source_external_id", (q) =>
        q.eq("source", args.source).eq("externalId", args.externalId)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name, isActive: args.isActive });
      return existing._id;
    }
    return await ctx.db.insert("externalOutlets", {
      ...args,
      createdBy: "system",
      createdAt: Date.now(),
    });
  },
});

// ─── PUBLIC MUTATIONS (called from frontend) ───

export const upsertOutlet = mutation({
  args: {
    token: v.string(),
    source: sourceValidator,
    externalId: v.string(),
    name: v.string(),
    address: v.optional(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const existing = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source_external_id", (q) =>
        q.eq("source", args.source).eq("externalId", args.externalId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        address: args.address,
        isActive: args.isActive,
      });
      return existing._id;
    }

    return await ctx.db.insert("externalOutlets", {
      source: args.source,
      externalId: args.externalId,
      name: args.name,
      address: args.address,
      isActive: args.isActive,
      createdBy: "admin",
      createdAt: Date.now(),
    });
  },
});

export const toggleOutletActive = mutation({
  args: {
    token: v.string(),
    outletId: v.id("externalOutlets"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);
    await ctx.db.patch(args.outletId, { isActive: args.isActive });
  },
});

export const linkProductMapping = mutation({
  args: {
    token: v.string(),
    mappingId: v.id("externalProductMappings"),
    menuProductId: v.optional(v.id("menuProducts")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);
    await ctx.db.patch(args.mappingId, { menuProductId: args.menuProductId });
  },
});
