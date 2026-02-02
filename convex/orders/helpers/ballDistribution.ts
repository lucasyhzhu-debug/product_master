/**
 * Ball Distribution Helper
 *
 * Consolidates the ball distribution algorithm used by both
 * completeBalls and addBallsToTray mutations.
 *
 * DUAL-WRITE: Updates both OLD (ballsRemaining) and NEW (orderItemProduction) systems.
 */

import type { MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

// ============================================
// Types
// ============================================

export interface BallDistributionResult {
  ballsUsed: number;
  overflow: number;
  completedOrderIds: Id<"orders">[];
  transitionedToInProduction: Id<"orders">[];
  filledPackages: { orderItemId: Id<"orderItems">; ballsAdded: number }[];
}

export interface BallDistributionOptions {
  ballType: "big" | "mid" | "original" | "bite_sized";
  count: number;
  trackFilledPackages: boolean;  // true for addBallsToTray, false for completeBalls
}

interface ItemWithProduction extends Doc<"orderItems"> {
  productionRecords: Doc<"orderItemProduction">[];
}

interface OrderWithItems {
  order: Doc<"orders">;
  items: ItemWithProduction[];
  bigBallsNeeded: number;
  midBallsNeeded: number;
}

// ============================================
// Helper: Log Order Event
// ============================================

async function logOrderEvent(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  eventType: string,
  options: {
    fromStatus?: string;
    toStatus?: string;
    reason?: string;
    triggeredBy?: string;
  } = {}
): Promise<void> {
  await ctx.db.insert("orderEvents", {
    orderId,
    eventType,
    fromStatus: options.fromStatus,
    toStatus: options.toStatus,
    reason: options.reason,
    timestamp: Date.now(),
    triggeredBy: options.triggeredBy ?? "system",
  });
}

// ============================================
// Helper: Fetch Eligible Orders
// ============================================

async function fetchEligibleOrdersWithItems(
  ctx: MutationCtx
): Promise<OrderWithItems[]> {
  // Get Confirmed and InProduction orders
  const confirmedOrders = await ctx.db
    .query("orders")
    .withIndex("by_status", (q) => q.eq("status", "Confirmed"))
    .collect();

  const inProductionOrders = await ctx.db
    .query("orders")
    .withIndex("by_status", (q) => q.eq("status", "InProduction"))
    .collect();

  // Combine - Confirmed first (they need to transition)
  const allEligibleOrders = [...confirmedOrders, ...inProductionOrders];

  // Fetch items with production records for each order
  return await Promise.all(
    allEligibleOrders.map(async (order) => {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      const itemsWithProduction = await Promise.all(
        items.map(async (item) => {
          const productionRecords = await ctx.db
            .query("orderItemProduction")
            .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
            .collect();
          return { ...item, productionRecords };
        })
      );

      // Calculate ball needs
      let bigBallsNeeded = 0;
      let midBallsNeeded = 0;

      for (const item of items) {
        if (item.productionType === "original" && item.productionUnits) {
          bigBallsNeeded += item.productionUnits;
        } else if (item.productionType === "bite_sized" && item.productionUnits) {
          midBallsNeeded += item.productionUnits;
        }
      }

      return { order, items: itemsWithProduction, bigBallsNeeded, midBallsNeeded };
    })
  );
}

// ============================================
// Helper: Sort Orders by Priority
// ============================================

function sortOrdersByPriority(orders: OrderWithItems[]): OrderWithItems[] {
  return orders.sort((a, b) => {
    // 1. Due date ASC (earliest first)
    if (a.order.dueDate !== b.order.dueDate) {
      if (!a.order.dueDate && !b.order.dueDate) return 0;
      if (!a.order.dueDate) return 1;
      if (!b.order.dueDate) return -1;
      return a.order.dueDate - b.order.dueDate;
    }

    // 2. Total units DESC (most first)
    const aTotalUnits = a.bigBallsNeeded + a.midBallsNeeded;
    const bTotalUnits = b.bigBallsNeeded + b.midBallsNeeded;
    if (aTotalUnits !== bTotalUnits) {
      return bTotalUnits - aTotalUnits;
    }

    // 3. Order date ASC (earliest first)
    return a.order.orderDate - b.order.orderDate;
  });
}

// ============================================
// Core: Distribute Balls to Orders
// ============================================

/**
 * Core ball distribution algorithm.
 *
 * Used by both completeBalls and addBallsToTray.
 * Handles dual-write to OLD and NEW production tracking systems.
 */
export async function distributeBallsToOrders(
  ctx: MutationCtx,
  options: BallDistributionOptions
): Promise<BallDistributionResult> {
  if (options.count <= 0) {
    return {
      ballsUsed: 0,
      overflow: 0,
      completedOrderIds: [],
      transitionedToInProduction: [],
      filledPackages: [],
    };
  }

  // Normalize ball type
  const normalizedBallType = options.ballType === "original" ? "big" :
                             options.ballType === "bite_sized" ? "mid" :
                             options.ballType;
  const productionUnitCode = normalizedBallType === "big" ? "BIG_BALL" : "MID_BALL";
  const productionTypeFilter = normalizedBallType === "big" ? "original" : "bite_sized";

  // Fetch and sort eligible orders
  const ordersWithItems = await fetchEligibleOrdersWithItems(ctx);
  const sortedOrders = sortOrdersByPriority(ordersWithItems);

  // Initialize tracking
  let remainingBalls = options.count;
  const completedOrderIds: Id<"orders">[] = [];
  const transitionedToInProduction: Id<"orders">[] = [];
  const filledPackages: { orderItemId: Id<"orderItems">; ballsAdded: number }[] = [];
  const updatedBallsRemaining = new Map<string, number>();

  // Process each order
  for (const { order, items } of sortedOrders) {
    if (remainingBalls <= 0) break;

    // Filter items by production type
    const matchingItems = items.filter(
      (item) => item.productionType === productionTypeFilter
    );

    let orderReceivedBalls = false;

    // Apply balls to matching items (OLD system - dual-write)
    for (const item of matchingItems) {
      if (remainingBalls <= 0) break;

      const currentBallsRemaining = item.ballsRemaining ?? 0;
      if (currentBallsRemaining <= 0) continue;

      const ballsToApply = Math.min(remainingBalls, currentBallsRemaining);
      const newBallsRemaining = currentBallsRemaining - ballsToApply;
      const newBallsFilled = (item.ballsFilled ?? 0) + ballsToApply;

      // Determine package status for addBallsToTray flow
      let packageStatus: "empty" | "filling" | "filled" | "packed" = "filling";
      if (newBallsRemaining <= 0) {
        packageStatus = "filled";
      }

      // Update OLD system
      if (options.trackFilledPackages) {
        // addBallsToTray flow - updates more fields
        await ctx.db.patch(item._id, {
          ballsRemaining: newBallsRemaining,
          ballsFilled: newBallsFilled,
          packageStatus: packageStatus,
        });
        filledPackages.push({ orderItemId: item._id, ballsAdded: ballsToApply });
      } else {
        // completeBalls flow - minimal update
        await ctx.db.patch(item._id, {
          ballsRemaining: newBallsRemaining,
        });
      }

      updatedBallsRemaining.set(item._id.toString(), newBallsRemaining);
      remainingBalls -= ballsToApply;
      orderReceivedBalls = true;
    }

    // PRD-7: Trigger Confirmed -> InProduction when first ball is filled
    if (order.status === "Confirmed" && orderReceivedBalls) {
      await ctx.db.patch(order._id, { status: "InProduction" });
      await logOrderEvent(ctx, order._id, "status_auto_transition", {
        fromStatus: "Confirmed",
        toStatus: "InProduction",
        reason: "First ball filled - production started",
        triggeredBy: "kitchen",
      });
      transitionedToInProduction.push(order._id);
    }

    // PRD-5: Apply balls to orderItemProduction records (NEW system - dual-write)
    // Track balls applied separately for NEW system (parallel to OLD system)
    const ballsAppliedToOldSystem = options.count - remainingBalls;
    let newSystemBallsToApply = ballsAppliedToOldSystem;

    for (const item of items) {
      if (newSystemBallsToApply <= 0) break;

      const matchingRecords = item.productionRecords.filter(
        (r) => r.productionUnitCode === productionUnitCode && r.unitsRemaining > 0
      );

      for (const record of matchingRecords) {
        if (newSystemBallsToApply <= 0) break;

        const unitsToApply = Math.min(newSystemBallsToApply, record.unitsRemaining);
        const newUnitsRemaining = record.unitsRemaining - unitsToApply;
        const newUnitsCompleted = record.unitsCompleted + unitsToApply;

        await ctx.db.patch(record._id, {
          unitsCompleted: newUnitsCompleted,
          unitsRemaining: newUnitsRemaining,
        });

        newSystemBallsToApply -= unitsToApply;
      }
    }

    // Check if ALL items in the order have ballsRemaining = 0
    const itemsWithProductionData = items.filter((item) => item.productionType);

    if (itemsWithProductionData.length > 0) {
      const allComplete = itemsWithProductionData.every((item) => {
        const updatedValue = updatedBallsRemaining.get(item._id.toString());
        if (updatedValue !== undefined) {
          return updatedValue <= 0;
        }
        return (item.ballsRemaining ?? 0) <= 0;
      });

      // PRD-7: Transition to Packaging when all balls complete
      if (allComplete) {
        const currentStatus = transitionedToInProduction.includes(order._id)
          ? "InProduction"
          : order.status;

        await ctx.db.patch(order._id, { status: "Packaging" });
        await logOrderEvent(ctx, order._id, "status_auto_transition", {
          fromStatus: currentStatus,
          toStatus: "Packaging",
          reason: "All balls complete - ready for packaging",
          triggeredBy: "kitchen",
        });

        // Mark all items as production complete
        for (const item of items) {
          await ctx.db.patch(item._id, { isProductionComplete: true });
        }

        completedOrderIds.push(order._id);
      }
    }
  }

  return {
    ballsUsed: options.count - remainingBalls,
    overflow: remainingBalls,
    completedOrderIds,
    transitionedToInProduction,
    filledPackages,
  };
}
