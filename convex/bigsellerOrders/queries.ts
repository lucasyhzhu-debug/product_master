import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import { requireRole } from "../lib/auth";
import { isExternalSource } from "../lib/externalSource";

/**
 * List BigSeller orders with optional filtering.
 * Client-side pagination via collect() + slice is appropriate for current
 * Frollie volume (~hundreds of orders, not millions).
 */
export const listOrders = query({
  args: {
    token: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    platform: v.optional(v.string()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const page = args.page ?? 1;
    const pageSize = args.pageSize ?? 50;

    let orders = await ctx.db
      .query("bigsellerOrders")
      .withIndex("by_time")
      .order("desc")
      .collect();

    // Filter by date range if provided
    if (args.startDate !== undefined) {
      orders = orders.filter((o) => o.orderTimeMs >= args.startDate!);
    }
    if (args.endDate !== undefined) {
      orders = orders.filter((o) => o.orderTimeMs <= args.endDate!);
    }

    // Filter by platform if provided
    if (args.platform) {
      orders = orders.filter((o) => o.platform === args.platform);
    }

    const total = orders.length;
    const start = (page - 1) * pageSize;
    const paged = orders.slice(start, start + pageSize);

    // ── Resolve per-SKU Frollie product mappings (query-time join) ──
    // Collect unique {source, sku} pairs from the paged slice and hydrate
    // externalProductMappings + menuProducts in bounded passes. Avoids N×M
    // lookup per render. Frollie order volume keeps this well under 100
    // unique SKUs per page.
    const uniqueKeys = new Set<string>();
    for (const order of paged) {
      const source = order.platform;
      for (const entry of order.skuVoList ?? []) {
        if (!entry.sku) continue;
        uniqueKeys.add(`${source}::${entry.sku}`);
      }
    }

    type MappingInfo = {
      externalProductMappingId: import("../_generated/dataModel").Id<"externalProductMappings"> | null;
      mappedMenuProductId: import("../_generated/dataModel").Id<"menuProducts"> | null;
      mappedMenuProductName: string | null;
    };
    const mappingBySkuKey = new Map<string, MappingInfo>();

    for (const key of uniqueKeys) {
      const idx = key.indexOf("::");
      if (idx < 0) continue;
      const source = key.slice(0, idx);
      const skuCode = key.slice(idx + 2);
      if (!skuCode || !isExternalSource(source)) {
        mappingBySkuKey.set(key, {
          externalProductMappingId: null,
          mappedMenuProductId: null,
          mappedMenuProductName: null,
        });
        continue;
      }
      const mapping = await ctx.db
        .query("externalProductMappings")
        .withIndex("by_source_code", (q) =>
          q.eq("source", source).eq("externalProductCode", skuCode)
        )
        .unique();
      if (!mapping) {
        mappingBySkuKey.set(key, {
          externalProductMappingId: null,
          mappedMenuProductId: null,
          mappedMenuProductName: null,
        });
        continue;
      }
      let name: string | null = null;
      if (mapping.menuProductId) {
        const mp = await ctx.db.get(mapping.menuProductId);
        name = mp?.name ?? null;
      }
      mappingBySkuKey.set(key, {
        externalProductMappingId: mapping._id,
        mappedMenuProductId: mapping.menuProductId ?? null,
        mappedMenuProductName: name,
      });
    }

    // Use BigSeller's authoritative profit field directly.
    // The old formula (platformIncome + commissionFee + sellerShippingFee + otherFee)
    // double-subtracted fees that were already accounted for in platformIncome.
    // BigSeller's profit = platformIncome - costFee (BUG-06 fix).
    const results = paged.map((order) => {
      const resolvedSkus = (order.skuVoList ?? []).map((entry) => {
        const key = `${order.platform}::${entry.sku}`;
        const info = mappingBySkuKey.get(key) ?? {
          externalProductMappingId: null,
          mappedMenuProductId: null,
          mappedMenuProductName: null,
        };
        return {
          sku: entry.sku,
          skuNum: entry.skuNum,
          returnNum: entry.returnNum,
          isAddition: entry.isAddition,
          externalProductMappingId: info.externalProductMappingId,
          mappedMenuProductId: info.mappedMenuProductId,
          mappedMenuProductName: info.mappedMenuProductName,
        };
      });
      return {
        ...order,
        calculatedProfit: order.profit,
        resolvedSkus,
      };
    });

    return {
      orders: results,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },
});

/**
 * Phase 79: Return all bigsellerOrders where skuVoList has exactly one entry.
 * Used by BigSeller sync to build the per-SKU price oracle (D-03) at the
 * start of each fetchOrders run.
 *
 * Scope assumption (RESEARCH.md A1): ~6K rows max — full scan is acceptable
 * at current Frollie volume. Add a composite index in a follow-up phase if
 * volume grows.
 */
export const getSingleSkuOrdersForOracle = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("bigsellerOrders").collect();
    return all.filter(
      (o) => Array.isArray(o.skuVoList) && o.skuVoList.length === 1
    );
  },
});

/**
 * Diagnostic: return raw skuVoList / allSkuNum / orderState for every order
 * in a date range. Run from Convex dashboard to confirm whether empty SKUs
 * are in storage vs. a frontend rendering bug.
 *
 * Usage (Convex dashboard Functions tab):
 *   bigsellerOrders:diagnoseSkuState
 *   args: { startMs: 1744502400000, endMs: 1744588799999 }  // 13 Apr 2026 WIB
 */
export const diagnoseSkuState = internalQuery({
  args: {
    startMs: v.number(),
    endMs: v.number(),
    platform: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let orders = await ctx.db
      .query("bigsellerOrders")
      .withIndex("by_time")
      .collect();

    orders = orders.filter(
      (o) => o.orderTimeMs >= args.startMs && o.orderTimeMs <= args.endMs
    );
    if (args.platform) {
      orders = orders.filter((o) => o.platform === args.platform);
    }

    return orders
      .sort((a, b) => b.orderTimeMs - a.orderTimeMs)
      .map((o) => ({
        platformOrderId: o.platformOrderId,
        orderTimeMs: o.orderTimeMs,
        orderTimeIso: new Date(o.orderTimeMs).toISOString(),
        platform: o.platform,
        orderState: o.orderState,
        allSkuNum: o.allSkuNum,
        skuVoListLen: (o.skuVoList ?? []).length,
        skuCodes: (o.skuVoList ?? []).map((s) => s.sku),
        costFee: o.costFee,
        syncLogId: o.syncLogId,
        createdAt: o.createdAt,
      }));
  },
});

/**
 * Get unmapped SKU codes for reconciliation UI.
 * Cross-references bigsellerOrders.skuVoList with externalProductMappings.
 */
export const getUnmappedSkus = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    // Collect all unique SKU codes from orders with their platform
    const skuMap = new Map<string, { count: number; platform: string }>();
    const orders = await ctx.db.query("bigsellerOrders").collect();

    for (const order of orders) {
      const platform = order.platform || "shopee";
      for (const sku of order.skuVoList || []) {
        if (!sku.sku) continue;
        const key = `${platform}::${sku.sku}`;
        const existing = skuMap.get(key);
        if (existing) {
          existing.count += sku.skuNum;
        } else {
          skuMap.set(key, { count: sku.skuNum, platform });
        }
      }
    }

    // Check which SKUs have mappings with linked menu products
    const unmapped: Array<{ sku: string; count: number; platform: string }> =
      [];
    for (const [key, value] of skuMap) {
      const [platform, skuCode] = key.split("::");
      if (!skuCode || !isExternalSource(platform)) continue;

      // Check for mapping with either platform as source
      const mapping = await ctx.db
        .query("externalProductMappings")
        .withIndex("by_source_code", (q) =>
          q
            .eq("source", platform)
            .eq("externalProductCode", skuCode)
        )
        .unique();

      if (!mapping || !mapping.menuProductId) {
        unmapped.push({ sku: skuCode, count: value.count, platform });
      }
    }

    return unmapped;
  },
});

/**
 * Get order statistics summary.
 * Returns totals by platform, revenue, and COGS caveat flag.
 */
export const getOrderStats = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin", "manager"]);

    const orders = await ctx.db.query("bigsellerOrders").collect();

    if (orders.length === 0) {
      return {
        totalOrders: 0,
        ordersByPlatform: {} as Record<string, number>,
        totalRevenue: 0,
        dateRange: null,
        allCostFeeZero: true,
      };
    }

    const ordersByPlatform: Record<string, number> = {};
    let totalRevenue = 0;
    let minTime = Infinity;
    let maxTime = 0;
    let allCostFeeZero = true;

    for (const order of orders) {
      const platform = order.platform || "unknown";
      ordersByPlatform[platform] = (ordersByPlatform[platform] || 0) + 1;
      totalRevenue += order.platformIncome || 0;
      if (order.orderTimeMs < minTime) minTime = order.orderTimeMs;
      if (order.orderTimeMs > maxTime) maxTime = order.orderTimeMs;
      if (order.costFee !== 0) allCostFeeZero = false;
    }

    return {
      totalOrders: orders.length,
      ordersByPlatform,
      totalRevenue,
      dateRange: {
        earliest: minTime,
        latest: maxTime,
      },
      allCostFeeZero,
    };
  },
});
