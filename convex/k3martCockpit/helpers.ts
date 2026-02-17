/**
 * K3 Mart Cockpit - Pure Business Logic Helpers
 *
 * These functions have NO Convex ctx dependency and can be unit tested directly.
 */

/**
 * Calculate how much kitchen needs to produce vs. how much to submit to K3 Mart API.
 *
 * @param target - Target stock level at the outlet
 * @param currentStock - Current stock at the outlet
 * @param transfersIn - Units being transferred in from other outlets
 * @returns apiStockInQty (what to submit to K3 Mart) and kitchenOrderQty (what kitchen must produce fresh)
 */
export function calculateKitchenDelta(
  target: number,
  currentStock: number,
  transfersIn: number
): { apiStockInQty: number; kitchenOrderQty: number } {
  const netStockIn = Math.max(0, target - currentStock);
  return {
    apiStockInQty: netStockIn,
    kitchenOrderQty: Math.max(0, netStockIn - transfersIn),
  };
}

/**
 * Calculate suggested dispatch quantity for an outlet.
 * Uses target, current stock, and 7-day average daily sales for safety buffer.
 *
 * @param target - Day target (weekday or weekend from restockTargets)
 * @param currentStock - Current stock at outlet
 * @param avgDailySales - 7-day average daily sales at this outlet
 * @returns Suggested quantity (always >= 0)
 */
export function calculateSuggestedQty(
  target: number,
  currentStock: number,
  avgDailySales: number
): number {
  const safetyStock = Math.ceil(avgDailySales);
  return Math.max(0, target - currentStock + safetyStock);
}

/**
 * Get ISO week number string from a YYYY-MM-DD date.
 * Returns format "2026-W07".
 */
export function getWeekNumber(date: string): string {
  const d = new Date(date + "T00:00:00+07:00"); // Jakarta timezone
  const dayNum = d.getDay() || 7; // Make Sunday = 7
  d.setDate(d.getDate() + 4 - dayNum); // Set to Thursday of the week
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Format a YYYY-MM-DD date for display.
 * Returns "Mon, Feb 11" style format.
 */
export function formatDateShort(date: string): string {
  const d = new Date(date + "T00:00:00+07:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Generate an array of YYYY-MM-DD dates for a week starting from Monday.
 * @param startDate - Any date in the week (YYYY-MM-DD)
 * @returns Array of 7 date strings [Monday..Sunday]
 */
export function getWeekDates(startDate: string): string[] {
  // Parse in Jakarta timezone to get correct day-of-week
  const d = new Date(startDate + "T12:00:00+07:00"); // Use noon to avoid edge cases

  // Get day of week from Jakarta perspective using Intl
  const dayName = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Jakarta",
  }).format(d);

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = dayMap[dayName] ?? 0;
  const adjustedDow = dayOfWeek === 0 ? 7 : dayOfWeek; // Sunday = 7

  // Calculate Monday from Jakarta-perspective date
  const jakartaDateStr = d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const jakartaDate = new Date(jakartaDateStr + "T12:00:00+07:00");
  const monday = new Date(jakartaDate);
  monday.setDate(jakartaDate.getDate() - adjustedDow + 1);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    dates.push(current.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }));
  }
  return dates;
}

/**
 * Get today's date in YYYY-MM-DD format (Jakarta timezone).
 */
export function getTodayJakarta(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/**
 * Get tomorrow's date in YYYY-MM-DD format (Jakarta timezone).
 */
export function getTomorrowJakarta(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

// ============================================
// Day Type Classification (for Convex backend)
// Mirror of src/lib/indonesianHolidays.ts logic.
// Convex can't import from src/, so we duplicate the minimal data needed.
// ============================================

/** Indonesian public holiday dates for 2026 */
const HOLIDAY_DATES_2026 = new Set([
  "2026-01-01", "2026-01-16", "2026-02-17", "2026-03-19",
  "2026-03-21", "2026-03-22", "2026-04-03", "2026-05-01",
  "2026-05-14", "2026-05-27", "2026-05-31", "2026-06-01",
  "2026-06-16", "2026-08-17", "2026-08-25", "2026-12-25",
]);

/** Commercial / sales dates for 2026 */
const COMMERCIAL_DATES_2026 = new Set([
  "2026-01-01", "2026-02-02", "2026-02-14", "2026-03-03",
  "2026-04-04", "2026-05-05", "2026-06-06", "2026-07-07",
  "2026-08-08", "2026-09-09", "2026-10-10", "2026-11-11", "2026-12-12",
]);

/**
 * Classify a YYYY-MM-DD date into a day type for demand patterns.
 * Priority: holiday > sales_date > weekend > weekday.
 * Backend version -- mirrors getDayType from indonesianHolidays.ts.
 */
export function getDayTypeForDate(
  date: string
): "weekday" | "weekend" | "holiday" | "sales_date" {
  if (HOLIDAY_DATES_2026.has(date)) return "holiday";
  if (COMMERCIAL_DATES_2026.has(date)) return "sales_date";
  const day = new Date(date + "T00:00:00+07:00").getDay();
  if (day === 0 || day === 6) return "weekend";
  return "weekday";
}

/**
 * Calculate auto-suggest quantity for a day based on previous week baseline and day type.
 *
 * @param baselineWeeklyTotal - Last week's total planned qty for this outlet+product (default 100 if no data)
 * @param dayType - The type of day from getDayType()
 * @returns Suggested quantity for this day (rounded)
 */
export function calculateAutoSuggest(
  baselineWeeklyTotal: number,
  dayType: "weekday" | "weekend" | "holiday" | "sales_date"
): number {
  const baseline = baselineWeeklyTotal > 0 ? baselineWeeklyTotal : 100;
  const weekdayRate = baseline / 5;
  if (dayType === "weekday") {
    return Math.round(weekdayRate);
  }
  // Weekend, holiday, sales_date: 2.5x weekday rate
  return Math.round(weekdayRate * 2.5);
}

/**
 * Parse a week number like "2026-W07" to get the Monday date,
 * then return all 7 dates of that week as YYYY-MM-DD strings.
 */
export function getWeekDatesFromWeekNumber(weekNumber: string): string[] {
  const match = weekNumber.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid week number format: ${weekNumber}`);
  }
  const year = parseInt(match[1]);
  const week = parseInt(match[2]);

  // ISO 8601: Week 1 contains January 4th
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // Sunday = 7
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1); // Monday of week 1

  // Add (week-1) * 7 days to get to target week's Monday
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}
