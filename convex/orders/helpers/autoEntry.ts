/**
 * Auto-Entry Logic for Kitchen
 *
 * Phase 14-02: Pure function for determining if an order should
 * automatically enter the kitchen (transition to BeingPrepared).
 *
 * Rules:
 * 1. Must be in PaymentReceived status
 * 2. Expedited orders always enter immediately
 * 3. Must have a due date (unless expedited)
 * 4. If kitchenEnteredAt is set, threshold already consumed (sent back from kitchen)
 * 5. Check if <=2 days before due date
 */

export interface AutoEntryOrder {
  status: string;
  dueDate?: number;
  kitchenEnteredAt?: number;
  expedited?: boolean;
}

/**
 * Determine if an order should automatically enter the kitchen.
 * Pure function (no Convex ctx dependency) for testability.
 *
 * @param order - Order data with status, dueDate, kitchenEnteredAt, expedited
 * @param now - Current timestamp in milliseconds
 * @returns true if the order should be auto-transitioned to BeingPrepared
 */
export function shouldAutoEnterKitchen(order: AutoEntryOrder, now: number): boolean {
  // 1. Must be in PaymentReceived status
  if (order.status !== "PaymentReceived") return false;

  // 2. Expedited orders always enter
  if (order.expedited) return true;

  // 3. Must have a due date
  if (!order.dueDate) return false;

  // 4. If kitchenEnteredAt is set, threshold already consumed (sent back from kitchen)
  if (order.kitchenEnteredAt) return false;

  // 5. Check if <=2 days before due date
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  const timeUntilDue = order.dueDate - now;
  return timeUntilDue <= twoDaysMs;
}
