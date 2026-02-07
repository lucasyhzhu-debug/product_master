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

    // Fetch menu product data for production fields
    let productionType: string | undefined;
    let productionUnits: number | undefined;

    if (args.item.menuProductId) {
      const menuProduct = await ctx.db.get(args.item.menuProductId);
      if (menuProduct) {
        productionType = menuProduct.productionType;
        productionUnits = menuProduct.productionUnits;
      }
    }

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
      // Production fields for Kitchen View ball tracking
      productionType,
      productionUnits,
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
