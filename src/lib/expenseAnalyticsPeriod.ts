/**
 * Period calculation helpers for Expense Analytics.
 *
 * Pure functions for WIB-aligned period range computation.
 * Extracted from the page component for unit testability.
 */

import { WIB_OFFSET_MS } from "@/lib/financialHelpers";

export type ExpensePeriodMode = "month" | "custom";

/**
 * Get the current year and 0-indexed month in WIB timezone.
 * Accepts optional `now` for testability.
 */
export function getCurrentWibMonth(now?: number): { year: number; month: number } {
  const ts = now ?? Date.now();
  const wibDate = new Date(ts + WIB_OFFSET_MS);
  return { year: wibDate.getUTCFullYear(), month: wibDate.getUTCMonth() };
}

/**
 * Convert WIB midnight (start of day) to UTC epoch ms.
 * WIB 00:00 = UTC previous day 17:00.
 */
export function wibMidnightToUtc(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day, -7, 0, 0, 0);
}

/**
 * Compute the period range for expense analytics.
 *
 * @param mode - "month" or "custom"
 * @param year - Year for month mode
 * @param month - 0-indexed month for month mode
 * @param customStart - UTC epoch ms for custom range start
 * @param customEnd - UTC epoch ms for custom range end
 * @returns { periodStart, periodEnd } in UTC epoch ms
 */
export function computePeriodRange(
  mode: ExpensePeriodMode,
  year: number,
  month: number,
  customStart?: number,
  customEnd?: number
): { periodStart: number; periodEnd: number } {
  if (mode === "month") {
    return {
      periodStart: wibMidnightToUtc(year, month, 1),
      periodEnd: wibMidnightToUtc(year, month + 1, 1),
    };
  }
  // custom mode
  return {
    periodStart: customStart ?? wibMidnightToUtc(year, month, 1),
    periodEnd: customEnd ?? wibMidnightToUtc(year, month + 1, 1),
  };
}

/**
 * Navigate to the previous month. Handles year boundary (Jan -> Dec previous year).
 */
export function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 0) {
    return { year: year - 1, month: 11 };
  }
  return { year, month: month - 1 };
}

/**
 * Navigate to the next month. Handles year boundary (Dec -> Jan next year).
 */
export function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 11) {
    return { year: year + 1, month: 0 };
  }
  return { year, month: month + 1 };
}

/**
 * Check if the given year/month is the current WIB month (or in the future).
 */
export function isCurrentOrFutureMonth(
  year: number,
  month: number,
  now?: number
): boolean {
  const current = getCurrentWibMonth(now);
  return year > current.year || (year === current.year && month >= current.month);
}

/**
 * Convert UTC epoch ms to YYYY-MM-DD string in WIB for <input type="date">.
 */
export function utcToWibDateStr(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const d = String(wib.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Convert YYYY-MM-DD string to WIB midnight in UTC epoch ms.
 */
export function wibDateStrToUtc(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d, -7, 0, 0, 0);
}
