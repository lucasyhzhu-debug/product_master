/**
 * Kitchen view enrichment and aggregation helpers.
 * Pure functions that compute ball stats, production stats by type,
 * and kitchen priority sorting from pre-fetched order/production data.
 */
import type { Doc } from "../../_generated/dataModel";

/**
 * Calculate ball stats from orderItemProduction records.
 * Items without production records contribute 0 balls.
 */
export function calculateBallStatsFromItems(
  items: Array<Doc<"orderItems"> & { productionRecords?: Doc<"orderItemProduction">[] }>
): { bigBallsNeeded: number; midBallsNeeded: number } {
  let bigBallsNeeded = 0;
  let midBallsNeeded = 0;

  for (const item of items) {
    if (item.isCancelled) continue;

    // NEW system: production records (BOM-derived, correct codes)
    const records = item.productionRecords ?? [];
    const activeRecords = records.filter(r => !r.isCancelled);

    if (activeRecords.length > 0) {
      for (const record of activeRecords) {
        if (record.productionUnitCode === "BIG_BALL") {
          bigBallsNeeded += record.unitsRemaining;
        } else if (record.productionUnitCode === "MID_BALL") {
          midBallsNeeded += record.unitsRemaining;
        }
      }
      continue; // Skip items without production records (0 balls)
    }

    // Items without production records contribute 0 balls
  }

  return { bigBallsNeeded, midBallsNeeded };
}

/**
 * Calculate NEW system production statistics by production unit type.
 * Aggregates unitsRemaining from orderItemProduction records.
 */
export function calculateProductionStatsByType(
  itemsWithProduction: Array<Doc<"orderItems"> & { productionRecords: Doc<"orderItemProduction">[] }>,
  productionUnitTypes: Doc<"productionUnitTypes">[]
): Array<{
  code: string;
  name: string;
  color: string;
  unitsNeeded: number;
}> {
  return productionUnitTypes
    .map((unitType) => {
      let unitsNeeded = 0;

      for (const item of itemsWithProduction) {
        for (const record of item.productionRecords) {
          if (record.productionUnitTypeId === unitType._id) {
            unitsNeeded += record.unitsRemaining;
          }
        }
      }

      return {
        code: unitType.code,
        name: unitType.name,
        color: unitType.color ?? "#93C572", // Default to pistachio green if not set
        unitsNeeded,
      };
    })
    .filter((p) => p.unitsNeeded > 0);
}

/**
 * Assign priority based on order status.
 * Phase 14: Simplified for 7-status model.
 * Priority 0: BeingPrepared (active production)
 * Priority 1: PaymentReceived (paid, waiting for kitchen)
 * Priority 2: Draft (de-prioritized)
 * Priority 3: AwaitingDelivery (ready for pickup/shipment)
 */
export function getStatusPriority(status: string): number {
  if (status === "BeingPrepared") {
    return 0;
  } else if (status === "PaymentReceived") {
    return 1;
  } else if (status === "Draft") {
    return 2;
  } else if (status === "AwaitingDelivery") {
    return 3;
  }
  return 4; // Fallback
}

/**
 * Comparator for sorting active (non-completed) orders by priority, then dueDate, then creation time.
 */
export function sortByPriorityComparator<T extends Doc<"orders">>(a: T, b: T): number {
  const aPriority = getStatusPriority(a.status);
  const bPriority = getStatusPriority(b.status);

  // Sort by priority first
  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  // Within same priority group, sort by due date (earliest first)
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate - b.dueDate;
  }

  // Finally by creation time (earliest first)
  return a._creationTime - b._creationTime;
}

/**
 * Aggregate ball stats from pre-fetched items and production records.
 * Used by getKitchenStats to compute pending + completed ball counts.
 */
export function aggregateKitchenStats(args: {
  pendingOrders: Doc<"orders">[];
  completedTodayOrders: Doc<"orders">[];
  itemsByOrder: Map<string, Doc<"orderItems">[]>;
  productionByItem: Map<string, Doc<"orderItemProduction">[]>;
  productionUnitTypes: Doc<"productionUnitTypes">[];
  wibDayStartUtc: number;
  wibDayEndUtc: number;
}): {
  bigBallsNeeded: number;
  bigBallsCompleted: number;
  midBallsNeeded: number;
  midBallsCompleted: number;
  productionByType: Array<{ code: string; name: string; color: string | undefined; unitsNeeded: number; unitsCompleted: number }>;
  minTargetToday: { totalBalls: number; bigBalls: number; midBalls: number; orderCount: number };
  ordersLeftToComplete: number;
} {
  const {
    pendingOrders,
    completedTodayOrders,
    itemsByOrder,
    productionByItem,
    productionUnitTypes,
    wibDayStartUtc,
    wibDayEndUtc,
  } = args;

  // Calculate stats for pending orders from orderItemProduction records
  let bigBallsNeeded = 0;
  let midBallsNeeded = 0;

  for (const order of pendingOrders) {
    const items = itemsByOrder.get(order._id.toString()) ?? [];
    for (const item of items) {
      if (item.isCancelled) continue;

      const records = productionByItem.get(item._id.toString()) ?? [];
      const activeRecords = records.filter(r => !r.isCancelled);

      for (const record of activeRecords) {
        if (record.productionUnitCode === "BIG_BALL") {
          bigBallsNeeded += record.unitsRemaining;
        } else if (record.productionUnitCode === "MID_BALL") {
          midBallsNeeded += record.unitsRemaining;
        }
      }
    }
  }

  // Calculate stats for completed orders today from orderItemProduction records
  let bigBallsCompleted = 0;
  let midBallsCompleted = 0;

  for (const order of completedTodayOrders) {
    const items = itemsByOrder.get(order._id.toString()) ?? [];
    for (const item of items) {
      if (item.isCancelled) continue;

      const records = productionByItem.get(item._id.toString()) ?? [];
      const activeRecords = records.filter(r => !r.isCancelled);

      for (const record of activeRecords) {
        if (record.productionUnitCode === "BIG_BALL") {
          bigBallsCompleted += record.unitsCompleted;
        } else if (record.productionUnitCode === "MID_BALL") {
          midBallsCompleted += record.unitsCompleted;
        }
      }
    }
  }

  // Calculate stats per production type
  const productionByType = productionUnitTypes
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((unitType) => {
      let unitsNeeded = 0;
      let unitsCompleted = 0;

      // Pending orders -> units needed (remaining)
      for (const order of pendingOrders) {
        const items = itemsByOrder.get(order._id.toString()) ?? [];
        for (const item of items) {
          const records = productionByItem.get(item._id.toString()) ?? [];
          for (const record of records) {
            if (record.productionUnitTypeId === unitType._id) {
              unitsNeeded += record.unitsRemaining;
            }
          }
        }
      }

      // Completed orders today -> units completed
      for (const order of completedTodayOrders) {
        const items = itemsByOrder.get(order._id.toString()) ?? [];
        for (const item of items) {
          const records = productionByItem.get(item._id.toString()) ?? [];
          for (const record of records) {
            if (record.productionUnitTypeId === unitType._id) {
              unitsCompleted += record.unitsCompleted;
            }
          }
        }
      }

      return {
        code: unitType.code,
        name: unitType.name,
        color: unitType.color,
        unitsNeeded,
        unitsCompleted,
      };
    });

  // Phase 15: Calculate minTargetToday -- balls needed from orders due today only
  let bigBallsNeededToday = 0;
  let midBallsNeededToday = 0;
  let dueTodayOrderCount = 0;

  for (const order of pendingOrders) {
    if (!order.dueDate) continue;
    if (order.dueDate >= wibDayStartUtc && order.dueDate < wibDayEndUtc) {
      dueTodayOrderCount++;
      const items = itemsByOrder.get(order._id.toString()) ?? [];
      for (const item of items) {
        if (item.isCancelled) continue;
        const records = productionByItem.get(item._id.toString()) ?? [];
        const activeRecords = records.filter(r => !r.isCancelled);
        for (const record of activeRecords) {
          if (record.productionUnitCode === "BIG_BALL") {
            bigBallsNeededToday += record.unitsRemaining;
          } else if (record.productionUnitCode === "MID_BALL") {
            midBallsNeededToday += record.unitsRemaining;
          }
        }
      }
    }
  }

  // Phase 15: Count non-terminal, non-cancelled orders still left to complete
  const ordersLeftToComplete = pendingOrders.length;

  return {
    bigBallsNeeded,
    bigBallsCompleted,
    midBallsNeeded,
    midBallsCompleted,
    productionByType,
    minTargetToday: {
      totalBalls: bigBallsNeededToday + midBallsNeededToday,
      bigBalls: bigBallsNeededToday,
      midBalls: midBallsNeededToday,
      orderCount: dueTodayOrderCount,
    },
    ordersLeftToComplete,
  };
}

/**
 * Calculate ball counts for a single order from production records.
 * Used by getCompletedToday to enrich each order.
 */
export function calculateOrderBallCounts(
  items: Doc<"orderItems">[],
  productionByItem: Map<string, Doc<"orderItemProduction">[]>,
): { bigBalls: number; midBalls: number } {
  let bigBalls = 0;
  let midBalls = 0;

  for (const item of items) {
    if (item.isCancelled) continue;

    const records = productionByItem.get(item._id.toString()) ?? [];
    const activeRecords = records.filter(r => !r.isCancelled);

    for (const record of activeRecords) {
      if (record.productionUnitCode === "BIG_BALL") {
        bigBalls += record.unitsCompleted;
      } else if (record.productionUnitCode === "MID_BALL") {
        midBalls += record.unitsCompleted;
      }
    }
  }

  return { bigBalls, midBalls };
}
