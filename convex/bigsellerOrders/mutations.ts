import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

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
        // Update: patch all fields except createdAt
        const { createdAt: _, ...updateData } = order;
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
 * Apply retroactive mapping: when a SKU is mapped to a menu product,
 * update all existing orders containing that SKU to link their revenue records.
 *
 * TODO: Add index on SKU field if order volume exceeds ~1000 rows and this becomes slow.
 */
export const applyRetroactiveMapping = internalMutation({
  args: {
    source: v.string(),
    skuCode: v.string(),
    menuProductId: v.id("menuProducts"),
  },
  handler: async (ctx, args) => {
    // Filter by platform to reduce scan scope
    const orders = await ctx.db
      .query("bigsellerOrders")
      .withIndex("by_platform", (q) => q.eq("platform", args.source))
      .collect();

    let updatedCount = 0;

    for (const order of orders) {
      // Check if this order contains the target SKU
      const hasSku = order.skuVoList?.some(
        (item) => item.sku === args.skuCode
      );
      if (!hasSku) continue;

      // Update the linked revenue record if it exists
      if (order.linkedRevenueId) {
        await ctx.db.patch(order.linkedRevenueId, {
          linkedMenuProductId: args.menuProductId,
        });
        updatedCount++;
      }
    }

    return { updatedCount };
  },
});
