import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, internalMutation, type MutationCtx } from "../_generated/server";
import { requireRole } from "../lib/auth";
import { externalSource, syncType } from "../schema";
import { dominantSku } from "../integrations/bigseller/helpers";

type ExternalSource = Infer<typeof externalSource>;

// Source validator reused across functions (uses shared externalSource from schema for consistency)
const sourceValidator = externalSource;

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
      adBurn: v.optional(v.number()),
      promoBurn: v.optional(v.number()),
      deliveryFees: v.optional(v.number()),
      gobizOrderNumber: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const results: Array<{ id: string; isNew: boolean }> = [];
    for (const record of args.records) {
      // Upsert: update if transaction already exists, insert if new
      if (record.externalTransactionId) {
        const existing = await ctx.db
          .query("externalRevenue")
          .withIndex("by_source_txn", (q) =>
            q.eq("source", record.source)
             .eq("externalTransactionId", record.externalTransactionId)
          )
          .unique();
        if (existing) {
          // Update revenue fields from re-sync (e.g. corrected gross/net/commission)
          // Preserve linkedMenuProductId and outletId from existing record
          await ctx.db.patch(existing._id, {
            revenueGross: record.revenueGross,
            revenueNet: record.revenueNet,
            commission: record.commission,
            adBurn: record.adBurn,
            promoBurn: record.promoBurn,
            deliveryFees: record.deliveryFees,
            transactionCount: record.transactionCount,
            periodStart: record.periodStart,
            periodEnd: record.periodEnd,
            transactionDate: record.transactionDate,
            syncLogId: record.syncLogId,
          });
          results.push({ id: existing._id, isNew: false });
          continue;
        }
      }
      const id = await ctx.db.insert("externalRevenue", record);
      results.push({ id, isNew: true });
    }
    return results;
  },
});

export const createSyncLog = internalMutation({
  args: {
    source: sourceValidator,
    outletId: v.optional(v.id("externalOutlets")),
    snapshotBatchId: v.optional(v.string()),
    syncType: syncType,
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

// ─── MIGRATION MUTATIONS (one-time, run from Convex dashboard) ───

/**
 * Fix internal revenue records: update revenueGross/revenueNet from real order data.
 * Run once to correct historical data where gross=finalTotal and net=totalMargin.
 * Safe to run multiple times (idempotent).
 */
export const fixInternalRevenueValues = internalMutation({
  args: {},
  handler: async (ctx) => {
    const internalRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source", (q) => q.eq("source", "internal"))
      .collect();

    let fixed = 0;
    let skipped = 0;
    let notFound = 0;

    for (const rev of internalRevenue) {
      if (!rev.externalTransactionId) { skipped++; continue; }

      const order = await ctx.db
        .query("orders")
        .withIndex("by_order_number", (q) => q.eq("orderNumber", rev.externalTransactionId!))
        .first();

      if (!order) { notFound++; continue; }

      const correctGross = order.totalAmount;
      const correctNet = order.finalTotal ?? order.totalAmount;

      if (rev.revenueGross !== correctGross || rev.revenueNet !== correctNet) {
        await ctx.db.patch(rev._id, {
          revenueGross: correctGross,
          revenueNet: correctNet,
        });
        fixed++;
      } else {
        skipped++;
      }
    }

    return { total: internalRevenue.length, fixed, skipped, notFound };
  },
});

/**
 * Seed/update K3Mart outlets with real location names.
 * Run BEFORE backfillRevenueOutletIds.
 * Safe to run multiple times (upserts by source + externalId).
 */
export const seedK3MartOutletNames = internalMutation({
  args: {},
  handler: async (ctx) => {
    const outlets: Record<string, string> = {
      "44": "JKT-SCBD",
      "45": "JKT-GADING SERPONG",
      "47": "JKT-BINTARO",
      "48": "JKT-KOTA KASABLANKA",
      "57": "JKT-LIPPO PURI",
      "78": "JKT-LM NUSANTARA",
      "81": "JKT-TAMTEM",
    };
    let updated = 0;
    let created = 0;
    for (const [id, name] of Object.entries(outlets)) {
      const existing = await ctx.db
        .query("externalOutlets")
        .withIndex("by_source_external_id", (q) =>
          q.eq("source", "k3mart").eq("externalId", id)
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { name, isActive: true });
        updated++;
      } else {
        await ctx.db.insert("externalOutlets", {
          source: "k3mart",
          externalId: id,
          name,
          isActive: true,
          createdBy: "system",
          createdAt: Date.now(),
        });
        created++;
      }
    }
    return { updated, created };
  },
});

/**
 * Backfill existing K3Mart revenue records with outletId.
 * Extracts outletName from externalTransactionId dedup key (field index 1).
 * Must run AFTER seedK3MartOutletNames so outlet docs have correct names.
 * Safe to run multiple times (skips records that already have outletId).
 */
export const backfillRevenueOutletIds = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Build name -> docId map from current outlet docs
    const outlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .collect();
    const nameToId: Record<string, string> = {};
    for (const o of outlets) {
      nameToId[o.name] = o._id;
    }

    // Find k3mart revenue missing outletId
    const revenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .collect();

    let patched = 0;
    let skipped = 0;
    for (const r of revenue) {
      if (r.outletId) { skipped++; continue; }
      if (!r.externalTransactionId) continue;

      // Parse outlet name from dedup key: "date|outletName|code|qty|total"
      const parts = r.externalTransactionId.split("|");
      if (parts.length < 2) continue;
      const outletName = parts[1];

      const outletDocId = nameToId[outletName];
      if (outletDocId) {
        await ctx.db.patch(r._id, { outletId: outletDocId as any });
        patched++;
      }
    }
    return { patched, skipped, total: revenue.length };
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

/**
 * Update a product mapping and retroactively update all revenue items
 * with the matching external product name.
 *
 * Phase 79 Plan 04 (D-08, D-09, D-10):
 *   - For Shopee/TikTok: ALSO cascades to externalRevenueItems where
 *     externalItemId === args.externalProductCode (SKU), since Plan 03's
 *     emit path sets productName = linked menuProduct.name after mapping
 *     (so the by_product_name lookup misses post-mapping stragglers).
 *   - Parent `externalRevenue.linkedMenuProductId` is set via the dominant-SKU
 *     rule (max qty across skuVoList, price tie-break) — mapping a minor SKU
 *     leaves the parent alone.
 *   - Idempotent: rerunning with the same args produces zero observable change.
 *   - No `isManuallyMapped` flag introduced (D-10).
 */
async function applyRetroactiveProductMappingImpl(
  ctx: MutationCtx,
  args: {
    source: ExternalSource;
    externalProductCode: string;
    externalProductName: string;
    menuProductId: Id<"menuProducts"> | undefined;
  }
): Promise<{ updatedItems: number; bigsellerUpdated: number }> {
  // 1) Legacy by-name cascade (non-Shopee sources rely on this; also catches
  //    pre-Plan-03 Shopee rows where productName was set to the SKU code).
  const itemsByName = await ctx.db
    .query("externalRevenueItems")
    .withIndex("by_product_name", (q) =>
      q.eq("source", args.source).eq("productName", args.externalProductName)
    )
    .collect();

  const patchedItemIds = new Set<string>();
  const targetName = args.externalProductName;
  for (const item of itemsByName) {
    await ctx.db.patch(item._id, {
      linkedMenuProductId: args.menuProductId,
      isAutoMatched: true,
      matchConfidence: "exact",
      productName: targetName,
    });
    patchedItemIds.add(item._id as unknown as string);
  }

  // 2) Shopee/TikTok extra cascade by externalItemId (SKU) and parent
  //    dominant-SKU update. Other sources (gobiz/gofood/gofood_depot/grabfood/
  //    tokopedia/lazada/internal) retain legacy behavior.
  let bigsellerUpdated = 0;
  if (args.source === "shopee" || args.source === "tiktok") {
    // 2a) Cascade items by externalItemId === SKU.
    const itemsBySku = await ctx.db
      .query("externalRevenueItems")
      .withIndex("by_source_external_item", (q) =>
        q.eq("source", args.source).eq("externalItemId", args.externalProductCode)
      )
      .collect();

    // Staff-review Improvement 2: fail-fast before exceeding Convex mutation
    // write limit. Frollie Shopee volume (~6K total orders across all SKUs)
    // keeps per-SKU cascade well under this, but hot SKUs that ever exceed it
    // should be paginated via a scheduled action rather than silently truncated.
    if (itemsBySku.length > 4000) {
      throw new Error(
        `Cascade batch size ${itemsBySku.length} exceeds Convex mutation limit (4000). ` +
          `Schedule a paginated action instead. SKU: ${args.externalProductCode}`
      );
    }

    for (const item of itemsBySku) {
      if (patchedItemIds.has(item._id as unknown as string)) continue; // already patched by name branch
      await ctx.db.patch(item._id, {
        linkedMenuProductId: args.menuProductId,
        isAutoMatched: true,
        matchConfidence: "exact",
        productName: targetName,
      });
      patchedItemIds.add(item._id as unknown as string);
    }

    // 2b) Parent dominant-SKU update (D-09). For every distinct parent
    //     revenueId touched by the by-SKU cascade, recompute the dominant SKU
    //     across ALL children items of that parent and update the parent's
    //     linkedMenuProductId when the just-mapped SKU wins.
    //
    //     We derive dominance from the persisted externalRevenueItems (not
    //     bigsellerOrders.skuVoList) so that the cascade is correct whether
    //     or not a bigsellerOrders row exists. bigsellerOrders is the emit
    //     source for Plan 03, but tests + legacy data may contain revenue
    //     rows without a paired bigsellerOrders row.
    if (args.menuProductId) {
      // Build mapping snapshot ONCE per cascade run — reused across every
      // parent. Hydrates menuProduct.defaultPrice for D-09 tie-break.
      const platformMappings = await ctx.db
        .query("externalProductMappings")
        .collect();
      const mappingBySku = new Map<
        string,
        { menuProductId?: string; menuProductPrice?: number }
      >();
      for (const m of platformMappings) {
        if (m.source !== args.source) continue;
        if (!m.menuProductId) continue;
        const mp = await ctx.db.get(m.menuProductId);
        mappingBySku.set(m.externalProductCode, {
          menuProductId: m.menuProductId as unknown as string,
          menuProductPrice: mp?.defaultPrice,
        });
      }
      // Overlay the just-applied mapping (handles callers that pass
      // menuProductId WITHOUT first patching externalProductMappings —
      // e.g. the public applyRetroactiveProductMapping mutation exposed
      // for tests and batch tooling).
      {
        const mp = await ctx.db.get(args.menuProductId);
        mappingBySku.set(args.externalProductCode, {
          menuProductId: args.menuProductId as unknown as string,
          menuProductPrice: mp?.defaultPrice,
        });
      }

      // Collect distinct parent revenueIds from the cascaded items.
      const parentIds = new Set<Id<"externalRevenue">>();
      for (const it of itemsBySku) parentIds.add(it.revenueId);

      for (const revenueId of parentIds) {
        const siblings = await ctx.db
          .query("externalRevenueItems")
          .withIndex("by_revenue", (q) => q.eq("revenueId", revenueId))
          .collect();

        // Reconstruct skuVoList-shape input for dominantSku() from items.
        const skuVoList = siblings
          .filter((s) => !!s.externalItemId)
          .map((s) => ({
            sku: s.externalItemId as string,
            skuNum: s.quantity,
          }));
        if (skuVoList.length === 0) continue;

        const dominant = dominantSku(skuVoList, mappingBySku);
        if (dominant.sku !== args.externalProductCode) continue; // not winning
        if (dominant.menuProductId == null) continue;

        await ctx.db.patch(revenueId, {
          linkedMenuProductId: dominant.menuProductId as unknown as Id<"menuProducts">,
        });
        bigsellerUpdated++;
      }
    }
  }

  return { updatedItems: patchedItemIds.size, bigsellerUpdated };
}

/**
 * Public-facing version of applyRetroactiveProductMapping.
 *
 * Used by admin tooling (and the Phase 79 retroactive cascade test) to
 * re-run the cascade without going through updateProductMapping /
 * setMenuProductForSku. Derives `externalProductName` from the existing
 * externalProductMappings row when available; falls back to the SKU code.
 */
export const applyRetroactiveProductMapping = mutation({
  args: {
    token: v.string(),
    source: sourceValidator,
    externalProductCode: v.string(),
    menuProductId: v.optional(v.id("menuProducts")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const mapping = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) =>
        q.eq("source", args.source).eq("externalProductCode", args.externalProductCode)
      )
      .unique();
    const externalProductName =
      mapping?.externalProductName ?? args.externalProductCode;

    return await applyRetroactiveProductMappingImpl(ctx, {
      source: args.source,
      externalProductCode: args.externalProductCode,
      externalProductName,
      menuProductId: args.menuProductId,
    });
  },
});

export const updateProductMapping = mutation({
  args: {
    token: v.string(),
    mappingId: v.id("externalProductMappings"),
    menuProductId: v.optional(v.id("menuProducts")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    const mapping = await ctx.db.get(args.mappingId);
    if (!mapping) throw new Error("Mapping not found");

    await ctx.db.patch(args.mappingId, {
      menuProductId: args.menuProductId,
      isAutoMapped: false,
      createdAt: Date.now(),
    });

    return await applyRetroactiveProductMappingImpl(ctx, {
      source: mapping.source,
      externalProductCode: mapping.externalProductCode,
      externalProductName: mapping.externalProductName,
      menuProductId: args.menuProductId,
    });
  },
});

/**
 * Set the menuProduct for a BigSeller (shopee/tiktok) SKU by source +
 * externalProductCode. Creates the externalProductMappings row on the fly
 * if one does not already exist. Used by the "Map manually" affordance in
 * the BigSellerOrdersTable so unmapped SKUs can be linked directly from the
 * row without first visiting the Product Mapping tab.
 *
 * After the mapping row exists / is patched, the same retroactive revenue
 * update logic as updateProductMapping runs (in-line to keep this a single
 * mutation).
 */
export const setMenuProductForSku = mutation({
  args: {
    token: v.string(),
    source: sourceValidator,
    externalProductCode: v.string(),
    menuProductId: v.optional(v.id("menuProducts")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    // Upsert mapping row
    let mapping = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) =>
        q.eq("source", args.source).eq("externalProductCode", args.externalProductCode)
      )
      .unique();

    let mappingId: Id<"externalProductMappings">;
    let externalProductName: string;
    if (!mapping) {
      mappingId = await ctx.db.insert("externalProductMappings", {
        source: args.source,
        externalProductCode: args.externalProductCode,
        externalProductName: args.externalProductCode,
        menuProductId: args.menuProductId,
        isAutoMapped: false,
        createdAt: Date.now(),
      });
      externalProductName = args.externalProductCode;
    } else {
      await ctx.db.patch(mapping._id, {
        menuProductId: args.menuProductId,
        isAutoMapped: false,
        createdAt: Date.now(),
      });
      mappingId = mapping._id;
      externalProductName = mapping.externalProductName;
    }

    const retro = await applyRetroactiveProductMappingImpl(ctx, {
      source: args.source,
      externalProductCode: args.externalProductCode,
      externalProductName,
      menuProductId: args.menuProductId,
    });

    return { mappingId, ...retro };
  },
});

// ─── REVENUE ITEMS MUTATIONS (journal-level data) ───

export const saveRevenueItems = internalMutation({
  args: {
    revenueId: v.id("externalRevenue"),
    items: v.array(v.object({
      externalItemId: v.optional(v.string()),
      productName: v.string(),
      unitPrice: v.number(),
      quantity: v.number(),
      totalPrice: v.number(),
      variants: v.optional(v.string()),
      linkedMenuProductId: v.optional(v.id("menuProducts")),
      isAutoMatched: v.boolean(),
      matchConfidence: v.optional(v.union(
        v.literal("exact"), v.literal("price_only"),
        v.literal("name_only"), v.literal("none")
      )),
    })),
  },
  handler: async (ctx, args) => {
    const ids = [];

    // Get source from parent revenue record
    const revenue = await ctx.db.get(args.revenueId);
    if (!revenue) {
      throw new Error(`Revenue record not found: ${args.revenueId}`);
    }

    for (const item of args.items) {
      // Dedup: skip if same revenueId + externalItemId exists
      if (item.externalItemId) {
        const existing = await ctx.db
          .query("externalRevenueItems")
          .withIndex("by_revenue", (q) => q.eq("revenueId", args.revenueId))
          .filter((q) => q.eq(q.field("externalItemId"), item.externalItemId))
          .first();
        if (existing) continue;
      }

      const id = await ctx.db.insert("externalRevenueItems", {
        revenueId: args.revenueId,
        source: revenue.source,
        externalItemId: item.externalItemId,
        productName: item.productName,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        variants: item.variants,
        linkedMenuProductId: item.linkedMenuProductId,
        isAutoMatched: item.isAutoMatched,
        matchConfidence: item.matchConfidence,
        createdAt: Date.now(),
      });
      ids.push(id);
    }

    return ids;
  },
});

export const updateProductMappingFields = mutation({
  args: {
    token: v.string(),
    mappingId: v.id("externalProductMappings"),
    grabfoodPrice: v.optional(v.number()),
    isAvailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    const mapping = await ctx.db.get(args.mappingId);
    if (!mapping) throw new Error("Mapping not found");

    const updates: Record<string, any> = {};
    if (args.grabfoodPrice !== undefined) updates.grabfoodPrice = args.grabfoodPrice;
    if (args.isAvailable !== undefined) updates.isAvailable = args.isAvailable;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.mappingId, updates);
    }
  },
});

export const autoMatchMenuProduct = internalMutation({
  args: {
    productName: v.string(),
    unitPrice: v.number(),
    source: sourceValidator,
  },
  handler: async (ctx, args) => {
    // Step 0: Check externalProductMappings for an existing manual mapping.
    // This ensures new revenue items from sync pick up mappings the user
    // already configured in /sales?tab=mappings.
    const existingMapping = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", args.source))
      .filter((q) =>
        q.or(
          q.eq(q.field("externalProductCode"), args.productName),
          q.eq(q.field("externalProductName"), args.productName)
        )
      )
      .first();

    if (existingMapping?.menuProductId) {
      return {
        linkedMenuProductId: existingMapping.menuProductId,
        matchConfidence: "exact" as const,
      };
    }

    // Step 1: Try exact price match
    const priceMatches = await ctx.db
      .query("menuProducts")
      .withIndex("by_default_price", (q) => q.eq("defaultPrice", args.unitPrice))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    if (priceMatches.length > 0) {
      // Check if any price match also matches name (case-insensitive)
      const nameLower = args.productName.toLowerCase();
      for (const product of priceMatches) {
        if (product.name.toLowerCase() === nameLower) {
          return {
            linkedMenuProductId: product._id,
            matchConfidence: "exact" as const,
          };
        }
      }
      // Price match but no name match
      return {
        linkedMenuProductId: priceMatches[0]._id,
        matchConfidence: "price_only" as const,
      };
    }

    // Step 2: Try name-only match (case-insensitive contains)
    const allProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const nameLower = args.productName.toLowerCase();
    for (const product of allProducts) {
      const productNameLower = product.name.toLowerCase();
      if (productNameLower.includes(nameLower) || nameLower.includes(productNameLower)) {
        return {
          linkedMenuProductId: product._id,
          matchConfidence: "name_only" as const,
        };
      }
    }

    // Step 3: No match found
    return {
      linkedMenuProductId: undefined,
      matchConfidence: "none" as const,
    };
  },
});

/**
 * One-time repair: backfill linkedMenuProductId on revenue items that have
 * a matching externalProductMappings entry but were synced before the mapping
 * lookup was added to autoMatchMenuProduct.
 */
export const backfillMappingsToRevenueItems = internalMutation({
  args: {},
  handler: async (ctx) => {
    const mappings = await ctx.db.query("externalProductMappings").collect();
    let updated = 0;

    for (const mapping of mappings) {
      if (!mapping.menuProductId) continue;

      // Find revenue items that match this mapping but have no linkedMenuProductId
      const orphanedItems = await ctx.db
        .query("externalRevenueItems")
        .withIndex("by_product_name", (q) =>
          q.eq("source", mapping.source).eq("productName", mapping.externalProductName)
        )
        .filter((q) => q.eq(q.field("linkedMenuProductId"), undefined))
        .collect();

      for (const item of orphanedItems) {
        await ctx.db.patch(item._id, {
          linkedMenuProductId: mapping.menuProductId,
          isAutoMatched: false,
          matchConfidence: "exact",
        });
        updated++;
      }
    }

    return { updated };
  },
});
