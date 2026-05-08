/**
 * Phase 76 FIN-04: Frontend financial export helpers (Task 3.1 — preset/filename/format-label).
 *
 * Pure-TypeScript helpers consumed by the financial export page (plan 04):
 *   - buildPeriodBuckets (RE-EXPORTED from convex/lib/periodBuckets — single source of truth)
 *   - buildExportFilenames (deterministic, path-traversal-safe filenames)
 *   - presetToRange (UI preset chips: last-week / last-month / last-quarter / ytd)
 *   - formatWeekLabel / formatMonthLabel / formatCustomLabel (period labels with `(partial)` suffix)
 *
 * CSV serializers added in Task 3.2.
 *
 * Critical contracts (locked by plan 03):
 *   - "Last week" returns prior ISO week (Mon-Sun) in WIB — Improvement 9 / M4
 *   - Filename uses periodEnd-1 for inclusive end-date label — D-11
 *   - buildPeriodBuckets is RE-EXPORTED — no local re-implementation (Improvement 8)
 */

import {
  utcToWibDateStr,
  wibMidnightToUtc,
  WIB_OFFSET_MS,
} from "./dateUtils";

// Single source of truth for period bucketing — backend and frontend both
// import from here. Cross-tier import verified by precedent (UnlinkedProductsBackfill,
// ProductInventorySettings, ChannelRoutingManager all import from convex/lib/).
import {
  buildPeriodBuckets,
  type Granularity,
} from "../../convex/lib/periodBuckets";

// Period-label helpers reuse WIB formatting from periodRange.
import {
  getIsoWeekNumber,
  utcToWibMonthStr,
} from "../../convex/lib/periodRange";

// Re-export so plan 04 page + tests can import everything from one module.
export { buildPeriodBuckets };
export type { Granularity };

// ─── Preset ranges (UI-SPEC chips) ───

export type Preset = "last-week" | "last-month" | "last-quarter" | "ytd";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Convert a preset chip to a [start, end) WIB range in epoch ms.
 *
 * Semantics (locked by Improvement 9 / M4):
 *   - last-week:    PRIOR ISO week (Mon-Sun) in WIB. Returns [previousMonday, thisMonday).
 *   - last-month:   Prior calendar month in WIB.
 *   - last-quarter: Prior 3 calendar months in WIB.
 *   - ytd:          Jan 1 of current year through tomorrow midnight (covers today).
 */
export function presetToRange(
  preset: Preset,
  nowMs: number = Date.now(),
): [number, number] {
  // Treat nowMs as "today in WIB" — snap to current day's WIB midnight.
  const wibNow = new Date(nowMs + WIB_OFFSET_MS);
  const todayWibMidnight = wibMidnightToUtc(
    wibNow.getUTCFullYear(),
    wibNow.getUTCMonth(),
    wibNow.getUTCDate(),
  );
  const tomorrowWibMidnight = todayWibMidnight + DAY_MS; // exclusive end

  switch (preset) {
    case "last-week": {
      // PRIOR ISO WEEK (Mon-Sun) in WIB — Improvement 9 locked semantics.
      // Snap today's WIB Monday, return [previousMonday, thisMonday).
      const dayOfWeek = wibNow.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const daysToMonday = (dayOfWeek + 6) % 7; // Mon→0, Tue→1, ..., Sun→6
      const thisMondayWib = todayWibMidnight - daysToMonday * DAY_MS;
      const previousMondayWib = thisMondayWib - 7 * DAY_MS;
      return [previousMondayWib, thisMondayWib];
    }
    case "last-month": {
      const start = wibMidnightToUtc(
        wibNow.getUTCFullYear(),
        wibNow.getUTCMonth() - 1,
        1,
      );
      const end = wibMidnightToUtc(
        wibNow.getUTCFullYear(),
        wibNow.getUTCMonth(),
        1,
      );
      return [start, end];
    }
    case "last-quarter": {
      const start = wibMidnightToUtc(
        wibNow.getUTCFullYear(),
        wibNow.getUTCMonth() - 3,
        1,
      );
      const end = wibMidnightToUtc(
        wibNow.getUTCFullYear(),
        wibNow.getUTCMonth(),
        1,
      );
      return [start, end];
    }
    case "ytd": {
      const start = wibMidnightToUtc(wibNow.getUTCFullYear(), 0, 1);
      return [start, tomorrowWibMidnight];
    }
  }
}

// ─── Filename helper (D-11 — verbatim templates, path-traversal-safe) ───

/**
 * Build the two export filenames for a given range and granularity.
 * Templates (verbatim — D-11):
 *   transactions: frollie-transactions-YYYYMMDD-YYYYMMDD.csv
 *   pl:           frollie-pl-summary-YYYYMMDD-YYYYMMDD-{granularity}.csv
 *
 * `periodEnd` is exclusive — uses `periodEnd-1` for the inclusive end-date label.
 * Defensive `^\d{8}$` assertion blocks any path-traversal characters (T-76-03 mitigation).
 */
export function buildExportFilenames(
  periodStart: number,
  periodEnd: number,
  granularity: Granularity,
): { transactions: string; pl: string } {
  const startStr = utcToWibDateStr(periodStart).replace(/-/g, "");
  const endStr = utcToWibDateStr(periodEnd - 1).replace(/-/g, "");
  if (!/^\d{8}$/.test(startStr) || !/^\d{8}$/.test(endStr)) {
    throw new Error("Invalid date range for filename");
  }
  return {
    transactions: `frollie-transactions-${startStr}-${endStr}.csv`,
    pl: `frollie-pl-summary-${startStr}-${endStr}-${granularity}.csv`,
  };
}

// ─── Period-label helpers (Improvement 6 — `(partial)` suffix support) ───

const WEEK_MS = 7 * DAY_MS;

/**
 * Format a weekly bucket label.
 *   Full ISO week (e - s === 7 days) → "2026-W15"
 *   Partial week                     → "2026-W15 (partial)"
 */
export function formatWeekLabel(s: number, e: number): string {
  const wibYear = new Date(s + WIB_OFFSET_MS).getUTCFullYear();
  const week = getIsoWeekNumber(s); // returns "W15"
  const isFullWeek = e - s === WEEK_MS;
  return isFullWeek ? `${wibYear}-${week}` : `${wibYear}-${week} (partial)`;
}

/**
 * Format a monthly bucket label.
 *   Full WIB month (1st → next 1st) → "2026-04"
 *   Partial month                   → "2026-04 (partial)"
 */
export function formatMonthLabel(s: number, e: number): string {
  const monthStr = utcToWibMonthStr(s); // "2026-04"
  const startWib = new Date(s + WIB_OFFSET_MS);
  const endWib = new Date(e + WIB_OFFSET_MS);
  const isFullMonth =
    startWib.getUTCDate() === 1 &&
    endWib.getUTCDate() === 1 &&
    (endWib.getUTCMonth() !== startWib.getUTCMonth() ||
      endWib.getUTCFullYear() !== startWib.getUTCFullYear());
  return isFullMonth ? monthStr : `${monthStr} (partial)`;
}

/** Format a custom range label as "YYYY-MM-DD to YYYY-MM-DD" (inclusive end via e-1). */
export function formatCustomLabel(s: number, e: number): string {
  const startStr = new Date(s + WIB_OFFSET_MS).toISOString().slice(0, 10);
  const endStr = new Date(e - 1 + WIB_OFFSET_MS).toISOString().slice(0, 10);
  return `${startStr} to ${endStr}`;
}
