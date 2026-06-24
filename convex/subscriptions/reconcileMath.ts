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
