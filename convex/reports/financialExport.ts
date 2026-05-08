/**
 * Phase 76 — Financial Data Export Backend Queries
 *
 * Three Convex queries powering the multi-period financial export page:
 *   - getRawTransactionsExport  — flat GL line export (FIN-03)
 *   - getMultiPeriodPLExport    — per-period P&L loop reusing Phase 75 fetchAndAggregate
 *   - getExportPreflight        — cheap range stats for the UI summary panel
 *
 * Trust boundary: every handler starts with a manager+admin role gate.
 * No N+1 — all ctx.db.get calls are wrapped in Promise.all over Set-deduped IDs.
 *
 * Schema name fidelity (per RESEARCH §"Schema name corrections"):
 *   - journalEntries.date / sourceType / sourceId / reversedByEntryId
 *   - journalEntryLines.journalEntryId / debitAmount / creditAmount / entryDate
 *   - chart-of-accounts table is named `accounts` (no legacy gl-prefix)
 *
 * Reversal/_void JEs are INCLUDED in raw output (D-04) — sourceType emits verbatim
 * with `_void` / `_reversal` suffix already encoded in the schema literal.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireRole } from "../lib/auth";
import { fetchAndAggregate, type WeekData } from "./incomeStatement";
import { buildPeriodBuckets, type Granularity } from "../lib/periodBuckets";
import {
  WIB_OFFSET_MS,
  getIsoWeekNumber,
  utcToWibMonthStr,
} from "../lib/periodRange";

// ─── Raw transactions export (FIN-03 D-01..D-04, D-13, D-14) ───

export type RawTransactionRow = {
  entryDate: number; // epoch ms — frontend formats with utcToWibDateStr
  journalEntryId: Id<"journalEntries">;
  entryNumber: string;
  sourceType: string; // emit verbatim (Pitfall 3)
  accountCode: string;
  accountName: string;
  debitAmount: number; // INTEGER rupiah (D-15) — frontend renders String(...)
  creditAmount: number;
  description: string;
  sourceId: string | undefined; // optional per schema
  createdByName: string | null; // null when user deleted (Edge case 10)
  _creationTime: number; // for sort stability
};

export const getRawTransactionsExport = query({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
    token: v.string(),
  },
  handler: async (ctx, args): Promise<RawTransactionRow[]> => {
    await requireRole(ctx, args.token, ["manager", "admin"]); // D-13 — CLAUDE.md Pitfall #10

    // 1. Index range scan (D-03 — half-open interval [periodStart, periodEnd))
    const lines = await ctx.db
      .query("journalEntryLines")
      .withIndex("by_entryDate", (q) =>
        q.gte("entryDate", args.periodStart).lt("entryDate", args.periodEnd),
      )
      .collect();

    if (lines.length === 0) return [];

    // 2. Set-dedupe IDs (no N+1)
    const uniqueJeIds = [
      ...new Set(lines.map((l) => l.journalEntryId as string)),
    ];
    const uniqueAccountIds = [
      ...new Set(lines.map((l) => l.accountId as string)),
    ];

    const [jeArr, accountArr] = await Promise.all([
      Promise.all(
        uniqueJeIds.map((id) =>
          ctx.db.get(id as Id<"journalEntries">),
        ),
      ),
      Promise.all(
        uniqueAccountIds.map((id) => ctx.db.get(id as Id<"accounts">)),
      ),
    ]);

    const jeMap = new Map<string, Doc<"journalEntries">>();
    for (const j of jeArr) if (j) jeMap.set(j._id as string, j);
    const accountMap = new Map<string, Doc<"accounts">>();
    for (const a of accountArr) if (a) accountMap.set(a._id as string, a);

    // 3. Resolve users (D-01 created_by; Edge case 10 — deleted user → null)
    const uniqueUserIds = [
      ...new Set(
        jeArr
          .filter((j): j is Doc<"journalEntries"> => j !== null)
          .map((j) => j.createdBy as string),
      ),
    ];
    const userArr = await Promise.all(
      uniqueUserIds.map((id) => ctx.db.get(id as Id<"users">)),
    );
    const userMap = new Map<string, Doc<"users">>();
    for (const u of userArr) if (u) userMap.set(u._id as string, u);

    // 4. Build flat rows (D-01)
    const rows: RawTransactionRow[] = [];
    for (const line of lines) {
      const je = jeMap.get(line.journalEntryId as string);
      if (!je) continue; // orphaned line — silent skip (data integrity belongs in Phase 77)
      const account = accountMap.get(line.accountId as string);
      if (!account) continue;
      const user = userMap.get(je.createdBy as string);

      rows.push({
        entryDate: line.entryDate,
        journalEntryId: je._id,
        entryNumber: je.entryNumber,
        sourceType: je.sourceType, // D-04 — _void/_reversal naturally identifiable
        accountCode: account.code,
        accountName: account.name,
        debitAmount: line.debitAmount, // D-15 integer
        creditAmount: line.creditAmount,
        description: je.description ?? "",
        sourceId: je.sourceId, // may be undefined for manual JEs
        createdByName: user?.name ?? null, // Edge case 10
        _creationTime: line._creationTime,
      });
    }

    // 5. Sort (D-02): entryDate ASC, entryNumber ASC, _creationTime ASC,
    //    debit-before-credit tiebreaker.
    rows.sort(
      (a, b) =>
        a.entryDate - b.entryDate ||
        a.entryNumber.localeCompare(b.entryNumber) ||
        a._creationTime - b._creationTime ||
        (a.creditAmount === 0 ? 0 : 1) - (b.creditAmount === 0 ? 0 : 1),
    );

    return rows;
  },
});

// ─── Period label helpers (Improvement 6 — implemented inline) ───
// Format per RESEARCH §"Section 2" lines 384-388:
//   weekly:  "2026-W15" if full ISO week, else "2026-W15 (partial)"
//   monthly: "2026-04"  if full WIB month, else "2026-04 (partial)"
//   custom:  "2026-04-01 to 2026-04-19" (inclusive end labelled via end-1)

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function formatWeekLabel(s: number, e: number): string {
  const wibYear = new Date(s + WIB_OFFSET_MS).getUTCFullYear();
  const week = getIsoWeekNumber(s); // returns "W15"
  const isFullWeek = e - s === WEEK_MS;
  return isFullWeek ? `${wibYear}-${week}` : `${wibYear}-${week} (partial)`;
}

export function formatMonthLabel(s: number, e: number): string {
  const monthStr = utcToWibMonthStr(s); // "2026-04"
  // Full WIB month: bucketStart aligns to day 1 AND bucketEnd aligns to next month day 1.
  const startWib = new Date(s + WIB_OFFSET_MS);
  const endWib = new Date(e + WIB_OFFSET_MS);
  const isFullMonth =
    startWib.getUTCDate() === 1 &&
    endWib.getUTCDate() === 1 &&
    (endWib.getUTCMonth() !== startWib.getUTCMonth() ||
      endWib.getUTCFullYear() !== startWib.getUTCFullYear());
  return isFullMonth ? monthStr : `${monthStr} (partial)`;
}

export function formatCustomLabel(s: number, e: number): string {
  // [s, e) — label inclusive end via e-1
  const startStr = new Date(s + WIB_OFFSET_MS).toISOString().slice(0, 10);
  const endStr = new Date(e - 1 + WIB_OFFSET_MS).toISOString().slice(0, 10);
  return `${startStr} to ${endStr}`;
}

function formatBucketLabel(
  s: number,
  e: number,
  granularity: Granularity,
): string {
  if (granularity === "custom") return formatCustomLabel(s, e);
  if (granularity === "weekly") return formatWeekLabel(s, e);
  return formatMonthLabel(s, e);
}

// ─── Range gap aggregation (D-08) — typed against real WeekData (Critical 3) ───

function aggregateRangeGap(periods: Array<{ current: WeekData }>): {
  totalProducts: number;
  totalMappedProducts: number;
  unmappedProducts: Array<{ name: string; count: number; revenue: number }>;
  missingChannels: Array<{
    source: string;
    displayName: string;
    reason: string;
  }>;
  zeroCostComponents: Array<{ name: string; code: string }>;
} {
  const unmappedMap = new Map<
    string,
    { name: string; count: number; revenue: number }
  >();
  const missingChannelsMap = new Map<
    string,
    { source: string; displayName: string; reason: string }
  >();
  const zeroCostMap = new Map<string, { name: string; code: string }>();
  let totalProducts = 0;
  let totalMappedProducts = 0;

  for (const p of periods) {
    // Walk real WeekData.gapAnalysis fields (Critical 3 — typed via Array<{ current: WeekData }>).
    totalProducts += p.current.gapAnalysis.totalProducts;
    totalMappedProducts += p.current.gapAnalysis.totalMappedProducts;
    for (const u of p.current.gapAnalysis.unmappedProducts) {
      const existing = unmappedMap.get(u.name);
      if (existing) {
        existing.count += u.count;
        existing.revenue += u.revenue;
      } else {
        unmappedMap.set(u.name, {
          name: u.name,
          count: u.count,
          revenue: u.revenue,
        });
      }
    }
    for (const ch of p.current.gapAnalysis.missingChannels) {
      missingChannelsMap.set(ch.source, ch);
    }
    for (const z of p.current.gapAnalysis.zeroCostComponents) {
      zeroCostMap.set(z.code, z);
    }
  }

  return {
    totalProducts,
    totalMappedProducts,
    unmappedProducts: [...unmappedMap.values()],
    missingChannels: [...missingChannelsMap.values()],
    zeroCostComponents: [...zeroCostMap.values()],
  };
}

// ─── Multi-period P&L export (FIN-04 D-05 D-07 D-08) ───

export const getMultiPeriodPLExport = query({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
    granularity: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("custom"),
    ),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]); // D-13

    const buckets = buildPeriodBuckets(
      args.periodStart,
      args.periodEnd,
      args.granularity,
    );
    const periods: Array<{
      bucketStart: number;
      bucketEnd: number;
      label: string;
      current: WeekData;
    }> = [];

    for (const [s, e] of buckets) {
      // D-05 + Pitfall 2: includePrevious=false — in-range delta computed in plan 03 helper
      const result = await fetchAndAggregate(
        ctx,
        s,
        e,
        s,
        s,
        /* includePrevious */ false,
      );
      periods.push({
        bucketStart: s,
        bucketEnd: e,
        label: formatBucketLabel(s, e, args.granularity),
        current: result.currentPeriod,
      });
    }

    // Range-wide gap aggregation (D-08) — union of unmappedProducts, missingChannels, etc.
    const rangeGap = aggregateRangeGap(periods);

    return { periods, rangeGap };
  },
});

// ─── Pre-flight stats (D-12, D-16) ───

export const getExportPreflight = query({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
    granularity: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("custom"),
    ),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const [jeLines, revenueRows] = await Promise.all([
      ctx.db
        .query("journalEntryLines")
        .withIndex("by_entryDate", (q) =>
          q.gte("entryDate", args.periodStart).lt("entryDate", args.periodEnd),
        )
        .collect(),
      ctx.db
        .query("externalRevenue")
        .withIndex("by_period", (q) =>
          q
            .gte("periodStart", args.periodStart)
            .lt("periodStart", args.periodEnd),
        )
        .collect(),
    ]);
    const buckets = buildPeriodBuckets(
      args.periodStart,
      args.periodEnd,
      args.granularity,
    );
    return {
      journalLineCount: jeLines.length,
      revenueRowCount: revenueRows.length,
      periodCount: buckets.length,
      isLargeRange: jeLines.length > 10_000, // D-16 soft warning threshold
    };
  },
});
