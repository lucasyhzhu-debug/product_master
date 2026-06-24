/**
 * Packaging Operations mutations
 * Per-package tracking and completion
 */
import { mutation, type MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";

// Pure helpers
import { calculatePackageStatus } from "../helpers";
// Ctx-dependent helpers
import { logOrderEvent, computeIsKitchenVisible, isTerminalStatus } from "../helpers/index";

// Phase B (Task B9): recognize subscription sale at delivery (AwaitingDelivery).
import { recognizeSubscriptionDelivery } from "../../subscriptions/recognition";

// ============================================
// Production record helpers for packaging
// ============================================

/**
 * Get balls per package for an order item.
 * Derives from orderItemProduction records.
 * Returns 1 as default if no production records exist.
 */
async function getBallsPerPackageForItem(
  ctx: MutationCtx,
  item: Doc<"orderItems">
): Promise<number> {
  const records = await ctx.db
    .query("orderItemProduction")
    .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
    .collect();

  const activeRecords = records.filter(r => !r.isCancelled);
  if (activeRecords.length > 0 && item.quantity > 0) {
    const totalUnits = activeRecords.reduce((sum, r) => sum + r.unitsRequired, 0);
    return totalUnits / item.quantity;
  }

  return 1;
}

/**
 * Check if an order item has production data (is a production item, not packaging-only).
 * Checks for active orderItemProduction records.
 */
async function hasProductionData(
  ctx: MutationCtx,
  item: Doc<"orderItems">
): Promise<boolean> {
  const records = await ctx.db
    .query("orderItemProduction")
    .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
    .collect();

  return records.some(r => !r.isCancelled);
}

// ============================================
// Mutations
// ============================================

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

    // Derive ballsPerPackage from production records
    const ballsPerPackage = await getBallsPerPackageForItem(ctx, item);
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
    const allPackagesPacked = newPackedIndices.length >= quantity;

    const newPackageStatus = calculatePackageStatus(ballsFilled, quantity, ballsPerPackage, newPackedIndices.length);

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
    const productionItems: typeof allItems = [];
    for (const i of allItems) {
      if (await hasProductionData(ctx, i)) {
        productionItems.push(i);
      }
    }

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

    // Validate order is in BeingPrepared status
    if (order.status !== "BeingPrepared") {
      throw new Error("Only BeingPrepared orders can be completed. Current status: " + order.status);
    }

    // Verify all packages are packed
    const allItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Filter to items with production data
    const productionItems: typeof allItems = [];
    for (const i of allItems) {
      if (await hasProductionData(ctx, i)) {
        productionItems.push(i);
      }
    }

    // Check if all items are fully packed (all packages in each item)
    const allItemsPacked = productionItems.every((i) => {
      const packed = i.packedPackageIndices ?? [];
      const itemQuantity = i.quantity ?? 1;
      return packed.length >= itemQuantity;
    });

    if (!allItemsPacked) {
      throw new Error("Cannot complete packaging: some packages are not yet packed");
    }

    // Phase 14: BeingPrepared -> AwaitingDelivery
    const nextStatus = "AwaitingDelivery";

    // Update order status
    await ctx.db.patch(args.orderId, {
      status: nextStatus,
      isKitchenVisible: computeIsKitchenVisible(nextStatus),
      completedAt: isTerminalStatus(nextStatus) ? Date.now() : undefined,
    });

    // Log the transition event
    await logOrderEvent(ctx, args.orderId, "status_change", {
      fromStatus: "BeingPrepared",
      toStatus: nextStatus,
      reason: "Packaging completed - ready for delivery",
      triggeredBy: "kitchen",
    });

    // Task B9: recognize subscription sale on entry to AwaitingDelivery (idempotent).
    await recognizeSubscriptionDelivery(ctx, args.orderId);

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

    // Validate order is in AwaitingDelivery status
    if (order.status !== "AwaitingDelivery") {
      throw new Error("Can only revert from AwaitingDelivery. Current status: " + order.status);
    }

    const previousStatus = order.status;

    // Update order status back to BeingPrepared
    await ctx.db.patch(args.orderId, {
      status: "BeingPrepared",
      isKitchenVisible: true,
      completedAt: undefined,
    });

    // Log the revert event
    await logOrderEvent(ctx, args.orderId, "status_change", {
      fromStatus: previousStatus,
      toStatus: "BeingPrepared",
      reason: "Reverted to BeingPrepared for corrections",
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
    // Derive ballsPerPackage from production records
    const ballsPerPackage = await getBallsPerPackageForItem(ctx, item);
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
    const allPackagesPacked = newPackedIndices.length >= quantity;

    const newPackageStatus = calculatePackageStatus(ballsFilled, quantity, ballsPerPackage, newPackedIndices.length);

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

    const quantity = item.quantity ?? 1;
    // Derive ballsPerPackage from production records
    const ballsPerPackage = await getBallsPerPackageForItem(ctx, item);
    const ballsFilled = item.ballsFilled ?? 0;

    const newPackageStatus = calculatePackageStatus(ballsFilled, quantity, ballsPerPackage, newPackedIndices.length);

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

/**
 * Fill balls into a package (increment ballsFilled).
 * PRD-Kitchen-Workflow: Package-based ball filling.
 *
 * @param orderItemId - The order item ID
 * @param ballsToAdd - Number of balls to add (default 1)
 */
export const fillPackage = mutation({
  args: {
    orderItemId: v.id("orderItems"),
    ballsToAdd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.orderItemId);
    if (!item) {
      throw new Error("Order item not found");
    }

    const ballsToAdd = args.ballsToAdd ?? 1;
    const currentBallsFilled = item.ballsFilled ?? 0;
    // Derive ballsPerPackage from production records
    const ballsPerPackage = await getBallsPerPackageForItem(ctx, item);
    const quantity = item.quantity ?? 1;
    const totalBallsRequired = quantity * ballsPerPackage;

    // Calculate new ballsFilled
    const newBallsFilled = Math.min(currentBallsFilled + ballsToAdd, totalBallsRequired);

    // Determine packageStatus
    const packedIndices = item.packedPackageIndices ?? [];
    const newPackageStatus = calculatePackageStatus(newBallsFilled, quantity, ballsPerPackage, packedIndices.length);

    // Update item
    await ctx.db.patch(args.orderItemId, {
      ballsFilled: newBallsFilled,
      packageStatus: newPackageStatus,
    });

    // Phase 14: No auto-transitions for individual ball fills.
    // All status transitions happen through the Kanban board (forward/backward buttons).
    // Ball filling is visual progress within BeingPrepared, not a status change trigger.

    return {
      orderItemId: args.orderItemId,
      ballsFilled: newBallsFilled,
      packageStatus: newPackageStatus,
    };
  },
});

/**
 * Unfill balls from a package (decrement ballsFilled).
 * PRD-Kitchen-Workflow: Package-based ball filling.
 *
 * @param orderItemId - The order item ID
 * @param ballsToRemove - Number of balls to remove (default 1)
 */
export const unfillPackage = mutation({
  args: {
    orderItemId: v.id("orderItems"),
    ballsToRemove: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.orderItemId);
    if (!item) {
      throw new Error("Order item not found");
    }

    const ballsToRemove = args.ballsToRemove ?? 1;
    const currentBallsFilled = item.ballsFilled ?? 0;

    // Calculate new ballsFilled (cannot go below 0)
    const newBallsFilled = Math.max(0, currentBallsFilled - ballsToRemove);

    // Determine packageStatus
    // Derive ballsPerPackage from production records
    const ballsPerPackage = await getBallsPerPackageForItem(ctx, item);
    const quantity = item.quantity ?? 1;
    const packedIndices = item.packedPackageIndices ?? [];
    const newPackageStatus = calculatePackageStatus(newBallsFilled, quantity, ballsPerPackage, packedIndices.length);

    // Update item
    await ctx.db.patch(args.orderItemId, {
      ballsFilled: newBallsFilled,
      packageStatus: newPackageStatus,
    });

    return {
      orderItemId: args.orderItemId,
      ballsFilled: newBallsFilled,
      packageStatus: newPackageStatus,
    };
  },
});
