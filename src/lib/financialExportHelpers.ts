/**
 * Phase 76 FIN-04: Frontend financial export helpers.
 *
 * Pure-TypeScript helpers consumed by the financial export page (plan 04):
 *   - buildPeriodBuckets (RE-EXPORTED from convex/lib/periodBuckets — single source of truth)
 *   - buildExportFilenames (deterministic, path-traversal-safe filenames)
 *   - presetToRange (UI preset chips: last-week / last-month / last-quarter / ytd)
 *   - formatWeekLabel / formatMonthLabel / formatCustomLabel (period labels with `(partial)` suffix)
 *   - generateRawTransactionsCSV (D-01 schema, every cell through escapeCell — D-14)
 *   - generateMultiPeriodPLCSV (one header, per-period bodies via buildIncomeStatementRows, one range-aggregated footer — D-08)
 *
 * Critical contracts (locked by plan 03):
 *   - "Last week" returns prior ISO week (Mon-Sun) in WIB — Improvement 9 / M4
 *   - Filename uses periodEnd-1 for inclusive end-date label — D-11
 *   - First period in multi-period output has empty prev_period_idr / delta_pct — D-05
 *   - buildIncomeStatementRows is called with 4 args (NO deltas) — plan 01 simplified signature
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
  getIsoWeekYear,
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
  // Use ISO week-year (NOT calendar year) — Dec 29 2025 Mon belongs to ISO 2026-W01,
  // not "2025-W01". Triple-review C1.
  const isoYear = getIsoWeekYear(s);
  const week = getIsoWeekNumber(s); // returns "W15"
  const isFullWeek = e - s === WEEK_MS;
  return isFullWeek ? `${isoYear}-${week}` : `${isoYear}-${week} (partial)`;
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

// ─── CSV serializers (Task 3.2) ───

import { buildIncomeStatementRows, escapeCell } from "./csvExport";
import type { WeekData } from "../../convex/reports/incomeStatement";

// ─── Raw transactions CSV (D-01 schema, D-14 escapeCell, D-15 integer rupiah) ───

/**
 * Type matches the return shape from
 * convex/reports/financialExport.ts:getRawTransactionsExport.
 */
export type RawTransactionRow = {
  entryDate: number;
  journalEntryId: string;
  entryNumber: string;
  sourceType: string;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
  sourceId: string | undefined;
  createdByName: string | null;
  _creationTime: number;
};

/**
 * Serialize raw GL line rows to CSV.
 *
 * Column order verbatim per D-01:
 *   entry_date, je_id, je_number, je_type, account_code, account_name,
 *   debit_idr, credit_idr, description, source_doc_type, source_doc_id, created_by
 *
 * Every cell — header AND body — runs through `escapeCell` (D-14 + Pitfall 5).
 * IDR amount cells emit as `String(amount)` — integer-only, no decimals/separators (D-15).
 * `source_doc_type` column = `sourceType` (Pitfall 3 — verbatim, no mapping).
 */
export function generateRawTransactionsCSV(rows: RawTransactionRow[]): string {
  const out: string[][] = [];

  // D-01 — column order verbatim
  out.push([
    "entry_date",
    "je_id",
    "je_number",
    "je_type",
    "account_code",
    "account_name",
    "debit_idr",
    "credit_idr",
    "description",
    "source_doc_type",
    "source_doc_id",
    "created_by",
  ]);

  for (const r of rows) {
    out.push([
      utcToWibDateStr(r.entryDate),
      String(r.journalEntryId),
      r.entryNumber,
      r.sourceType, // D-01 + Pitfall 3 — verbatim, no mapping
      r.accountCode,
      r.accountName,
      String(r.debitAmount), // D-15 — integer rupiah
      String(r.creditAmount),
      r.description ?? "",
      r.sourceType, // D-01 source_doc_type column = sourceType
      r.sourceId ?? "",
      r.createdByName ?? "<unknown>", // Edge case 10 — deleted user
    ]);
  }

  // D-14 + Pitfall 5: every row including header through escapeCell
  return out.map((row) => row.map(escapeCell).join(",")).join("\n");
}

// ─── Multi-period P&L CSV (D-05 in-range deltas, D-08 single footer) ───

/**
 * Type matches return shape from
 * convex/reports/financialExport.ts:getMultiPeriodPLExport.
 *
 * `rangeGap` shape uses real `WeekData.gapAnalysis` fields (per Critical 3 —
 * NOT placeholder string-arrays). `unmappedProducts` is `Array<{name,count,revenue}>`
 * not `string[]`; `missingChannels` is `Array<{source,displayName,reason}>`;
 * `zeroCostComponents` replaces the placeholder `zeroCogsCount`.
 */
export type MultiPeriodPLData = {
  periods: Array<{
    bucketStart: number;
    bucketEnd: number;
    label: string;
    current: WeekData;
  }>;
  rangeGap: {
    totalProducts: number;
    totalMappedProducts: number;
    unmappedProducts: Array<{ name: string; count: number; revenue: number }>;
    missingChannels: Array<{
      source: string;
      displayName: string;
      reason: string;
    }>;
    zeroCostComponents: Array<{ name: string; code: string }>;
  };
};

/**
 * Serialize multi-period P&L data to CSV.
 *
 * Layout (D-08 — single header, single footer):
 *   1 header row (8 cols, Phase 75 schema)
 *   1 annotation comment row (CONTEXT.md <specifics> recommendation)
 *   Per-period body rows via buildIncomeStatementRows (4-arg signature — no deltas
 *     — plan 01 simplified signature; helper computes deltas internally)
 *   1 blank separator + range-aggregated Data Quality Notes footer
 *
 * First period's prev_period_idr / delta_pct cells are empty strings (D-05 —
 * passed via `firstInRange=true` flag). Subsequent periods compute prev as
 * `periods[i-1].current` (in-range delta, NOT equal-length lookback).
 */
export function generateMultiPeriodPLCSV(data: MultiPeriodPLData): string {
  const out: string[][] = [];

  // 8-column header (Phase 75 schema, verbatim)
  out.push([
    "period",
    "section",
    "channel",
    "line_item",
    "amount_idr",
    "confidence",
    "prev_period_idr",
    "delta_pct",
  ]);

  // Annotation comment row
  out.push([
    "# Multi-period export — prev_period_idr compares against the immediately prior period within the file.",
  ]);

  // Per-period body rows via buildIncomeStatementRows (D-05 in-range delta semantics)
  // CRITICAL: 4 args — NO deltas (plan 01 simplified signature, helper computes internally).
  for (let i = 0; i < data.periods.length; i++) {
    const p = data.periods[i];
    const prev = i > 0 ? data.periods[i - 1].current : null;
    const isFirstInRange = i === 0;
    out.push(
      ...buildIncomeStatementRows(p.label, p.current, prev, isFirstInRange),
    );
  }

  // D-08: single range-aggregated Data Quality footer at bottom (real rangeGap shape)
  out.push([]);
  out.push(["# Data Quality Notes (range-aggregated)"]);
  out.push([
    `# Mapped products: ${data.rangeGap.totalMappedProducts}/${data.rangeGap.totalProducts}`,
  ]);
  if (data.rangeGap.unmappedProducts.length > 0) {
    const summary = data.rangeGap.unmappedProducts
      .map((u) => `${u.name} (qty=${u.count}, IDR ${u.revenue})`)
      .join("; ");
    out.push([`# Unmapped products: ${summary}`]);
  }
  if (data.rangeGap.missingChannels.length > 0) {
    const summary = data.rangeGap.missingChannels
      .map((ch) => `${ch.displayName} (${ch.source}): ${ch.reason}`)
      .join("; ");
    out.push([`# Missing channels: ${summary}`]);
  }
  if (data.rangeGap.zeroCostComponents.length > 0) {
    const summary = data.rangeGap.zeroCostComponents
      .map((z) => `${z.name} (${z.code})`)
      .join("; ");
    out.push([`# Zero-cost components: ${summary}`]);
  }

  // D-14 + Pitfall 5: every row through escapeCell
  return out.map((row) => row.map(escapeCell).join(",")).join("\n");
}
