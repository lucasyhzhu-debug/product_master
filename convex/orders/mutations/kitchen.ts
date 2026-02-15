/**
 * Kitchen Operations mutations
 * Tray inventory and ball distribution
 *
 * INFRA-03: All production counts now derive from productionLog.
 * No writes to productionCounts table. Validation reads via aggregateForProduct.
 */
import { mutation, type MutationCtx } from "../../_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../../_generated/dataModel";

// Ctx-dependent helpers
import { distributeBallsToOrders } from "../helpers/index";

// Auth + inventory + status helpers for new kitchen mutations
import { requireRole } from "../../lib/auth";
import { consumeBatchMaterials } from "./inventoryIntegration";
import { logAutoTransition, computeIsKitchenVisible, isTerminalStatus } from "../helpers/statusTransitions";
import { consumeFromFIFO, applyFIFOConsumption } from "../../inventory/fifo";
import { updateComponentStock } from "../../inventory/helpers";
import { aggregateForProduct } from "../../productionLog/helpers";

// ============================================
// Helper Functions
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
    totalProducedOriginal: 0,
    totalProducedBiteSized: 0,
    lastUpdated: Date.now(),
    updatedBy: "system",
  });

  const newInventory = await ctx.db.get(id);
  if (!newInventory) throw new Error("Failed to create inventory");
  return newInventory;
}

// ============================================
// Mutations
// ============================================

/**
 * Add balls to tray (NO auto-distribution).
 * PRD-6: Visual Inventory Tray System
 */
export const addBallsToTray = mutation({
  args: {
    ballType: v.union(v.literal("original"), v.literal("bite_sized"), v.literal("jumbo")),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.count === 0) {
      throw new Error("Count cannot be zero");
    }

    const inventory = await getOrCreateTodayInventory(ctx);

    const fieldName = args.ballType === "original" ? "originalBallCount" : "biteSizedBallCount";
    const currentCount = args.ballType === "original" ? inventory.originalBallCount : inventory.biteSizedBallCount;
    const newCount = Math.max(0, currentCount + args.count);

    const patchData: Record<string, number> = {
      [fieldName]: newCount,
      lastUpdated: Date.now(),
    };

    if (args.count > 0) {
      const actualAdded = newCount - currentCount;
      if (actualAdded > 0) {
        const cumulativeField = args.ballType === "original" ? "totalProducedOriginal" : "totalProducedBiteSized";
        const currentCumulative = inventory[cumulativeField] ?? 0;
        patchData[cumulativeField] = currentCumulative + actualAdded;
      }
    }

    await ctx.db.patch(inventory._id, patchData);

    return {
      trayCount: newCount,
      ballsAdded: newCount - currentCount,
      ballType: args.ballType,
    };
  },
});

/**
 * Fill pending orders with balls from tray.
 * PRD-6: Visual Inventory Tray System - Manual Fill
 */
export const fillPendingOrders = mutation({
  args: {
    ballType: v.union(v.literal("original"), v.literal("bite_sized"), v.literal("jumbo")),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];

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

    const result = await distributeBallsToOrders(ctx, {
      ballType: args.ballType,
      count: availableBalls,
      trackFilledPackages: true,
    });

    await ctx.db.patch(tray._id, {
      [countField]: result.overflow,
      lastUpdated: Date.now(),
    });

    const uniqueOrderItemIds = new Set(result.filledPackages.map(p => p.orderItemId.toString()));
    const ordersUpdated = uniqueOrderItemIds.size;
    const packagesCompleted = result.completedOrderIds.length;

    return {
      success: true,
      ballsUsed: result.ballsUsed,
      overflow: result.overflow,
      filledItems: result.filledPackages,
      packagesCompleted,
      ordersUpdated,
      completedOrderIds: result.completedOrderIds,
    };
  },
});

/**
 * Remove a ball from tray (undo functionality).
 * PRD-6: Visual Inventory Tray System
 */
export const removeBallFromTray = mutation({
  args: {
    ballType: v.union(v.literal("original"), v.literal("bite_sized"), v.literal("jumbo")),
  },
  handler: async (ctx, args) => {
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

// ============================================
// Kitchen V3: Production Pipeline Mutations
// INFRA-03: No productionCounts writes. All counts derive from productionLog.
// ============================================

/**
 * Box products mutation.
 * Deducts balls from kitchen inventory tray, consumes boxing-stage packaging (FIFO),
 * and logs to productionLog. Supports negative quantity for undo.
 */
export const boxProducts = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen", "manager", "admin"]);

    if (args.quantity === 0) {
      throw new ConvexError("Quantity cannot be zero");
    }

    const menuProduct = await ctx.db.get(args.menuProductId);
    if (!menuProduct) throw new ConvexError("Menu product not found");

    // Get current aggregated counts from productionLog for validation
    const resetRecord = await ctx.db
      .query("productionResets")
      .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.menuProductId))
      .first();
    const currentCounts = await aggregateForProduct(ctx, args.menuProductId, resetRecord);

    let packagingWarning: string | undefined;

    if (args.quantity > 0) {
      // POSITIVE FLOW: Box products
      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.menuProductId))
        .collect();

      let totalBallsNeeded = 0;
      let ballFieldName: "originalBallCount" | "biteSizedBallCount" | null = null;

      for (const comp of components) {
        const ct = await ctx.db.get(comp.componentTypeId);
        if (!ct || ct.category !== "production") continue;

        totalBallsNeeded += comp.quantity * args.quantity;
        if (ct.code === "MID_BALL") {
          ballFieldName = "originalBallCount";
        } else if (ct.code === "BIG_BALL") {
          ballFieldName = "biteSizedBallCount";
        }
      }

      if (totalBallsNeeded > 0 && ballFieldName) {
        const today = new Date().toISOString().split("T")[0];
        const inventory = await ctx.db
          .query("kitchenInventory")
          .withIndex("by_date", (q) => q.eq("date", today))
          .first();

        if (!inventory) throw new ConvexError("No kitchen inventory for today. Add balls to tray first.");

        const available = inventory[ballFieldName] ?? 0;
        if (available < totalBallsNeeded) {
          throw new ConvexError(`Insufficient balls: need ${totalBallsNeeded}, have ${available}`);
        }

        await ctx.db.patch(inventory._id, {
          [ballFieldName]: available - totalBallsNeeded,
          lastUpdated: Date.now(),
        });
      }

      // Consume boxing-stage packaging from FIFO (non-fatal)
      try {
        await consumeBatchMaterials(ctx, {
          menuProductId: args.menuProductId,
          quantity: args.quantity,
          stage: "boxing",
        });
      } catch (e) {
        packagingWarning = e instanceof Error ? e.message : "Packaging stock issue";
      }

    } else {
      // NEGATIVE FLOW: Undo boxing
      const undoQty = Math.abs(args.quantity);

      if (currentCounts.boxed - undoQty < currentCounts.stickered) {
        throw new ConvexError(`Cannot undo boxing: ${currentCounts.stickered} already stickered. Unsticker first. Max unbox: ${currentCounts.boxed - currentCounts.stickered}`);
      }

      // Return balls to kitchen inventory tray
      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.menuProductId))
        .collect();

      let totalBallsToReturn = 0;
      let ballFieldName: "originalBallCount" | "biteSizedBallCount" | null = null;

      for (const comp of components) {
        const ct = await ctx.db.get(comp.componentTypeId);
        if (!ct || ct.category !== "production") continue;
        totalBallsToReturn += comp.quantity * undoQty;
        if (ct.code === "MID_BALL") ballFieldName = "originalBallCount";
        else if (ct.code === "BIG_BALL") ballFieldName = "biteSizedBallCount";
      }

      if (totalBallsToReturn > 0 && ballFieldName) {
        const today = new Date().toISOString().split("T")[0];
        const inventory = await ctx.db
          .query("kitchenInventory")
          .withIndex("by_date", (q) => q.eq("date", today))
          .first();

        if (inventory) {
          await ctx.db.patch(inventory._id, {
            [ballFieldName]: (inventory[ballFieldName] ?? 0) + totalBallsToReturn,
            lastUpdated: Date.now(),
          });
        }
      }
    }

    // Write production log entry
    const isUndo = args.quantity < 0;
    await ctx.db.insert("productionLog", {
      menuProductId: args.menuProductId,
      action: isUndo ? "unbox" : "box",
      quantity: Math.abs(args.quantity),
      timestamp: Date.now(),
      performedBy: user.name,
      ...(packagingWarning ? { note: `packaging-shortage:${packagingWarning}` } : {}),
    });

    return { success: true as const, warning: packagingWarning };
  },
});

/**
 * Sticker products mutation.
 * Validates against boxed count via productionLog aggregation, consumes labeling-stage
 * packaging (FIFO), and logs to productionLog. Supports negative quantity for undo.
 */
export const stickerProducts = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen", "manager", "admin"]);

    if (args.quantity === 0) throw new ConvexError("Quantity cannot be zero");

    // Get current aggregated counts from productionLog for validation
    const resetRecord = await ctx.db
      .query("productionResets")
      .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.menuProductId))
      .first();
    const currentCounts = await aggregateForProduct(ctx, args.menuProductId, resetRecord);

    let packagingWarning: string | undefined;

    if (args.quantity > 0) {
      const availableForStickering = currentCounts.boxed - currentCounts.stickered;
      if (availableForStickering < args.quantity) {
        throw new ConvexError(`Insufficient boxed products: need ${args.quantity}, available ${availableForStickering}`);
      }

      // Consume labeling-stage packaging from FIFO (non-fatal)
      try {
        await consumeBatchMaterials(ctx, {
          menuProductId: args.menuProductId,
          quantity: args.quantity,
          stage: "labeling",
        });
      } catch (e) {
        packagingWarning = e instanceof Error ? e.message : "Packaging stock issue";
      }

    } else {
      const undoQty = Math.abs(args.quantity);

      if (currentCounts.stickered - undoQty < currentCounts.packed) {
        throw new ConvexError(`Cannot undo stickering: ${currentCounts.packed} already packed. Unpack first. Max unsticker: ${currentCounts.stickered - currentCounts.packed}`);
      }
    }

    // Write production log
    const isUndo = args.quantity < 0;
    await ctx.db.insert("productionLog", {
      menuProductId: args.menuProductId,
      action: isUndo ? "unsticker" : "sticker",
      quantity: Math.abs(args.quantity),
      timestamp: Date.now(),
      performedBy: user.name,
      ...(packagingWarning ? { note: `packaging-shortage:${packagingWarning}` } : {}),
    });

    return { success: true as const, warning: packagingWarning };
  },
});

/**
 * Toggle pack/unpack for an order line item.
 * Validates against stickered pool via productionLog aggregation, updates packageStatus
 * on orderItem, and logs to productionLog.
 */
export const togglePackOrderLineItem = mutation({
  args: {
    token: v.string(),
    orderId: v.id("orders"),
    orderItemId: v.id("orderItems"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen", "manager", "admin"]);

    const orderItem = await ctx.db.get(args.orderItemId);
    if (!orderItem) throw new ConvexError("Order item not found");
    if (orderItem.orderId !== args.orderId) throw new ConvexError("Order item does not belong to this order");

    if (!orderItem.menuProductId) throw new ConvexError("Order item has no menu product");

    // Get current aggregated counts from productionLog for validation
    const resetRecord = await ctx.db
      .query("productionResets")
      .withIndex("by_menu_product", (q) => q.eq("menuProductId", orderItem.menuProductId!))
      .first();
    const currentCounts = await aggregateForProduct(ctx, orderItem.menuProductId!, resetRecord);

    const isPacked = orderItem.packageStatus === "packed";
    const neededQty = orderItem.quantity;

    if (isPacked) {
      // UNPACK
      await ctx.db.patch(args.orderItemId, {
        packageStatus: "filled",
      });

      await ctx.db.insert("productionLog", {
        menuProductId: orderItem.menuProductId!,
        action: "unpack",
        quantity: neededQty,
        timestamp: Date.now(),
        performedBy: user.name,
        orderId: args.orderId,
        orderItemId: args.orderItemId,
      });

    } else {
      // PACK
      const availableForPacking = currentCounts.stickered - currentCounts.packed;
      if (availableForPacking < neededQty) {
        throw new ConvexError(`Insufficient stickered products: need ${neededQty}, available ${availableForPacking}`);
      }

      await ctx.db.patch(args.orderItemId, {
        packageStatus: "packed",
      });

      await ctx.db.insert("productionLog", {
        menuProductId: orderItem.menuProductId!,
        action: "pack",
        quantity: neededQty,
        timestamp: Date.now(),
        performedBy: user.name,
        orderId: args.orderId,
        orderItemId: args.orderItemId,
      });
    }

    return { packed: !isPacked };
  },
});

/**
 * Mark an order as ready for shipping/pickup.
 * Validates all product line items are packed, consumes "none"-stage packaging
 * from FIFO, and transitions order status based on delivery type.
 */
export const markOrderReady = mutation({
  args: {
    token: v.string(),
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen", "manager", "admin"]);

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");

    const orderItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    const activeItems = orderItems.filter(item => !item.isCancelled);

    for (const item of activeItems) {
      if (item.menuProductId && item.packageStatus !== "packed") {
        throw new ConvexError(`Item "${item.productName}" is not packed yet`);
      }
    }

    for (const item of activeItems) {
      if (!item.menuProductId) continue;

      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", item.menuProductId!))
        .collect();

      for (const comp of components) {
        const ct = await ctx.db.get(comp.componentTypeId);
        if (!ct || !ct.trackInventory) continue;

        const effectiveStage = comp.consumptionStage ?? ct.consumptionStage;
        if (effectiveStage !== "none") continue;

        const totalNeeded = comp.quantity * item.quantity;

        const defaultLocation = await ctx.db
          .query("storageLocations")
          .withIndex("by_default", (q) => q.eq("isDefault", true))
          .first();

        if (!defaultLocation) continue;

        const fifoResult = await consumeFromFIFO(ctx, comp.componentTypeId, defaultLocation._id, totalNeeded);
        await applyFIFOConsumption(
          ctx, fifoResult, comp.componentTypeId, defaultLocation._id,
          args.orderId,
          `order-ready:${order.orderNumber}`,
          user.name
        );
        await updateComponentStock(ctx, comp.componentTypeId, defaultLocation._id);
      }
    }

    // Phase 14: BeingPrepared -> AwaitingDelivery (single transition for all delivery types)
    const newStatus = "AwaitingDelivery";
    const currentStatus = order.status;

    await ctx.db.patch(order._id, {
      status: newStatus as typeof order.status,
      isKitchenVisible: computeIsKitchenVisible(newStatus),
      completedAt: isTerminalStatus(newStatus) ? Date.now() : undefined,
    });

    await logAutoTransition(
      ctx,
      order._id,
      currentStatus,
      newStatus,
      "All items packed - order ready for delivery",
      "kitchen"
    );

    return { newStatus };
  },
});
