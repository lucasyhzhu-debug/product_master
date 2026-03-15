/**
 * Shared WIB (Western Indonesian Time, UTC+7) timezone helpers.
 *
 * Single source of truth for WIB date/time conversions used across
 * SalesAnalytics, GrabFoodManager, and other frontend modules.
 */

/** UTC+7 offset in milliseconds */
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Convert WIB midnight (year, month, day) to UTC epoch ms. WIB 00:00 = UTC -7h. */
export function wibMidnightToUtc(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day, -7, 0, 0, 0);
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

/** Format as Indonesian locale date string (e.g. "6 Mar 2026") */
export function formatDateId(utcMs: number): string {
  return new Date(utcMs).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
