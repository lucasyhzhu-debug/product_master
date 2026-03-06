/**
 * Shared WIB (Western Indonesian Time, UTC+7) timezone helpers.
 *
 * Single source of truth for WIB date/time conversions used across
 * SalesAnalytics, GrabFoodManager, and other frontend modules.
 */

/** UTC+7 offset in milliseconds */
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

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

/** Format as Indonesian locale date string (e.g. "6 Mar 2026") */
export function formatDateId(utcMs: number): string {
  return new Date(utcMs).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
