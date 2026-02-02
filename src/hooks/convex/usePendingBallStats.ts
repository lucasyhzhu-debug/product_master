import { useMemo } from 'react';

/**
 * Pending ball statistics interface
 */
export interface PendingBallStats {
  originalCount: number;
  originalBalls: number;
  biteSizedCount: number;
  biteSizedBalls: number;
}

/**
 * Order item with production data (from useOrders hook)
 */
interface OrderItemWithProduction {
  production_type?: string;
  quantity?: number;
  production_units?: number;
  balls_filled?: number;
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
      // Original balls calculation
      const originalItems = order.items?.filter(
        (item) => item.production_type === "original"
      ) ?? [];

      if (originalItems.length > 0) {
        originalCount++;
        for (const item of originalItems) {
          const totalRequired = (item.quantity ?? 0) * (item.production_units ?? 0);
          const needed = totalRequired - (item.balls_filled ?? 0);
          if (needed > 0) originalBalls += needed;
        }
      }

      // Bite-sized balls calculation
      const biteSizedItems = order.items?.filter(
        (item) => item.production_type === "bite_sized"
      ) ?? [];

      if (biteSizedItems.length > 0) {
        biteSizedCount++;
        for (const item of biteSizedItems) {
          const totalRequired = (item.quantity ?? 0) * (item.production_units ?? 0);
          const needed = totalRequired - (item.balls_filled ?? 0);
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
