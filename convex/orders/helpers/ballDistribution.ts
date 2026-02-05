/**
 * Ball Distribution Helper
 *
 * Consolidates the ball distribution algorithm used by both
 * completeBalls and addBallsToTray mutations.
 *
 * Uses orderItemProduction as the source of truth for production tracking.
 */

import type { MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { logAutoTransition } from "./statusTransitions";

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

      // Calculate ball needs from NEW system (production records)
      let bigBallsNeeded = 0;
      let midBallsNeeded = 0;

      for (const item of itemsWithProduction) {
        for (const record of item.productionRecords) {
          if (record.isCancelled) continue;
          if (record.productionUnitCode === "BIG_BALL") {
            bigBallsNeeded += record.unitsRemaining;
          } else if (record.productionUnitCode === "MID_BALL") {
            midBallsNeeded += record.unitsRemaining;
          }
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
// Helper: Calculate item balls needed from production records
// ============================================

/**
 * Get balls needed for an item from NEW system (orderItemProduction).
 *
 * IMPORTANT: This requires production records to exist.
 * Use backfillProductionRecords mutation for orders missing them.
 */
function getItemBallsNeeded(
  item: ItemWithProduction,
  productionUnitCode: string
): number {
  let needed = 0;
  for (const record of item.productionRecords) {
    if (record.isCancelled) continue;
    if (record.productionUnitCode === productionUnitCode) {
      needed += record.unitsRemaining;
    }
  }
  return needed;
}

// ============================================
// Core: Distribute Balls to Orders
// ============================================

/**
 * Core ball distribution algorithm.
 *
 * Used by both completeBalls and addBallsToTray.
 * Uses NEW system (orderItemProduction) as the source of truth.
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
  // Track updated production record values for completion check
  const updatedUnitsRemaining = new Map<string, number>();
  // Track balls added per item for UI updates
  const ballsAddedPerItem = new Map<string, number>();

  // Process each order
  for (const { order, items } of sortedOrders) {
    if (remainingBalls <= 0) break;

    // Filter items that have production records of the requested ball type
    // FIX: Use NEW system (production records) instead of OLD system (productionType field)
    const matchingItems = items.filter((item) => {
      return item.productionRecords.some(
        (r) => r.productionUnitCode === productionUnitCode &&
               r.unitsRemaining > 0 &&
               !r.isCancelled
      );
    });

    let orderReceivedBalls = false;

    // Apply balls to matching items using NEW system (orderItemProduction)
    for (const item of matchingItems) {
      if (remainingBalls <= 0) break;

      // Get balls needed from production records (NEW system)
      const ballsNeeded = getItemBallsNeeded(item, productionUnitCode);
      if (ballsNeeded <= 0) continue;

      const ballsToApply = Math.min(remainingBalls, ballsNeeded);

      // Update production records (NEW system - source of truth)
      let ballsAppliedToItem = 0;
      const matchingRecords = item.productionRecords.filter(
        (r) => r.productionUnitCode === productionUnitCode && r.unitsRemaining > 0 && !r.isCancelled
      );

      for (const record of matchingRecords) {
        if (ballsAppliedToItem >= ballsToApply) break;

        const unitsToApply = Math.min(ballsToApply - ballsAppliedToItem, record.unitsRemaining);
        const newUnitsRemaining = record.unitsRemaining - unitsToApply;
        const newUnitsCompleted = record.unitsCompleted + unitsToApply;

        await ctx.db.patch(record._id, {
          unitsCompleted: newUnitsCompleted,
          unitsRemaining: newUnitsRemaining,
        });

        updatedUnitsRemaining.set(record._id.toString(), newUnitsRemaining);
        ballsAppliedToItem += unitsToApply;
      }

      if (ballsAppliedToItem > 0) {
        // Track for UI updates
        const prevBallsAdded = ballsAddedPerItem.get(item._id.toString()) ?? 0;
        ballsAddedPerItem.set(item._id.toString(), prevBallsAdded + ballsAppliedToItem);

        // Update UI fields on orderItems (ballsFilled, packageStatus)
        if (options.trackFilledPackages) {
          const newBallsFilled = (item.ballsFilled ?? 0) + ballsAppliedToItem;
          const newBallsNeeded = ballsNeeded - ballsAppliedToItem;

          // Determine package status
          let packageStatus: "empty" | "filling" | "filled" | "packed" = "filling";
          if (newBallsNeeded <= 0) {
            packageStatus = "filled";
          }

          await ctx.db.patch(item._id, {
            ballsFilled: newBallsFilled,
            packageStatus: packageStatus,
          });
          filledPackages.push({ orderItemId: item._id, ballsAdded: ballsAppliedToItem });
        }

        remainingBalls -= ballsAppliedToItem;
        orderReceivedBalls = true;
      }
    }

    // PRD-7: Trigger Confirmed -> InProduction when first ball is filled
    if (order.status === "Confirmed" && orderReceivedBalls) {
      await ctx.db.patch(order._id, { status: "InProduction" });
      await logAutoTransition(
        ctx,
        order._id,
        "Confirmed",
        "InProduction",
        "First ball filled - production started",
        "kitchen"
      );
      transitionedToInProduction.push(order._id);
    }

    // Check if ALL items in the order are complete using NEW system (orderItemProduction)
    // An item is complete when all its production records have unitsRemaining = 0
    // FIX: Use NEW system (production records) instead of OLD system (productionType field)
    const itemsWithProductionData = items.filter((item) => item.productionRecords.length > 0);

    if (itemsWithProductionData.length > 0) {
      const allComplete = itemsWithProductionData.every((item) => {
        // Check NEW system: all production records must have unitsRemaining <= 0
        const activeRecords = item.productionRecords.filter(r => !r.isCancelled);
        if (activeRecords.length === 0) {
          // No production records = item complete (or not tracked)
          return true;
        }
        // NEW system check: all records must be complete (use updated values if available)
        return activeRecords.every(record => {
          const updatedValue = updatedUnitsRemaining.get(record._id.toString());
          if (updatedValue !== undefined) {
            return updatedValue <= 0;
          }
          return record.unitsRemaining <= 0;
        });
      });

      // PRD-7: Transition to Packaging when all balls complete
      if (allComplete) {
        const currentStatus = transitionedToInProduction.includes(order._id)
          ? "InProduction"
          : order.status;

        await ctx.db.patch(order._id, { status: "Packaging" });
        await logAutoTransition(
          ctx,
          order._id,
          currentStatus,
          "Packaging",
          "All balls complete - ready for packaging",
          "kitchen"
        );

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
