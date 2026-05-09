/**
 * Phase 76 — Shared period-bucket math.
 *
 * Single source of truth for the financial export multi-period bucketing logic.
 * Imported by BOTH:
 *   - backend  (convex/reports/financialExport.ts)
 *   - frontend (src/lib/financialExportHelpers.ts — plan 03)
 *
 * Cross-tier import precedent: src/pages/UnlinkedProductsBackfill.tsx,
 * src/pages/ProductInventorySettings.tsx, src/pages/ChannelRoutingManager.tsx all
 * import from convex/lib/. Plain TS files in convex/lib/ are bundler-safe to import
 * from src/.
 *
 * Pure function — no Convex context required.
 */

import { wibMidnightToUtc, WIB_OFFSET_MS } from "./periodRange";

export type Granularity = "weekly" | "monthly" | "custom";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build period buckets for a date range.
 *
 * - "weekly":  snaps to Monday 00:00 WIB; clamps partial leading/trailing buckets to [periodStart, periodEnd).
 * - "monthly": one bucket per WIB calendar month; clamps partial buckets at edges.
 * - "custom":  exactly one bucket spanning [periodStart, periodEnd).
 *
 * Returns: Array of [bucketStart, bucketEnd) half-open epoch-ms intervals.
 */
export function buildPeriodBuckets(
  periodStart: number,
  periodEnd: number,
  granularity: Granularity,
): Array<[number, number]> {
  if (granularity === "custom") return [[periodStart, periodEnd]];
  const buckets: Array<[number, number]> = [];
  if (granularity === "weekly") {
    const wibDate = new Date(periodStart + WIB_OFFSET_MS);
    const dayOfWeek = wibDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysToMonday = (dayOfWeek + 6) % 7; // Mon→0, Tue→1, ..., Sun→6
    const snappedStart = periodStart - daysToMonday * DAY_MS;
    let cursor = snappedStart;
    while (cursor < periodEnd) {
      const next = cursor + WEEK_MS;
      buckets.push([Math.max(cursor, periodStart), Math.min(next, periodEnd)]);
      cursor = next;
    }
  } else {
    // monthly
    const wibDate = new Date(periodStart + WIB_OFFSET_MS);
    let y = wibDate.getUTCFullYear();
    let m = wibDate.getUTCMonth();
    while (true) {
      const monthStart = wibMidnightToUtc(y, m, 1);
      const monthEnd = wibMidnightToUtc(y, m + 1, 1);
      if (monthStart >= periodEnd) break;
      buckets.push([
        Math.max(monthStart, periodStart),
        Math.min(monthEnd, periodEnd),
      ]);
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  }
  return buckets;
}
