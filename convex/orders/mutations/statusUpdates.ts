/**
 * Order Status Update mutations
 * Status, payment, shipping, and details updates
 */
import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import { statusValidator, channelValidator } from "../validators";

// Ctx-dependent helpers
import {
  incrementChannelUsage,
  decrementChannelUsage,
  incrementShippingAgencyUsage,
  decrementShippingAgencyUsage,
} from "../helpers/index";

// Audit logging + kitchen visibility
import { logOrderEvent, computeIsKitchenVisible, isTerminalStatus } from "../helpers/statusTransitions";

// Inventory integration (internal helpers)
import {
  reserveStockForOrderInternal,
  consumeProductionMaterialsInternal,
  consumeBoxingMaterialsInternal,
  consumeStickerMaterialsInternal,
  releaseReservationInternal,
} from "./inventoryIntegration";

// ============================================
// Type-safe Update Interfaces
// ============================================

interface OrderStatusUpdate {
  status: "Draft" | "AwaitingPayment" | "Confirmed" | "InProduction" | "ProductionComplete" | "Boxed" | "Labeled" | "Packaging" | "WaitingShipment" | "CompleteShipped" | "WaitingPickup" | "PickedUp" | "Cancelled";
  awaitingPaymentSince?: number;
  confirmedAt?: number;
  isKitchenVisible?: boolean;
  completedAt?: number;
}

interface OrderDetailsUpdate {
  dueDate?: number;
  notes?: string;
  deliveryType?: string;
  pickupLocation?: string;
  deliveryAddress?: string;
  contactWa?: string;
  contactIg?: string;
  channel?: "whatsapp" | "instagram" | "shopee" | "tiktok" | "tokopedia" | "grabfood" | "k3mart_gf" | "legato_tamtem" | "legato_goldfinch" | "bazaar" | "other";
  soldBy?: string;
}

// ============================================
// Mutations
// ============================================

/**
 * Update order status.
 *
 * Integrates with inventory management:
 * - Confirmed: Reserve stock for packaging components
 * - Boxed: Consume boxing materials (boxes, wrappers, ball paper)
 * - Labeled: Consume sticker materials (product/QR stickers)
 * - Cancelled: Release all reservations
 */
export const updateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: statusValidator,
    locationId: v.optional(v.id("storageLocations")),
    skipStockCheck: v.optional(v.boolean()),
    overrideReason: v.optional(v.string()),
    overrideBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const oldStatus = order.status;
    const newStatus = args.status;

    const updates: OrderStatusUpdate = {
      status: newStatus,
      isKitchenVisible: computeIsKitchenVisible(newStatus),
      completedAt: isTerminalStatus(newStatus) ? Date.now() : undefined,
    };

    // Track awaiting payment timestamp
    if (newStatus === "AwaitingPayment" && !order.awaitingPaymentSince) {
      updates.awaitingPaymentSince = Date.now();
    }

    // Track payment confirmation timestamp (revenue recognition date)
    if (newStatus === "Confirmed" && oldStatus !== "Confirmed" && !order.confirmedAt) {
      updates.confirmedAt = Date.now();
    }

    // Update order status first
    await ctx.db.patch(args.orderId, updates);

    // ============================================
    // Inventory Integration
    // ============================================

    // Reserve stock when confirming order
    if (newStatus === "Confirmed" && oldStatus !== "Confirmed") {
      try {
        await reserveStockForOrderInternal(ctx, {
          orderId: args.orderId,
          locationId: args.locationId,
          skipStockCheck: args.skipStockCheck,
        });

        // Log audit event when stock check was overridden
        if (args.skipStockCheck === true) {
          await logOrderEvent(ctx, args.orderId, "stock_override", {
            fromStatus: oldStatus,
            toStatus: newStatus,
            reason: args.overrideReason ?? "No reason provided",
            metadata: {
              overrideBy: args.overrideBy ?? "unknown",
              shortageDetails: "Stock shortage overridden by user",
            },
            triggeredBy: "user",
          });
        }
      } catch (error) {
        // Revert status on failure
        await ctx.db.patch(args.orderId, {
          status: oldStatus,
          isKitchenVisible: computeIsKitchenVisible(oldStatus),
          completedAt: isTerminalStatus(oldStatus) ? Date.now() : undefined,
        });
        throw error;
      }
    }

    // Consume production materials when entering production
    if (newStatus === "InProduction" && oldStatus !== "InProduction") {
      try {
        await consumeProductionMaterialsInternal(ctx, { orderId: args.orderId });
      } catch (error) {
        // Revert status on failure
        await ctx.db.patch(args.orderId, {
          status: oldStatus,
          isKitchenVisible: computeIsKitchenVisible(oldStatus),
          completedAt: isTerminalStatus(oldStatus) ? Date.now() : undefined,
        });
        throw error;
      }
    }

    // Consume boxing materials when marking as boxed
    if (newStatus === "Boxed" && oldStatus !== "Boxed") {
      try {
        await consumeBoxingMaterialsInternal(ctx, { orderId: args.orderId });
      } catch (error) {
        // Revert status on failure
        await ctx.db.patch(args.orderId, {
          status: oldStatus,
          isKitchenVisible: computeIsKitchenVisible(oldStatus),
          completedAt: isTerminalStatus(oldStatus) ? Date.now() : undefined,
        });
        throw error;
      }
    }

    // Consume sticker materials when marking as labeled
    if (newStatus === "Labeled" && oldStatus !== "Labeled") {
      try {
        await consumeStickerMaterialsInternal(ctx, { orderId: args.orderId });
      } catch (error) {
        // Revert status on failure
        await ctx.db.patch(args.orderId, {
          status: oldStatus,
          isKitchenVisible: computeIsKitchenVisible(oldStatus),
          completedAt: isTerminalStatus(oldStatus) ? Date.now() : undefined,
        });
        throw error;
      }
    }

    // Release reservations when cancelling
    if (newStatus === "Cancelled" && oldStatus !== "Cancelled") {
      try {
        await releaseReservationInternal(ctx, { orderId: args.orderId });
      } catch (error) {
        // Log error but don't revert (cancellation should succeed)
        console.error("Error releasing reservations:", error);
      }
    }

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
    channel: v.optional(channelValidator),
    soldBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orderId, ...updates } = args;

    const order = await ctx.db.get(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const patchData: OrderDetailsUpdate = {};
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
