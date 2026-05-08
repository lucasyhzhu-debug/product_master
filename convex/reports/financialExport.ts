/**
 * Phase 76 — Financial Data Export Backend Queries
 *
 * Convex queries powering the multi-period financial export page.
 * Task 2.1 (this commit): getRawTransactionsExport — flat GL line export (FIN-03).
 * Task 2.2 (next commit): getMultiPeriodPLExport, getExportPreflight, label helpers.
 *
 * Trust boundary: every handler starts with requireRole(ctx, args.token, ["manager", "admin"]).
 * No N+1 — all ctx.db.get calls are wrapped in Promise.all over Set-deduped IDs.
 *
 * Schema name fidelity (per RESEARCH §"Schema name corrections"):
 *   - journalEntries.date / sourceType / sourceId / reversedByEntryId
 *   - journalEntryLines.journalEntryId / debitAmount / creditAmount / entryDate
 *   - accounts (NOT glAccounts)
 *
 * Reversal/_void JEs are INCLUDED in raw output (D-04) — sourceType emits verbatim
 * with `_void` / `_reversal` suffix already encoded in the schema literal.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireRole } from "../lib/auth";
// WeekData imported here — consumed by Task 2.2's aggregateRangeGap typing (Critical 3).
import type { WeekData } from "./incomeStatement";

// Reference WeekData so the import isn't tree-shaken before Task 2.2 lands.
// Task 2.2 will type aggregateRangeGap against `Array<{ current: WeekData }>`.
export type _WeekDataReExport = WeekData;

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
