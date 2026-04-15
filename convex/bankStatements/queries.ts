/**
 * bankStatements queries — manager + admin per Phase 73 D-23 (widened from P72 D-19).
 *
 * Bank data is finance-sensitive (account numbers are PII; line details
 * reveal counterparties + amounts). Every query gates on
 * `requireRole(ctx, token, ["manager", "admin"])`. Rule CRUD (`bankKeywordRules`)
 * stays admin-only; only statement/line reads widen for reconciliation UI access.
 *
 * `listStatements` returns the 50 most-recent uploads (by_createdAt desc) —
 * typical UI usage is a recent-uploads picker; a bigger page would paginate.
 *
 * Phase 73 Plan 02 appends:
 *  - getStatementProgress / getStatementProgressBulk (BANK-04)
 *  - listCandidatesForLine + search* (D-05 / D-06)
 *  - revenueGapByPeriod (D-14, C1 mapped/unmapped split)
 */

import { ConvexError, v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import { requireRole } from "../lib/auth";
import type { Id } from "../_generated/dataModel";
import { similarityScore } from "../lib/fuzzyMatch";
import { mapChannelToSource } from "./channelMapping";
import type { ExternalSource } from "../lib/externalSource";

export const listStatements = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    return await ctx.db
      .query("bankStatements")
      .withIndex("by_createdAt")
      .order("desc")
      .take(50);
  },
});

export const getStatement = query({
  args: {
    token: v.string(),
    id: v.id("bankStatements"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    return await ctx.db.get(args.id);
  },
});

/** Single bank line by id (Phase 73 — used by AssetRegister CapEx round-trip). */
export const getLine = query({
  args: {
    token: v.string(),
    lineId: v.id("bankStatementLines"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    return await ctx.db.get(args.lineId);
  },
});

/**
 * Dedup probe — fire after the client computes the file hash, BEFORE showing
 * the review step. Lets the UI surface "already imported on ..." upfront
 * instead of letting the user scroll through preview and click Confirm only
 * to hit the server-side dedup guard in createFromParsedStatement.
 * Returns a minimal shape (no PII leak): { _id, createdAt } or null.
 */
export const findByFileHash = query({
  args: {
    token: v.string(),
    fileHash: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const existing = await ctx.db
      .query("bankStatements")
      .withIndex("by_fileHash", (q) => q.eq("fileHash", args.fileHash))
      .first();
    if (!existing) return null;
    return { _id: existing._id, createdAt: existing.createdAt };
  },
});

export const listLines = query({
  args: {
    token: v.string(),
    statementId: v.id("bankStatements"),
    statusFilter: v.optional(
      v.union(
        v.literal("unmatched"),
        v.literal("auto_matched"),
        v.literal("suggested"),
        v.literal("confirmed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const cursor = args.statusFilter
      ? ctx.db
          .query("bankStatementLines")
          .withIndex("by_statement_status", (q) =>
            q.eq("statementId", args.statementId).eq("status", args.statusFilter!),
          )
      : ctx.db
          .query("bankStatementLines")
          .withIndex("by_statement", (q) => q.eq("statementId", args.statementId));
    return await cursor.order("asc").collect();
  },
});

// ===========================================================================
// Phase 73 Plan 02 — Progress aggregation (BANK-04)
// ===========================================================================

type ProgressResult = {
  total: number;
  unmatched: number;
  autoMatched: number;
  suggested: number;
  confirmed: number;
  matched: number;
  reconciledPct: number;
};

const STATUS_VALUES = ["unmatched", "auto_matched", "suggested", "confirmed"] as const;

async function computeProgress(
  ctx: QueryCtx,
  statementId: Id<"bankStatements">,
): Promise<ProgressResult> {
  // 4 prefix scans on by_statement_status — Pattern 5 (RESEARCH).
  // Each scan collects only that one status bucket.
  const [unmatched, autoMatched, suggested, confirmed] = await Promise.all(
    STATUS_VALUES.map((status) =>
      ctx.db
        .query("bankStatementLines")
        .withIndex("by_statement_status", (q) =>
          q.eq("statementId", statementId).eq("status", status),
        )
        .collect(),
    ),
  );
  const uCount = unmatched.length;
  const amCount = autoMatched.length;
  const sCount = suggested.length;
  const cCount = confirmed.length;
  const total = uCount + amCount + sCount + cCount;
  const matched = amCount + sCount + cCount;
  const reconciledPct = total === 0 ? 0 : Math.round((cCount / total) * 100);
  return {
    total,
    unmatched: uCount,
    autoMatched: amCount,
    suggested: sCount,
    confirmed: cCount,
    matched,
    reconciledPct,
  };
}

export const getStatementProgress = query({
  args: {
    token: v.string(),
    statementId: v.id("bankStatements"),
  },
  handler: async (ctx, args): Promise<ProgressResult> => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    return await computeProgress(ctx, args.statementId);
  },
});

export const getStatementProgressBulk = query({
  args: {
    token: v.string(),
    statementIds: v.array(v.id("bankStatements")),
  },
  handler: async (ctx, args): Promise<Record<string, ProgressResult>> => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    // RESEARCH Pitfall 7 — cap bulk input.
    if (args.statementIds.length > 50) {
      throw new ConvexError("Bulk progress limited to 50 statements per call");
    }
    // C3 — parallelize per-statement progress scans. Each computeProgress
    // itself runs 4 prefix scans in parallel, but a serial outer loop would
    // force N sequential round-trips for N statements. Promise.all lets the
    // Convex runtime overlap them.
    const entries = await Promise.all(
      args.statementIds.map(
        async (id) => [id, await computeProgress(ctx, id)] as const,
      ),
    );
    const out: Record<string, ProgressResult> = {};
    for (const [id, result] of entries) {
      out[id] = result;
    }
    return out;
  },
});

// ===========================================================================
// Phase 73 Plan 02 — Candidate lookup (D-05)
// ===========================================================================

const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

type CandidateRecord<T> = T & { alreadyLinkedToLineId?: Id<"bankStatementLines"> };

async function annotateAlreadyLinked<T extends { _id: Id<"expenses" | "externalRevenue" | "reimbursementBatches" | "payrollEntries"> }>(
  ctx: QueryCtx,
  rows: T[],
  matchedType: "expense" | "revenue" | "reimbursement" | "payroll",
  excludeLineId?: Id<"bankStatementLines">,
): Promise<CandidateRecord<T>[]> {
  return await Promise.all(
    rows.map(async (r) => {
      const linked = await ctx.db
        .query("bankStatementLines")
        .withIndex("by_matched", (q) =>
          q.eq("matchedType", matchedType).eq("matchedId", r._id as unknown as string),
        )
        .first();
      const out: CandidateRecord<T> = { ...r };
      if (linked && linked._id !== excludeLineId) {
        out.alreadyLinkedToLineId = linked._id;
      }
      return out;
    }),
  );
}

export const listCandidatesForLine = query({
  args: {
    token: v.string(),
    lineId: v.id("bankStatementLines"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Line not found");
    const dateStart = line.date - MATCH_WINDOW_MS;
    const dateEnd = line.date + MATCH_WINDOW_MS;
    const amount = line.amountIdr;

    // Amount-first indexed scans (Phase 72 added by_amount_* indexes on all 4 tables).
    const [expensesRaw, revenueRaw, reimbursementsRaw, payrollRaw] = await Promise.all([
      ctx.db
        .query("expenses")
        .withIndex("by_amount_date_submitter", (q) => q.eq("amount", amount))
        .collect()
        .then((rows) =>
          rows.filter((r) => r.expenseDate >= dateStart && r.expenseDate <= dateEnd),
        ),
      ctx.db
        .query("externalRevenue")
        .withIndex("by_amount_transactionDate", (q) => q.eq("revenueGross", amount))
        .collect()
        .then((rows) =>
          rows.filter((r) => {
            const d = r.transactionDate ?? r.periodStart;
            return d >= dateStart && d <= dateEnd;
          }),
        ),
      ctx.db
        .query("reimbursementBatches")
        .withIndex("by_amount_createdAt", (q) => q.eq("totalAmount", amount))
        .collect()
        .then((rows) =>
          rows.filter((r) => r.createdAt >= dateStart && r.createdAt <= dateEnd),
        ),
      ctx.db
        .query("payrollEntries")
        .withIndex("by_amount_period", (q) => q.eq("amount", amount))
        .collect()
        .then((rows) =>
          rows.filter((r) => r.periodStart >= dateStart && r.periodStart <= dateEnd),
        ),
    ]);

    const [expense, revenue, reimbursement, payroll] = await Promise.all([
      annotateAlreadyLinked(ctx, expensesRaw, "expense", args.lineId),
      annotateAlreadyLinked(ctx, revenueRaw, "revenue", args.lineId),
      annotateAlreadyLinked(ctx, reimbursementsRaw, "reimbursement", args.lineId),
      annotateAlreadyLinked(ctx, payrollRaw, "payroll", args.lineId),
    ]);

    return { expense, revenue, reimbursement, payroll };
  },
});

// ===========================================================================
// Phase 73 Plan 02 — Search escape hatches (D-06)
// ===========================================================================

const SEARCH_LIMIT = 50;

function matchesSearch(haystack: string[], term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return haystack.some((h) => (h ?? "").toLowerCase().includes(t));
}

function rankBySimilarity<T>(rows: T[], term: string | undefined, getField: (r: T) => string): T[] {
  if (!term || !term.trim()) return rows.slice(0, SEARCH_LIMIT);
  const scored = rows.map((r) => ({ r, s: similarityScore(term, getField(r)) }));
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, SEARCH_LIMIT).map((x) => x.r);
}

export const searchExpenses = query({
  args: {
    token: v.string(),
    amountIdr: v.optional(v.number()),
    dateStart: v.optional(v.number()),
    dateEnd: v.optional(v.number()),
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    // Widen to whole-table scan — escape hatch for out-of-window hunts.
    const all = await ctx.db.query("expenses").collect();
    const filtered = all.filter((e) => {
      if (args.amountIdr !== undefined && e.amount !== args.amountIdr) return false;
      if (args.dateStart !== undefined && e.expenseDate < args.dateStart) return false;
      if (args.dateEnd !== undefined && e.expenseDate > args.dateEnd) return false;
      if (args.searchTerm && !matchesSearch([e.description, e.vendorName, e.expenseNumber], args.searchTerm)) {
        return false;
      }
      return true;
    });
    return rankBySimilarity(filtered, args.searchTerm, (e) => `${e.description} ${e.vendorName}`);
  },
});

export const searchRevenue = query({
  args: {
    token: v.string(),
    amountIdr: v.optional(v.number()),
    dateStart: v.optional(v.number()),
    dateEnd: v.optional(v.number()),
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const all = await ctx.db.query("externalRevenue").collect();
    const filtered = all.filter((r) => {
      if (args.amountIdr !== undefined && r.revenueGross !== args.amountIdr) return false;
      const txDate = r.transactionDate ?? r.periodStart;
      if (args.dateStart !== undefined && txDate < args.dateStart) return false;
      if (args.dateEnd !== undefined && txDate > args.dateEnd) return false;
      if (args.searchTerm) {
        const hays = [r.productName ?? "", r.source, r.externalTransactionId ?? ""];
        if (!matchesSearch(hays, args.searchTerm)) return false;
      }
      return true;
    });
    return rankBySimilarity(filtered, args.searchTerm, (r) => `${r.productName ?? ""} ${r.source}`);
  },
});

export const searchReimbursements = query({
  args: {
    token: v.string(),
    amountIdr: v.optional(v.number()),
    dateStart: v.optional(v.number()),
    dateEnd: v.optional(v.number()),
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const all = await ctx.db.query("reimbursementBatches").collect();
    const filtered = all.filter((r) => {
      if (args.amountIdr !== undefined && r.totalAmount !== args.amountIdr) return false;
      if (args.dateStart !== undefined && r.createdAt < args.dateStart) return false;
      if (args.dateEnd !== undefined && r.createdAt > args.dateEnd) return false;
      if (args.searchTerm) {
        const hays = [r.batchNumber, r.bankReference ?? ""];
        if (!matchesSearch(hays, args.searchTerm)) return false;
      }
      return true;
    });
    return rankBySimilarity(filtered, args.searchTerm, (r) => `${r.batchNumber} ${r.bankReference ?? ""}`);
  },
});

export const searchPayroll = query({
  args: {
    token: v.string(),
    amountIdr: v.optional(v.number()),
    dateStart: v.optional(v.number()),
    dateEnd: v.optional(v.number()),
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const all = await ctx.db.query("payrollEntries").collect();
    const filtered = all.filter((r) => {
      if (args.amountIdr !== undefined && r.amount !== args.amountIdr) return false;
      if (args.dateStart !== undefined && r.periodStart < args.dateStart) return false;
      if (args.dateEnd !== undefined && r.periodStart > args.dateEnd) return false;
      if (args.searchTerm) {
        const hays = [r.recipientName, r.description, r.payrollNumber];
        if (!matchesSearch(hays, args.searchTerm)) return false;
      }
      return true;
    });
    return rankBySimilarity(filtered, args.searchTerm, (r) => `${r.recipientName} ${r.description}`);
  },
});

// ===========================================================================
// Phase 73 Plan 02 — Revenue gap (D-14, C1 mapped/unmapped split)
// ===========================================================================

type RevenueGapMappedRow = {
  channel: string;
  source: ExternalSource | null;
  bankCr: number;
  extRev: number | null;
  diff: number;
  diffPct: number | null;
};

type RevenueGapUnmappedRow = {
  channel: string;
  bankCr: number;
  extRev: null;
  diff: number;
  diffPct: null;
  unmapped: true;
};

const UNALLOCATED_LABEL = "(unallocated)";

export const revenueGapByPeriod = query({
  args: {
    token: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ rows: RevenueGapMappedRow[]; unmappedRows: RevenueGapUnmappedRow[] }> => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    // 1) Bank credit lines in window. Use by_date index then filter direction.
    const bankLines = await ctx.db
      .query("bankStatementLines")
      .withIndex("by_date", (q) =>
        q.gte("date", args.periodStart).lte("date", args.periodEnd),
      )
      .collect();
    const credits = bankLines.filter((l) => l.direction === "credit");

    // 2) externalRevenue in window, indexed by periodStart.
    const revenues = await ctx.db
      .query("externalRevenue")
      .withIndex("by_period", (q) =>
        q.gte("periodStart", args.periodStart).lte("periodStart", args.periodEnd),
      )
      .collect();

    // 3) Group bank credits by linkedChannel (null → (unallocated)).
    const bankByChannel = new Map<string, number>();
    for (const l of credits) {
      const key = l.linkedChannel ?? UNALLOCATED_LABEL;
      bankByChannel.set(key, (bankByChannel.get(key) ?? 0) + l.amountIdr);
    }

    // 4) Group externalRevenue by source.
    const extBySource = new Map<ExternalSource, number>();
    for (const r of revenues) {
      const gross = r.revenueGross ?? 0;
      extBySource.set(r.source, (extBySource.get(r.source) ?? 0) + gross);
    }

    const rows: RevenueGapMappedRow[] = [];
    const unmappedRows: RevenueGapUnmappedRow[] = [];

    for (const [channel, bankCr] of bankByChannel.entries()) {
      if (channel === UNALLOCATED_LABEL) {
        rows.push({
          channel,
          source: null,
          bankCr,
          extRev: null,
          diff: bankCr,
          diffPct: null,
        });
        continue;
      }
      const mapped = mapChannelToSource(channel);
      if (!mapped) {
        unmappedRows.push({
          channel,
          bankCr,
          extRev: null,
          diff: bankCr,
          diffPct: null,
          unmapped: true,
        });
        continue;
      }
      const extRev = extBySource.get(mapped) ?? 0;
      const diff = bankCr - extRev;
      const diffPct = extRev > 0 ? (diff / extRev) * 100 : null;
      rows.push({
        channel,
        source: mapped,
        bankCr,
        extRev: extRev === 0 ? null : extRev,
        diff,
        diffPct,
      });
    }

    return { rows, unmappedRows };
  },
});
