import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

// ─── INTERNAL MUTATIONS (called by adapter actions + webhooks) ───

/**
 * Upsert a single GrabFood order into grabfoodOrders table.
 * Dedup on orderID: if exists and state changed, patch. If unchanged, skip.
 * Also creates a linked externalRevenue record for analytics.
 *
 * IDR exponent=0: prices are whole rupiah, no division needed.
 */
export const upsertOrder = internalMutation({
  args: {
    order: v.any(),
    syncLogId: v.optional(v.id("externalSyncLogs")),
    outletId: v.optional(v.id("externalOutlets")),
  },
  handler: async (ctx, args) => {
    const { order, syncLogId, outletId } = args;
    const orderID: string = order.orderID ?? "";
    if (!orderID) throw new Error("GrabFood order missing orderID");

    // Dedup: check if order already exists
    const existing = await ctx.db
      .query("grabfoodOrders")
      .withIndex("by_order_id", (q) => q.eq("orderID", orderID))
      .first();

    if (existing) {
      // If orderState changed, update it
      const newState = order.orderState ?? order.state ?? undefined;
      if (newState && newState !== existing.orderState) {
        await ctx.db.patch(existing._id, {
          orderState: newState,
          rawJson: JSON.stringify(order),
        });
        return existing._id;
      }
      // Unchanged — skip
      return existing._id;
    }

    // Parse order time to ms
    const orderTimeStr: string = order.orderTime ?? order.createdAt ?? new Date().toISOString();
    const orderTimeMs = new Date(orderTimeStr).getTime() || Date.now();

    // Insert new order
    const orderId = await ctx.db.insert("grabfoodOrders", {
      orderID,
      merchantID: order.merchantID ?? "",
      shortOrderNumber: order.shortOrderNumber ?? "",
      orderState: order.orderState ?? order.state ?? undefined,
      orderTime: orderTimeStr,
      orderTimeMs,
      currency: order.currency?.code ?? "IDR",
      items: order.items ?? [],
      price: order.price ?? {},
      rawJson: JSON.stringify(order),
      syncLogId,
      outletId,
      createdAt: Date.now(),
    });

    // ── Revenue bridge ──
    // IDR exponent=0: prices are whole rupiah, no division needed
    const price = order.price ?? {};
    const subtotal: number = price.subtotal ?? 0;
    const grabFundPromo: number = price.grabFundPromo ?? 0;
    const merchantFundPromo: number = price.merchantFundPromo ?? 0;
    const basketPromo: number = price.basketPromo ?? 0;
    const revenueNet = subtotal - grabFundPromo - merchantFundPromo - basketPromo;

    // Dedup revenue: check if transaction already exists
    const existingRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source_txn", (q) =>
        q.eq("source", "grabfood").eq("externalTransactionId", orderID)
      )
      .first();

    let linkedRevenueId = existingRevenue?._id;

    if (!existingRevenue) {
      linkedRevenueId = await ctx.db.insert("externalRevenue", {
        source: "grabfood",
        outletId,
        revenueGross: subtotal,
        revenueNet,
        periodStart: orderTimeMs,
        periodEnd: orderTimeMs,
        dataOrigin: "api_revenue",
        confidence: "exact",
        externalTransactionId: orderID,
        transactionDate: orderTimeMs,
        transactionType: "sales",
        syncLogId,
      });
    }

    // Link revenue to order
    if (linkedRevenueId) {
      await ctx.db.patch(orderId, { linkedRevenueId });
    }

    return orderId;
  },
});

/**
 * Batch upsert GrabFood orders.
 * Processes all orders inline (no nested runMutation) for efficiency.
 * Returns insert/update/skip counts.
 */
export const upsertOrderBatch = internalMutation({
  args: {
    orders: v.array(v.any()),
    syncLogId: v.optional(v.id("externalSyncLogs")),
    outletId: v.optional(v.id("externalOutlets")),
  },
  handler: async (ctx, args) => {
    const { orders, syncLogId, outletId } = args;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const order of orders) {
      const orderID: string = order.orderID ?? "";
      if (!orderID) {
        skipped++;
        continue;
      }

      // Dedup: check if order already exists
      const existing = await ctx.db
        .query("grabfoodOrders")
        .withIndex("by_order_id", (q) => q.eq("orderID", orderID))
        .first();

      if (existing) {
        const newState = order.orderState ?? order.state ?? undefined;
        if (newState && newState !== existing.orderState) {
          await ctx.db.patch(existing._id, {
            orderState: newState,
            rawJson: JSON.stringify(order),
          });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      // Parse order time
      const orderTimeStr: string = order.orderTime ?? order.createdAt ?? new Date().toISOString();
      const orderTimeMs = new Date(orderTimeStr).getTime() || Date.now();

      // Insert new order
      const orderId = await ctx.db.insert("grabfoodOrders", {
        orderID,
        merchantID: order.merchantID ?? "",
        shortOrderNumber: order.shortOrderNumber ?? "",
        orderState: order.orderState ?? order.state ?? undefined,
        orderTime: orderTimeStr,
        orderTimeMs,
        currency: order.currency?.code ?? "IDR",
        items: order.items ?? [],
        price: order.price ?? {},
        rawJson: JSON.stringify(order),
        syncLogId,
        outletId,
        createdAt: Date.now(),
      });

      // ── Revenue bridge ──
      // IDR exponent=0: prices are whole rupiah, no division needed
      const price = order.price ?? {};
      const subtotal: number = price.subtotal ?? 0;
      const grabFundPromo: number = price.grabFundPromo ?? 0;
      const merchantFundPromo: number = price.merchantFundPromo ?? 0;
      const basketPromo: number = price.basketPromo ?? 0;
      const revenueNet = subtotal - grabFundPromo - merchantFundPromo - basketPromo;

      // Dedup revenue
      const existingRevenue = await ctx.db
        .query("externalRevenue")
        .withIndex("by_source_txn", (q) =>
          q.eq("source", "grabfood").eq("externalTransactionId", orderID)
        )
        .first();

      if (!existingRevenue) {
        const revenueId = await ctx.db.insert("externalRevenue", {
          source: "grabfood",
          outletId,
          revenueGross: subtotal,
          revenueNet,
          periodStart: orderTimeMs,
          periodEnd: orderTimeMs,
          dataOrigin: "api_revenue",
          confidence: "exact",
          externalTransactionId: orderID,
          transactionDate: orderTimeMs,
          transactionType: "sales",
          syncLogId,
        });

        await ctx.db.patch(orderId, { linkedRevenueId: revenueId });
      }

      inserted++;
    }

    return { inserted, updated, skipped };
  },
});
