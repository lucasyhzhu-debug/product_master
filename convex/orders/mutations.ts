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

  // Count today's orders
  const todayOrders = await ctx.db
    .query("orders")
    .filter((q) => q.gte(q.field("orderNumber"), prefix))
    .filter((q) => q.lt(q.field("orderNumber"), `${datePrefix}.`))
    .collect();

  const count = todayOrders.length;
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
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

    // Calculate totals
    let totalAmount = 0;
    let totalCost = 0;

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
      return { ...item, discountAmount: discount, lineTotal, lineCost, lineMargin };
    });

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

    // Create order items
    for (const item of itemsToCreate) {
      await ctx.db.insert("orderItems", {
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
      });
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
 */
export const updatePayment = mutation({
  args: {
    orderId: v.id("orders"),
    paymentStatus: v.string(),
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

    // Delete items
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    for (const item of items) {
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
    });

    // Update order totals
    await ctx.db.patch(args.orderId, {
      totalAmount: order.totalAmount + lineTotal,
      totalCost: order.totalCost + lineCost,
      totalMargin: order.totalMargin + lineMargin,
      itemCount: order.itemCount + 1,
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

    // Update order totals
    await ctx.db.patch(item.orderId, {
      totalAmount: order.totalAmount - item.lineTotal,
      totalCost: order.totalCost - item.lineCost,
      totalMargin: order.totalMargin - item.lineMargin,
      itemCount: order.itemCount - 1,
    });

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

    // Update order totals
    await ctx.db.patch(item.orderId, {
      totalAmount: order.totalAmount + amountDiff,
      totalCost: order.totalCost + costDiff,
      totalMargin: order.totalMargin + marginDiff,
    });

    return args.itemId;
  },
});
