/**
 * Order CRUD mutations
 * Core order lifecycle: create, cancel, remove, complete
 */
import { mutation, type MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";

// Pure calculation helpers (no ctx dependency)
import { calculateLineTotals, generateOrderNumber as formatOrderNumber } from "../helpers";

// Ctx-dependent helpers from helpers/ directory
import {
  distributeBallsToOrders,
  logOrderEvent,
  logStatusTransition,
  isTerminalStatus,
  createProductionRecordsForItem,
  cancelOrderProductionRecords,
  markOrderProductionComplete,
  resetOrderProductionComplete,
  validateAndApplyVoucher,
  recordVoucherUsage,
  releaseVoucherUsage,
  validateFinalPrice,
} from "../helpers/index";

// Auth helper for token -> userId resolution
import { getSessionUser } from "../../lib/auth";

// Shared validators
import { orderItemInput } from "../validators";

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

  // Use pure helper for format string generation
  const orderNumber = formatOrderNumber(now, maxSequence);

  // Verify uniqueness (handles race condition)
  const existing = await ctx.db
    .query("orders")
    .withIndex("by_order_number", (q) => q.eq("orderNumber", orderNumber))
    .first();

  if (existing) {
    // Rare race condition - retry with incremented sequence
    return formatOrderNumber(now, maxSequence + 1);
  }

  return orderNumber;
}

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
    soldBy: v.optional(v.string()),
    createdByUserId: v.optional(v.id("users")),
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
    // Voucher (optional - if provided, will validate and apply)
    voucherCode: v.optional(v.string()),
    lowPriceConfirmed: v.optional(v.boolean()), // Required if final price < 20k
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

    // BOM-02: Removed menuProductsMap for deprecated productionType/productionUnits.
    // New orders no longer stamp these fields on orderItems. BOM production records
    // (created by createProductionRecordsForItem below) are the sole source of truth.

    // PRD-5: Fetch menu product components for new production tracking
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
            const componentType = await ctx.db.get(comp.componentTypeId);
            if (!componentType) return null;

            // Bridge: find productionUnitType by code (required by orderItemProduction schema)
            const productionUnitType = await ctx.db
              .query("productionUnitTypes")
              .withIndex("by_code", (q) => q.eq("code", componentType.code))
              .first();

            if (!productionUnitType) return null;

            return {
              productionUnitTypeId: productionUnitType._id,
              productionUnitCode: componentType.code,
              productionUnitName: componentType.name,
              quantity: comp.quantity,
            };
          })
        );

        // Filter out null entries
        const validComponents = enrichedComponents.filter((c) => c !== null);
        if (validComponents.length > 0) {
          menuProductComponentsMap.set(
            mpId.toString(),
            validComponents as Array<{
              productionUnitTypeId: Id<"productionUnitTypes">;
              productionUnitCode: string;
              productionUnitName: string;
              quantity: number;
            }>
          );
        }
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

      // BOM-02: No longer stamp productionType/productionUnits from menuProduct.
      // Production tracking uses orderItemProduction records (created below).
      return {
        ...item,
        discountAmount: discount,
        lineTotal,
        lineCost,
        lineMargin,
      };
    });

    // Calculate order-level discount (manual discount)
    let manualDiscountAmount = 0;
    if (args.orderLevelDiscount !== undefined && args.orderLevelDiscountType !== undefined) {
      if (args.orderLevelDiscountType === "percentage") {
        manualDiscountAmount = totalAmount * (args.orderLevelDiscount / 100);
      } else {
        manualDiscountAmount = args.orderLevelDiscount;
      }
    }

    // Process voucher if provided
    let voucherInfo: {
      voucherId: Id<"vouchers">;
      voucherCode: string;
      voucherDiscountValue: number;
    } | undefined;

    if (args.voucherCode) {
      // Voucher and manual discount are mutually exclusive
      // If voucher is provided, it overrides manual discount
      voucherInfo = await validateAndApplyVoucher(
        ctx,
        args.voucherCode,
        totalAmount,
        customerId
      );
      // Use voucher discount instead of manual discount
      manualDiscountAmount = 0;
    }

    // Calculate final total
    const totalDiscount = voucherInfo?.voucherDiscountValue ?? manualDiscountAmount;

    // Validate final price (hard block if <= 0)
    const { finalPrice, isLowPrice } = validateFinalPrice(totalAmount, totalDiscount);

    // Check low price confirmation if needed
    if (isLowPrice && !args.lowPriceConfirmed) {
      throw new Error(
        "CONFIRMATION_REQUIRED:LOW_PRICE:Final price is below Rp 20,000. Please confirm this is intentional."
      );
    }

    const finalTotal = finalPrice;

    // Create order
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerId,
      customerName,
      customerPhone,
      status: "Draft",
      isKitchenVisible: true,
      paymentStatus: "Unpaid",
      orderDate: Date.now(),
      dueDate: args.dueDate,
      totalAmount,
      totalCost,
      totalMargin: totalAmount - totalCost,
      // Manual discount (only used if no voucher)
      orderLevelDiscount: voucherInfo ? undefined : args.orderLevelDiscount,
      orderLevelDiscountType: voucherInfo ? undefined : args.orderLevelDiscountType,
      finalTotal,
      // Voucher info (if applied)
      voucherId: voucherInfo?.voucherId,
      voucherCode: voucherInfo?.voucherCode,
      voucherDiscountValue: voucherInfo?.voucherDiscountValue,
      lowPriceConfirmed: isLowPrice ? args.lowPriceConfirmed : undefined,
      // Other fields
      soldBy: args.soldBy,
      createdByUserId: args.createdByUserId,
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
        // BOM-02: productionType/productionUnits no longer stamped.
        // Ball composition is tracked via orderItemProduction records (below).
      });

      // PRD-5: Create orderItemProduction records (new production tracking system)
      if (item.menuProductId) {
        await createProductionRecordsForItem(ctx, orderItemId, item.menuProductId, item.quantity);
      }
    }

    // Record voucher usage if voucher was applied
    if (voucherInfo) {
      await recordVoucherUsage(ctx, voucherInfo.voucherId, customerId, orderId);
    }

    // GAP-02: Log audit event for Draft creation so audit trail starts from order creation
    await logOrderEvent(ctx, orderId, "created", {
      toStatus: "Draft",
      triggeredBy: "user",
      userId: args.createdByUserId,
    });

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
      isKitchenVisible: false,
      completedAt: Date.now(),
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

    // Release voucher usage if voucher was applied
    if (order.voucherId) {
      await releaseVoucherUsage(ctx, order.voucherId, args.orderId);
    }

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
      // PRD-5: Delete orderItemProduction records
      const productionRecords = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();

      for (const record of productionRecords) {
        await ctx.db.delete(record._id);
      }

      await ctx.db.delete(item._id);
    }

    // Delete order
    await ctx.db.delete(args.orderId);
    return true;
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

    if (order.status !== "BeingPrepared") {
      throw new Error("Only BeingPrepared orders can be completed");
    }

    // Update order status - BeingPrepared -> AwaitingDelivery
    await ctx.db.patch(args.orderId, {
      status: "AwaitingDelivery",
      isKitchenVisible: false,
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

    if (order.status !== "AwaitingDelivery") {
      throw new Error("Only AwaitingDelivery orders can be reverted to BeingPrepared");
    }

    // Update order status - AwaitingDelivery -> BeingPrepared
    await ctx.db.patch(args.orderId, {
      status: "BeingPrepared",
      isKitchenVisible: true,
      completedAt: undefined,
    });

    // PRD-5: Reset orderItemProduction records using NEW system
    await resetOrderProductionComplete(ctx, args.orderId);

    return args.orderId;
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

/**
 * Complete balls and auto-complete orders.
 * PRD-1: Kitchen Core - Wave 2.
 * PRD-5: Enhanced with dual-write to orderItemProduction.
 * PRD-7: Enhanced with automatic status transitions:
 *   - Confirmed -> InProduction (first ball filled)
 *   - InProduction -> Packaging (all balls complete)
 *
 * Applies a batch of completed balls (big or mid) to BeingPrepared orders
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
      ballsUsed: result.ballsUsed,
      overflow: result.overflow,
    };
  },
});

// ============================================
// Phase 14.1: Draft Order Mutations
// ============================================

/**
 * Create a minimal Draft order with just a customer.
 * No items required -- Draft persists immediately on customer selection.
 *
 * Phase 14.1: Auto-creates Draft the moment a customer is selected in the new order form.
 */
export const createDraft = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    newCustomer: v.optional(
      v.object({
        name: v.string(),
        phone: v.optional(v.string()),
      })
    ),
    createdByUserId: v.optional(v.id("users")),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Resolve customer (same pattern as existing create mutation)
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
        createdBy: args.createdBy ?? "admin",
      });
      customerName = args.newCustomer.name;
      customerPhone = args.newCustomer.phone;
    } else {
      throw new Error("Either customerId or newCustomer is required");
    }

    // Generate order number
    const orderNumber = await generateOrderNumber(ctx);

    // Create minimal Draft order
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerId,
      customerName,
      customerPhone,
      status: "Draft",
      isKitchenVisible: false,
      paymentStatus: "Unpaid",
      orderDate: Date.now(),
      totalAmount: 0,
      totalCost: 0,
      totalMargin: 0,
      finalTotal: 0,
      itemCount: 0,
      deliveryType: "Pickup",
      createdBy: args.createdBy ?? "admin",
      createdByUserId: args.createdByUserId,
    });

    // Log audit event
    await logOrderEvent(ctx, orderId, "created", {
      toStatus: "Draft",
      triggeredBy: "user",
      userId: args.createdByUserId,
    });

    return orderId;
  },
});

/**
 * Update all editable fields on a Draft order.
 * Does NOT handle items -- frontend uses replaceItems from itemCrud.ts for that.
 *
 * Phase 14.1: Full Draft editing (customer change, due date, delivery, voucher, notes).
 */
export const updateDraft = mutation({
  args: {
    orderId: v.id("orders"),
    customerId: v.optional(v.id("customers")),
    newCustomer: v.optional(
      v.object({
        name: v.string(),
        phone: v.optional(v.string()),
      })
    ),
    dueDate: v.optional(v.number()),
    deliveryAddress: v.optional(v.string()),
    deliveryType: v.optional(v.string()),
    notes: v.optional(v.string()),
    voucherCode: v.optional(v.string()),
    lowPriceConfirmed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }
    if (order.status !== "Draft") {
      throw new Error("Can only update Draft orders via updateDraft");
    }

    // Build patch object from provided optional fields
    const patch: Record<string, unknown> = {};

    // Handle customer change
    if (args.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (!customer) {
        throw new Error("Customer not found");
      }
      patch.customerId = args.customerId;
      patch.customerName = customer.name;
      patch.customerPhone = customer.phone;
    } else if (args.newCustomer) {
      const newCustomerId = await ctx.db.insert("customers", {
        name: args.newCustomer.name,
        phone: args.newCustomer.phone,
        createdBy: order.createdBy ?? "admin",
      });
      patch.customerId = newCustomerId;
      patch.customerName = args.newCustomer.name;
      patch.customerPhone = args.newCustomer.phone;
    }

    // Patch simple fields (only if explicitly provided)
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
    if (args.deliveryAddress !== undefined) patch.deliveryAddress = args.deliveryAddress;
    if (args.deliveryType !== undefined) patch.deliveryType = args.deliveryType;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.lowPriceConfirmed !== undefined) patch.lowPriceConfirmed = args.lowPriceConfirmed;

    // Handle voucher change
    if (args.voucherCode !== undefined) {
      const currentCustomerId = (patch.customerId as Id<"customers"> | undefined) ?? order.customerId;

      if (args.voucherCode === "") {
        // Clear voucher
        if (order.voucherId) {
          await releaseVoucherUsage(ctx, order.voucherId, args.orderId);
        }
        patch.voucherId = undefined;
        patch.voucherCode = undefined;
        patch.voucherDiscountValue = undefined;
        // Recalculate finalTotal without voucher
        patch.finalTotal = order.totalAmount;
      } else if (args.voucherCode !== order.voucherCode) {
        // New/changed voucher
        // Release old voucher if exists
        if (order.voucherId) {
          await releaseVoucherUsage(ctx, order.voucherId, args.orderId);
        }
        // Validate and apply new voucher
        const voucherInfo = await validateAndApplyVoucher(
          ctx,
          args.voucherCode,
          order.totalAmount,
          currentCustomerId
        );
        patch.voucherId = voucherInfo.voucherId;
        patch.voucherCode = voucherInfo.voucherCode;
        patch.voucherDiscountValue = voucherInfo.voucherDiscountValue;
        // Record usage
        await recordVoucherUsage(ctx, voucherInfo.voucherId, currentCustomerId, args.orderId);
        // Recalculate finalTotal with new voucher
        patch.finalTotal = order.totalAmount - voucherInfo.voucherDiscountValue;
      }
    }

    // Apply patch if there are changes
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.orderId, patch);
    }

    return args.orderId;
  },
});

// ============================================
// Phase 14: Order Lifecycle Mutations
// ============================================

/**
 * Submit a Draft order, transitioning it to AwaitingPayment.
 * Validates the order has items before submission.
 *
 * Phase 14: "Submit Order" action on Kanban Draft column.
 */
export const submitOrder = mutation({
  args: {
    orderId: v.id("orders"),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "Draft") throw new Error("Can only submit Draft orders");

    // Validate order has items
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .filter((q) => q.neq(q.field("isCancelled"), true))
      .collect();

    if (items.length === 0) {
      throw new Error("Cannot submit order with no items");
    }

    await ctx.db.patch(args.orderId, {
      status: "AwaitingPayment",
      awaitingPaymentSince: Date.now(),
      isKitchenVisible: false,
    });

    // Resolve userId from token for audit trail
    let userId: Id<"users"> | undefined;
    if (args.token) {
      const user = await getSessionUser(ctx, args.token);
      if (user) userId = user._id;
    }

    await logStatusTransition(
      ctx,
      args.orderId,
      "Draft",
      "AwaitingPayment",
      "Order submitted",
      "user",
      userId
    );

    return args.orderId;
  },
});

/**
 * Create a new Draft order by copying details from a cancelled order.
 * Copies customer, items (quantities, prices), and delivery info.
 * Due date defaults to tomorrow. Vouchers are removed.
 *
 * Phase 14: "Copy to new order" on cancelled order cards.
 */
export const copyFromCancelled = mutation({
  args: {
    orderId: v.id("orders"),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sourceOrder = await ctx.db.get(args.orderId);
    if (!sourceOrder) throw new Error("Order not found");
    if (sourceOrder.status !== "Cancelled") {
      throw new Error("Can only copy from Cancelled orders");
    }

    // Get source items (include cancelled items -- they represent the original order)
    const sourceItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Generate new order number
    const orderNumber = await generateOrderNumber(ctx);

    // Due date defaults to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dueDate = tomorrow.getTime();

    // Resolve creator from token
    let createdByUserId: Id<"users"> | undefined;
    let createdBy = sourceOrder.createdBy;
    if (args.token) {
      const user = await getSessionUser(ctx, args.token);
      if (user) {
        createdByUserId = user._id;
        createdBy = user.name;
      }
    }

    // Recalculate totals from source items (no voucher)
    let totalAmount = 0;
    let totalCost = 0;
    const activeItems = sourceItems.filter((item) => !item.isCancelled);

    for (const item of activeItems) {
      totalAmount += item.lineTotal;
      totalCost += item.lineCost;
    }

    // Create new order (no voucher, no manual discount)
    const newOrderId = await ctx.db.insert("orders", {
      orderNumber,
      customerId: sourceOrder.customerId,
      customerName: sourceOrder.customerName,
      customerPhone: sourceOrder.customerPhone,
      status: "Draft",
      isKitchenVisible: false,
      paymentStatus: "Unpaid",
      orderDate: Date.now(),
      dueDate,
      totalAmount,
      totalCost,
      totalMargin: totalAmount - totalCost,
      finalTotal: totalAmount, // No discount on copy
      deliveryType: sourceOrder.deliveryType,
      pickupLocation: sourceOrder.pickupLocation,
      deliveryAddress: sourceOrder.deliveryAddress,
      contactWa: sourceOrder.contactWa,
      contactIg: sourceOrder.contactIg,
      notes: sourceOrder.notes,
      soldBy: sourceOrder.soldBy,
      createdBy,
      createdByUserId,
      copiedFromOrderId: args.orderId,
      itemCount: activeItems.length,
    });

    // Copy items (non-cancelled only) and create production records
    for (const item of activeItems) {
      const orderItemId = await ctx.db.insert("orderItems", {
        orderId: newOrderId,
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
      });

      // Create production records for items with menu products
      if (item.menuProductId) {
        await createProductionRecordsForItem(ctx, orderItemId, item.menuProductId, item.quantity);
      }
    }

    // Log creation event
    await logOrderEvent(ctx, newOrderId, "order_created", {
      reason: `Copied from cancelled order ${sourceOrder.orderNumber}`,
      triggeredBy: "user",
      userId: createdByUserId,
      metadata: {
        copiedFromOrderId: args.orderId,
        copiedFromOrderNumber: sourceOrder.orderNumber,
      },
    });

    return newOrderId;
  },
});
