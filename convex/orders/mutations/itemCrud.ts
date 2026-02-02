/**
 * Order Item CRUD mutations
 * Managing items within orders: add, remove, update quantity
 */
import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";

// Pure calculation helpers (no ctx dependency)
import { calculateLineTotals, recalculateFinalTotal } from "../helpers";

// Ctx-dependent helpers
import {
  createProductionRecordsForItem,
  updateProductionRecordsForQuantityChange,
  deleteProductionRecordsForItem,
} from "../helpers/index";

// ============================================
// Input Types
// ============================================

const orderItemInput = v.object({
  productName: v.string(),
  productVariant: v.optional(v.string()),
  quantity: v.number(),
  unitPrice: v.number(),
  unitCost: v.number(),
  discountAmount: v.optional(v.number()),
  menuProductId: v.optional(v.id("menuProducts")),
});

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
    let ballsRemaining: number | undefined;

    if (args.item.menuProductId) {
      const menuProduct = await ctx.db.get(args.item.menuProductId);
      if (menuProduct) {
        productionType = menuProduct.productionType;
        productionUnits = menuProduct.productionUnits;
        ballsRemaining = menuProduct.productionUnits * args.item.quantity;
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
      // Production fields for Kitchen View ball tracking (DEPRECATED - kept for dual-write)
      productionType,
      productionUnits,
      ballsRemaining,
    });

    // PRD-5: Create orderItemProduction records (new production tracking system)
    if (args.item.menuProductId) {
      await createProductionRecordsForItem(ctx, itemId, args.item.menuProductId, args.item.quantity);
    }

    // Calculate new totals
    const newTotalAmount = order.totalAmount + lineTotal;
    const newTotalCost = order.totalCost + lineCost;

    // Recalculate finalTotal with order-level discount
    const newFinalTotal = recalculateFinalTotal(
      newTotalAmount,
      order.orderLevelDiscount,
      order.orderLevelDiscountType
    );

    // Update order totals
    await ctx.db.patch(args.orderId, {
      totalAmount: newTotalAmount,
      totalCost: newTotalCost,
      totalMargin: order.totalMargin + lineMargin,
      itemCount: order.itemCount + 1,
      finalTotal: newFinalTotal,
    });

    return itemId;
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

    // Calculate new totals
    const newTotalAmount = order.totalAmount - item.lineTotal;
    const newTotalCost = order.totalCost - item.lineCost;

    // Recalculate finalTotal with order-level discount
    const newFinalTotal = recalculateFinalTotal(
      newTotalAmount,
      order.orderLevelDiscount,
      order.orderLevelDiscountType
    );

    // Update order totals
    await ctx.db.patch(item.orderId, {
      totalAmount: newTotalAmount,
      totalCost: newTotalCost,
      totalMargin: order.totalMargin - item.lineMargin,
      itemCount: order.itemCount - 1,
      finalTotal: newFinalTotal,
    });

    // PRD-5: Delete orderItemProduction records (use helper)
    await deleteProductionRecordsForItem(ctx, args.itemId);

    // Delete item
    await ctx.db.delete(args.itemId);
    return true;
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

    // Recalculate ballsRemaining if productionUnits exists
    const newBallsRemaining = item.productionUnits
      ? item.productionUnits * args.quantity
      : undefined;

    // Update item
    await ctx.db.patch(args.itemId, {
      quantity: args.quantity,
      lineTotal,
      lineCost,
      lineMargin,
      ballsRemaining: newBallsRemaining,
    });

    // PRD-5: Update orderItemProduction records with new quantity (use helper)
    if (item.menuProductId) {
      await updateProductionRecordsForQuantityChange(ctx, args.itemId, item.menuProductId, args.quantity);
    }

    // Calculate new order totals
    const newTotalAmount = order.totalAmount + amountDiff;
    const newTotalCost = order.totalCost + costDiff;

    // Recalculate finalTotal with order-level discount
    const newFinalTotal = recalculateFinalTotal(
      newTotalAmount,
      order.orderLevelDiscount,
      order.orderLevelDiscountType
    );

    // Update order totals
    await ctx.db.patch(item.orderId, {
      totalAmount: newTotalAmount,
      totalCost: newTotalCost,
      totalMargin: order.totalMargin + marginDiff,
      finalTotal: newFinalTotal,
    });

    return args.itemId;
  },
});
