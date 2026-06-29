/**
 * Shared WIB (Western Indonesian Time, UTC+7) timezone helpers.
 *
 * Single source of truth for WIB date/time conversions used across
 * SalesAnalytics, GrabFoodManager, and other frontend modules.
 */

import { format } from "date-fns";
import { id } from "date-fns/locale/id";

/** UTC+7 offset in milliseconds */
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Convert WIB midnight (year, month, day) to UTC epoch ms. WIB 00:00 = UTC -7h. */
export function wibMidnightToUtc(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day, -7, 0, 0, 0);
}

/**
 * WIB month bounds as UTC epoch ms: start = WIB midnight on 1st, end = WIB
 * midnight of the following 1st minus 1ms (last instant of the month in WIB).
 * `month` is 0-indexed to match Date conventions.
 */
export function wibMonthBoundsMs(year: number, month: number): { start: number; end: number } {
  const start = wibMidnightToUtc(year, month, 1);
  const end = wibMidnightToUtc(year, month + 1, 1) - 1;
  return { start, end };
}

/**
 * Parse a "YYYY-MM" key into WIB month bounds. Returns null on malformed
 * input or out-of-range month.
 */
export function wibMonthBoundsFromKey(key: string): { start: number; end: number } | null {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  if (month < 0 || month > 11) return null;
  return wibMonthBoundsMs(year, month);
}

/** WIB month bounds derived from a UTC epoch ms (uses the tx's WIB date). */
export function wibMonthBoundsFromUtcMs(utcMs: number): { start: number; end: number } {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  return wibMonthBoundsMs(wib.getUTCFullYear(), wib.getUTCMonth());
}

/**
 * Get current WIB month as { year, month } where month is 0-indexed.
 * Accepts optional `now` (epoch ms) for testability.
 */
export function getCurrentWibMonth(now?: number): { year: number; month: number } {
  const ts = now ?? Date.now();
  const wibDate = new Date(ts + WIB_OFFSET_MS);
  return { year: wibDate.getUTCFullYear(), month: wibDate.getUTCMonth() };
}

/** Convert UTC epoch ms to a WIB date string (YYYY-MM-DD) */
export function utcToWibDateStr(utcMs: number): string {
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().split("T")[0];
}

/** Convert WIB date string (YYYY-MM-DD) to UTC epoch ms at WIB midnight */
export function wibDateStrToUtcMs(dateStr: string): number {
  return new Date(dateStr).getTime() - WIB_OFFSET_MS;
}

/** Format WIB time as HH:MM from UTC epoch ms */
export function utcToWibTimeStr(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const h = wib.getUTCHours().toString().padStart(2, "0");
  const m = wib.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Format as Indonesian locale datetime string (e.g. "6 Mar 2026, 14:30") */
export function formatDateTimeId(utcMs: number): string {
  return new Date(utcMs).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Strict YYYY-MM-DD to WIB midnight UTC epoch ms converter.
 *
 * Unlike `wibDateStrToUtcMs`, this rejects anything that isn't exactly
 * YYYY-MM-DD and validates that the date components are real (e.g.,
 * rejects 2026-02-30). Returns NaN for invalid input.
 */
export function strictWibDateStrToUtcMs(dateStr: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NaN;
  }

  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);

  // Validate date components are real (e.g., reject month=13, day=32)
  const utcMs = Date.UTC(year, month, day);
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month ||
    check.getUTCDate() !== day
  ) {
    return NaN;
  }

  return utcMs - WIB_OFFSET_MS;
}

/**
 * Format a Monday epoch-ms as "DD MMM – DD MMM YYYY" (en-GB, Asia/Jakarta tz).
 *
 * Single source of truth for subscription week range labels. Replaces the
 * identical local copies in SubscriptionSchedulePage, SubscriptionWeeklyInvoicePage,
 * and CrmFundingDashboardPage.
 */
export function formatSubscriptionWeekLabel(weekStartMs: number): string {
  const DAY_MS = 86_400_000;
  const monDate = new Date(weekStartMs);
  const sunDate = new Date(weekStartMs + 6 * DAY_MS);
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  };
  const mon = monDate.toLocaleDateString("en-GB", opts);
  const sun = sunDate.toLocaleDateString("en-GB", { ...opts, year: "numeric" });
  return `${mon} – ${sun}`;
}

/**
 * Format a UTC epoch ms as a WIB-pinned weekday + day label, e.g. "Mon, 29 Jun".
 * WIB-correct (timeZone: Asia/Jakarta) so per-day invoice rows never drift a day
 * on a non-WIB machine. Used by the subscription weekly invoice's day-by-day lines.
 */
export function formatWibDayLabel(utcMs: number): string {
  return new Date(utcMs).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Compact Indonesian locale date-time (no year), e.g. "19 Jun 14.30".
 * Used by the CRM activity timeline rows for dense display.
 */
export function formatDateTimeIdCompact(utcMs: number): string {
  return new Date(utcMs).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format as Indonesian locale date string (e.g. "6 Mar 2026") */
export function formatDateId(utcMs: number): string {
  return new Date(utcMs).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format date as Indonesian full date: "Senin, 16 Maret 2026" */
export function formatIndonesianDate(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return format(d, "EEEE, d MMMM yyyy", { locale: id });
}

/**
 * Format a UTC epoch ms as the short WIB admin-UI timestamp:
 *   "Apr 19, 2026 14:32 WIB"
 *
 * Introduced for Phase 74.5.1 admin surfaces (ChannelRoutingManager,
 * ProductInventorySettings, audit/backfill pages) per UI-SPEC §WIB Timezone
 * Display. Single source of truth — do NOT reimplement ad-hoc.
 */
export function formatShortWIB(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = MONTHS[wib.getUTCMonth()];
  const day = wib.getUTCDate();
  const year = wib.getUTCFullYear();
  const hh = wib.getUTCHours().toString().padStart(2, "0");
  const mm = wib.getUTCMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${year} ${hh}:${mm} WIB`;
}

/**
 * Long WIB format for detail views: "Monday, April 19 2026 at 2:32 PM WIB".
 */
export function formatLongWIB(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const weekday = WEEKDAYS[wib.getUTCDay()];
  const month = MONTHS[wib.getUTCMonth()];
  const day = wib.getUTCDate();
  const year = wib.getUTCFullYear();
  let h = wib.getUTCHours();
  const m = wib.getUTCMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${weekday}, ${month} ${day} ${year} at ${h}:${m} ${ampm} WIB`;
}
