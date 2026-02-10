import { useMemo } from 'react';

/**
 * Pending ball statistics interface.
 * Note: "biteSized" fields track jumbo/bite_sized balls (80g, BIG_BALL).
 * Field names kept for backwards compatibility; display labels use BALL_CONFIG.
 */
export interface PendingBallStats {
  originalCount: number;
  originalBalls: number;
  biteSizedCount: number;
  biteSizedBalls: number;
}

/**
 * Order item with production data.
 * Supports both snake_case (V1/KitchenView) and camelCase (V2/Convex) field names.
 */
interface OrderItemWithProduction {
  production_type?: string;
  productionType?: string;
  quantity?: number;
  production_units?: number;
  productionUnits?: number;
  balls_filled?: number;
  ballsFilled?: number;
}

/**
 * Order with balls (from useConvexKitchenOrdersWithBalls)
 */
interface OrderWithBalls {
  items?: OrderItemWithProduction[];
}

/**
 * Calculate pending order counts and total balls needed for each ball type.
 *
 * This hook eliminates duplication in KitchenView.tsx where the same
 * calculation logic was repeated for original and bite-sized balls.
 *
 * @param orders - Pending orders from useConvexKitchenOrdersWithBalls
 * @returns Statistics for both ball types
 *
 * @example
 * ```tsx
 * const { data: orders } = useConvexKitchenOrdersWithBalls();
 * const stats = usePendingBallStats(orders);
 * // stats.originalCount = 3, stats.originalBalls = 24
 * ```
 */
export function usePendingBallStats(orders: OrderWithBalls[] | undefined): PendingBallStats {
  return useMemo(() => {
    if (!orders) {
      return {
        originalCount: 0,
        originalBalls: 0,
        biteSizedCount: 0,
        biteSizedBalls: 0,
      };
    }

    let originalCount = 0;
    let originalBalls = 0;
    let biteSizedCount = 0;
    let biteSizedBalls = 0;

    for (const order of orders) {
      // Helper to get production type from either field name convention
      const getType = (item: OrderItemWithProduction) => item.production_type ?? item.productionType;
      const getUnits = (item: OrderItemWithProduction) => item.production_units ?? item.productionUnits ?? 0;
      const getFilled = (item: OrderItemWithProduction) => item.balls_filled ?? item.ballsFilled ?? 0;

      // Original balls calculation
      const originalItems = order.items?.filter(
        (item) => getType(item) === "original"
      ) ?? [];

      if (originalItems.length > 0) {
        originalCount++;
        for (const item of originalItems) {
          const totalRequired = (item.quantity ?? 0) * getUnits(item);
          const needed = totalRequired - getFilled(item);
          if (needed > 0) originalBalls += needed;
        }
      }

      // Jumbo/bite-sized balls calculation (80g, BIG_BALL)
      const biteSizedItems = order.items?.filter(
        (item) => getType(item) === "bite_sized" || getType(item) === "jumbo"
      ) ?? [];

      if (biteSizedItems.length > 0) {
        biteSizedCount++;
        for (const item of biteSizedItems) {
          const totalRequired = (item.quantity ?? 0) * getUnits(item);
          const needed = totalRequired - getFilled(item);
          if (needed > 0) biteSizedBalls += needed;
        }
      }
    }

    return {
      originalCount,
      originalBalls,
      biteSizedCount,
      biteSizedBalls,
    };
  }, [orders]);
}
