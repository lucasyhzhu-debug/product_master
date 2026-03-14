/**
 * Shared journal line aggregation helpers (no ctx dependency).
 *
 * Extracted from convex/reports/incomeStatement.ts for reuse
 * by both income statement and expense analytics queries.
 */

/**
 * Groups journal entry lines by accountId, computes debit-credit per account,
 * filters near-zero-balance items from display, sorts by code ascending.
 *
 * Total is computed BEFORE filtering near-zero items (total includes all).
 */
export function aggregateJournalLines(
  lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }>,
  targetIds: Set<string>,
  lookup: Map<string, { code: string; name: string }>
): { items: Array<{ code: string; name: string; total: number }>; total: number } {
  const totals = new Map<string, number>();

  for (const line of lines) {
    const key = line.accountId as string;
    if (!targetIds.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + line.debitAmount - line.creditAmount);
  }

  // Compute total BEFORE filtering near-zero items (total includes all)
  let total = 0;
  for (const amount of totals.values()) {
    total += amount;
  }

  // Build display items, filtering near-zero-balance using Math.abs < 0.01
  const items: Array<{ code: string; name: string; total: number }> = [];
  for (const [accountId, amount] of totals) {
    if (Math.abs(amount) < 0.01) continue;
    const account = lookup.get(accountId);
    if (!account) continue;
    items.push({ code: account.code, name: account.name, total: amount });
  }

  items.sort((a, b) => a.code.localeCompare(b.code));
  return { items, total };
}
