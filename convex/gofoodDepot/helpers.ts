/**
 * GoFood Depot Helper Functions
 *
 * Pure computation helpers (no Convex context dependency).
 * These can be used in both queries and frontend code.
 */

/**
 * Compute restock suggestion for a depot product.
 * Rules:
 * - Monday (dayOfWeek=1): reset to previous Thursday's total sold
 * - Friday (5) or Saturday (6): n+2 buffer on 3-day average
 * - All other days: n+1 buffer on 3-day average
 * @param salesLast3Days Array of daily sales counts [day-3, day-2, day-1] (most recent last)
 * @param dayOfWeek 0=Sun, 1=Mon, ..., 6=Sat (in WIB timezone)
 * @param previousThursdayTotal Total sold on the previous Thursday
 * @returns { suggestion: number, breakdown: string }
 */
export function computeRestockSuggestion(
  salesLast3Days: number[],
  dayOfWeek: number,
  previousThursdayTotal: number
): { suggestion: number; breakdown: string } {
  if (dayOfWeek === 1) {
    // Monday: reset to previous Thursday's total
    return {
      suggestion: previousThursdayTotal,
      breakdown: `Monday reset to Thu total: ${previousThursdayTotal}`,
    };
  }

  const validDays = salesLast3Days.filter((v) => v >= 0);
  const avg3d =
    validDays.length > 0
      ? validDays.reduce((s, v) => s + v, 0) / validDays.length
      : 0;

  const buffer = dayOfWeek === 5 || dayOfWeek === 6 ? 2 : 1;
  const suggestion = Math.ceil(avg3d + buffer);
  const label = buffer === 2 ? "Fri/Sat +2" : "weekday +1";

  return {
    suggestion,
    breakdown: `3-day avg: ${avg3d.toFixed(1)} → +${buffer} (${label}) = ${suggestion}`,
  };
}

/**
 * Get WIB day of week (0=Sun, 1=Mon, ..., 6=Sat).
 */
export function getWibDayOfWeek(timestampMs?: number): number {
  const ts = timestampMs ?? Date.now();
  return new Date(ts + 7 * 60 * 60 * 1000).getUTCDay();
}

// Phase 81 / Plan 02 (D-10): the previous WIB date helpers (YYYY-MM-DD and
// "N days ago" variants) were deleted outright. Use getWibDateStr from
// convex/lib/periodRange instead. For "N days ago" semantics, pass the
// pre-subtracted ms: getWibDateStr(now - n * 24 * 60 * 60 * 1000)
