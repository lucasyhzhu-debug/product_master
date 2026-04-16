/**
 * bankStatements mutations — admin-only statement ingest.
 *
 * The `createFromParsedStatement` mutation is the transactional anchor of Phase
 * 72: it atomically persists the header + all N lines, runs the Layer A
 * classifier and Layer B record-linkage for each line, and applies a 5000-row
 * soft cap (T-72-24).
 *
 * Invariants enforced server-side:
 *  - Primary dedup: fileHash must be unique (by_fileHash index).
 *  - Secondary dedup: (accountNumber, reportedPeriodStart, reportedPeriodEnd)
 *    must be unique — prevents re-import of a renamed/re-exported statement
 *    whose bytes changed but whose period coverage is identical. Error masks
 *    accountNumber (last 4 only) per RESEARCH §Security — PII.
 *  - Server-side reconciliation re-validation (T-72-19): sum of debit lines
 *    MUST equal header.reportedDebitTotal; symmetric for credit. Client is
 *    untrusted — the check also ran client-side in Plan 02 (xlsx not
 *    available in Convex) but is re-done here before any insert.
 *  - D-20: ZERO journal entries posted. `jeDebitAccountId` / `jeCreditAccountId`
 *    on the resulting lines are PROPOSALS only; Phase 73 posts the actual JEs
 *    on user confirmation. This file MUST NOT import the journal-entry creator.
 *
 * Auth: `requireRole(ctx, token, ["admin"])` — D-19 (bank data is finance-sensitive).
 *
 * WIB month derivation: `line.month` is "YYYY-MM" in WIB timezone. Using UTC
 * components would misbucket transactions near midnight WIB (e.g., a 2025-12-31
 * 17:30 UTC tx is 2026-01-01 00:30 WIB → month "2026-01"). See
 * convex/lib/periodRange.ts `getWibComponents`.
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireRole } from "../lib/auth";
import { getWibComponents } from "../lib/periodRange";
import { externalSource } from "../schema";
import {
  buildCreditLine,
  buildDebitLine,
  buildReversedLines,
  createJournalEntryWithLines,
} from "../lib/journalEngine";
import {
  assertTargetUnlinked,
  classifyLine,
  computeConfidence,
  findLinkedRecord,
} from "./matchEngine";
import { getNextNumber } from "../lib/counter";

const MAX_LINES = 5000;

export const createFromParsedStatement = mutation({
  args: {
    token: v.string(),
    header: v.object({
      fileHash: v.string(),
      fileName: v.string(),
      accountNumber: v.string(),
      accountHolder: v.string(),
      reportedPeriodStart: v.number(),
      reportedPeriodEnd: v.number(),
      currency: v.string(),
      openingBalance: v.number(),
      closingBalance: v.number(),
      reportedDebitTotal: v.number(),
      reportedCreditTotal: v.number(),
    }),
    lines: v.array(
      v.object({
        rowIndex: v.number(),
        date: v.number(),
        rawDescription: v.string(),
        direction: v.union(v.literal("debit"), v.literal("credit")),
        amountIdr: v.number(),
        runningBalanceIdr: v.optional(v.number()),
        parsedCounterparty: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);

    // 1) Size guardrail (T-72-24 DoS mitigation)
    if (args.lines.length > MAX_LINES) {
      throw new ConvexError(
        `Too many transaction rows (${args.lines.length}) — capped at ${MAX_LINES}.`,
      );
    }

    // 2) Primary dedup: file hash
    const dupHash = await ctx.db
      .query("bankStatements")
      .withIndex("by_fileHash", (q) => q.eq("fileHash", args.header.fileHash))
      .first();
    if (dupHash) {
      throw new ConvexError(
        `Already imported on ${new Date(dupHash.createdAt).toLocaleDateString()}`,
      );
    }

    // 3) Secondary dedup: (accountNumber, periodStart, periodEnd).
    //    Mask accountNumber in the error message (RESEARCH §Security — PII).
    const dupPeriod = await ctx.db
      .query("bankStatements")
      .withIndex("by_account_period", (q) =>
        q
          .eq("accountNumber", args.header.accountNumber)
          .eq("reportedPeriodStart", args.header.reportedPeriodStart)
          .eq("reportedPeriodEnd", args.header.reportedPeriodEnd),
      )
      .first();
    if (dupPeriod) {
      const masked = args.header.accountNumber.replace(/.(?=.{4})/g, "*");
      throw new ConvexError(
        `Period ${masked} / ${args.header.reportedPeriodStart}-${args.header.reportedPeriodEnd} already imported`,
      );
    }

    // 4) Server-side reconciliation re-validation (T-72-19).
    //    Client is untrusted — re-check sum(debit lines) === reportedDebitTotal,
    //    symmetric for credit, BEFORE any insert.
    //    Reject non-integer amounts up front — strict `!==` on floats would
    //    otherwise surface as a confusing "reconciliation failed" error.
    let computedDebit = 0;
    let computedCredit = 0;
    for (const ln of args.lines) {
      if (!Number.isInteger(ln.amountIdr) || ln.amountIdr < 0) {
        throw new ConvexError(
          `Invalid line amount: amountIdr must be a non-negative integer (got ${ln.amountIdr}).`,
        );
      }
      if (ln.direction === "debit") computedDebit += ln.amountIdr;
      else computedCredit += ln.amountIdr;
    }
    if (!Number.isInteger(args.header.reportedDebitTotal) || !Number.isInteger(args.header.reportedCreditTotal)) {
      throw new ConvexError(
        "Invalid header: reportedDebitTotal and reportedCreditTotal must be integers (IDR cents are not used).",
      );
    }
    if (computedDebit !== args.header.reportedDebitTotal) {
      throw new ConvexError(
        `Reconciliation failed: sum of debit lines (${computedDebit}) ≠ reportedDebitTotal (${args.header.reportedDebitTotal}). Re-upload the original file.`,
      );
    }
    if (computedCredit !== args.header.reportedCreditTotal) {
      throw new ConvexError(
        `Reconciliation failed: sum of credit lines (${computedCredit}) ≠ reportedCreditTotal (${args.header.reportedCreditTotal}). Re-upload the original file.`,
      );
    }

    // 5) Load active rules once. The match engine further filters + sorts them.
    const allRules = await ctx.db
      .query("bankKeywordRules")
      .withIndex("by_active_priority", (q) => q.eq("isActive", true))
      .collect();

    // 6) Insert header (IMMUTABLE afterwards per D-01).
    const statementId = await ctx.db.insert("bankStatements", {
      fileHash: args.header.fileHash,
      fileName: args.header.fileName,
      accountNumber: args.header.accountNumber,
      accountHolder: args.header.accountHolder,
      reportedPeriodStart: args.header.reportedPeriodStart,
      reportedPeriodEnd: args.header.reportedPeriodEnd,
      currency: args.header.currency,
      openingBalance: args.header.openingBalance,
      closingBalance: args.header.closingBalance,
      reportedDebitTotal: args.header.reportedDebitTotal,
      reportedCreditTotal: args.header.reportedCreditTotal,
      lineCount: args.lines.length,
      matchedCount: 0, // patched at end
      uploadedBy: user._id,
      createdAt: Date.now(),
    });

    // 7) For each line, run classifier + linkage and insert with full metadata.
    //    D-20: NO journal entries posted — jeDebit/jeCreditAccountId are proposals only.
    let matchedCount = 0;
    for (const line of args.lines) {
      const classify = classifyLine(
        {
          rawDescription: line.rawDescription,
          direction: line.direction,
          amountIdr: line.amountIdr,
          date: line.date,
        },
        allRules,
      );
      const lineFlags = classify?.rule.flags ?? [];

      const linkage = await findLinkedRecord(ctx, {
        amountIdr: line.amountIdr,
        direction: line.direction,
        date: line.date,
        rawDescription: line.rawDescription,
        flags: lineFlags,
      });

      const confidence = computeConfidence(
        classify?.rule ?? null,
        classify?.hintHit ?? false,
        linkage ? { found: true, fuzzyScore: linkage.fuzzyScore } : null,
      );

      const hasMatch = !!classify || !!linkage;
      if (hasMatch) matchedCount++;

      // WIB month derivation — using UTC would misbucket boundary transactions.
      const { year, month } = getWibComponents(line.date);
      const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

      const matchMethod: "keyword" | "linked_to_record" | "unmatched" = classify
        ? "keyword"
        : linkage
        ? "linked_to_record"
        : "unmatched";

      await ctx.db.insert("bankStatementLines", {
        statementId,
        rowIndex: line.rowIndex,
        date: line.date,
        month: monthStr,
        rawDescription: line.rawDescription,
        direction: line.direction,
        amountIdr: line.amountIdr,
        runningBalanceIdr: line.runningBalanceIdr,
        parsedCounterparty: line.parsedCounterparty,
        originalCategory: classify?.rule.plSection,
        matchMethod,
        updatedCategoryAccountId: classify?.rule.categoryAccountId,
        subCategory: classify?.rule.subCategoryTemplate,
        plSection: classify?.rule.plSection,
        matchedRuleId: classify?.rule._id,
        jeDebitAccountId: classify?.rule.jeDebitAccountId,
        jeCreditAccountId: classify?.rule.jeCreditAccountId,
        matchedType: linkage?.matchedType,
        matchedId: linkage?.matchedId,
        linkedChannel: classify?.rule.linkedChannel,
        confidence,
        status: hasMatch ? "auto_matched" : "unmatched",
        isAutoMatched: hasMatch,
        flags: lineFlags.length > 0 ? lineFlags : undefined,
      });
    }

    // 8) Patch header counter (matchedCount is NOT a reconciliation field).
    await ctx.db.patch(statementId, { matchedCount });

    return {
      statementId,
      lineCount: args.lines.length,
      matchedCount,
    };
  },
});

// ===========================================================================
// Phase 73 Plan 01 — reconciliation write mutations
// Permission: manager + admin (D-23). Rule CRUD stays admin-only.
// All JE writes route through createJournalEntryWithLines (JE-06).
// D-24 anti-pattern: do NOT mutate bankStatements.matchedCount here; that
// field is the import-time snapshot.
// ===========================================================================

/**
 * Manually link a bank line to an existing expense / revenue / reimbursement /
 * payroll record. D-04: 1:1 cardinality — each target accepts at most one line.
 *
 * Guards:
 *  - Line must exist and not be confirmed (unmatch first).
 *  - Target record must exist (`ctx.db.get`).
 *  - Pre-write cross-link guard: `by_matched` index returns 0 hits for this target.
 *  - Post-write TOCTOU consistency: re-query `by_matched` after patch; if
 *    >1 row is linked, throw `Concurrent match detected; retry`. Convex mutation
 *    atomicity rolls back the patch on throw.
 */
export const manualMatch = mutation({
  args: {
    token: v.string(),
    lineId: v.id("bankStatementLines"),
    matchedType: v.union(
      v.literal("expense"),
      v.literal("revenue"),
      v.literal("reimbursement"),
      v.literal("payroll"),
    ),
    matchedId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Line not found");
    if (line.status === "confirmed") {
      throw new ConvexError("Line already confirmed — unmatch first");
    }

    // Verify target exists AND that its id belongs to the claimed table
    // (WR-02). `ctx.db.get` with a casted id returns the doc regardless of
    // which table the id originated from (polymorphic FK per D-02), so
    // without this check a caller could pass matchedType="expense" with
    // a reimbursementBatches id and the mutation would silently mislabel
    // the link. `db.normalizeId(tableName, raw)` returns `null` when the
    // id does not belong to `tableName`, which is the correct gate here.
    const tableForType = {
      expense: "expenses",
      revenue: "externalRevenue",
      reimbursement: "reimbursementBatches",
      payroll: "payrollEntries",
    } as const;
    const tableName = tableForType[args.matchedType];
    const normalizedId = ctx.db.normalizeId(tableName, args.matchedId);
    if (!normalizedId) {
      throw new ConvexError(
        `matchedId does not belong to ${tableName} (matchedType=${args.matchedType})`,
      );
    }
    const target = await ctx.db.get(normalizedId);
    if (!target) {
      throw new ConvexError(`Target ${args.matchedType} record not found`);
    }

    // Pre-write cross-link guard: D-04 1:1 cardinality.
    await assertTargetUnlinked(ctx, args.matchedType, args.matchedId, args.lineId);

    await ctx.db.patch(args.lineId, {
      matchedType: args.matchedType,
      matchedId: args.matchedId,
      matchMethod: "linked_to_record",
      status: "suggested",
      isAutoMatched: false,
    });

    // Post-write consistency check (TOCTOU defense): two concurrent calls can
    // both pass the pre-check above; re-query after patch to catch a duplicate
    // and throw. Convex mutation atomicity rolls back the patch.
    const afterWrite = await ctx.db
      .query("bankStatementLines")
      .withIndex("by_matched", (q) =>
        q.eq("matchedType", args.matchedType).eq("matchedId", args.matchedId),
      )
      .collect();
    if (afterWrite.length > 1) {
      throw new ConvexError("Concurrent match detected; retry");
    }
    return null;
  },
});

/**
 * Clear a bank line's link. If the line was already `confirmed`, post a
 * reversal JE using `createJournalEntryWithLines` directly with
 * `sourceType: "bank_statement_reversal"` — bypasses the standard void-pairing
 * path because `"bank_statement"` sits in `NON_REVERSIBLE_TYPES` (RESEARCH Pitfall 1).
 *
 * Reversal JE uses original.date (JE-03 — preserves accounting period).
 */
export const unmatch = mutation({
  args: {
    token: v.string(),
    lineId: v.id("bankStatementLines"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Line not found");
    if (line.reversalJournalEntryId) {
      throw new ConvexError("Line already reversed");
    }

    const wasConfirmed = line.status === "confirmed";

    // Recompute status: if a keyword classification still applies
    // (originalCategory carried the rule category), status → 'suggested';
    // otherwise → 'unmatched'.
    const newStatus: "unmatched" | "suggested" = line.originalCategory
      ? "suggested"
      : "unmatched";

    // Clear link fields. Preserve originalCategory / plSection / etc. for
    // rule-driven re-classification on the recomputed status. If Layer A
    // (keyword rule) classified the line, preserve matchMethod="keyword" so
    // its provenance survives the unmatch; only clear "linked_to_record".
    const preservedMatchMethod =
      line.matchMethod === "keyword" ? "keyword" : undefined;
    await ctx.db.patch(args.lineId, {
      matchedType: undefined,
      matchedId: undefined,
      matchMethod: preservedMatchMethod,
      status: newStatus,
      isAutoMatched: false,
    });

    if (!wasConfirmed) {
      return { reversed: false };
    }

    // Post reversal JE for a previously-confirmed line.
    const originalJeId = line.confirmedJournalEntryId;
    if (!originalJeId) {
      // Defensive: status=confirmed should always have confirmedJournalEntryId.
      throw new ConvexError(
        "Line marked confirmed but no confirmedJournalEntryId recorded",
      );
    }
    const originalJe = await ctx.db.get(originalJeId);
    if (!originalJe) {
      throw new ConvexError("Original journal entry not found");
    }
    if (originalJe.isReversed) {
      throw new ConvexError("Original journal entry already reversed");
    }
    const originalLines = await ctx.db
      .query("journalEntryLines")
      .withIndex("by_journal_entry", (q) =>
        q.eq("journalEntryId", originalJeId),
      )
      .collect();
    if (originalLines.length === 0) {
      throw new ConvexError(
        "Original journal entry has no lines (data integrity error)",
      );
    }

    const reversedLines = buildReversedLines(
      originalLines.map((l) => ({
        accountId: l.accountId,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
        description: l.description,
      })),
    );

    // Direct call — sourceType "bank_statement_reversal" bypasses the
    // NON_REVERSIBLE_TYPES guard on "bank_statement". Date = original.date
    // (JE-03: preserve business period).
    const reversalId = await createJournalEntryWithLines(ctx, {
      date: originalJe.date,
      description: `Reversal of ${originalJe.entryNumber}: ${originalJe.description}`,
      sourceType: "bank_statement_reversal",
      sourceId: args.lineId,
      createdBy: user._id,
      lines: reversedLines,
    });

    // Mark the line's reversal audit fields
    const now = Date.now();
    await ctx.db.patch(args.lineId, {
      reversedAt: now,
      reversedBy: user._id,
      reversalJournalEntryId: reversalId,
    });

    // Mark the original JE as reversed
    await ctx.db.patch(originalJeId, {
      isReversed: true,
      reversedByEntryId: reversalId,
    });

    return { reversed: true, reversalJournalEntryId: reversalId };
  },
});

/**
 * Confirm a single matched line — posts a 2-line JE via createJournalEntryWithLines
 * with sourceType="bank_statement" and sourceId=line._id. Transitions the line to
 * status="confirmed" with the audit fields populated.
 */
export const confirmLine = mutation({
  args: {
    token: v.string(),
    lineId: v.id("bankStatementLines"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Line not found");
    if (line.status === "confirmed") {
      throw new ConvexError("Already confirmed");
    }
    if (!line.jeDebitAccountId || !line.jeCreditAccountId) {
      throw new ConvexError("Line has no JE accounts — classify first");
    }

    const jeId = await createJournalEntryWithLines(ctx, {
      date: line.date,
      description: `Bank ${line.direction} — ${line.rawDescription.slice(0, 80)}`,
      sourceType: "bank_statement",
      sourceId: line._id,
      createdBy: user._id,
      lines: [
        buildDebitLine(line.jeDebitAccountId, line.amountIdr),
        buildCreditLine(line.jeCreditAccountId, line.amountIdr),
      ],
    });

    const now = Date.now();
    await ctx.db.patch(args.lineId, {
      status: "confirmed",
      confirmedAt: now,
      confirmedBy: user._id,
      confirmedJournalEntryId: jeId,
    });

    return { journalEntryId: jeId };
  },
});

/**
 * Batch-confirm all exact-tier candidates on a statement. Scans by
 * `by_statement_status` for status IN ('auto_matched','suggested'), filters to
 * `confidence === "exact"` AND both je accounts present, posts a JE for each.
 *
 * Convex mutation atomicity: any throw mid-flight rolls back the entire batch,
 * so no partial-state risk.
 *
 * Returns `{ posted, skipped, totalAmountIdr }` where `skipped` counts
 * exact-tier candidates missing jeDebitAccountId/jeCreditAccountId (UI should
 * surface a "classify first" nudge for those lines).
 */
export const batchConfirmExactTier = mutation({
  args: {
    token: v.string(),
    statementId: v.id("bankStatements"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    const candidates = await ctx.db
      .query("bankStatementLines")
      .withIndex("by_statement_status", (q) => q.eq("statementId", args.statementId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "auto_matched"),
          q.eq(q.field("status"), "suggested"),
        ),
      )
      .collect();

    const exactCandidates = candidates.filter((l) => l.confidence === "exact");
    const postable = exactCandidates.filter(
      (l) => l.jeDebitAccountId && l.jeCreditAccountId,
    );
    const skipped = exactCandidates.length - postable.length;

    // Capture once so every line in this batch gets the same confirmedAt
    // timestamp — keeps the batch auditably atomic.
    const now = Date.now();
    let totalAmountIdr = 0;
    for (const line of postable) {
      const jeId = await createJournalEntryWithLines(ctx, {
        date: line.date,
        description: `Bank ${line.direction} — ${line.rawDescription.slice(0, 80)}`,
        sourceType: "bank_statement",
        sourceId: line._id,
        createdBy: user._id,
        lines: [
          buildDebitLine(line.jeDebitAccountId!, line.amountIdr),
          buildCreditLine(line.jeCreditAccountId!, line.amountIdr),
        ],
      });
      await ctx.db.patch(line._id, {
        status: "confirmed",
        confirmedAt: now,
        confirmedBy: user._id,
        confirmedJournalEntryId: jeId,
      });
      totalAmountIdr += line.amountIdr;
    }

    return { posted: postable.length, skipped, totalAmountIdr };
  },
});

// ===========================================================================
// Phase 73 Plan 02 — Inline record-creation wrappers + markAssetLinked
// Permission: manager + admin (D-23). Standard submission paths only —
// D-17 invariant: inline-created expenses MUST have status="submitted",
// never "approved". Expense still needs manager/admin approval via the
// existing ExpenseApproval queue.
// ===========================================================================

/**
 * Inline-create expense from an unmatched bank line (D-17).
 *
 * CRITICAL: status is hard-coded to "submitted", NEVER "approved". The reviewer
 * matching the bank statement is often not the person who incurred the expense,
 * so the expense must still route through the standard approval queue — even
 * though the money has already left the bank.
 *
 * On save: patches the bank line with matchedType="expense", matchedId=new,
 * matchMethod="linked_to_record", status="suggested" (NOT confirmed — waits
 * for approval AND explicit Confirm per D-17), createdExpenseId=new.
 */
export const inlineCreateExpense = mutation({
  args: {
    token: v.string(),
    bankLineId: v.id("bankStatementLines"),
    submittedBy: v.id("users"),
    receiptStorageId: v.id("_storage"),
    accountId: v.id("accounts"),
    expenseDate: v.number(),
    amountIdr: v.number(),
    vendorName: v.string(),
    description: v.string(),
    paymentMethod: v.union(
      v.literal("employee_paid"),
      v.literal("company_paid"),
      v.literal("payment_request"),
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    const line = await ctx.db.get(args.bankLineId);
    if (!line) throw new ConvexError("Bank line not found");
    if (line.status === "confirmed") {
      throw new ConvexError("Line already confirmed — unmatch first");
    }

    const expenseNumber = await getNextNumber(ctx, "EXP");
    const now = Date.now();

    const expenseId = await ctx.db.insert("expenses", {
      expenseNumber,
      submittedBy: args.submittedBy,
      amount: args.amountIdr,
      accountId: args.accountId,
      expenseDate: args.expenseDate,
      description: args.description,
      vendorName: args.vendorName,
      paymentMethod: args.paymentMethod,
      receiptFileId: args.receiptStorageId,
      // D-17 INVARIANT: status MUST be "submitted" — NEVER "approved".
      status: "submitted",
      lateSubmission: false,
      submittedAt: now,
      createdAt: now,
    });

    // D-04 1:1 cardinality pre-write guard (mirrors manualMatch) — defensive
    // against a concurrent match racing on the freshly-inserted id.
    await assertTargetUnlinked(ctx, "expense", expenseId, args.bankLineId);

    await ctx.db.patch(args.bankLineId, {
      matchedType: "expense",
      matchedId: expenseId,
      matchMethod: "linked_to_record",
      status: "suggested",
      isAutoMatched: false,
      createdExpenseId: expenseId,
    });

    return { expenseId, lineId: args.bankLineId };
  },
});

/**
 * Inline-create externalRevenue from an unmatched credit bank line (D-18).
 *
 * `source` uses the strict externalSource 8-literal union (never v.string());
 * a free-form string would fail the Convex validator at runtime since
 * externalRevenue.source is strictly typed in schema.
 *
 * Client pre-selects via mapChannelToSource(line.linkedChannel) when possible;
 * if null, user picks from the 8 literals in the dialog.
 */
export const inlineCreateRevenue = mutation({
  args: {
    token: v.string(),
    bankLineId: v.id("bankStatementLines"),
    transactionDate: v.number(),
    revenueGross: v.number(),
    source: externalSource, // strict 8-literal union (not v.string())
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    const line = await ctx.db.get(args.bankLineId);
    if (!line) throw new ConvexError("Bank line not found");
    if (line.status === "confirmed") {
      throw new ConvexError("Line already confirmed — unmatch first");
    }

    const revenueId = await ctx.db.insert("externalRevenue", {
      source: args.source,
      transactionDate: args.transactionDate,
      revenueGross: args.revenueGross,
      periodStart: args.periodStart ?? args.transactionDate,
      periodEnd: args.periodEnd ?? args.transactionDate,
      dataOrigin: "manual_entry",
      confidence: "manual",
    });

    // D-04 1:1 cardinality pre-write guard (mirrors manualMatch).
    await assertTargetUnlinked(ctx, "revenue", revenueId, args.bankLineId);

    await ctx.db.patch(args.bankLineId, {
      matchedType: "revenue",
      matchedId: revenueId,
      matchMethod: "linked_to_record",
      status: "suggested",
      isAutoMatched: false,
      createdRevenueId: revenueId,
    });

    return { revenueId, lineId: args.bankLineId };
  },
});

/**
 * Inline-create reimbursement batch from an unmatched debit bank line (D-19).
 *
 * Creates a pending batch tied to a single employee with the supplied
 * expenseIds (must be awaiting_payment, belong to employee, not already
 * in another pending batch). Patches bank line with createdReimbursementId.
 */
export const inlineCreateReimbursement = mutation({
  args: {
    token: v.string(),
    bankLineId: v.id("bankStatementLines"),
    employeeUserId: v.id("users"),
    expenseIds: v.array(v.id("expenses")),
  },
  handler: async (ctx, args) => {
    // WR-03: single requireRole call — capture user here so the insert below
    // doesn't re-run session lookup + role check. Also prevents a subtle
    // drift bug if the role list is ever widened on only one of the calls.
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    const line = await ctx.db.get(args.bankLineId);
    if (!line) throw new ConvexError("Bank line not found");
    if (line.status === "confirmed") {
      throw new ConvexError("Line already confirmed — unmatch first");
    }

    if (args.expenseIds.length === 0) {
      throw new ConvexError("At least one expense is required");
    }

    const uniqueExpenseIds = [...new Set(args.expenseIds)];
    const employee = await ctx.db.get(args.employeeUserId);
    if (!employee) throw new ConvexError("Employee not found");

    let totalAmount = 0;
    for (const expenseId of uniqueExpenseIds) {
      const expense = await ctx.db.get(expenseId);
      if (!expense) throw new ConvexError("Expense not found");
      if (expense.status !== "awaiting_payment") {
        throw new ConvexError(
          `Expense ${expense.expenseNumber} is not awaiting payment`,
        );
      }
      if (expense.submittedBy !== args.employeeUserId) {
        throw new ConvexError(
          `Expense ${expense.expenseNumber} does not belong to this employee`,
        );
      }
      totalAmount += expense.amount;
    }

    const batchNumber = await getNextNumber(ctx, "RMB");

    const batchId = await ctx.db.insert("reimbursementBatches", {
      batchNumber,
      employeeUserId: args.employeeUserId,
      totalAmount,
      status: "pending",
      createdBy: user._id,
      createdAt: Date.now(),
    });
    for (const expenseId of uniqueExpenseIds) {
      await ctx.db.insert("reimbursementBatchItems", { batchId, expenseId });
    }

    // D-04 1:1 cardinality pre-write guard (mirrors manualMatch).
    await assertTargetUnlinked(ctx, "reimbursement", batchId, args.bankLineId);

    await ctx.db.patch(args.bankLineId, {
      matchedType: "reimbursement",
      matchedId: batchId,
      matchMethod: "linked_to_record",
      status: "suggested",
      isAutoMatched: false,
      createdReimbursementId: batchId,
    });

    return { batchId, batchNumber, totalAmount, lineId: args.bankLineId };
  },
});

/**
 * Mark a bank line as linked to an expense created via the Asset Register
 * CapEx flow (D-21, I1 idempotency).
 *
 * I1 guards:
 *  (a) `line.createdExpenseId === args.expenseId` → no-op (handles retries).
 *  (b) `line.createdExpenseId !== undefined && !== args.expenseId` → throws
 *      `Line already linked to different expense` (prevents cross-linking).
 *  (c) Otherwise patches line with matchedType="expense", matchedId=expenseId,
 *      matchMethod="linked_to_record", status="suggested",
 *      createdExpenseId=expenseId.
 */
export const markAssetLinked = mutation({
  args: {
    token: v.string(),
    bankLineId: v.id("bankStatementLines"),
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const line = await ctx.db.get(args.bankLineId);
    if (!line) throw new ConvexError("Bank line not found");

    // I1 idempotency/conflict checks.
    if (line.createdExpenseId === args.expenseId) {
      return null; // No-op — already linked to this exact expense.
    }
    if (line.createdExpenseId && line.createdExpenseId !== args.expenseId) {
      throw new ConvexError("Line already linked to different expense");
    }

    await ctx.db.patch(args.bankLineId, {
      matchedType: "expense",
      matchedId: args.expenseId,
      matchMethod: "linked_to_record",
      status: "suggested",
      isAutoMatched: false,
      createdExpenseId: args.expenseId,
    });

    // WR-04: post-write consistency check (TOCTOU defense). Two concurrent
    // markAssetLinked calls with different expenseIds can both observe
    // createdExpenseId === undefined before patch and both fall through
    // to the patch branch. Re-read after patch and throw on mismatch;
    // Convex mutation atomicity rolls back the losing writer's patch.
    const after = await ctx.db.get(args.bankLineId);
    if (after?.createdExpenseId !== args.expenseId) {
      throw new ConvexError("Concurrent asset-link detected; retry");
    }
    return null;
  },
});
