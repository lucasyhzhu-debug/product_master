import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { aggregateForProduct, getResetsMap } from "../productionLog/helpers";

/**
 * Get orders ready for packing in the kitchen.
 * Returns confirmed/InProduction/Boxed/Labeled orders with:
 * - Product line items with needed qty and pack status
 * - Packaging materials (consumptionStage="none") for each order
 */
export const getKitchenPackingOrders = query({
  args: {},
  handler: async (ctx) => {
    // Get orders in packable statuses (Phase 14: simplified)
    const statuses = ["BeingPrepared"] as const;

    const allOrders = [];
    for (const status of statuses) {
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      allOrders.push(...orders);
    }

    // Sort by due date (earliest first), then order date
    allOrders.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.orderDate - b.orderDate;
    });

    // Get global production counts from productionLog aggregation
    const resetsMap = await getResetsMap(ctx);

    // Collect unique menuProductIds from orders to aggregate only what's needed
    const menuProductIds = new Set<Id<"menuProducts">>();

    // Pre-fetch order items for all orders
    const allOrderItems = await Promise.all(
      allOrders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { orderId: order._id, items };
      })
    );

    const orderItemsMap = new Map(
      allOrderItems.map((o) => [o.orderId as unknown as string, o.items])
    );

    for (const { items } of allOrderItems) {
      for (const item of items) {
        if (item.menuProductId && !item.isCancelled) {
          menuProductIds.add(item.menuProductId);
        }
      }
    }

    // Aggregate counts for relevant products
    const countsMap = new Map<string, { stickered: number; packed: number }>();
    for (const mpId of menuProductIds) {
      const resetRecord = resetsMap.get(mpId as unknown as string) ?? null;
      const counts = await aggregateForProduct(ctx, mpId, resetRecord);
      countsMap.set(mpId as unknown as string, counts);
    }

    const result = await Promise.all(
      allOrders.map(async (order) => {
        const orderItems =
          orderItemsMap.get(order._id as unknown as string) ?? [];

        const activeItems = orderItems.filter((item) => !item.isCancelled);

        // Section 1: Product line items
        const productItems = await Promise.all(
          activeItems.map(async (item) => {
            let availableForPacking = 0;

            if (item.menuProductId) {
              const counts = countsMap.get(item.menuProductId as unknown as string);
              if (counts) {
                availableForPacking = counts.stickered - counts.packed;
              }
            }

            return {
              _id: item._id,
              productName: item.productName,
              productVariant: item.productVariant,
              quantity: item.quantity,
              menuProductId: item.menuProductId,
              packageStatus: item.packageStatus ?? "empty",
              isPacked: item.packageStatus === "packed",
              canPack: availableForPacking >= item.quantity,
              availableForPacking,
            };
          })
        );

        // Section 2: Packaging materials (consumptionStage="none")
        const packagingMaterials: Array<{
          componentTypeId: string;
          componentName: string;
          quantityNeeded: number;
        }> = [];

        // Collect "none"-stage components from all items in this order
        const seenComponents = new Map<string, number>();

        for (const item of activeItems) {
          if (!item.menuProductId) continue;

          const components = await ctx.db
            .query("menuProductComponents")
            .withIndex("by_menu_product", (q) =>
              q.eq("menuProductId", item.menuProductId as Id<"menuProducts">)
            )
            .collect();

          for (const comp of components) {
            const ct = await ctx.db.get(comp.componentTypeId);
            if (!ct || !ct.trackInventory) continue;

            const effectiveStage = comp.consumptionStage ?? ct.consumptionStage;
            if (effectiveStage !== "none") continue;

            const key = comp.componentTypeId as string;
            const current = seenComponents.get(key) ?? 0;
            seenComponents.set(key, current + comp.quantity * item.quantity);
          }
        }

        for (const [ctId, qty] of seenComponents) {
          const ct = await ctx.db.get(ctId as Id<"componentTypes">);
          packagingMaterials.push({
            componentTypeId: ctId,
            componentName: ct?.name ?? "Unknown",
            quantityNeeded: qty,
          });
        }

        // Check if all products are packed
        const allProductsPacked = productItems.every((item) => item.isPacked);

        // Phase 15: Resolve creator name from users table
        let creatorName = order.createdBy ?? "admin";
        if (order.createdByUserId) {
          const creator = await ctx.db.get(order.createdByUserId);
          if (creator) creatorName = creator.name;
        }

        return {
          _id: order._id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          status: order.status,
          deliveryType: order.deliveryType,
          dueDate: order.dueDate,
          // Phase 15: expedited flag and creator name
          expedited: order.expedited ?? false,
          creatorName,
          productItems,
          packagingMaterials,
          allProductsPacked,
          canMarkReady: allProductsPacked,
        };
      })
    );

    return result;
  },
});
