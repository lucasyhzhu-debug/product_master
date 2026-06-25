// Pure function — no convex/server imports, no Date.now() calls.
// Importable by both backend (Convex queries) and frontend.
import type { Doc } from "../../_generated/dataModel";

export type DrawdownPoint = {
  date: number;
  /** Actual delivered pcs (solid line). 0 for past days with no delivery recorded. */
  deliveredPcs: number;
  /** Planned pcs for this day (sum of all items in the plannedDay entry). */
  plannedPcs: number;
  /** Credit remaining after this day — read directly from the passed-in pool trajectory; never re-keyed. */
  creditRemaining: number;
  /** true when date ≤ today (solid/past partition); false when date > today (dashed/future). */
  isPast: boolean;
};

export type DrawdownSeriesResult = {
  points: DrawdownPoint[];
  /**
   * true when the last point in the series (week-end, i.e. Sunday) has creditRemaining > 0.
   * Signals unspent credit that will expire or roll over.
   */
  leftoverFlag: boolean;
};

/**
 * Builds a per-day chart series for a single subscription week.
 *
 * - Solid (isPast=true)  : days where date ≤ today — uses deliveredByDay for actual pcs.
 * - Dashed (isPast=false): days where date > today — uses plannedDays for projected pcs.
 * - creditRemaining per point is read directly from poolTrajectory; it is NEVER re-keyed or
 *   recomputed here (caller owns the pool derivation — principle C10).
 * - leftoverFlag fires when the last point's creditRemaining > 0 (projected unspent credit).
 *
 * @param deliveredByDay  Actual delivery records for this week, one entry per day delivered.
 * @param plannedDays     The week's plannedDays array from `subscriptionWeeks` doc.
 * @param poolTrajectory  Per-day creditRemaining snapshots, same date space as plannedDays.
 * @param today           Reference epoch-ms timestamp representing "now" (injected for test determinism).
 */
export function buildDrawdownSeries(
  deliveredByDay: { date: number; pcs: number }[],
  plannedDays: Doc<"subscriptionWeeks">["plannedDays"],
  poolTrajectory: { date: number; creditRemaining: number }[],
  today: number,
): DrawdownSeriesResult {
  if (plannedDays.length === 0) {
    return { points: [], leftoverFlag: false };
  }

  // Index delivered pcs by date for O(1) lookup.
  const deliveredByDate = new Map<number, number>();
  for (const entry of deliveredByDay) {
    deliveredByDate.set(entry.date, entry.pcs);
  }

  // Index pool trajectory by date for O(1) lookup.
  const creditByDate = new Map<number, number>();
  for (const entry of poolTrajectory) {
    creditByDate.set(entry.date, entry.creditRemaining);
  }

  // Sort planned days ascending by date.
  const sortedDays = plannedDays.slice().sort((a, b) => a.date - b.date);

  const points: DrawdownPoint[] = sortedDays.map((day) => {
    const isPast = day.date <= today;
    const plannedPcs = day.items.reduce((sum, item) => sum + item.qty, 0);
    const deliveredPcs = isPast ? (deliveredByDate.get(day.date) ?? 0) : 0;
    const creditRemaining = creditByDate.get(day.date) ?? 0;

    return { date: day.date, deliveredPcs, plannedPcs, creditRemaining, isPast };
  });

  // leftoverFlag: true when the last point (week end) has creditRemaining > 0.
  const lastPoint = points[points.length - 1];
  const leftoverFlag = lastPoint.creditRemaining > 0;

  return { points, leftoverFlag };
}
