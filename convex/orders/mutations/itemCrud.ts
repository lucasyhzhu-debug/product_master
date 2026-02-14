/**
 * Order Item CRUD mutations
 * Managing items within orders: add, remove, update quantity
 */
import { mutation } from "../../_generated/server";
import { v } from "convex/values";

// Pure calculation helpers (no ctx dependency)
import { calculateLineTotals, recalculateFinalTotal } from "../helpers";

// Ctx-dependent helpers
import {
  createProductionRecordsForItem,
  updateProductionRecordsForQuantityChange,
  deleteProductionRecordsForItem,
  clearVoucherFromOrder,
} from "../helpers/index";

// Shared validators
import { orderItemInput } from "../validators";

// ============================================
// Mutations
// ============================================

/**
 * Add item to existing order.
 */
export const addItem = mutation({
  args: {
    orderId: v.id("orders"),
    item: orderItemInput,
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Auto-release voucher when order is modified
    // Returns true if voucher was cleared, indicating frontend should show toast
    const voucherCleared = await clearVoucherFromOrder(ctx, args.orderId);

    // Re-fetch order if voucher was cleared (finalTotal may have changed)
    const currentOrder = voucherCleared ? await ctx.db.get(args.orderId) : order;
    if (!currentOrder) {
      throw new Error("Order not found after voucher clear");
    }

    const discount = args.item.discountAmount ?? 0;
    const { lineTotal, lineCost, lineMargin } = calculateLineTotals(
      args.item.quantity,
      args.item.unitPrice,
      args.item.unitCost,
      discount
    );

    // BOM-02: No longer stamp productionType/productionUnits from menuProduct.
    // Production tracking uses orderItemProduction records (created below).

    // Create item
    const itemId = await ctx.db.insert("orderItems", {
      orderId: args.orderId,
      productName: args.item.productName,
      productVariant: args.item.productVariant,
      quantity: args.item.quantity,
      unitPrice: args.item.unitPrice,
      unitCost: args.item.unitCost,
      discountAmount: discount,
      lineTotal,
      lineCost,
      lineMargin,
      menuProductId: args.item.menuProductId,
      // BOM-02: productionType/productionUnits no longer stamped.
      // Ball composition is tracked via orderItemProduction records (below).
    });

    // PRD-5: Create orderItemProduction records (new production tracking system)
    if (args.item.menuProductId) {
      await createProductionRecordsForItem(ctx, itemId, args.item.menuProductId, args.item.quantity);
    }

    // Calculate new totals
    const newTotalAmount = currentOrder.totalAmount + lineTotal;
    const newTotalCost = currentOrder.totalCost + lineCost;

    // Recalculate finalTotal with order-level discount (voucher already cleared)
    const newFinalTotal = recalculateFinalTotal(
      newTotalAmount,
      currentOrder.orderLevelDiscount,
      currentOrder.orderLevelDiscountType
    );

    // Update order totals
    await ctx.db.patch(args.orderId, {
      totalAmount: newTotalAmount,
      totalCost: newTotalCost,
      totalMargin: currentOrder.totalMargin + lineMargin,
      itemCount: currentOrder.itemCount + 1,
      finalTotal: newFinalTotal,
    });

    return { itemId, voucherCleared };
  },
});

/**
 * Remove item from order.
 */
export const removeItem = mutation({
  args: {
    itemId: v.id("orderItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Order item not found");
    }

    const order = await ctx.db.get(item.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Auto-release voucher when order is modified
    const voucherCleared = await clearVoucherFromOrder(ctx, item.orderId);

    // Re-fetch order if voucher was cleared
    const currentOrder = voucherCleared ? await ctx.db.get(item.orderId) : order;
    if (!currentOrder) {
      throw new Error("Order not found after voucher clear");
    }

    // Calculate new totals
    const newTotalAmount = currentOrder.totalAmount - item.lineTotal;
    const newTotalCost = currentOrder.totalCost - item.lineCost;

    // Recalculate finalTotal with order-level discount (voucher already cleared)
    const newFinalTotal = recalculateFinalTotal(
      newTotalAmount,
      currentOrder.orderLevelDiscount,
      currentOrder.orderLevelDiscountType
    );

    // Update order totals
    await ctx.db.patch(item.orderId, {
      totalAmount: newTotalAmount,
      totalCost: newTotalCost,
      totalMargin: currentOrder.totalMargin - item.lineMargin,
      itemCount: currentOrder.itemCount - 1,
      finalTotal: newFinalTotal,
    });

    // PRD-5: Delete orderItemProduction records (use helper)
    await deleteProductionRecordsForItem(ctx, args.itemId);

    // Delete item
    await ctx.db.delete(args.itemId);
    return { success: true, voucherCleared };
  },
});

/**
 * Replace all items in an order.
 * Used by the "Edit Order" flow to update items in bulk.
 * Only allowed for Draft and AwaitingPayment orders.
 */
export const replaceItems = mutation({
  args: {
    orderId: v.id("orders"),
    items: v.array(orderItemInput),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (!["Draft", "AwaitingPayment"].includes(order.status)) {
      throw new Error("Can only edit items for Draft or AwaitingPayment orders");
    }

    if (args.items.length === 0) {
      throw new Error("Order must have at least one item");
    }

    // Auto-release voucher when order is modified
    await clearVoucherFromOrder(ctx, args.orderId);

    // Delete all existing items and their production records
    const existingItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    for (const item of existingItems) {
      await deleteProductionRecordsForItem(ctx, item._id);
      await ctx.db.delete(item._id);
    }

    // Insert new items and calculate totals
    let totalAmount = 0;
    let totalCost = 0;
    let totalMargin = 0;

    for (const itemInput of args.items) {
      const discount = itemInput.discountAmount ?? 0;
      const { lineTotal, lineCost, lineMargin } = calculateLineTotals(
        itemInput.quantity,
        itemInput.unitPrice,
        itemInput.unitCost,
        discount
      );

      // BOM-02: No longer stamp productionType/productionUnits from menuProduct.
      // Production tracking uses orderItemProduction records (created below).

      const itemId = await ctx.db.insert("orderItems", {
        orderId: args.orderId,
        productName: itemInput.productName,
        productVariant: itemInput.productVariant,
        quantity: itemInput.quantity,
        unitPrice: itemInput.unitPrice,
        unitCost: itemInput.unitCost,
        discountAmount: discount,
        lineTotal,
        lineCost,
        lineMargin,
        menuProductId: itemInput.menuProductId,
        // BOM-02: productionType/productionUnits no longer stamped.
      });

      // Create production records
      if (itemInput.menuProductId) {
        await createProductionRecordsForItem(ctx, itemId, itemInput.menuProductId, itemInput.quantity);
      }

      totalAmount += lineTotal;
      totalCost += lineCost;
      totalMargin += lineMargin;
    }

    // Recalculate finalTotal with order-level discount (voucher already cleared)
    const newFinalTotal = recalculateFinalTotal(
      totalAmount,
      order.orderLevelDiscount,
      order.orderLevelDiscountType
    );

    // Update order totals
    await ctx.db.patch(args.orderId, {
      totalAmount,
      totalCost,
      totalMargin,
      itemCount: args.items.length,
      finalTotal: newFinalTotal,
    });

    return { success: true };
  },
});

/**
 * Update order item quantity.
 */
export const updateItemQuantity = mutation({
  args: {
    itemId: v.id("orderItems"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Order item not found");
    }

    const order = await ctx.db.get(item.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Auto-release voucher when order is modified
    const voucherCleared = await clearVoucherFromOrder(ctx, item.orderId);

    // Re-fetch order if voucher was cleared
    const currentOrder = voucherCleared ? await ctx.db.get(item.orderId) : order;
    if (!currentOrder) {
      throw new Error("Order not found after voucher clear");
    }

    // Calculate new line totals
    const { lineTotal, lineCost, lineMargin } = calculateLineTotals(
      args.quantity,
      item.unitPrice,
      item.unitCost,
      item.discountAmount
    );

    // Calculate difference
    const amountDiff = lineTotal - item.lineTotal;
    const costDiff = lineCost - item.lineCost;
    const marginDiff = lineMargin - item.lineMargin;

    // Update item
    await ctx.db.patch(args.itemId, {
      quantity: args.quantity,
      lineTotal,
      lineCost,
      lineMargin,
    });

    // PRD-5: Update orderItemProduction records with new quantity (use helper)
    if (item.menuProductId) {
      await updateProductionRecordsForQuantityChange(ctx, args.itemId, item.menuProductId, args.quantity);
    }

    // Calculate new order totals
    const newTotalAmount = currentOrder.totalAmount + amountDiff;
    const newTotalCost = currentOrder.totalCost + costDiff;

    // Recalculate finalTotal with order-level discount (voucher already cleared)
    const newFinalTotal = recalculateFinalTotal(
      newTotalAmount,
      currentOrder.orderLevelDiscount,
      currentOrder.orderLevelDiscountType
    );

    // Update order totals
    await ctx.db.patch(item.orderId, {
      totalAmount: newTotalAmount,
      totalCost: newTotalCost,
      totalMargin: currentOrder.totalMargin + marginDiff,
      finalTotal: newFinalTotal,
    });

    return { itemId: args.itemId, voucherCleared };
  },
});
