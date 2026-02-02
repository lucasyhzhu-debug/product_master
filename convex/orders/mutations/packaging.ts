/**
 * Packaging Operations mutations
 * Per-package tracking and completion
 */
import { mutation } from "../../_generated/server";
import { v } from "convex/values";

// Ctx-dependent helpers
import { logOrderEvent } from "../helpers/index";

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
