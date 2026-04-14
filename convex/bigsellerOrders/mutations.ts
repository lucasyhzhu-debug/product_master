import { v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireRole } from "../lib/auth";
import {
  buildPriceOracle,
  prorateItems,
} from "../integrations/bigseller/helpers";
import type { Id } from "../_generated/dataModel";

type SkuEntry = {
  sku: string;
  skuNum: number;
  returnNum: number;
  isAddition: number;
};

/**
 * Decide which `skuVoList` to write on a re-sync of an existing order.
 *
 * Preserve-non-empty guard: when BigSeller returns an order with empty
 * `skuVoList` but the stored order already has entries, keep the stored
 * entries. Prevents re-syncs from destroying previously-known SKU data.
 * Observed 2026-04-13 for Shopee orders (BigSeller intermittently returns
 * empty skuVoList despite allSkuNum > 0).
 *
 * Pure function — exported for direct testing.
 */
export function resolveSkuVoListOnUpdate(
  incoming: readonly SkuEntry[],
  existing: readonly SkuEntry[]
): SkuEntry[] {
  if (incoming.length === 0 && existing.length > 0) {
    return [...existing];
  }
  return [...incoming];
}

/**
 * Upsert BigSeller orders -- dedup by platformOrderId.
 * Called by sync action, never directly from frontend.
 */
export const upsertOrders = internalMutation({
  args: {
    orders: v.array(
      v.object({
        platformOrderId: v.string(),
        shopId: v.number(),
        shopName: v.string(),
        platform: v.string(),
        orderState: v.string(),
        orderTimeMs: v.number(),
        saleAmount: v.number(),
        orderAmount: v.optional(v.number()),
        platformIncome: v.number(),
        costFee: v.number(),
        profit: v.number(),
        profitMargin: v.string(),
        commissionFee: v.number(),
        sellerShippingFee: v.number(),
        buyerShippingFee: v.number(),
        otherFee: v.number(),
        allSkuNum: v.number(),
        skuVoList: v.array(
          v.object({
            sku: v.string(),
            skuNum: v.number(),
            returnNum: v.number(),
            isAddition: v.number(),
          })
        ),
        syncLogId: v.optional(v.id("externalSyncLogs")),
        createdAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const order of args.orders) {
      const existing = await ctx.db
        .query("bigsellerOrders")
        .withIndex("by_platform_order", (q) =>
          q.eq("platformOrderId", order.platformOrderId)
        )
        .unique();

      if (existing) {
        // Update: patch all fields except createdAt.
        // Apply preserve-non-empty guard for skuVoList via helper.
        const { createdAt: _, ...updateData } = order;
        updateData.skuVoList = resolveSkuVoListOnUpdate(
          updateData.skuVoList ?? [],
          existing.skuVoList ?? []
        );
        await ctx.db.patch(existing._id, updateData);
        updated++;
      } else {
        await ctx.db.insert("bigsellerOrders", order);
        inserted++;
      }
    }

    return { inserted, updated };
  },
});

/**
 * Link externalRevenue IDs back to bigsellerOrders after saveRevenue.
 * Called by fetchOrders to establish the cross-reference needed for retroactive mapping.
 */
export const linkRevenueToOrders = internalMutation({
  args: {
    links: v.array(
      v.object({
        platformOrderId: v.string(),
        revenueId: v.id("externalRevenue"),
      })
    ),
  },
  handler: async (ctx, args) => {
    let linked = 0;
    for (const link of args.links) {
      const order = await ctx.db
        .query("bigsellerOrders")
        .withIndex("by_platform_order", (q) =>
          q.eq("platformOrderId", link.platformOrderId)
        )
        .unique();
      if (order) {
        await ctx.db.patch(order._id, { linkedRevenueId: link.revenueId });
        linked++;
      }
    }
    return { linked };
  },
});

// ─── Phase 79 Plan 07: Admin Backfill ────────────────────────────────────────

/**
 * Phase 79 Plan 07 (DA-10): Backfill `externalRevenueItems` for historical
 * `bigsellerOrders` whose `skuVoList` is populated but never produced item
 * rows (e.g., orders synced before Plan 03 emit branch was wired).
 *
 * Idempotent — re-running creates 0 new rows because `saveRevenueItems`
 * dedups on (revenueId, externalItemId).
 *
 * Scope guarantees:
 *   - D-21: NEVER deducts inventory (no productInventory writes).
 *   - D-22: NEVER calls processBigsellerSales (no journal-entry side effect).
 *   - D-18: Skips orders with empty skuVoList (no placeholder items).
 *   - V4: Admin-only via requireRole.
 *   - T-79-12 (DoS): `limit` capped at 500. Caller paginates by re-invoking
 *     until `hasMore === false` (the UI does this in BigSellerSyncPanel).
 *
 * Returns aggregated counts so the UI toast can show
 * `Created N items from M orders (K skipped)`.
 */
export const backfillBigsellerItems = mutation({
  args: {
    token: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);

    // Build price oracle ONCE per backfill invocation from all single-SKU
    // historical orders. Acceptable full scan at Frollie volume (~6K rows;
    // RESEARCH.md A1).
    const allOrders = await ctx.db.query("bigsellerOrders").collect();
    const singleSkuOrders = allOrders.filter(
      (o) => Array.isArray(o.skuVoList) && o.skuVoList.length === 1
    );
    const priceOracle = buildPriceOracle(singleSkuOrders);

    // Build SKU → menuProduct mapping once (shopee + tiktok).
    const shopeeMappings = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "shopee"))
      .collect();
    const tiktokMappings = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "tiktok"))
      .collect();

    const mappingBySku = new Map<
      string,
      { menuProductId?: string; menuProductPrice?: number }
    >();
    const menuProductById = new Map<string, { name: string; price: number }>();

    for (const m of [...shopeeMappings, ...tiktokMappings]) {
      let menuProductPrice: number | undefined;
      let menuProductName: string | undefined;
      if (m.menuProductId) {
        const mp = await ctx.db.get(m.menuProductId);
        if (mp) {
          menuProductName = mp.name;
          menuProductPrice = mp.defaultPrice;
          menuProductById.set(m.menuProductId as unknown as string, {
            name: mp.name,
            price: mp.defaultPrice ?? 0,
          });
        }
      }
      mappingBySku.set(m.externalProductCode, {
        menuProductId: m.menuProductId
          ? (m.menuProductId as unknown as string)
          : undefined,
        menuProductPrice,
      });
      // Suppress lint about unused locals.
      void menuProductName;
    }

    // Pull a bounded batch of candidate orders (any platform with a non-empty
    // skuVoList AND a linkedRevenueId — rows missing the link cannot have
    // items attributed to a revenue record).
    const candidates = allOrders
      .filter(
        (o) =>
          (o.platform === "shopee" || o.platform === "tiktok") &&
          Array.isArray(o.skuVoList) &&
          o.skuVoList.length > 0 &&
          o.linkedRevenueId
      )
      .slice(0, limit);

    let created = 0;
    let skipped = 0;
    let processedOrders = 0;

    for (const order of candidates) {
      // D-18: skip empty skuVoList (already filtered above, but defensive).
      if (!order.skuVoList || order.skuVoList.length === 0) {
        skipped++;
        continue;
      }
      if (!order.linkedRevenueId) {
        skipped++;
        continue;
      }

      const prorated = prorateItems(
        {
          orderAmount: order.orderAmount,
          saleAmount: order.saleAmount,
          skuVoList: order.skuVoList,
        },
        priceOracle,
        mappingBySku
      );

      const items = prorated.map((p) => {
        const mapping = mappingBySku.get(p.sku);
        const menuProductIdStr = mapping?.menuProductId;
        const menuProduct = menuProductIdStr
          ? menuProductById.get(menuProductIdStr)
          : null;
        const productName = menuProduct?.name ?? p.sku;
        return {
          externalItemId: p.sku, // (revenueId, externalItemId) dedup key
          productName,
          unitPrice: p.unitPrice,
          quantity: p.skuNum,
          totalPrice: p.totalPrice,
          linkedMenuProductId: menuProductIdStr
            ? (menuProductIdStr as unknown as Id<"menuProducts">)
            : undefined,
          isAutoMatched: Boolean(menuProductIdStr),
          matchConfidence: (menuProductIdStr ? "exact" : "none") as
            | "exact"
            | "none",
        };
      });

      if (items.length === 0) {
        skipped++;
        continue;
      }

      // D-22: this call only writes externalRevenueItems. NO inventory
      // deduction. NO processBigsellerSales invocation.
      const ids: Array<Id<"externalRevenueItems">> = await ctx.runMutation(
        internal.externalData.mutations.saveRevenueItems,
        { revenueId: order.linkedRevenueId, items }
      );
      const newCount = ids.length;
      const dupCount = items.length - newCount;
      created += newCount;
      skipped += dupCount;
      processedOrders++;
    }

    return {
      created,
      skipped,
      processedOrders,
      hasMore: candidates.length === limit,
    };
  },
});

