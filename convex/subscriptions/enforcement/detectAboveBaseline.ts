/** Pure: is the day's TOTAL qty across all products strictly above baseline? (clause 4, warn-only) */
export function detectAboveBaseline(
  dayItems: { qty: number }[],
  baselineDailyQty: number,
): boolean {
  const total = dayItems.reduce((s, it) => s + it.qty, 0);
  return total > baselineDailyQty;
}
