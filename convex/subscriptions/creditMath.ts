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
