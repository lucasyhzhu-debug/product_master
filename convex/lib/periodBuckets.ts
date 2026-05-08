/**
 * Shared period-bucket math used by BOTH backend (convex/reports/financialExport.ts)
 * AND frontend (src/lib/financialExportHelpers.ts). Single source of truth.
 *
 * The frontend imports this file directly — verified cross-tier import precedent
 * in src/pages/UnlinkedProductsBackfill.tsx, src/pages/ProductInventorySettings.tsx.
 *
 * Phase 76 plan 03 worktree-stub note (will be overwritten by plan 02 on merge):
 *   This file is created in plan 03's worktree to satisfy the type-check before
 *   plan 02 lands. The implementation matches the documented signature in
 *   76-02-PLAN.md and 76-03-PLAN.md verbatim. The orchestrator's post-merge gate
 *   verifies both versions are consistent.
 */

import { wibMidnightToUtc, WIB_OFFSET_MS } from "./periodRange";

export type Granularity = "weekly" | "monthly" | "custom";

/**
 * Build period buckets for a date range.
 *
 * - "weekly": snaps to Monday 00:00 WIB; clamps partial leading/trailing buckets to [periodStart, periodEnd).
 * - "monthly": one bucket per WIB calendar month; clamps partial buckets at edges.
 * - "custom": exactly one bucket spanning [periodStart, periodEnd).
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
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const wibDate = new Date(periodStart + WIB_OFFSET_MS);
    const dayOfWeek = wibDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysToMonday = (dayOfWeek + 6) % 7; // Mon→0, Tue→1, ..., Sun→6
    const snappedStart = periodStart - daysToMonday * 24 * 60 * 60 * 1000;
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
