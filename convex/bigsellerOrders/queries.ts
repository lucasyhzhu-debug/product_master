import { v } from "convex/values";
import { query } from "../_generated/server";
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

    // Add calculated profit field
    const results = paged.map((order) => ({
      ...order,
      // Fees are negative, so addition is correct: platformIncome + commissionFee + sellerShippingFee + otherFee
      calculatedProfit:
        order.platformIncome +
        order.commissionFee +
        order.sellerShippingFee +
        order.otherFee,
    }));

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
