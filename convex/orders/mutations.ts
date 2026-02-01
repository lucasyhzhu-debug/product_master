import { mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

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

function calculateLineTotals(
  quantity: number,
  unitPrice: number,
  unitCost: number,
  discountAmount: number
): { lineTotal: number; lineCost: number; lineMargin: number } {
  const discountedPrice = unitPrice - discountAmount;
  const lineTotal = quantity * discountedPrice;
  const lineCost = quantity * unitCost;
  const lineMargin = lineTotal - lineCost;
  return { lineTotal, lineCost, lineMargin };
}

/**
 * Recalculate finalTotal when totalAmount changes.
 * Handles both percentage and amount-based discounts.
 */
function recalculateFinalTotal(
  totalAmount: number,
  discount?: number,
  discountType?: "amount" | "percentage"
): number {
  if (discount === undefined || discount === 0) {
    return totalAmount;
  }
  const discountAmount =
    discountType === "percentage"
      ? totalAmount * (discount / 100)
      : discount;
  return totalAmount - discountAmount;
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
    channel: v.optional(v.string()),
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
        // Initialize ballsRemaining = productionUnits * quantity
        ballsRemaining: menuProductData
          ? menuProductData.productionUnits * item.quantity
          : undefined,
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
        ballsRemaining: item.ballsRemaining,
      });

      // PRD-5: Create orderItemProduction records (new production tracking system)
      if (item.menuProductId) {
        const components = menuProductComponentsMap.get(item.menuProductId.toString());
        if (components && components.length > 0) {
          for (const comp of components) {
            const unitsRequired = comp.quantity * item.quantity;
            await ctx.db.insert("orderItemProduction", {
              orderItemId,
              productionUnitTypeId: comp.productionUnitTypeId,
              productionUnitCode: comp.productionUnitCode,
              productionUnitName: comp.productionUnitName,
              unitsRequired,
              unitsCompleted: 0,
              unitsRemaining: unitsRequired,
            });
          }
        }
      }
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

    await ctx.db.patch(orderId, patchData);
    return orderId;
  },
});

/**
 * Cancel an order.
 */
export const cancel = mutation({
  args: {
    orderId: v.id("orders"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    await ctx.db.patch(args.orderId, {
      status: "Cancelled",
      cancellationReason: args.reason,
    });

    return args.orderId;
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
      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.item.menuProductId!))
        .collect();

      for (const comp of components) {
        const unitType = await ctx.db.get(comp.productionUnitTypeId);
        const unitsRequired = comp.quantity * args.item.quantity;
        await ctx.db.insert("orderItemProduction", {
          orderItemId: itemId,
          productionUnitTypeId: comp.productionUnitTypeId,
          productionUnitCode: unitType?.code ?? "UNKNOWN",
          productionUnitName: unitType?.name ?? "Unknown",
          unitsRequired,
          unitsCompleted: 0,
          unitsRemaining: unitsRequired,
        });
      }
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

    // PRD-5: Delete orderItemProduction records
    const productionRecords = await ctx.db
      .query("orderItemProduction")
      .withIndex("by_order_item", (q) => q.eq("orderItemId", args.itemId))
      .collect();

    for (const record of productionRecords) {
      await ctx.db.delete(record._id);
    }

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

    // PRD-5: Update orderItemProduction records with new quantity
    const productionRecords = await ctx.db
      .query("orderItemProduction")
      .withIndex("by_order_item", (q) => q.eq("orderItemId", args.itemId))
      .collect();

    // Get menu product components to recalculate
    if (item.menuProductId) {
      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", item.menuProductId!))
        .collect();

      // Create a map of component productionUnitTypeId to quantity
      const componentMap = new Map<string, number>();
      for (const comp of components) {
        componentMap.set(comp.productionUnitTypeId.toString(), comp.quantity);
      }

      // Update each production record
      for (const record of productionRecords) {
        const componentQty = componentMap.get(record.productionUnitTypeId.toString()) ?? 0;
        const newUnitsRequired = componentQty * args.quantity;
        // Recalculate remaining (keep completed the same, adjust remaining)
        const newUnitsRemaining = Math.max(0, newUnitsRequired - record.unitsCompleted);

        await ctx.db.patch(record._id, {
          unitsRequired: newUnitsRequired,
          unitsRemaining: newUnitsRemaining,
        });
      }
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

    // Set all item ballsRemaining to 0 (DEPRECATED - kept for dual-write)
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    for (const item of items) {
      await ctx.db.patch(item._id, {
        ballsRemaining: 0,
        isProductionComplete: true,
      });

      // PRD-5: Update orderItemProduction records
      const productionRecords = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();

      for (const record of productionRecords) {
        await ctx.db.patch(record._id, {
          unitsCompleted: record.unitsRequired,
          unitsRemaining: 0,
        });
      }
    }

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

    // Reset ballsRemaining to productionUnits (DEPRECATED - kept for dual-write)
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    for (const item of items) {
      await ctx.db.patch(item._id, {
        ballsRemaining: item.productionUnits ?? 0,
        isProductionComplete: false,
      });

      // PRD-5: Reset orderItemProduction records
      const productionRecords = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();

      for (const record of productionRecords) {
        await ctx.db.patch(record._id, {
          unitsCompleted: 0,
          unitsRemaining: record.unitsRequired,
        });
      }
    }

    return args.orderId;
  },
});

/**
 * Complete balls and auto-complete orders.
 * PRD-1: Kitchen Core - Wave 2.
 * PRD-5: Enhanced with dual-write to orderItemProduction.
 *
 * Applies a batch of completed balls (big or mid) to Confirmed orders
 * in priority order. Orders are automatically marked as ProductionComplete
 * when all their items reach ballsRemaining = 0.
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

    // PRD-5: Map ball type to production unit code
    const productionUnitCode = args.ballType === "big" ? "BIG_BALL" : "MID_BALL";

    // Get Confirmed orders sorted by priority (same as getKitchenOrders)
    const confirmedOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Confirmed"))
      .collect();

    // Fetch items for each order and calculate ball needs (for sorting)
    const ordersWithItems = await Promise.all(
      confirmedOrders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        // PRD-5: Fetch production records for each item
        const itemsWithProduction = await Promise.all(
          items.map(async (item) => {
            const productionRecords = await ctx.db
              .query("orderItemProduction")
              .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
              .collect();
            return { ...item, productionRecords };
          })
        );

        let bigBallsNeeded = 0;
        let midBallsNeeded = 0;

        for (const item of items) {
          if (item.productionType === "original" && item.productionUnits) {
            bigBallsNeeded += item.productionUnits;
          } else if (item.productionType === "bite_sized" && item.productionUnits) {
            midBallsNeeded += item.productionUnits;
          }
        }

        return {
          order,
          items: itemsWithProduction,
          bigBallsNeeded,
          midBallsNeeded,
        };
      })
    );

    // Sort by: dueDate ASC → totalUnits DESC → orderDate ASC
    const sortedOrders = ordersWithItems.sort((a, b) => {
      // Sort by due date first (earliest first)
      if (a.order.dueDate !== b.order.dueDate) {
        if (!a.order.dueDate && !b.order.dueDate) return 0;
        if (!a.order.dueDate) return 1;
        if (!b.order.dueDate) return -1;
        return a.order.dueDate - b.order.dueDate;
      }

      // Then by total units (most first)
      const aTotalUnits = a.bigBallsNeeded + a.midBallsNeeded;
      const bTotalUnits = b.bigBallsNeeded + b.midBallsNeeded;
      if (aTotalUnits !== bTotalUnits) {
        return bTotalUnits - aTotalUnits;
      }

      // Finally by order date (earliest first)
      return a.order.orderDate - b.order.orderDate;
    });

    // Apply balls to orders
    let remainingBalls = args.count;
    const completedOrderIds: Id<"orders">[] = [];
    const productionTypeFilter = args.ballType === "big" ? "original" : "bite_sized";

    // Track updated ballsRemaining for accurate auto-completion check
    const updatedBallsRemaining = new Map<string, number>();

    for (const { order, items } of sortedOrders) {
      if (remainingBalls <= 0) break;

      // Filter items by production type matching ball type (OLD system)
      const matchingItems = items.filter(
        (item) => item.productionType === productionTypeFilter
      );

      // Apply balls to matching items (OLD system - dual-write)
      for (const item of matchingItems) {
        if (remainingBalls <= 0) break;

        const currentBallsRemaining = item.ballsRemaining ?? 0;
        if (currentBallsRemaining <= 0) continue;

        const ballsToApply = Math.min(remainingBalls, currentBallsRemaining);
        const newBallsRemaining = currentBallsRemaining - ballsToApply;

        await ctx.db.patch(item._id, {
          ballsRemaining: newBallsRemaining,
        });

        // Track the updated value
        updatedBallsRemaining.set(item._id.toString(), newBallsRemaining);

        remainingBalls -= ballsToApply;
      }

      // PRD-5: Apply balls to orderItemProduction records (NEW system - dual-write)
      let remainingForNewSystem = args.count;
      for (const item of items) {
        if (remainingForNewSystem <= 0) break;

        // Find matching production records by unit code
        const matchingRecords = item.productionRecords.filter(
          (r) => r.productionUnitCode === productionUnitCode && r.unitsRemaining > 0
        );

        for (const record of matchingRecords) {
          if (remainingForNewSystem <= 0) break;

          const unitsToApply = Math.min(remainingForNewSystem, record.unitsRemaining);
          const newUnitsRemaining = record.unitsRemaining - unitsToApply;
          const newUnitsCompleted = record.unitsCompleted + unitsToApply;

          await ctx.db.patch(record._id, {
            unitsCompleted: newUnitsCompleted,
            unitsRemaining: newUnitsRemaining,
          });

          remainingForNewSystem -= unitsToApply;
        }
      }

      // Check if ALL items in the order have ballsRemaining = 0 (using tracked values)
      // IMPORTANT: Only consider items that have production data (productionType set)
      const itemsWithProductionData = items.filter((item) => item.productionType);

      // If no items have production data, don't auto-complete this order
      if (itemsWithProductionData.length === 0) {
        continue;
      }

      const allComplete = itemsWithProductionData.every((item) => {
        // Check if we updated this item
        const updatedValue = updatedBallsRemaining.get(item._id.toString());
        if (updatedValue !== undefined) {
          return updatedValue <= 0;
        }
        // This item wasn't updated, check its original value
        return (item.ballsRemaining ?? 0) <= 0;
      });

      if (allComplete) {
        await ctx.db.patch(order._id, {
          status: "ProductionComplete",
        });

        // PRD-5: Mark all items as production complete
        for (const item of items) {
          await ctx.db.patch(item._id, {
            isProductionComplete: true,
          });
        }

        completedOrderIds.push(order._id);
      }
    }

    const ballsUsed = args.count - remainingBalls;
    const overflow = remainingBalls;

    return {
      completedOrderIds,
      ballsUsed,
      overflow,
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

        // If ballsRemaining is 0, the item is complete
        const ballsRemaining = item.ballsRemaining ?? unitsRequired;
        const unitsCompleted = unitsRequired - ballsRemaining;

        await ctx.db.insert("orderItemProduction", {
          orderItemId: item._id,
          productionUnitTypeId: unitType._id,
          productionUnitCode: unitCode,
          productionUnitName: unitName,
          unitsRequired,
          unitsCompleted: Math.max(0, unitsCompleted),
          unitsRemaining: Math.max(0, ballsRemaining),
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
    const terminalStatuses = ["CompleteShipped", "PickedUp", "Cancelled"];
    if (terminalStatuses.includes(order.status)) {
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
