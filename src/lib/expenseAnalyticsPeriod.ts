/**
 * Period calculation helpers for Expense Analytics.
 *
 * Pure functions for WIB-aligned period range computation.
 * Extracted from the page component for unit testability.
 */

import { wibMidnightToUtc, getCurrentWibMonth } from "@/lib/dateUtils";

// Re-export canonical copies from dateUtils for backward compatibility
export { wibMidnightToUtc, getCurrentWibMonth };

export type ExpensePeriodMode = "month" | "custom";

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

// utcToWibDateStr and wibDateStrToUtcMs are canonical exports from @/lib/dateUtils
// Import from there instead of duplicating here.
