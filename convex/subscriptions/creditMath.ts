import type { CreditPool, LedgerType, PlannedDay } from "./types";

export function computeLineTotal(qty: number, unitPrice: number): number {
  return Math.round(qty * unitPrice);
}

export function computeScheduleTotal(days: PlannedDay[]): number {
  return days.reduce(
    (sum, d) => sum + d.items.reduce((s, it) => s + computeLineTotal(it.qty, it.unitPrice), 0),
    0,
  );
}

export function nextBalanceAfter(prevBalance: number, amount: number): number {
  return prevBalance + amount;
}

// weeklyQty is always DERIVED from the schedule template (staffreview I2 — avoid
// drift), never re-keyed by a caller. Single derivation path for create + update.
export function deriveWeeklyQty(
  template: { items: { qty: number }[] }[],
): number {
  return template.reduce(
    (sum, day) => sum + day.items.reduce((s, it) => s + it.qty, 0),
    0,
  );
}

/**
 * Projected end-of-week credit position for a (possibly amended) week.
 *
 * A week is funded up-front (weekly invoice paid → `topup` = creditIssued). When
 * the plan is amended UP mid-week, planned consumption can exceed the funded credit.
 * The shortfall is the amount we must bill as a top-up so deliveries don't overdraw.
 *
 * @param plannedConsumption  total IDR the current (amended) plan will draw down
 * @param creditIssued        total IDR funded into the pool so far (sum of topups)
 * @returns projectedShortfall (≥0; >0 means "projected to overrun") and the signed
 *          projectedEndingPool (negative = overdrawn at week end).
 */
export function deriveWeekShortfall(args: {
  plannedConsumption: number;
  creditIssued: number;
}): { projectedShortfall: number; projectedEndingPool: number } {
  const projectedEndingPool = args.creditIssued - args.plannedConsumption;
  return {
    projectedShortfall: Math.max(0, -projectedEndingPool),
    projectedEndingPool,
  };
}

export function deriveCreditPool(entries: { type: LedgerType; amount: number }[]): CreditPool {
  let creditIssued = 0;
  let creditConsumed = 0;
  let creditExpired = 0;
  let creditRemaining = 0;
  for (const e of entries) {
    creditRemaining += e.amount;
    if (e.type === "topup") creditIssued += e.amount;
    else if (e.type === "drawdown") creditConsumed += -e.amount;
    else if (e.type === "expiry") creditExpired += -e.amount;
    // refund / adjustment only move remaining
  }
  return { creditIssued, creditConsumed, creditRemaining, creditExpired };
}
