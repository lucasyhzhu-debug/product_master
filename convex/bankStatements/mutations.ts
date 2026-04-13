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
import {
  classifyLine,
  computeConfidence,
  findLinkedRecord,
} from "./matchEngine";

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
