/**
 * Period range calculation helpers for sales analytics.
 * Uses WIB (UTC+7) timezone for day-boundary presets.
 * Pure functions - no Convex context required.
 */

export type PeriodPreset =
  | "past24hours"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "last7days"
  | "last30days"
  | "thisMonth"
  | "allTime";

export interface PeriodRange {
  currentStart: number; // epoch ms
  currentEnd: number; // epoch ms
  previousStart: number; // epoch ms
  previousEnd: number; // epoch ms
  periodLabel: string;
  comparisonLabel: string;
}

const WIB_OFFSET_HOURS = 7;

/**
 * Get the current WIB date components from a UTC timestamp.
 */
export function getWibComponents(utcMs: number) {
  const d = new Date(utcMs + WIB_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(), // 0-indexed
    day: d.getUTCDate(),
    dayOfWeek: d.getUTCDay(), // 0=Sunday
    hour: d.getUTCHours(), // 0-23 WIB
  };
}

/**
 * Convert WIB midnight (start of day) to UTC epoch ms.
 * WIB 00:00 = UTC previous day 17:00
 */
export function wibMidnightToUtc(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day, -WIB_OFFSET_HOURS, 0, 0, 0);
}

/**
 * Calculate current and previous period ranges for a given preset.
 * All timestamps are UTC epoch milliseconds with WIB day boundaries.
 *
 * @param preset - One of the period presets
 * @param now - Optional UTC timestamp for testing (defaults to Date.now())
 */
export function calculatePeriodRange(preset: PeriodPreset, now?: number): PeriodRange {
  const timestamp = now ?? Date.now();
  const { year, month, day, dayOfWeek } = getWibComponents(timestamp);

  switch (preset) {
    case "past24hours": {
      const currentStart = timestamp - 24 * 60 * 60 * 1000;
      const currentEnd = timestamp;
      const previousStart = timestamp - 48 * 60 * 60 * 1000;
      const previousEnd = currentStart;
      return { currentStart, currentEnd, previousStart, previousEnd, periodLabel: "Past 24 hours", comparisonLabel: "vs previous 24h" };
    }

    case "today": {
      const currentStart = wibMidnightToUtc(year, month, day);
      const currentEnd = timestamp;
      const previousStart = wibMidnightToUtc(year, month, day - 1);
      const previousEnd = currentStart;
      return { currentStart, currentEnd, previousStart, previousEnd, periodLabel: "Today", comparisonLabel: "vs yesterday" };
    }

    case "yesterday": {
      const todayStart = wibMidnightToUtc(year, month, day);
      const currentStart = wibMidnightToUtc(year, month, day - 1);
      const currentEnd = todayStart;
      const previousStart = wibMidnightToUtc(year, month, day - 2);
      const previousEnd = currentStart;
      return { currentStart, currentEnd, previousStart, previousEnd, periodLabel: "Yesterday", comparisonLabel: "vs day before" };
    }

    case "thisWeek": {
      // Monday to now (WIB). dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat
      // Days since Monday: if Sunday (0) -> 6, else dayOfWeek - 1
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const currentStart = wibMidnightToUtc(year, month, day - daysSinceMonday);
      const currentEnd = timestamp;
      // Previous week: same span
      const previousStart = wibMidnightToUtc(year, month, day - daysSinceMonday - 7);
      const previousEnd = currentStart;
      return { currentStart, currentEnd, previousStart, previousEnd, periodLabel: "This week", comparisonLabel: "vs last week" };
    }

    case "last7days": {
      const currentEnd = timestamp;
      const currentStart = wibMidnightToUtc(year, month, day - 6);
      const previousEnd = currentStart;
      const previousStart = wibMidnightToUtc(year, month, day - 13);
      return { currentStart, currentEnd, previousStart, previousEnd, periodLabel: "Last 7 days", comparisonLabel: "vs previous 7 days" };
    }

    case "last30days": {
      const currentEnd = timestamp;
      const currentStart = wibMidnightToUtc(year, month, day - 29);
      const previousEnd = currentStart;
      const previousStart = wibMidnightToUtc(year, month, day - 59);
      return { currentStart, currentEnd, previousStart, previousEnd, periodLabel: "Last 30 days", comparisonLabel: "vs previous 30 days" };
    }

    case "thisMonth": {
      const currentStart = wibMidnightToUtc(year, month, 1);
      const currentEnd = timestamp;
      // Previous month: full month
      const prevMonthStart = wibMidnightToUtc(year, month - 1, 1);
      const prevMonthEnd = currentStart;
      return { currentStart, currentEnd, previousStart: prevMonthStart, previousEnd: prevMonthEnd, periodLabel: "This month", comparisonLabel: "vs last month" };
    }

    case "allTime": {
      // Use a very old date as start (Jan 1, 2020)
      const currentStart = Date.UTC(2020, 0, 1);
      const currentEnd = timestamp;
      // No meaningful comparison for all time
      const previousStart = currentStart;
      const previousEnd = currentStart;
      return { currentStart, currentEnd, previousStart, previousEnd, periodLabel: "All time", comparisonLabel: "" };
    }
  }
}

// ─── Month range calculation ───

/**
 * Calculate month range boundaries from a year and month.
 * Returns both the current month range and the previous month range
 * for comparison calculations.
 *
 * @param year - Full year (e.g. 2026)
 * @param month - 0-indexed month (0=Jan, 11=Dec)
 * @returns { currentStart, currentEnd, previousStart, previousEnd }
 *          All values are UTC epoch ms with WIB day boundaries.
 *          currentEnd is EXCLUSIVE (1st of next month 00:00 WIB).
 */
export function calculateMonthRange(year: number, month: number): {
  currentStart: number;
  currentEnd: number;
  previousStart: number;
  previousEnd: number;
} {
  const currentStart = wibMidnightToUtc(year, month, 1);
  const currentEnd = wibMidnightToUtc(year, month + 1, 1);
  const previousStart = wibMidnightToUtc(year, month - 1, 1);
  const previousEnd = currentStart;
  return { currentStart, currentEnd, previousStart, previousEnd };
}

// ─── Custom range calculation ───

/**
 * Calculate an arbitrary period range with an equal-length comparison window
 * immediately preceding the selected range.
 *
 * @param periodStart - UTC epoch ms for the start of the period
 * @param periodEnd - UTC epoch ms for the end of the period (exclusive)
 * @returns { currentStart, currentEnd, previousStart, previousEnd }
 */
export function calculateCustomRange(periodStart: number, periodEnd: number): {
  currentStart: number;
  currentEnd: number;
  previousStart: number;
  previousEnd: number;
} {
  const duration = periodEnd - periodStart;
  return {
    currentStart: periodStart,
    currentEnd: periodEnd,
    previousStart: periodStart - duration,
    previousEnd: periodStart,
  };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Calculate week range boundaries from a weekStart timestamp.
 * weekStart should be a Monday 00:00 WIB epoch ms.
 *
 * Returns both the current week range and the previous week range
 * for comparison calculations.
 *
 * @param weekStartMs - Epoch ms for Monday 00:00 WIB of the target week
 * @returns { currentStart, currentEnd, previousStart, previousEnd }
 *          All values are UTC epoch ms.
 *          currentEnd is EXCLUSIVE (next Monday 00:00 WIB).
 */
export function calculateWeekRange(weekStartMs: number): {
  currentStart: number;
  currentEnd: number;
  previousStart: number;
  previousEnd: number;
} {
  return {
    currentStart: weekStartMs,
    currentEnd: weekStartMs + WEEK_MS, // Exclusive end: next Monday 00:00 WIB
    previousStart: weekStartMs - WEEK_MS,
    previousEnd: weekStartMs,
  };
}

// --- WIB Date Formatting Helpers ---
// Used by time-series, revenue-by-outlet, restock, and sell-through queries.

export const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Canonical WIB date helper. Returns YYYY-MM-DD for a UTC epoch ms.
 *
 * Phase 81 / D-06, D-07: Single source of truth for WIB date-string
 * conversion. NaN-guard semantics promoted from the (deleted in this same
 * plan) staffAttendance/flagEngine.ts#toWibDateString — fails loud on
 * non-finite input rather than letting "Invalid Date" strings leak into
 * downstream reports/aggregations.
 *
 * Replaces (deleted in Plan 81-02 — no shims per D-10):
 *   - getWibDateString (gofoodDepot/helpers.ts)
 *   - getWibDateStringDaysAgo (gofoodDepot/helpers.ts)
 *   - toWibDateString (staffAttendance/flagEngine.ts)
 *   - utcToWibDateStr (this file — collapsed into the canonical)
 */
export function getWibDateStr(utcMs: number): string {
  if (!Number.isFinite(utcMs)) {
    throw new Error(`getWibDateStr: non-finite input ${utcMs}`);
  }
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * @deprecated Phase 81: scheduled for deletion in Plan 81-02 Task 2.5 after
 * all backend callers migrate. Use {@link getWibDateStr} instead.
 */
export function utcToWibDateStr(utcMs: number): string {
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().split("T")[0];
}

/** Check if a WIB-adjusted timestamp falls on a weekend (Sat=6, Sun=0) */
export function isWeekend(utcMs: number): boolean {
  const wibDate = new Date(utcMs + WIB_OFFSET_MS);
  const day = wibDate.getUTCDay();
  return day === 0 || day === 6;
}

/** Get ISO week number from WIB-adjusted date. Returns "W06" format. */
export function getIsoWeekNumber(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const d = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `W${weekNo.toString().padStart(2, "0")}`;
}

/**
 * Get ISO 8601 week-year (the year that owns the ISO week containing this date).
 * Differs from calendar year at year boundaries: Dec 29 2025 (Mon) belongs to ISO 2026-W01.
 * Pair with getIsoWeekNumber() to produce labels like "2026-W01" — never "2025-W01" for that date.
 */
export function getIsoWeekYear(utcMs: number): number {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const d = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

/** Get YYYY-MM from WIB-adjusted date */
export function utcToWibMonthStr(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const y = wib.getUTCFullYear();
  const m = (wib.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

/** Get "YYYY-MM-DD HH" from UTC epoch ms, WIB-adjusted */
export function utcToWibHourStr(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const date = wib.toISOString().split("T")[0];
  const hour = wib.getUTCHours().toString().padStart(2, "0");
  return `${date} ${hour}`;
}
