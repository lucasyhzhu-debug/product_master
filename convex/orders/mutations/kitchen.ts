/**
 * Kitchen Operations mutations
 * Tray inventory and ball distribution
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
    ballType: v.union(v.literal("original"), v.literal("bite_sized"), v.literal("jumbo")),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.count === 0) {
      throw new Error("Count cannot be zero");
    }

    // Get or create today's inventory
    const inventory = await getOrCreateTodayInventory(ctx);

    // Add (or remove) balls from tray (NO auto-distribution)
    // "original" → originalBallCount (45g, MID_BALL)
    // "bite_sized" / "jumbo" → biteSizedBallCount (80g, BIG_BALL)
    const fieldName = args.ballType === "original" ? "originalBallCount" : "biteSizedBallCount";
    const currentCount = args.ballType === "original" ? inventory.originalBallCount : inventory.biteSizedBallCount;
    // Clamp to 0 — can't go below zero
    const newCount = Math.max(0, currentCount + args.count);

    const patchData: Record<string, number> = {
      [fieldName]: newCount,
      lastUpdated: Date.now(),
    };

    // Only increment cumulative counter for positive additions (never decrement)
    if (args.count > 0) {
      const actualAdded = newCount - currentCount;
      if (actualAdded > 0) {
        const cumulativeField = args.ballType === "original" ? "totalProducedOriginal" : "totalProducedBiteSized";
        const currentCumulative = inventory[cumulativeField] ?? 0;
        patchData[cumulativeField] = currentCumulative + actualAdded;
      }
    }

    await ctx.db.patch(inventory._id, patchData);

    // Return actual change (may be less than requested if clamped)
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
 *
 * Flow:
 * 1. Get current tray inventory
 * 2. Call existing distribution helper (handles status transitions)
 * 3. Update tray with remaining balls (overflow)
 * 4. Return results for UI (animations, sounds, toasts)
 */
export const fillPendingOrders = mutation({
  args: {
    ballType: v.union(v.literal("original"), v.literal("bite_sized"), v.literal("jumbo")),
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
    ballType: v.union(v.literal("original"), v.literal("bite_sized"), v.literal("jumbo")),
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

    // "original" → originalBallCount (45g, MID_BALL)
    // "bite_sized" / "jumbo" → biteSizedBallCount (80g, BIG_BALL)
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

// ============================================
// Kitchen V3: Production Pipeline Mutations
// ============================================

/**
 * Box products mutation.
 * Deducts balls from kitchen inventory tray, consumes boxing-stage packaging (FIFO),
 * and increments boxed count. Supports negative quantity for undo.
 */
export const boxProducts = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    quantity: v.number(), // Can be negative for undo
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen", "manager", "admin"]);

    if (args.quantity === 0) {
      throw new ConvexError("Quantity cannot be zero");
    }

    const menuProduct = await ctx.db.get(args.menuProductId);
    if (!menuProduct) throw new ConvexError("Menu product not found");

    // Get or create production counts
    let counts = await ctx.db
      .query("productionCounts")
      .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.menuProductId))
      .first();

    if (!counts) {
      const id = await ctx.db.insert("productionCounts", {
        menuProductId: args.menuProductId,
        boxed: 0,
        stickered: 0,
        packed: 0,
      });
      counts = await ctx.db.get(id);
      if (!counts) throw new ConvexError("Failed to create production counts");
    }

    let packagingWarning: string | undefined;

    if (args.quantity > 0) {
      // POSITIVE FLOW: Box products
      // Look up production components to find ball type & quantity per unit
      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.menuProductId))
        .collect();

      // Find production component(s) — balls
      let totalBallsNeeded = 0;
      let ballFieldName: "originalBallCount" | "biteSizedBallCount" | null = null;

      for (const comp of components) {
        const ct = await ctx.db.get(comp.componentTypeId);
        if (!ct || ct.category !== "production") continue;

        totalBallsNeeded += comp.quantity * args.quantity;
        // Determine which tray field to deduct from based on production unit code
        if (ct.code === "MID_BALL") {
          ballFieldName = "originalBallCount"; // Original (45g) = MID_BALL
        } else if (ct.code === "BIG_BALL") {
          ballFieldName = "biteSizedBallCount"; // Jumbo (80g) = BIG_BALL
        }
      }

      // Deduct balls from kitchen inventory tray
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

      // Consume boxing-stage packaging from FIFO (non-fatal — boxing proceeds even if packaging short)
      try {
        await consumeBatchMaterials(ctx, {
          menuProductId: args.menuProductId,
          quantity: args.quantity,
          stage: "boxing",
        });
      } catch (e) {
        packagingWarning = e instanceof Error ? e.message : "Packaging stock issue";
      }

      // Increment boxed count
      await ctx.db.patch(counts._id, {
        boxed: counts.boxed + args.quantity,
      });

    } else {
      // NEGATIVE FLOW: Undo boxing
      const undoQty = Math.abs(args.quantity);

      // Validate: can't un-box if already stickered
      if (counts.boxed - undoQty < counts.stickered) {
        throw new ConvexError(`Cannot undo boxing: ${counts.stickered} already stickered. Unsticker first. Max unbox: ${counts.boxed - counts.stickered}`);
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

      // NOTE: Negative flow does NOT reverse FIFO packaging consumption

      // Decrement boxed count
      await ctx.db.patch(counts._id, {
        boxed: counts.boxed - undoQty,
      });
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
 * Validates against boxed count, consumes labeling-stage packaging (FIFO),
 * and increments stickered count. Supports negative quantity for undo.
 */
export const stickerProducts = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    quantity: v.number(), // Can be negative for undo
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen", "manager", "admin"]);

    if (args.quantity === 0) throw new ConvexError("Quantity cannot be zero");

    // Get or create production counts
    let counts = await ctx.db
      .query("productionCounts")
      .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.menuProductId))
      .first();

    if (!counts) {
      const id = await ctx.db.insert("productionCounts", {
        menuProductId: args.menuProductId,
        boxed: 0,
        stickered: 0,
        packed: 0,
      });
      counts = await ctx.db.get(id);
      if (!counts) throw new ConvexError("Failed to create production counts");
    }

    let packagingWarning: string | undefined;

    if (args.quantity > 0) {
      // POSITIVE FLOW: Sticker products
      const availableForStickering = counts.boxed - counts.stickered;
      if (availableForStickering < args.quantity) {
        throw new ConvexError(`Insufficient boxed products: need ${args.quantity}, available ${availableForStickering}`);
      }

      // Consume labeling-stage packaging from FIFO (non-fatal — stickering proceeds even if packaging short)
      try {
        await consumeBatchMaterials(ctx, {
          menuProductId: args.menuProductId,
          quantity: args.quantity,
          stage: "labeling",
        });
      } catch (e) {
        packagingWarning = e instanceof Error ? e.message : "Packaging stock issue";
      }

      // Increment stickered count
      await ctx.db.patch(counts._id, {
        stickered: counts.stickered + args.quantity,
      });

    } else {
      // NEGATIVE FLOW: Undo stickering
      const undoQty = Math.abs(args.quantity);

      if (counts.stickered - undoQty < counts.packed) {
        throw new ConvexError(`Cannot undo stickering: ${counts.packed} already packed. Unpack first. Max unsticker: ${counts.stickered - counts.packed}`);
      }

      // NOTE: No FIFO reversal

      await ctx.db.patch(counts._id, {
        stickered: counts.stickered - undoQty,
      });
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
 * Validates against stickered pool, updates packageStatus on orderItem,
 * and adjusts packed count. Toggle behavior based on current packageStatus.
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

    // Get or create production counts for this menu product
    let counts = await ctx.db
      .query("productionCounts")
      .withIndex("by_menu_product", (q) => q.eq("menuProductId", orderItem.menuProductId!))
      .first();

    if (!counts) {
      const id = await ctx.db.insert("productionCounts", {
        menuProductId: orderItem.menuProductId!,
        boxed: 0,
        stickered: 0,
        packed: 0,
      });
      counts = await ctx.db.get(id);
      if (!counts) throw new ConvexError("Failed to create production counts");
    }

    // Determine if packing or unpacking based on current packageStatus
    const isPacked = orderItem.packageStatus === "packed";
    const neededQty = orderItem.quantity; // Read qty from orderItems (staff doesn't type it)

    if (isPacked) {
      // UNPACK: decrement packed count, unmark line item
      await ctx.db.patch(counts._id, {
        packed: counts.packed - neededQty,
      });

      await ctx.db.patch(args.orderItemId, {
        packageStatus: "filled",
      });

      // Log
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
      // PACK: validate stickered pool, increment packed, mark line item
      const availableForPacking = counts.stickered - counts.packed;
      if (availableForPacking < neededQty) {
        throw new ConvexError(`Insufficient stickered products: need ${neededQty}, available ${availableForPacking}`);
      }

      await ctx.db.patch(counts._id, {
        packed: counts.packed + neededQty,
      });

      await ctx.db.patch(args.orderItemId, {
        packageStatus: "packed",
      });

      // Log
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

    // Validate all product line items are packed
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

    // Deduct consumptionStage="none" packaging from FIFO
    // These are outer boxes, brochures, inserts etc.
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

        // Consume "none"-stage packaging at order ready
        const totalNeeded = comp.quantity * item.quantity;

        // Get default location
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

    // Transition order status based on delivery type
    const newStatus = order.deliveryType === "Pickup" ? "WaitingPickup" : "WaitingShipment";
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
      "All items packed - order ready",
      "kitchen"
    );

    return { newStatus };
  },
});
