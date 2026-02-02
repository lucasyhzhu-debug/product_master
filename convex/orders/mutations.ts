import { mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

// Pure calculation helpers (no ctx dependency)
import { calculateLineTotals, recalculateFinalTotal } from "./helpers";

// Ctx-dependent helpers from helpers/ directory
import {
  // Ball distribution
  distributeBallsToOrders,
  // Status transitions & audit logging
  logOrderEvent,
  isTerminalStatus,
  // Usage tracking
  incrementChannelUsage,
  decrementChannelUsage,
  incrementShippingAgencyUsage,
  decrementShippingAgencyUsage,
  // Production records
  createProductionRecordsForItem,
  updateProductionRecordsForQuantityChange,
  deleteProductionRecordsForItem,
  cancelOrderProductionRecords,
  markOrderProductionComplete,
  resetOrderProductionComplete,
} from "./helpers/index";

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
// Helper Functions
// ============================================

async function generateOrderNumber(ctx: MutationCtx): Promise<string> {
  const now = new Date();
  const datePrefix = `${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const prefix = `${datePrefix}-`;

  // Get today's orders using index for efficient lookup
  const todayOrders = await ctx.db
    .query("orders")
    .withIndex("by_order_number", (q) =>
      q.gte("orderNumber", prefix).lt("orderNumber", `${datePrefix}.`)
    )
    .collect();

  // Find the highest sequence number used today (handles gaps from deletions)
  let maxSequence = 0;
  for (const order of todayOrders) {
    const parts = order.orderNumber.split("-");
    if (parts.length === 2) {
      const seq = parseInt(parts[1], 10);
      if (!isNaN(seq) && seq > maxSequence) {
        maxSequence = seq;
      }
    }
  }

  // Generate next sequence
  const nextSequence = maxSequence + 1;
  const orderNumber = `${prefix}${String(nextSequence).padStart(3, "0")}`;

  // Verify uniqueness (handles race condition)
  const existing = await ctx.db
    .query("orders")
    .withIndex("by_order_number", (q) => q.eq("orderNumber", orderNumber))
    .first();

  if (existing) {
    // Rare race condition - retry with incremented sequence
    const retrySequence = nextSequence + 1;
    return `${prefix}${String(retrySequence).padStart(3, "0")}`;
  }

  return orderNumber;
}

// Helper functions moved to convex/orders/helpers/
// - logOrderEvent -> statusTransitions.ts
// - incrementChannelUsage -> usageTracking.ts
// - decrementChannelUsage -> usageTracking.ts
// - incrementShippingAgencyUsage -> usageTracking.ts
// - decrementShippingAgencyUsage -> usageTracking.ts

// ============================================
// Mutations
// ============================================

/**
 * Create a new order with items.
 */
export const create = mutation({
  args: {
    // Customer - either existing ID or new customer data
    customerId: v.optional(v.id("customers")),
    newCustomer: v.optional(
      v.object({
        name: v.string(),
        phone: v.optional(v.string()),
        source: v.optional(v.string()),
      })
    ),
    // Order details
    channel: v.optional(v.union(
      v.literal("whatsapp"),
      v.literal("instagram"),
      v.literal("shopee"),
      v.literal("tiktok"),
      v.literal("tokopedia"),
      v.literal("grabfood"),
      v.literal("k3mart_gf"),
      v.literal("legato_tamtem"),
      v.literal("legato_goldfinch"),
      v.literal("bazaar"),
      v.literal("other")
    )),
    soldBy: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    deliveryType: v.optional(v.string()),
    pickupLocation: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),
    contactWa: v.optional(v.string()),
    contactIg: v.optional(v.string()),
    // Discount
    orderLevelDiscount: v.optional(v.number()),
    orderLevelDiscountType: v.optional(v.union(
      v.literal("amount"),
      v.literal("percentage")
    )),
    // Items
    items: v.array(orderItemInput),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Handle customer
    let customerId: Id<"customers">;
    let customerName: string;
    let customerPhone: string | undefined;

    if (args.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (!customer) {
        throw new Error("Customer not found");
      }
      customerId = args.customerId;
      customerName = customer.name;
      customerPhone = customer.phone;
    } else if (args.newCustomer) {
      customerId = await ctx.db.insert("customers", {
        name: args.newCustomer.name,
        phone: args.newCustomer.phone,
        source: args.newCustomer.source,
        createdBy: args.createdBy ?? "admin",
      });
      customerName = args.newCustomer.name;
      customerPhone = args.newCustomer.phone;
    } else {
      throw new Error("Either customerId or newCustomer is required");
    }

    // Generate order number
    const orderNumber = await generateOrderNumber(ctx);

    // Calculate totals and fetch menu product data for production fields
    let totalAmount = 0;
    let totalCost = 0;

    // Fetch all menu products needed (batch for efficiency)
    const menuProductIds = args.items
      .map((item) => item.menuProductId)
      .filter((id): id is Id<"menuProducts"> => id !== undefined);

    const menuProductsMap = new Map<string, { productionType: string; productionUnits: number }>();
    for (const mpId of menuProductIds) {
      const mp = await ctx.db.get(mpId);
      if (mp && mp.productionType && mp.productionUnits) {
        // Use string key for proper Map lookup (Id objects use reference equality)
        menuProductsMap.set(mpId.toString(), {
          productionType: mp.productionType,
          productionUnits: mp.productionUnits,
        });
      }
    }

    // PRD-5: Fetch menu product components for new production tracking (dual-write)
    const menuProductComponentsMap = new Map<string, Array<{
      productionUnitTypeId: Id<"productionUnitTypes">;
      productionUnitCode: string;
      productionUnitName: string;
      quantity: number;
    }>>();

    for (const mpId of menuProductIds) {
      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", mpId))
        .collect();

      if (components.length > 0) {
        const enrichedComponents = await Promise.all(
          components.map(async (comp) => {
            const unitType = await ctx.db.get(comp.productionUnitTypeId);
            return {
              productionUnitTypeId: comp.productionUnitTypeId,
              productionUnitCode: unitType?.code ?? "UNKNOWN",
              productionUnitName: unitType?.name ?? "Unknown",
              quantity: comp.quantity,
            };
          })
        );
        menuProductComponentsMap.set(mpId.toString(), enrichedComponents);
      }
    }

    const itemsToCreate = args.items.map((item) => {
      const discount = item.discountAmount ?? 0;
      const { lineTotal, lineCost, lineMargin } = calculateLineTotals(
        item.quantity,
        item.unitPrice,
        item.unitCost,
        discount
      );
      totalAmount += lineTotal;
      totalCost += lineCost;

      // Get production data from menu product if available
      // Use string key for proper Map lookup (Id objects use reference equality)
      const menuProductData = item.menuProductId
        ? menuProductsMap.get(item.menuProductId.toString())
        : undefined;

      return {
        ...item,
        discountAmount: discount,
        lineTotal,
        lineCost,
        lineMargin,
        productionType: menuProductData?.productionType,
        productionUnits: menuProductData?.productionUnits,
      };
    });

    // Calculate order-level discount
    let discountAmount = 0;
    if (args.orderLevelDiscount !== undefined && args.orderLevelDiscountType !== undefined) {
      if (args.orderLevelDiscountType === "percentage") {
        discountAmount = totalAmount * (args.orderLevelDiscount / 100);
      } else {
        discountAmount = args.orderLevelDiscount;
      }
    }

    const finalTotal = totalAmount - discountAmount;

    // Create order
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerId,
      customerName,
      customerPhone,
      status: "Draft",
      paymentStatus: "Unpaid",
      orderDate: Date.now(),
      dueDate: args.dueDate,
      totalAmount,
      totalCost,
      totalMargin: totalAmount - totalCost,
      orderLevelDiscount: args.orderLevelDiscount,
      orderLevelDiscountType: args.orderLevelDiscountType,
      finalTotal,
      channel: args.channel,
      soldBy: args.soldBy,
      deliveryType: args.deliveryType ?? "Pickup",
      pickupLocation: args.pickupLocation,
      deliveryAddress: args.deliveryAddress,
      contactWa: args.contactWa,
      contactIg: args.contactIg,
      notes: args.notes,
      createdBy: args.createdBy ?? "admin",
      itemCount: args.items.length,
    });

    // Create order items and production tracking records
    for (const item of itemsToCreate) {
      const orderItemId = await ctx.db.insert("orderItems", {
        orderId,
        productName: item.productName,
        productVariant: item.productVariant,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost,
        discountAmount: item.discountAmount,
        lineTotal: item.lineTotal,
        lineCost: item.lineCost,
        lineMargin: item.lineMargin,
        menuProductId: item.menuProductId,
        // Production fields for Kitchen View ball tracking (DEPRECATED - kept for dual-write)
        productionType: item.productionType,
        productionUnits: item.productionUnits,
      });

      // PRD-5: Create orderItemProduction records (new production tracking system)
      if (item.menuProductId) {
        await createProductionRecordsForItem(ctx, orderItemId, item.menuProductId, item.quantity);
      }
    }

    // PRD-7: Track channel usage for "Top 4" button selectors
    if (args.channel) {
      await incrementChannelUsage(ctx, args.channel);
    }

    return orderId;
  },
});

/**
 * Update order status.
 */
export const updateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const updates: Record<string, unknown> = { status: args.status };

    // Track awaiting payment timestamp
    if (args.status === "AwaitingPayment" && !order.awaitingPaymentSince) {
      updates.awaitingPaymentSince = Date.now();
    }

    await ctx.db.patch(args.orderId, updates);
    return args.orderId;
  },
});

/**
 * Update payment status.
 * PRD-0: Uses type-safe union for paymentStatus.
 */
export const updatePayment = mutation({
  args: {
    orderId: v.id("orders"),
    paymentStatus: v.union(
      v.literal("Unpaid"),
      v.literal("Partial"),
      v.literal("Paid")
    ),
    paymentMethod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    await ctx.db.patch(args.orderId, {
      paymentStatus: args.paymentStatus,
      paymentMethod: args.paymentMethod,
    });

    return args.orderId;
  },
});

/**
 * Update shipping info.
 * PRD-7: Enhanced with shipping agency usage tracking.
 */
export const updateShipping = mutation({
  args: {
    orderId: v.id("orders"),
    shippingAgency: v.optional(v.string()),
    shippingNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // PRD-7: Track shipping agency usage changes for "Top 4" button selectors
    if (args.shippingAgency !== undefined && args.shippingAgency !== order.shippingAgency) {
      // Decrement old agency usage
      if (order.shippingAgency) {
        await decrementShippingAgencyUsage(ctx, order.shippingAgency);
      }
      // Increment new agency usage
      if (args.shippingAgency) {
        await incrementShippingAgencyUsage(ctx, args.shippingAgency);
      }
    }

    await ctx.db.patch(args.orderId, {
      shippingAgency: args.shippingAgency,
      shippingNumber: args.shippingNumber,
    });

    return args.orderId;
  },
});

/**
 * Update order details (notes, delivery info, etc.).
 */
export const updateDetails = mutation({
  args: {
    orderId: v.id("orders"),
    dueDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    deliveryType: v.optional(v.string()),
    pickupLocation: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),
    contactWa: v.optional(v.string()),
    contactIg: v.optional(v.string()),
    channel: v.optional(v.string()),
    soldBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orderId, ...updates } = args;

    const order = await ctx.db.get(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const patchData: Record<string, unknown> = {};
    if (updates.dueDate !== undefined) patchData.dueDate = updates.dueDate;
    if (updates.notes !== undefined) patchData.notes = updates.notes;
    if (updates.deliveryType !== undefined)
      patchData.deliveryType = updates.deliveryType;
    if (updates.pickupLocation !== undefined)
      patchData.pickupLocation = updates.pickupLocation;
    if (updates.deliveryAddress !== undefined)
      patchData.deliveryAddress = updates.deliveryAddress;
    if (updates.contactWa !== undefined) patchData.contactWa = updates.contactWa;
    if (updates.contactIg !== undefined) patchData.contactIg = updates.contactIg;
    if (updates.channel !== undefined) patchData.channel = updates.channel;
    if (updates.soldBy !== undefined) patchData.soldBy = updates.soldBy;

    // PRD-7: Track channel usage changes for "Top 4" button selectors
    if (updates.channel !== undefined && updates.channel !== order.channel) {
      // Decrement old channel usage
      if (order.channel) {
        await decrementChannelUsage(ctx, order.channel);
      }
      // Increment new channel usage
      if (updates.channel) {
        await incrementChannelUsage(ctx, updates.channel);
      }
    }

    await ctx.db.patch(orderId, patchData);
    return orderId;
  },
});

/**
 * Cancel an order.
 * PRD-7: Enhanced with detailed cleanup and audit logging.
 *
 * This mutation:
 * 1. Validates order can be cancelled (not already completed/cancelled)
 * 2. Updates order status with cancellation details
 * 3. Marks all order items as cancelled (soft delete)
 * 4. Marks all production records as cancelled (soft delete)
 * 5. Logs cancellation event for audit trail
 */
export const cancel = mutation({
  args: {
    orderId: v.id("orders"),
    reason: v.optional(v.string()),
    reasonCategory: v.optional(v.union(
      v.literal("customer_request"),
      v.literal("out_of_stock"),
      v.literal("payment_issue"),
      v.literal("duplicate"),
      v.literal("other")
    )),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // PRD-7: Check if order can be cancelled
    if (isTerminalStatus(order.status)) {
      throw new Error("Cannot cancel a completed or already cancelled order");
    }

    const previousStatus = order.status;

    // PRD-7: Update order with cancellation details
    await ctx.db.patch(args.orderId, {
      status: "Cancelled",
      cancellationReason: args.reason,
      cancellationCategory: args.reasonCategory,
      cancelledAt: Date.now(),
    });

    // PRD-7: Mark all order items as cancelled (soft delete)
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    let itemsCancelled = 0;

    for (const item of items) {
      await ctx.db.patch(item._id, {
        isCancelled: true,
      });
      itemsCancelled++;
    }

    // PRD-7: Mark production records as cancelled (use helper)
    await cancelOrderProductionRecords(ctx, args.orderId);

    // Count how many production records were cancelled (for audit log)
    let productionRecordsCancelled = 0;
    for (const item of items) {
      const productionRecords = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();
      productionRecordsCancelled += productionRecords.length;
    }

    // PRD-7: Log cancellation event for audit trail
    await logOrderEvent(ctx, args.orderId, "cancelled", {
      fromStatus: previousStatus,
      toStatus: "Cancelled",
      reason: args.reason,
      category: args.reasonCategory,
      metadata: {
        itemsCancelled,
        productionRecordsCancelled,
      },
      triggeredBy: "user",
    });

    return {
      orderId: args.orderId,
      previousStatus,
      itemsCancelled,
      productionRecordsCancelled,
    };
  },
});

/**
 * Delete an order and its items.
 */
export const remove = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Only allow deleting Draft orders
    if (order.status !== "Draft") {
      throw new Error("Only draft orders can be deleted");
    }

    // Delete items and their production records
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    for (const item of items) {
      // PRD-5: Delete orderItemProduction records (use helper)
      await deleteProductionRecordsForItem(ctx, item._id);

      await ctx.db.delete(item._id);
    }

    // Delete order
    await ctx.db.delete(args.orderId);
    return true;
  },
});

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

/**
 * Complete an order (mark all production as done).
 * PRD-1: Kitchen Core - Wave 1.
 */
export const completeOrder = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== "Confirmed") {
      throw new Error("Only Confirmed orders can be completed");
    }

    // Update order status
    await ctx.db.patch(args.orderId, {
      status: "ProductionComplete",
    });

    // PRD-5: Mark production complete using NEW system (orderItemProduction)
    await markOrderProductionComplete(ctx, args.orderId);

    return args.orderId;
  },
});

/**
 * Revert order back to Confirmed status.
 * PRD-1: Kitchen Core - Wave 1.
 */
export const revertToConfirmed = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== "ProductionComplete") {
      throw new Error("Only ProductionComplete orders can be reverted");
    }

    // Update order status
    await ctx.db.patch(args.orderId, {
      status: "Confirmed",
    });

    // PRD-5: Reset orderItemProduction records using NEW system
    await resetOrderProductionComplete(ctx, args.orderId);

    return args.orderId;
  },
});

/**
 * Complete balls and auto-complete orders.
 * PRD-1: Kitchen Core - Wave 2.
 * PRD-5: Enhanced with dual-write to orderItemProduction.
 * PRD-7: Enhanced with automatic status transitions:
 *   - Confirmed -> InProduction (first ball filled)
 *   - InProduction -> Packaging (all balls complete)
 *
 * Applies a batch of completed balls (big or mid) to Confirmed/InProduction orders
 * in priority order.
 */
export const completeBalls = mutation({
  args: {
    ballType: v.union(v.literal("big"), v.literal("mid")),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.count <= 0) {
      throw new Error("Count must be positive");
    }

    const result = await distributeBallsToOrders(ctx, {
      ballType: args.ballType,
      count: args.count,
      trackFilledPackages: false,
    });

    return {
      completedOrderIds: result.completedOrderIds,
      transitionedToInProduction: result.transitionedToInProduction,
      ballsUsed: result.ballsUsed,
      overflow: result.overflow,
    };
  },
});

/**
 * Backfill orderItemProduction records from existing orderItems.
 * PRD-5: Migration - Wave 6.
 *
 * Run from Convex dashboard Functions tab: orders:backfillOrderItemProduction
 *
 * This creates orderItemProduction records for all existing orders that have
 * production data (productionType and productionUnits) on their items.
 */
export const backfillOrderItemProduction = mutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;

    // Get production unit types
    const bigBall = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_code", (q) => q.eq("code", "BIG_BALL"))
      .first();

    const midBall = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_code", (q) => q.eq("code", "MID_BALL"))
      .first();

    if (!bigBall || !midBall) {
      throw new Error("Production unit types not found. Run productionUnitTypes:seedDefaults first.");
    }

    // Get all orderItems with production data that don't have production records yet
    const allOrderItems = await ctx.db.query("orderItems").collect();

    // Filter to items with production data
    const itemsWithProduction = allOrderItems.filter(
      (item) => item.productionType && item.productionUnits
    );

    // Check which items already have production records
    const itemsToProcess = [];
    for (const item of itemsWithProduction.slice(0, batchSize)) {
      const existingRecords = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .first();

      if (!existingRecords) {
        itemsToProcess.push(item);
      }
    }

    // Create production records for items that need them
    const results = {
      processed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const item of itemsToProcess) {
      try {
        // Determine which production unit type to use
        const unitType = item.productionType === "original" ? bigBall : midBall;
        const unitCode = item.productionType === "original" ? "BIG_BALL" : "MID_BALL";
        const unitName = item.productionType === "original" ? "Big Ball" : "Mid Ball";

        // Calculate units based on productionUnits * quantity
        const unitsRequired = (item.productionUnits ?? 0) * item.quantity;

        // For migration: assume all units are still pending (unitsCompleted = 0)
        const unitsCompleted = 0;
        const unitsRemaining = unitsRequired;

        await ctx.db.insert("orderItemProduction", {
          orderItemId: item._id,
          productionUnitTypeId: unitType._id,
          productionUnitCode: unitCode,
          productionUnitName: unitName,
          unitsRequired,
          unitsCompleted,
          unitsRemaining,
        });

        results.processed++;
      } catch (error) {
        results.errors.push(`Item ${item._id}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    results.skipped = itemsWithProduction.length - itemsToProcess.length - results.errors.length;

    return {
      ...results,
      totalItemsWithProduction: itemsWithProduction.length,
      remainingToProcess: itemsWithProduction.length - results.processed - results.skipped,
      message: results.processed > 0
        ? `Processed ${results.processed} items. Run again if there are more to process.`
        : "No items need processing.",
    };
  },
});

/**
 * Update order-level discount.
 * PRD-5: Order System V2 - Wave 1.
 */
export const updateOrderDiscount = mutation({
  args: {
    orderId: v.id("orders"),
    discount: v.number(),
    discountType: v.union(v.literal("amount"), v.literal("percentage")),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Check order isn't in terminal state
    if (isTerminalStatus(order.status)) {
      throw new Error("Cannot modify discount on completed/cancelled order");
    }

    // Recalculate total (use original totalAmount, not finalTotal)
    const discountAmount = args.discountType === "percentage"
      ? order.totalAmount * (args.discount / 100)
      : args.discount;

    await ctx.db.patch(args.orderId, {
      orderLevelDiscount: args.discount,
      orderLevelDiscountType: args.discountType,
      finalTotal: order.totalAmount - discountAmount,
    });

    return args.orderId;
  },
});

// ============================================
// PRD-6: VISUAL INVENTORY TRAY SYSTEM
// ============================================

/**
 * Get or create today's kitchen inventory tray.
 */
async function getOrCreateTodayInventory(ctx: MutationCtx) {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const existing = await ctx.db
    .query("kitchenInventory")
    .withIndex("by_date", (q) => q.eq("date", today))
    .first();

  if (existing) {
    return existing;
  }

  // Create new inventory for today
  const id = await ctx.db.insert("kitchenInventory", {
    date: today,
    originalBallCount: 0,
    biteSizedBallCount: 0,
    lastUpdated: Date.now(),
  });

  const newInventory = await ctx.db.get(id);
  if (!newInventory) throw new Error("Failed to create inventory");
  return newInventory;
}

/**
 * Add balls to tray (NO auto-distribution).
 * PRD-6: Visual Inventory Tray System
 *
 * Flow:
 * 1. Add balls to tray ONLY (no distribution)
 * 2. User clicks "Fill Orders" button separately to distribute
 *
 * This separates accumulation (adding balls) from distribution (filling orders)
 * for better UX control.
 */
export const addBallsToTray = mutation({
  args: {
    ballType: v.union(v.literal("original"), v.literal("bite_sized")),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.count <= 0) {
      throw new Error("Count must be positive");
    }

    // Get or create today's inventory
    const inventory = await getOrCreateTodayInventory(ctx);

    // Add balls to tray (NO auto-distribution)
    const fieldName = args.ballType === "original" ? "originalBallCount" : "biteSizedBallCount";
    const currentCount = args.ballType === "original" ? inventory.originalBallCount : inventory.biteSizedBallCount;
    const newCount = currentCount + args.count;

    await ctx.db.patch(inventory._id, {
      [fieldName]: newCount,
      lastUpdated: Date.now(),
    });

    // Return new count only - NO distribution
    return {
      trayCount: newCount,
      ballsAdded: args.count,
      ballType: args.ballType,
    };
  },
});

/**
 * Fill pending orders with balls from tray.
 * PRD-6: Visual Inventory Tray System - Manual Fill
 *
 * Flow:
 * 1. Get current tray inventory
 * 2. Call existing distribution helper (handles status transitions)
 * 3. Update tray with remaining balls (overflow)
 * 4. Return results for UI (animations, sounds, toasts)
 */
export const fillPendingOrders = mutation({
  args: {
    ballType: v.union(v.literal("original"), v.literal("bite_sized")),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];

    // 1. Get current tray inventory
    const tray = await ctx.db
      .query("kitchenInventory")
      .withIndex("by_date", (q) => q.eq("date", today))
      .unique();

    if (!tray) {
      return {
        success: false,
        error: "No tray inventory found",
        ballsUsed: 0,
        overflow: 0,
        filledItems: [] as Array<{ orderItemId: Id<"orderItems">; ballsAdded: number; isPackageComplete: boolean }>,
        packagesCompleted: 0,
        ordersUpdated: 0,
      };
    }

    const countField = args.ballType === "original"
      ? "originalBallCount"
      : "biteSizedBallCount";
    const availableBalls = tray[countField] ?? 0;

    if (availableBalls === 0) {
      return {
        success: false,
        error: "No balls in tray",
        ballsUsed: 0,
        overflow: 0,
        filledItems: [] as Array<{ orderItemId: Id<"orderItems">; ballsAdded: number; isPackageComplete: boolean }>,
        packagesCompleted: 0,
        ordersUpdated: 0,
      };
    }

    // 2. Call existing distribution helper (handles status transitions)
    const result = await distributeBallsToOrders(ctx, {
      ballType: args.ballType,
      count: availableBalls,
      trackFilledPackages: true,
    });

    // 3. Update tray with remaining balls (overflow)
    await ctx.db.patch(tray._id, {
      [countField]: result.overflow,
      lastUpdated: Date.now(),
    });

    // 4. Derive additional metrics from result
    // Count unique orders updated (from filledPackages)
    const uniqueOrderItemIds = new Set(result.filledPackages.map(p => p.orderItemId.toString()));
    const ordersUpdated = uniqueOrderItemIds.size;

    // Count packages completed (orders that transitioned to Packaging status)
    const packagesCompleted = result.completedOrderIds.length;

    // 5. Return results for UI (animations, sounds, toasts)
    return {
      success: true,
      ballsUsed: result.ballsUsed,
      overflow: result.overflow,
      filledItems: result.filledPackages,
      packagesCompleted,
      ordersUpdated,
      completedOrderIds: result.completedOrderIds,
      transitionedToInProduction: result.transitionedToInProduction,
    };
  },
});

/**
 * Remove a ball from tray (undo functionality).
 * PRD-6: Visual Inventory Tray System
 *
 * Removes from tray first, then from most recently filled package (LIFO).
 */
export const removeBallFromTray = mutation({
  args: {
    ballType: v.union(v.literal("original"), v.literal("bite_sized")),
  },
  handler: async (ctx, args) => {
    // Get today's inventory
    const today = new Date().toISOString().split("T")[0];
    const inventory = await ctx.db
      .query("kitchenInventory")
      .withIndex("by_date", (q) => q.eq("date", today))
      .first();

    if (!inventory) {
      throw new Error("No inventory for today");
    }

    const fieldName = args.ballType === "original" ? "originalBallCount" : "biteSizedBallCount";
    const currentCount = args.ballType === "original" ? inventory.originalBallCount : inventory.biteSizedBallCount;

    if (currentCount <= 0) {
      throw new Error("No balls in tray to remove");
    }

    // Remove from tray
    await ctx.db.patch(inventory._id, {
      [fieldName]: currentCount - 1,
      lastUpdated: Date.now(),
    });

    return {
      removedFrom: "tray",
      newTrayCount: currentCount - 1,
    };
  },
});

/**
 * Mark a specific package as packed (Yellow -> Green).
 * PRD-6: Visual Inventory Tray System - Per-package tracking
 * PRD-7: Enhanced with automatic status transitions:
 *   - Packaging -> WaitingShipment (for Delivery orders) when all items packed
 *   - Packaging -> WaitingPickup (for Pickup orders) when all items packed
 *
 * @param orderItemId - The order item ID
 * @param packageIndex - The specific package index (0 to quantity-1)
 */
export const markPackagePacked = mutation({
  args: {
    orderItemId: v.id("orderItems"),
    packageIndex: v.optional(v.number()), // Optional for backward compatibility
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.orderItemId);
    if (!item) {
      throw new Error("Order item not found");
    }

    const packageIndex = args.packageIndex ?? 0;
    const quantity = item.quantity ?? 1;

    // Validate package index
    if (packageIndex < 0 || packageIndex >= quantity) {
      throw new Error(`Invalid package index ${packageIndex}. Must be 0 to ${quantity - 1}`);
    }

    // Check if balls are filled for this package
    const ballsPerPackage = item.productionUnits ?? 1;
    const ballsFilled = item.ballsFilled ?? 0;
    const ballsForThisPackage = Math.min(
      Math.max(0, ballsFilled - (packageIndex * ballsPerPackage)),
      ballsPerPackage
    );

    if (ballsForThisPackage < ballsPerPackage) {
      throw new Error("Can only pack filled packages (yellow status)");
    }

    // Get current packed indices or initialize empty array
    const packedIndices = item.packedPackageIndices ?? [];

    // Check if already packed
    if (packedIndices.includes(packageIndex)) {
      throw new Error(`Package ${packageIndex} is already packed`);
    }

    // Add this package to packed list
    const newPackedIndices = [...packedIndices, packageIndex].sort((a, b) => a - b);

    // Determine overall packageStatus
    const totalBallsRequired = quantity * ballsPerPackage;
    const allPackagesFilled = ballsFilled >= totalBallsRequired;
    const allPackagesPacked = newPackedIndices.length >= quantity;

    let newPackageStatus: "empty" | "filling" | "filled" | "packed" = "filling";
    if (allPackagesPacked) {
      newPackageStatus = "packed";
    } else if (allPackagesFilled) {
      newPackageStatus = "filled";
    }

    await ctx.db.patch(args.orderItemId, {
      packedPackageIndices: newPackedIndices,
      packageStatus: newPackageStatus,
    });

    // Check if all items in the order are now fully packed
    const order = await ctx.db.get(item.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const allItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", item.orderId))
      .collect();

    // Filter to items with production data
    const productionItems = allItems.filter((i) => i.productionType);

    // Check if all items are fully packed (all packages in each item)
    const allItemsPacked = productionItems.every((i) => {
      if (i._id.toString() === args.orderItemId.toString()) {
        // Use the updated state for this item
        return allPackagesPacked;
      }
      // Check existing packedPackageIndices
      const packed = i.packedPackageIndices ?? [];
      const itemQuantity = i.quantity ?? 1;
      return packed.length >= itemQuantity;
    });

    // Check if all packages are packed (for frontend to show Complete Packaging button)
    let statusTransition: { from: string; to: string } | null = null;

    return {
      orderItemId: args.orderItemId,
      packageIndex,
      allPackagesPacked: allItemsPacked,
      orderId: item.orderId,
      statusTransition,
    };
  },
});

/**
 * Complete packaging for an order (manual transition after all packages packed).
 * PRD-Kitchen-UI-Flow: Phase 1 - Manual packaging completion.
 *
 * Validates that all packages are packed, then transitions to:
 * - WaitingShipment (for Delivery orders)
 * - WaitingPickup (for Pickup orders)
 */
export const completePackaging = mutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Validate order is in Packaging status
    if (order.status !== "Packaging") {
      throw new Error("Only Packaging orders can be completed. Current status: " + order.status);
    }

    // Verify all packages are packed
    const allItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Filter to items with production data
    const productionItems = allItems.filter((i) => i.productionType);

    // Check if all items are fully packed (all packages in each item)
    const allItemsPacked = productionItems.every((i) => {
      const packed = i.packedPackageIndices ?? [];
      const itemQuantity = i.quantity ?? 1;
      return packed.length >= itemQuantity;
    });

    if (!allItemsPacked) {
      throw new Error("Cannot complete packaging: some packages are not yet packed");
    }

    // Determine next status based on delivery type
    const nextStatus = order.deliveryType === "Delivery" ? "WaitingShipment" : "WaitingPickup";

    // Update order status
    await ctx.db.patch(args.orderId, {
      status: nextStatus,
    });

    // Log the transition event
    await logOrderEvent(ctx, args.orderId, "status_change", {
      fromStatus: "Packaging",
      toStatus: nextStatus,
      reason: "Packaging completed - ready for " + (order.deliveryType === "Delivery" ? "shipment" : "pickup"),
      triggeredBy: "kitchen",
    });

    return {
      orderId: args.orderId,
      newStatus: nextStatus,
    };
  },
});

/**
 * Revert order from WaitingShipment/WaitingPickup back to Packaging.
 * PRD-Kitchen-UI-Flow: Phase 1 - Allow reverting packaging completion.
 *
 * Does NOT reset packedPackageIndices - preserves packaging progress.
 */
export const revertToPackaging = mutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Validate order is in WaitingShipment or WaitingPickup status
    if (order.status !== "WaitingShipment" && order.status !== "WaitingPickup") {
      throw new Error("Can only revert from WaitingShipment or WaitingPickup. Current status: " + order.status);
    }

    const previousStatus = order.status;

    // Update order status back to Packaging
    await ctx.db.patch(args.orderId, {
      status: "Packaging",
    });

    // Log the revert event
    await logOrderEvent(ctx, args.orderId, "status_change", {
      fromStatus: previousStatus,
      toStatus: "Packaging",
      reason: "Reverted to packaging for corrections",
      triggeredBy: "kitchen",
    });

    return {
      orderId: args.orderId,
      previousStatus,
    };
  },
});

/**
 * Mark multiple packages as packed in a single mutation.
 * PRD-Kitchen-UI-Flow: "Mark all as packaged" button for product rows.
 *
 * @param orderItemId - The order item ID
 * @param packageIndices - Array of package indices to mark as packed
 */
export const markAllItemPackagesPacked = mutation({
  args: {
    orderItemId: v.id("orderItems"),
    packageIndices: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.orderItemId);
    if (!item) {
      throw new Error("Order item not found");
    }

    const quantity = item.quantity ?? 1;
    const ballsPerPackage = item.productionUnits ?? 1;
    const ballsFilled = item.ballsFilled ?? 0;
    const currentPackedIndices = item.packedPackageIndices ?? [];

    // Validate all indices and filter only filled packages
    const validIndices: number[] = [];
    for (const idx of args.packageIndices) {
      if (idx < 0 || idx >= quantity) continue;
      if (currentPackedIndices.includes(idx)) continue; // Skip already packed

      // Check if this package is filled
      const ballsForPackage = Math.min(
        Math.max(0, ballsFilled - (idx * ballsPerPackage)),
        ballsPerPackage
      );
      if (ballsForPackage >= ballsPerPackage) {
        validIndices.push(idx);
      }
    }

    if (validIndices.length === 0) {
      return { orderItemId: args.orderItemId, packedCount: 0, allPackagesPacked: false };
    }

    // Merge indices
    const newPackedIndices = [...new Set([...currentPackedIndices, ...validIndices])].sort((a, b) => a - b);

    // Determine status
    const totalBallsRequired = quantity * ballsPerPackage;
    const allPackagesFilled = ballsFilled >= totalBallsRequired;
    const allPackagesPacked = newPackedIndices.length >= quantity;

    let newPackageStatus: "empty" | "filling" | "filled" | "packed" = "filling";
    if (allPackagesPacked) {
      newPackageStatus = "packed";
    } else if (allPackagesFilled) {
      newPackageStatus = "filled";
    }

    await ctx.db.patch(args.orderItemId, {
      packedPackageIndices: newPackedIndices,
      packageStatus: newPackageStatus,
    });

    return {
      orderItemId: args.orderItemId,
      packedCount: validIndices.length,
      allPackagesPacked,
    };
  },
});

/**
 * Unmark a specific package as packed (Green -> Yellow).
 * PRD-6: Visual Inventory Tray System - Per-package tracking
 *
 * @param orderItemId - The order item ID
 * @param packageIndex - The specific package index to unpack
 */
export const unmarkPackagePacked = mutation({
  args: {
    orderItemId: v.id("orderItems"),
    packageIndex: v.optional(v.number()), // Optional for backward compatibility
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.orderItemId);
    if (!item) {
      throw new Error("Order item not found");
    }

    const packageIndex = args.packageIndex ?? 0;
    const packedIndices = item.packedPackageIndices ?? [];

    // Check if this package is packed
    if (!packedIndices.includes(packageIndex)) {
      throw new Error(`Package ${packageIndex} is not packed`);
    }

    // Remove this package from packed list
    const newPackedIndices = packedIndices.filter((i) => i !== packageIndex);

    // Determine new packageStatus
    const quantity = item.quantity ?? 1;
    const ballsPerPackage = item.productionUnits ?? 1;
    const ballsFilled = item.ballsFilled ?? 0;
    const totalBallsRequired = quantity * ballsPerPackage;
    const allPackagesFilled = ballsFilled >= totalBallsRequired;

    let newPackageStatus: "empty" | "filling" | "filled" | "packed" = "filling";
    if (newPackedIndices.length >= quantity) {
      newPackageStatus = "packed";
    } else if (allPackagesFilled) {
      newPackageStatus = "filled";
    }

    await ctx.db.patch(args.orderItemId, {
      packedPackageIndices: newPackedIndices,
      packageStatus: newPackageStatus,
    });

    return {
      orderItemId: args.orderItemId,
      packageIndex,
    };
  },
});

// ============================================
// MIGRATIONS
// ============================================

// Channel code mapping: old short codes -> new full names
const CHANNEL_MIGRATION_MAP: Record<string, string> = {
  "WA": "whatsapp",
  "IG": "instagram",
  "SHP": "shopee",
  "TT": "tiktok",
  "TKP": "tokopedia",
  "GRB": "grabfood",
  "K3M": "k3mart_gf",
  "LTT": "legato_tamtem",
  "LGF": "legato_goldfinch",
  "BZR": "bazaar",
  "OTH": "other",
};

/**
 * Migrate old channel codes to new channel values.
 * Run from Convex dashboard Functions tab: orders:migrateChannelCodes
 *
 * Converts old short codes (WA, IG, etc.) to new full names (whatsapp, instagram, etc.)
 */
export const migrateChannelCodes = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;

    // Get all orders
    const allOrders = await ctx.db.query("orders").collect();

    const results = {
      total: allOrders.length,
      migrated: 0,
      alreadyValid: 0,
      nullOrEmpty: 0,
      updates: [] as { orderId: string; orderNumber: string; from: string; to: string }[],
    };

    // Valid new channel values
    const validChannels = new Set([
      "whatsapp", "instagram", "shopee", "tiktok", "tokopedia",
      "grabfood", "k3mart_gf", "legato_tamtem", "legato_goldfinch",
      "bazaar", "other"
    ]);

    for (const order of allOrders) {
      const channel = order.channel;

      // Skip null/undefined channels
      if (!channel) {
        results.nullOrEmpty++;
        continue;
      }

      // Skip already valid channels
      if (validChannels.has(channel)) {
        results.alreadyValid++;
        continue;
      }

      // Check if it's an old code that needs migration
      const newChannel = CHANNEL_MIGRATION_MAP[channel];
      if (newChannel) {
        results.updates.push({
          orderId: order._id,
          orderNumber: order.orderNumber,
          from: channel,
          to: newChannel,
        });

        if (!dryRun) {
          await ctx.db.patch(order._id, {
            channel: newChannel as "whatsapp" | "instagram" | "shopee" | "tiktok" | "tokopedia" | "grabfood" | "k3mart_gf" | "legato_tamtem" | "legato_goldfinch" | "bazaar" | "other",
          });
        }

        results.migrated++;
      }
    }

    return {
      ...results,
      dryRun,
      message: dryRun
        ? `Dry run: Would migrate ${results.migrated} orders. Run again with dryRun: false to apply.`
        : `Migrated ${results.migrated} orders from old channel codes to new values.`,
    };
  },
});

/**
 * Backfill production records for order items missing them.
 * Run from Convex dashboard Functions tab: orders:backfillProductionRecords
 *
 * Creates orderItemProduction records for items that have productionType but no production records.
 * Uses the item's productionType to determine the ball type (original -> BIG_BALL, bite_sized -> MID_BALL).
 */
export const backfillProductionRecords = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;

    // Get all order items with production type
    const allItems = await ctx.db.query("orderItems").collect();
    const itemsWithProductionType = allItems.filter(item => item.productionType);

    // Get production unit types
    const productionUnitTypes = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const bigBallType = productionUnitTypes.find(t => t.code === "BIG_BALL");
    const midBallType = productionUnitTypes.find(t => t.code === "MID_BALL");

    if (!bigBallType || !midBallType) {
      return {
        success: false,
        error: "Missing production unit types (BIG_BALL or MID_BALL). Please seed them first.",
      };
    }

    const results = {
      total: itemsWithProductionType.length,
      created: 0,
      skipped: 0,
      details: [] as { itemId: string; productionType: string; quantity: number; action: string }[],
    };

    for (const item of itemsWithProductionType) {
      // Check if production records already exist
      const existingRecords = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();

      if (existingRecords.length > 0) {
        results.skipped++;
        results.details.push({
          itemId: item._id,
          productionType: item.productionType!,
          quantity: item.quantity,
          action: "skipped (already has records)",
        });
        continue;
      }

      // Determine ball type from productionType
      const unitType = item.productionType === "original" ? bigBallType : midBallType;
      const unitsRequired = item.quantity;

      if (!dryRun) {
        await ctx.db.insert("orderItemProduction", {
          orderItemId: item._id,
          productionUnitTypeId: unitType._id,
          productionUnitCode: unitType.code,
          productionUnitName: unitType.name,
          unitsRequired,
          unitsCompleted: item.ballsFilled ?? 0, // Preserve existing progress
          unitsRemaining: Math.max(0, unitsRequired - (item.ballsFilled ?? 0)),
        });
      }

      results.created++;
      results.details.push({
        itemId: item._id,
        productionType: item.productionType!,
        quantity: item.quantity,
        action: dryRun ? "would create" : "created",
      });
    }

    return {
      ...results,
      dryRun,
      message: dryRun
        ? `Dry run: Would create ${results.created} production records. Run again with dryRun: false to apply.`
        : `Created ${results.created} production records (${results.skipped} already had records).`,
    };
  },
});
