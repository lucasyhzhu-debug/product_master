/**
 * Order Status Update mutations
 * Phase 14: Simplified for 7-status Kanban workflow.
 *
 * Inventory integration:
 * - PaymentReceived: Reserve stock for packaging components
 * - BeingPrepared: Consume all materials (production + boxing + sticker)
 * - Cancelled: Release all reservations
 */
import { mutation } from "../../_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { statusValidator, channelValidator } from "../validators";
import { protectedMutation } from "../../lib/functions";

// Ctx-dependent helpers
import {
  incrementChannelUsage,
  decrementChannelUsage,
  incrementShippingAgencyUsage,
  decrementShippingAgencyUsage,
} from "../helpers/index";

// Pure helpers
import { parseDeliveryAddress } from "../helpers";

// Audit logging + kitchen visibility + transition validation
import {
  logOrderEvent,
  logStatusTransition,
  computeIsKitchenVisible,
  isTerminalStatus,
  isValidBackwardTransition,
  FORWARD_TRANSITIONS,
} from "../helpers/statusTransitions";

// Auth helper for token -> userId resolution
import { getSessionUser } from "../../lib/auth";

// Inventory integration (internal helpers)
import {
  reserveStockForOrderInternal,
  consumeProductionMaterialsInternal,
  consumeBoxingMaterialsInternal,
  consumeStickerMaterialsInternal,
  consumeIngredientMaterialsInternal,
  releaseReservationInternal,
} from "./inventoryIntegration";

// ============================================
// Type-safe Update Interfaces
// ============================================

interface OrderStatusUpdate {
  status: "Draft" | "AwaitingPayment" | "PaymentReceived" | "BeingPrepared" | "AwaitingDelivery" | "Complete" | "Cancelled";
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
 * @deprecated For new code, prefer `moveForward` and `moveBackward` which validate
 * transitions and handle side effects. This mutation is retained as a lower-level
 * escape hatch for edge cases.
 *
 * Integrates with inventory management:
 * - PaymentReceived: Reserve stock for packaging components
 * - BeingPrepared: Consume all materials (production + boxing + sticker) at once
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
    // Phase 14: Audit trail for backward transitions
    reason: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new ConvexError("Order not found");
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
    if (newStatus === "PaymentReceived" && oldStatus !== "PaymentReceived" && !order.confirmedAt) {
      updates.confirmedAt = Date.now();
    }

    // Phase 14: Backward transition from PaymentReceived clears confirmedAt (sales reversal)
    if (oldStatus === "PaymentReceived" && (newStatus === "AwaitingPayment" || newStatus === "Draft")) {
      updates.confirmedAt = undefined;
    }

    // Update order status first
    await ctx.db.patch(args.orderId, updates);

    // ============================================
    // Inventory Integration
    // ============================================

    // Reserve stock when payment received
    if (newStatus === "PaymentReceived" && oldStatus !== "PaymentReceived") {
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
            userId: args.userId,
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

    // Consume ALL materials when entering BeingPrepared (production + boxing + sticker + ingredients)
    if (newStatus === "BeingPrepared" && oldStatus !== "BeingPrepared") {
      try {
        await consumeProductionMaterialsInternal(ctx, { orderId: args.orderId });
        await consumeBoxingMaterialsInternal(ctx, { orderId: args.orderId });
        await consumeStickerMaterialsInternal(ctx, { orderId: args.orderId });
        // Phase 20: Deduct ingredient inventory through production hierarchy
        const ingredientResult = await consumeIngredientMaterialsInternal(ctx, { orderId: args.orderId });
        if (ingredientResult.warnings.length > 0) {
          console.warn("Ingredient stock warnings:", ingredientResult.warnings);
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

    // Log status transition for audit trail
    await logStatusTransition(
      ctx,
      args.orderId,
      oldStatus,
      newStatus,
      args.reason ?? "Status updated",
      "user",
      args.userId
    );

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
      throw new ConvexError("Order not found");
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
      throw new ConvexError("Order not found");
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
      throw new ConvexError("Order not found");
    }

    const patchData: OrderDetailsUpdate = {};
    if (updates.dueDate !== undefined) patchData.dueDate = updates.dueDate;
    if (updates.notes !== undefined) patchData.notes = updates.notes;
    if (updates.deliveryType !== undefined)
      patchData.deliveryType = updates.deliveryType;
    if (updates.pickupLocation !== undefined)
      patchData.pickupLocation = updates.pickupLocation;
    if (updates.deliveryAddress !== undefined) {
      patchData.deliveryAddress = updates.deliveryAddress;
      const parsed = parseDeliveryAddress(updates.deliveryAddress);
      patchData.deliveryType = parsed.deliveryType;
      patchData.pickupLocation = parsed.pickupLocation;
    }
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

// ============================================
// Phase 14: Validated Status Transition Mutations
// ============================================

/**
 * Move an order one step forward in the Kanban workflow.
 * Validates the transition using FORWARD_TRANSITIONS map.
 * Handles status-specific side effects (stock reservation, material consumption).
 *
 * Phase 14: Replaces ad-hoc updateStatus calls for forward moves.
 */
export const moveForward = mutation({
  args: {
    orderId: v.id("orders"),
    token: v.optional(v.string()),
    locationId: v.optional(v.id("storageLocations")),
    skipStockCheck: v.optional(v.boolean()),
    overrideReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");

    const nextStatus = FORWARD_TRANSITIONS[order.status];
    if (!nextStatus) {
      throw new ConvexError(`Cannot move forward from ${order.status}`);
    }

    // Resolve userId from token
    let userId: Id<"users"> | undefined;
    if (args.token) {
      const user = await getSessionUser(ctx, args.token);
      if (user) userId = user._id;
    }

    // Build status update
    const updates: OrderStatusUpdate = {
      status: nextStatus as OrderStatusUpdate["status"],
      isKitchenVisible: computeIsKitchenVisible(nextStatus),
    };

    // Status-specific side effects
    if (nextStatus === "AwaitingPayment" && !order.awaitingPaymentSince) {
      updates.awaitingPaymentSince = Date.now();
    }

    if (nextStatus === "PaymentReceived") {
      updates.confirmedAt = Date.now();
    }

    if (nextStatus === "BeingPrepared") {
      // kitchenEnteredAt tracks when order enters kitchen (one-time)
      // isKitchenVisible is already set by computeIsKitchenVisible
    }

    if (isTerminalStatus(nextStatus)) {
      updates.completedAt = Date.now();
    }

    // GAP-03: Auto-expedite orders due today or tomorrow when reaching PaymentReceived
    let autoExpedited = false;
    if (nextStatus === "PaymentReceived" && order.dueDate) {
      // Calculate today and tomorrow boundaries in WIB (UTC+7)
      const nowMs = Date.now();
      const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
      const nowWIB = new Date(nowMs + WIB_OFFSET_MS);
      const todayStartWIB = new Date(
        Date.UTC(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), nowWIB.getUTCDate())
      ).getTime() - WIB_OFFSET_MS;
      const dayAfterTomorrowStartWIB = todayStartWIB + 2 * 24 * 60 * 60 * 1000;

      // Due date is today or tomorrow if it falls before day-after-tomorrow start
      if (order.dueDate >= todayStartWIB && order.dueDate < dayAfterTomorrowStartWIB) {
        autoExpedited = true;
        // Skip PaymentReceived, go straight to BeingPrepared (like expediteOrder)
        updates.status = "BeingPrepared" as OrderStatusUpdate["status"];
        updates.isKitchenVisible = true;
        (updates as any).expedited = true;
        (updates as any).kitchenEnteredAt = Date.now();
      }
    }

    // Apply status update
    await ctx.db.patch(args.orderId, updates);

    // Inventory integration: reserve stock on PaymentReceived (also needed for auto-expedited)
    if ((nextStatus === "PaymentReceived" || autoExpedited) && order.status !== "PaymentReceived") {
      try {
        await reserveStockForOrderInternal(ctx, {
          orderId: args.orderId,
          locationId: args.locationId,
          skipStockCheck: args.skipStockCheck,
        });

        if (args.skipStockCheck === true) {
          await logOrderEvent(ctx, args.orderId, "stock_override", {
            fromStatus: order.status,
            toStatus: nextStatus,
            reason: args.overrideReason ?? "No reason provided",
            triggeredBy: "user",
            userId,
          });
        }
      } catch (error) {
        // Revert status on failure
        await ctx.db.patch(args.orderId, {
          status: order.status,
          isKitchenVisible: computeIsKitchenVisible(order.status),
        });
        throw error;
      }
    }

    // Inventory integration: consume all materials on BeingPrepared (including auto-expedited)
    if ((nextStatus === "BeingPrepared" || autoExpedited) && order.status !== "BeingPrepared") {
      try {
        await consumeProductionMaterialsInternal(ctx, { orderId: args.orderId });
        await consumeBoxingMaterialsInternal(ctx, { orderId: args.orderId });
        await consumeStickerMaterialsInternal(ctx, { orderId: args.orderId });
        // Phase 20: Deduct ingredient inventory through production hierarchy
        const ingredientResult = await consumeIngredientMaterialsInternal(ctx, { orderId: args.orderId });
        if (ingredientResult.warnings.length > 0) {
          console.warn("Ingredient stock warnings:", ingredientResult.warnings);
        }
      } catch (error) {
        await ctx.db.patch(args.orderId, {
          status: order.status,
          isKitchenVisible: computeIsKitchenVisible(order.status),
        });
        throw error;
      }
    }

    // Audit trail
    if (autoExpedited) {
      // Log the auto-expedite as a system-triggered transition
      await logStatusTransition(
        ctx,
        args.orderId,
        order.status,
        "BeingPrepared",
        "Auto-expedited: due date is today or tomorrow",
        "system",
        userId
      );
      await logOrderEvent(ctx, args.orderId, "auto_expedited", {
        fromStatus: order.status,
        toStatus: "BeingPrepared",
        reason: "Order due today or tomorrow - auto-expedited to kitchen",
        triggeredBy: "system",
        userId,
        metadata: {
          dueDate: order.dueDate,
          skippedStatus: "PaymentReceived",
        },
      });
    } else {
      await logStatusTransition(
        ctx,
        args.orderId,
        order.status,
        nextStatus,
        "Moved forward",
        "user",
        userId
      );
    }

    return args.orderId;
  },
});

/**
 * Move an order backward in the Kanban workflow.
 * Validates the backward transition and handles reversal side effects.
 *
 * Phase 14: Backward transitions with confirmation reason and sales reversal.
 */
export const moveBackward = mutation({
  args: {
    orderId: v.id("orders"),
    targetStatus: statusValidator,
    reason: v.optional(v.string()),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");

    if (!isValidBackwardTransition(order.status, args.targetStatus)) {
      throw new ConvexError(
        `Invalid backward transition: ${order.status} -> ${args.targetStatus}`
      );
    }

    // Resolve userId from token
    let userId: Id<"users"> | undefined;
    if (args.token) {
      const user = await getSessionUser(ctx, args.token);
      if (user) userId = user._id;
    }

    // Build update using the same typed interface as updateStatus
    const updates: OrderStatusUpdate = {
      status: args.targetStatus as OrderStatusUpdate["status"],
      isKitchenVisible: computeIsKitchenVisible(args.targetStatus),
    };

    // Status-specific reversal side effects

    // PaymentReceived -> AwaitingPayment/Draft: clear confirmedAt (reverse sales recognition)
    if (
      order.status === "PaymentReceived" &&
      (args.targetStatus === "AwaitingPayment" || args.targetStatus === "Draft")
    ) {
      updates.confirmedAt = undefined;
    }

    // BeingPrepared -> PaymentReceived: mark kitchenEnteredAt as consumed
    // (prevents auto-re-entry if threshold already crossed)
    if (order.status === "BeingPrepared" && args.targetStatus === "PaymentReceived") {
      // kitchenEnteredAt stays set (threshold consumed) -- order won't auto-enter again
      // Reset package status on order items
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
        .filter((q) => q.neq(q.field("isCancelled"), true))
        .collect();

      for (const item of items) {
        await ctx.db.patch(item._id, {
          packageStatus: "empty",
          ballsFilled: 0,
          packedPackageIndices: [],
        });
      }
    }

    // Complete -> AwaitingDelivery: clear completedAt
    if (order.status === "Complete" && args.targetStatus === "AwaitingDelivery") {
      updates.completedAt = undefined;
    }

    // Release reservations when reverting from PaymentReceived to before payment
    if (
      order.status === "PaymentReceived" &&
      (args.targetStatus === "AwaitingPayment" || args.targetStatus === "Draft")
    ) {
      try {
        await releaseReservationInternal(ctx, { orderId: args.orderId });
      } catch (error) {
        console.error("Error releasing reservations on backward transition:", error);
      }
    }

    await ctx.db.patch(args.orderId, updates);

    // Audit trail
    await logStatusTransition(
      ctx,
      args.orderId,
      order.status,
      args.targetStatus,
      args.reason ?? "Moved backward",
      "user",
      userId
    );

    return args.orderId;
  },
});

/**
 * Expedite a PaymentReceived order into kitchen production immediately.
 * Bypasses the 2-day auto-entry threshold for rush orders.
 *
 * Phase 14: "Expedite Production" button on PaymentReceived cards.
 */
export const expediteOrder = mutation({
  args: {
    orderId: v.id("orders"),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (order.status !== "PaymentReceived") {
      throw new ConvexError("Can only expedite PaymentReceived orders");
    }

    // Resolve userId from token
    let userId: Id<"users"> | undefined;
    if (args.token) {
      const user = await getSessionUser(ctx, args.token);
      if (user) userId = user._id;
    }

    await ctx.db.patch(args.orderId, {
      status: "BeingPrepared",
      isKitchenVisible: true,
      expedited: true,
      kitchenEnteredAt: Date.now(),
    });

    // Consume materials on expedited entry to BeingPrepared
    try {
      await consumeProductionMaterialsInternal(ctx, { orderId: args.orderId });
      await consumeBoxingMaterialsInternal(ctx, { orderId: args.orderId });
      await consumeStickerMaterialsInternal(ctx, { orderId: args.orderId });
      // Phase 20: Deduct ingredient inventory through production hierarchy
      const ingredientResult = await consumeIngredientMaterialsInternal(ctx, { orderId: args.orderId });
      if (ingredientResult.warnings.length > 0) {
        console.warn("Ingredient stock warnings:", ingredientResult.warnings);
      }
    } catch (error) {
      // Revert on failure
      await ctx.db.patch(args.orderId, {
        status: "PaymentReceived",
        isKitchenVisible: false,
        expedited: undefined,
        kitchenEnteredAt: undefined,
      });
      throw error;
    }

    await logStatusTransition(
      ctx,
      args.orderId,
      "PaymentReceived",
      "BeingPrepared",
      "Expedited - manual production entry",
      "user",
      userId
    );

    return args.orderId;
  },
});

/**
 * Admin-only: Force-complete a stuck order to Complete+Paid.
 * Does NOT trigger any inventory side effects (no stock reservation, no material consumption).
 * Use only for data fixes (e.g., orders already delivered but stuck in non-terminal status).
 *
 * Quick Task 2: Admin escape hatch for stuck orders.
 */
export const forceComplete = protectedMutation({
  roles: ["admin", "manager"],
  args: {
    orderId: v.id("orders"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Belt-and-suspenders: roles already validated by protectedMutation wrapper
    const user = ctx.user;

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");

    if (isTerminalStatus(order.status)) {
      throw new ConvexError(`Order is already ${order.status}`);
    }

    const oldStatus = order.status;

    // Force to Complete + Paid, no inventory side effects
    await ctx.db.patch(args.orderId, {
      status: "Complete",
      completedAt: Date.now(),
      isKitchenVisible: false,
      paymentStatus: "Paid",
      // Ensure confirmedAt exists for revenue tracking
      ...(order.confirmedAt ? {} : { confirmedAt: Date.now() }),
    });

    // Audit: log the force-complete event
    await logOrderEvent(ctx, args.orderId, "admin_force_complete", {
      fromStatus: oldStatus,
      toStatus: "Complete",
      reason: args.reason ?? "Admin force complete - data fix",
      category: "data_fix",
      triggeredBy: "user",
      userId: user._id,
      metadata: {
        paymentStatusSet: "Paid",
        inventorySideEffects: false,
      },
    });

    // Also log as a status transition for the status history timeline
    await logStatusTransition(
      ctx,
      args.orderId,
      oldStatus,
      "Complete",
      args.reason ?? "Admin force complete - data fix",
      "user",
      user._id
    );

    return args.orderId;
  },
});
