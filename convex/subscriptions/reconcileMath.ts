/**
 * Net delivered consumption against the week's topup tranches, FIFO oldest-first, so the
 * surviving per-tranche balances SUM TO `leftover` (the NET undelivered credit) — never
 * the GROSS topup total (CR-A).
 *
 * Deliveries (and any other pool reductions — refunds/adjustments/prior expiries) consume
 * the OLDEST credit first (highest `weeksCarried`). The total amount to remove is
 * `sum(tranches.amount) - leftover` (i.e. everything in the ledger that is not still
 * remaining). Fully-consumed tranches are dropped; partially-consumed tranches keep their
 * `weeksCarried` age and the reduced amount. The result feeds `reconcileTranches`.
 *
 * Invariant: the returned amounts sum to exactly `max(leftover, 0)` (clamped — a negative
 * pool means over-delivery, which has no credit to expire/carry, so all tranches drop).
 */
export function allocateLeftoverToTranches(
  tranches: { weekId: string; amount: number; weeksCarried: number }[],
  leftover: number,
): { weekId: string; amount: number; weeksCarried: number }[] {
  const gross = tranches.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0);
  const target = leftover > 0 ? leftover : 0;
  // Amount of credit already consumed/removed that must be netted off the tranches.
  let toRemove = gross - target;
  if (toRemove < 0) toRemove = 0; // defensive: never inflate a tranche above its topup
  // Oldest first (highest weeksCarried) — deliveries consume oldest credit first (FIFO).
  const ordered = [...tranches]
    .filter((t) => t.amount > 0)
    .sort((a, b) => b.weeksCarried - a.weeksCarried);
  const result: { weekId: string; amount: number; weeksCarried: number }[] = [];
  for (const t of ordered) {
    if (toRemove >= t.amount) {
      toRemove -= t.amount; // tranche fully consumed → dropped
      continue;
    }
    const remaining = t.amount - toRemove;
    toRemove = 0;
    if (remaining > 0) {
      result.push({ weekId: t.weekId, amount: remaining, weeksCarried: t.weeksCarried });
    }
  }
  return result;
}

export function reconcileTranches(args: {
  tranches: { weekId: string; amount: number; weeksCarried: number }[];
  policy: "expire" | "rollover";
  rolloverExpiryWeeks: number | null;
}): { expire: { weekId: string; amount: number }[]; carry: { weekId: string; amount: number }[] } {
  const expire: { weekId: string; amount: number }[] = [];
  const carry: { weekId: string; amount: number }[] = [];
  // Oldest first (highest weeksCarried) for deterministic FIFO expiry.
  const ordered = [...args.tranches].sort((a, b) => b.weeksCarried - a.weeksCarried);
  for (const t of ordered) {
    if (t.amount <= 0) continue;
    const expired =
      args.policy === "expire" ||
      (args.rolloverExpiryWeeks !== null && t.weeksCarried >= args.rolloverExpiryWeeks);
    (expired ? expire : carry).push({ weekId: t.weekId, amount: t.amount });
  }
  return { expire, carry };
}
