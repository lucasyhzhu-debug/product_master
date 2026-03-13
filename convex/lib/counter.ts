/**
 * Atomic daily counter helper for sequential number generation.
 *
 * Generates numbers in PREFIX-MMDD-NNN format (e.g., EXP-0312-001, JE-0312-042)
 * using WIB timezone for date extraction and Convex OCC for atomicity.
 *
 * Used by: expenses (EXP), journal entries (JE), reimbursement batches (RMB).
 *
 * NOTE on year boundary: The counters table stores MMDD without year. On Jan 1
 * of a new year, a counter row for "0101" from the prior year (if still present)
 * would continue incrementing rather than resetting. This is acceptable because
 * ~1,095 rows/year is negligible and old counter rows don't affect correctness
 * (the sequence just continues from a higher number).
 */

import type { MutationCtx } from "../_generated/server";
import { getWibComponents } from "./periodRange";

/**
 * Format a counter number as PREFIX-MMDD-NNN.
 *
 * Pure function, exported for testing.
 *
 * @param prefix - Counter prefix (e.g., "EXP", "JE", "RMB")
 * @param dateStr - MMDD date string
 * @param sequence - Sequence number (zero-padded to 3 digits minimum)
 */
export function formatCounterNumber(
  prefix: string,
  dateStr: string,
  sequence: number
): string {
  return `${prefix}-${dateStr}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Extract MMDD date string from a UTC timestamp using WIB timezone.
 *
 * Thin wrapper around getWibComponents -- does NOT duplicate WIB offset logic.
 * Month is 1-indexed in output (January = "01").
 *
 * @param utcMs - UTC epoch milliseconds
 * @returns MMDD string (e.g., "0312" for March 12)
 */
export function getWibDateStr(utcMs: number): string {
  const { month, day } = getWibComponents(utcMs);
  // month is 0-indexed from getWibComponents, so +1 for 1-indexed output
  return `${String(month + 1).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

/**
 * Get the next sequential number for a given prefix and date.
 *
 * Uses the counters table with by_prefix_date index for O(1) lookup.
 * Convex OCC guarantees atomicity -- if two mutations race on the same
 * counter row, one will automatically retry.
 *
 * @param ctx - Convex MutationCtx
 * @param prefix - Counter prefix (e.g., "EXP", "JE", "RMB")
 * @param now - Optional UTC timestamp for testability (defaults to Date.now())
 * @returns Formatted counter string (e.g., "EXP-0312-001")
 */
export async function getNextNumber(
  ctx: MutationCtx,
  prefix: string,
  now?: number
): Promise<string> {
  const dateStr = getWibDateStr(now ?? Date.now());

  // Look up existing counter for this prefix+date combination.
  // Use .unique() instead of .first() -- throws on duplicate rows,
  // preventing silent counter corruption.
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_prefix_date", (q) => q.eq("prefix", prefix).eq("date", dateStr))
    .unique();

  let sequence: number;

  if (counter) {
    sequence = counter.lastSequence + 1;
    await ctx.db.patch(counter._id, { lastSequence: sequence });
  } else {
    sequence = 1;
    await ctx.db.insert("counters", { prefix, date: dateStr, lastSequence: sequence });
  }

  return formatCounterNumber(prefix, dateStr, sequence);
}
