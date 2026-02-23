/**
 * Dispatch Planner - Pure Business Logic Helpers
 *
 * These functions have NO Convex ctx dependency and can be unit tested directly.
 * Reuses date helpers from k3martCockpit/helpers.ts where possible.
 */

import { getWeekDates } from "../k3martCockpit/helpers";

// Re-export getWeekDates for convenience
export { getWeekDates };

/**
 * Channel display colors for capacity bar segments.
 */
export const CHANNEL_COLORS: Record<string, string> = {
  direct: "#3B82F6",
  gofood: "#22C55E",
  k3mart: "#F97316",
  consignment: "#6B7280",
};

/**
 * Generate 7 YYYY-MM-DD dates starting from `startDate`.
 * If startDate is not a Monday, snaps to Monday first.
 * Delegates to k3martCockpit/helpers.getWeekDates which does exactly this.
 */
export function generateWeekDates(startDate: string): string[] {
  // Generate 7 consecutive days starting from startDate (no Monday snap).
  // The Planner is yesterday-anchored: startDate = yesterday so today = column 2.
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate + "T12:00:00+07:00");
    d.setDate(d.getDate() + i);
    dates.push(d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }));
  }
  return dates;
}

/**
 * Returns "weekend" for Sat/Sun, "weekday" otherwise.
 * Uses Jakarta timezone.
 */
export function getDayType(date: string): "weekday" | "weekend" {
  const d = new Date(date + "T00:00:00+07:00");
  const day = d.getDay();
  if (day === 0 || day === 6) return "weekend";
  return "weekday";
}

/**
 * Calculate default pre-fill for a future day based on recent sales averages.
 * Splits sales by weekday/weekend, averages the matching type, rounds to nearest integer.
 * If no data for the matching day type, returns 0.
 */
export function calculatePreFill(
  recentSales: { date: string; quantity: number }[],
  targetDate: string
): number {
  if (recentSales.length === 0) return 0;

  const targetDayType = getDayType(targetDate);

  const matchingSales = recentSales.filter(
    (s) => getDayType(s.date) === targetDayType
  );

  if (matchingSales.length === 0) return 0;

  const total = matchingSales.reduce((sum, s) => sum + s.quantity, 0);
  return Math.round(total / matchingSales.length);
}

/**
 * When total exceeds capacity, reduce from lowest-priority channels first.
 * Highest priority number = lowest priority = cut first.
 * Returns adjusted totals. If total <= capacity, returns unchanged map.
 *
 * @param dailyTotals - Map of channelKey -> total quantity for a single day
 * @param channelPriorities - Channel keys with their priority numbers (lower number = higher priority)
 * @param capacity - Maximum daily capacity
 * @returns Adjusted totals map with reductions applied
 */
export function redistributeOverCapacity(
  dailyTotals: Map<string, number>,
  channelPriorities: { channelKey: string; priority: number }[],
  capacity: number
): Map<string, number> {
  let total = 0;
  for (const qty of dailyTotals.values()) {
    total += qty;
  }

  if (total <= capacity) {
    return new Map(dailyTotals);
  }

  let excess = total - capacity;
  const result = new Map(dailyTotals);

  // Sort by priority descending (highest number = lowest priority = cut first)
  const sortedChannels = [...channelPriorities].sort(
    (a, b) => b.priority - a.priority
  );

  for (const { channelKey } of sortedChannels) {
    if (excess <= 0) break;

    const current = result.get(channelKey) ?? 0;
    if (current <= 0) continue;

    const reduction = Math.min(current, excess);
    result.set(channelKey, current - reduction);
    excess -= reduction;
  }

  return result;
}

/**
 * Convert epoch ms to YYYY-MM-DD in Jakarta timezone.
 */
export function epochToDateString(epoch: number): string {
  return new Date(epoch).toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Convert order dueDate (epoch ms) to production start date string (YYYY-MM-DD).
 * Production start is dueDate minus 2 days. Uses Jakarta timezone.
 */
export function orderDueDateToProductionStart(dueDate: number): string {
  const d = new Date(dueDate);
  d.setDate(d.getDate() - 2);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
