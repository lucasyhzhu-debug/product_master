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
function getWibComponents(utcMs: number) {
  const d = new Date(utcMs + WIB_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(), // 0-indexed
    day: d.getUTCDate(),
    dayOfWeek: d.getUTCDay(), // 0=Sunday
  };
}

/**
 * Convert WIB midnight (start of day) to UTC epoch ms.
 * WIB 00:00 = UTC previous day 17:00
 */
function wibMidnightToUtc(year: number, month: number, day: number): number {
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
