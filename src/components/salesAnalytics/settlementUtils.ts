/**
 * Settlement Utilities — Pure functions for settlement math and date conversion.
 *
 * Shared between SettlementFormDialog (live preview) and unit tests.
 * Mirrors convex/consignment/helpers.ts computeSettlementMath for consistency.
 */

/**
 * Compute the settlement preview for live math display.
 * @param totalRevenue - Total revenue from the period
 * @param revSharePercent - Outlet's revenue share percentage (0-100)
 * @returns Object with revShareAmount and frolliePayment
 */
export function computeSettlementPreview(
  totalRevenue: number,
  revSharePercent: number
): { revShareAmount: number; frolliePayment: number } {
  const revShareAmount = Math.round(totalRevenue * revSharePercent / 100);
  const frolliePayment = totalRevenue - revShareAmount;
  return { revShareAmount, frolliePayment };
}

/**
 * Convert a date input string (YYYY-MM-DD) to local midnight epoch milliseconds.
 * Uses local timezone to avoid off-by-one-day bugs in WIB (UTC+7).
 *
 * CRITICAL: Do NOT use Date.parse(dateString) — it parses as UTC and causes
 * the date to be one day earlier in WIB timezone.
 *
 * @param dateString - Date in YYYY-MM-DD format from <input type="date">
 * @returns Epoch milliseconds at local midnight
 */
export function toLocalEpoch(dateString: string): number {
  return new Date(dateString + "T00:00:00").getTime();
}

/**
 * Convert an epoch milliseconds value back to YYYY-MM-DD string in local timezone.
 * Used to pre-fill date inputs when editing existing settlements.
 *
 * @param epochMs - Epoch milliseconds
 * @returns Date string in YYYY-MM-DD format
 */
export function fromEpochToDateString(epochMs: number): string {
  const d = new Date(epochMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format an epoch timestamp to a human-readable local date.
 * Uses Indonesian locale for consistency with the rest of the app.
 *
 * @param epochMs - Epoch milliseconds
 * @returns Formatted date string (e.g., "15 Mar 2026")
 */
export function formatSettlementDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
