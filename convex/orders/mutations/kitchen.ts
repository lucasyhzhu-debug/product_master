/**
 * Kitchen Operations mutations
 * Tray inventory and ball distribution
 */
import { mutation, type MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";

// Ctx-dependent helpers
import { distributeBallsToOrders } from "../helpers/index";

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
    lastUpdated: Date.now(),
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
