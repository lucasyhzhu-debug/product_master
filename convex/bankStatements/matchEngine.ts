/**
 * Two-layer match engine for bank statement lines.
 *
 * - Layer A (classifyLine): pure, ctx-free. Evaluates bankKeywordRules against a
 *   line's rawDescription + direction per D-11/D-17b. Catch-all rules evaluate
 *   LAST regardless of priority. Within each bucket, order by priority DESC
 *   then ruleCode ASC.
 * - Layer B (findLinkedRecord): ctx-dependent. Scans expenses, externalRevenue,
 *   reimbursementBatches, payrollEntries for amount+date+fuzzy matches.
 *   Expenses/revenue/reimbursement use ±3 day window (D-14); payroll uses ±14
 *   day window on periodStart (D-15 Revision 2026-04-13). Fuzzy threshold 0.8.
 *   related_party flag (B02) causes payroll scan to be skipped.
 * - computeConfidence: merges rule-derived confidence, hint elevation, and
 *   linkage strength into the final "exact" | "strong" | "suggested" | "none".
 *
 * First-match-wins tiebreak order in Layer B: expense → revenue → reimbursement
 * → payroll (staffreview 2026-04-13).
 *
 * See 72-CONTEXT.md D-11/D-12/D-13/D-14/D-15/D-17b and 72-RESEARCH.md §4.
 */

import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { similarityScore } from "../lib/fuzzyMatch";

export type BankKeywordRule = Doc<"bankKeywordRules">;

/** Polymorphic link target for bankStatementLines.matchedType (schema D-02).
 *  Phase B (gap#1): "subscriptionWeeklyInvoice" links a credit line to an unpaid
 *  subscription weekly invoice (the customer's Monday transfer reference). */
export type BankMatchedType =
  | "expense"
  | "revenue"
  | "reimbursement"
  | "payroll"
  | "subscriptionWeeklyInvoice";

export interface ClassifyContext {
  rawDescription: string;
  direction: "debit" | "credit";
  amountIdr: number;
  date: number;
}

export interface ClassifyResult {
  rule: BankKeywordRule;
  hintHit: boolean;
}

export type LinkageResult = {
  matchedType: BankMatchedType;
  matchedId: string;
  fuzzyScore: number;
  // Phase B (gap#1): surfaced only for subscriptionWeeklyInvoice matches so the
  // operator sees WHICH week's credit a transfer funds.
  invoiceNumber?: string;
  subscriptionWeekId?: string;
};

/**
 * D-04 1:1 cardinality guard: throw if (matchedType, matchedId) is already
 * linked to a different bank line. Pre-write check shared by manualMatch and
 * all inline-create flows; paired with a post-write re-read in manualMatch to
 * close the TOCTOU window (Convex mutation atomicity rolls back on throw).
 */
export async function assertTargetUnlinked(
  ctx: MutationCtx,
  matchedType: BankMatchedType,
  matchedId: string,
  selfLineId: Id<"bankStatementLines">,
): Promise<void> {
  const existing = await ctx.db
    .query("bankStatementLines")
    .withIndex("by_matched", (q) =>
      q.eq("matchedType", matchedType).eq("matchedId", matchedId),
    )
    .first();
  if (existing && existing._id !== selfLineId) {
    throw new ConvexError(`Target already linked to bank line ${existing._id}`);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FUZZY_MATCH_THRESHOLD = 0.8;
const EXPENSE_DATE_WINDOW_DAYS = 3;
const PAYROLL_DATE_WINDOW_DAYS = 14;
const DAY_MS = 24 * 3600 * 1000;

// ---------------------------------------------------------------------------
// Layer A — classifyLine
// ---------------------------------------------------------------------------

/**
 * Returns true if any pattern is a case-insensitive substring of haystack.
 */
function anySubstring(haystack: string, patterns: string[]): boolean {
  const h = haystack.toLowerCase();
  return patterns.some((p) => h.includes(p.toLowerCase()));
}

/**
 * Returns true if ALL patterns are case-insensitive substrings of haystack.
 */
function allSubstring(haystack: string, patterns: string[]): boolean {
  const h = haystack.toLowerCase();
  return patterns.every((p) => h.includes(p.toLowerCase()));
}

/**
 * Evaluate a single rule against a line. Returns { matched, hintHit }.
 * hintHit only meaningful when descriptionPatternsMode === "hint".
 */
function matches(
  line: ClassifyContext,
  rule: BankKeywordRule,
): { matched: boolean; hintHit: boolean } {
  // 1. Direction check (FIRST predicate — T-72-16 mitigation)
  if (rule.direction !== "any" && rule.direction !== line.direction) {
    return { matched: false, hintHit: false };
  }

  const desc = line.rawDescription;
  const cpPatterns = rule.counterpartyPatterns ?? [];
  const descPatterns = rule.descriptionPatterns ?? [];
  const descMode = rule.descriptionPatternsMode;

  const cpMatched = cpPatterns.length > 0 && anySubstring(desc, cpPatterns);

  let descMatched: boolean;
  let hintHit = false;
  if (descPatterns.length === 0) {
    // No description patterns -> vacuously satisfied.
    descMatched = true;
  } else if (descMode === "all") {
    descMatched = allSubstring(desc, descPatterns);
  } else if (descMode === "any") {
    descMatched = anySubstring(desc, descPatterns);
  } else {
    // "hint" — not required for match; only raises confidence via hintHit.
    descMatched = true;
    hintHit = anySubstring(desc, descPatterns);
  }

  // 2. matchType dispatch
  switch (rule.matchType) {
    case "counterparty":
      return { matched: cpMatched, hintHit };
    case "description_contains":
    case "description_exact":
      return {
        matched:
          descPatterns.length > 0 &&
          (descMode === "hint" ? anySubstring(desc, descPatterns) : descMatched),
        hintHit,
      };
    case "description_regex": {
      // Try each pattern as a regex; silently skip invalid regexes (T-72-12).
      try {
        const hit = descPatterns.some((p) => {
          try {
            return new RegExp(p, "i").test(desc);
          } catch {
            return false;
          }
        });
        return { matched: hit, hintHit: false };
      } catch {
        return { matched: false, hintHit: false };
      }
    }
    case "counterparty_or_keyword": {
      const descHit =
        descPatterns.length > 0 &&
        (descMode === "all" ? allSubstring(desc, descPatterns) : anySubstring(desc, descPatterns));
      return { matched: cpMatched || descHit, hintHit };
    }
    case "counterparty_and_keyword": {
      const descHit =
        descPatterns.length > 0 &&
        (descMode === "all" ? allSubstring(desc, descPatterns) : anySubstring(desc, descPatterns));
      return { matched: cpMatched && descHit, hintHit };
    }
    case "catch_all":
      // catch_all always matches (direction already enforced above).
      // hintHit remains true if any hint keyword happened to be present.
      return { matched: true, hintHit: descMode === "hint" && anySubstring(desc, descPatterns) };
    default:
      return { matched: false, hintHit: false };
  }
}

/**
 * Layer A classifier. Splits rules into non-catch-all and catch-all buckets
 * BEFORE sorting so priority bumps on catch-all rules cannot leapfrog normal
 * rules (T-72-14 mitigation). Within each bucket, priority DESC then ruleCode
 * ASC for determinism.
 */
export function classifyLine(
  line: ClassifyContext,
  rules: BankKeywordRule[],
): ClassifyResult | null {
  const active = rules.filter((r) => r.isActive);

  const nonCatchAll = active.filter((r) => !r.isCatchAll);
  const catchAll = active.filter((r) => r.isCatchAll);

  const sortByPriorityThenCode = (a: BankKeywordRule, b: BankKeywordRule) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.ruleCode.localeCompare(b.ruleCode);
  };

  nonCatchAll.sort(sortByPriorityThenCode);
  catchAll.sort(sortByPriorityThenCode);

  for (const rule of nonCatchAll) {
    const { matched, hintHit } = matches(line, rule);
    if (matched) return { rule, hintHit };
  }
  for (const rule of catchAll) {
    const { matched, hintHit } = matches(line, rule);
    if (matched) return { rule, hintHit };
  }

  return null;
}

// ---------------------------------------------------------------------------
// computeConfidence
// ---------------------------------------------------------------------------

export function computeConfidence(
  rule: BankKeywordRule | null,
  hintHit: boolean,
  linkage: { found: boolean; fuzzyScore?: number } | null,
): "exact" | "strong" | "suggested" | "none" {
  if (!rule) return "none";

  // Linkage elevates confidence. Exact rule + near-perfect fuzzy → "exact".
  if (linkage?.found && linkage.fuzzyScore !== undefined) {
    if (linkage.fuzzyScore >= 0.95 && rule.confidence === "exact") return "exact";
    if (linkage.fuzzyScore >= FUZZY_MATCH_THRESHOLD) return "strong";
  }

  // Rule-intrinsic confidence + hint elevation.
  if (rule.confidence === "exact") return "exact";
  if (rule.confidence === "strong") return hintHit ? "exact" : "strong";
  if (rule.confidence === "suggested") return hintHit ? "strong" : "suggested";

  return "suggested";
}

// ---------------------------------------------------------------------------
// Layer B — findLinkedRecord
// ---------------------------------------------------------------------------

/**
 * Scan expenses/externalRevenue/reimbursementBatches/payrollEntries for a
 * candidate record matching this bank line on amount + date + description
 * fuzzy score (≥ 0.8). First-match-wins in scan order: expense → revenue →
 * reimbursement → payroll.
 *
 * related_party flag (B02) causes payroll scan to be skipped (RESEARCH Open
 * Q #3; D-17b).
 */
export async function findLinkedRecord(
  ctx: QueryCtx,
  line: {
    amountIdr: number;
    direction: "debit" | "credit";
    date: number;
    rawDescription: string;
    flags?: string[];
  },
): Promise<LinkageResult | null> {
  const dateMin = line.date - EXPENSE_DATE_WINDOW_DAYS * DAY_MS;
  const dateMax = line.date + EXPENSE_DATE_WINDOW_DAYS * DAY_MS;
  const payrollMin = line.date - PAYROLL_DATE_WINDOW_DAYS * DAY_MS;
  const payrollMax = line.date + PAYROLL_DATE_WINDOW_DAYS * DAY_MS;

  const skipPayroll = line.flags?.includes("related_party") ?? false;

  // Direction gating per double-entry semantics:
  //   debit line (money out)  → expense / reimbursement / payroll candidates
  //   credit line (money in)  → externalRevenue candidates
  // Without this gate, a credit line can fuzzy-match an expense of the same
  // amount (and vice versa), producing semantically wrong linkages.
  const scanOutflows = line.direction === "debit";
  const scanInflows = line.direction === "credit";

  // 1. Expenses — amount-first index (debit lines only)
  if (scanOutflows) {
    const rows = await ctx.db
      .query("expenses")
      .withIndex("by_amount_date_submitter", (q) =>
        q.eq("amount", line.amountIdr).gte("expenseDate", dateMin).lte("expenseDate", dateMax),
      )
      .collect();
    let bestId: string | null = null;
    let bestScore = 0;
    for (const row of rows) {
      const score = similarityScore(row.description ?? "", line.rawDescription);
      if (score > bestScore) {
        bestScore = score;
        bestId = row._id;
      }
    }
    if (bestId && bestScore >= FUZZY_MATCH_THRESHOLD) {
      return { matchedType: "expense", matchedId: bestId, fuzzyScore: bestScore };
    }
  }

  // 1b. Subscription weekly invoices — credit lines only (gap#1).
  //     The customer puts the weekly invoiceNumber (INV-YYMM-NNN) on the Monday
  //     transfer memo, so try an EXACT reference match first (description contains
  //     the invoiceNumber), then fall back to amount+date fuzzy in the same ±3-day
  //     window. Scanned via by_kind_paymentStatus (NOT a full invoices scan).
  //     Runs BEFORE the externalRevenue scan: subscription orders are excluded
  //     from externalRevenue (C1), so a weekly transfer would otherwise match
  //     nothing and sit unreconciled.
  if (scanInflows) {
    const candidates = await ctx.db
      .query("invoices")
      .withIndex("by_kind_paymentStatus", (q) =>
        q.eq("invoiceKind", "subscription_weekly").eq("paymentStatus", "Unpaid"),
      )
      .collect();

    // 1. Reference match: bank line description contains the invoiceNumber → exact.
    const byRef = candidates.find(
      (inv) => inv.invoiceNumber && line.rawDescription.includes(inv.invoiceNumber),
    );
    if (byRef) {
      return {
        matchedType: "subscriptionWeeklyInvoice",
        matchedId: byRef._id,
        fuzzyScore: 1.0,
        invoiceNumber: byRef.invoiceNumber,
        subscriptionWeekId: byRef.subscriptionWeekId,
      };
    }

    // 2. Amount + date fuzzy fallback over the same candidates (±3-day window).
    //    Match on finalTotal (the invoice total = the expected transfer amount)
    //    and orderDate (= week start) within the expense date window.
    const byAmount = candidates.find(
      (inv) =>
        inv.finalTotal === line.amountIdr &&
        inv.orderDate >= dateMin &&
        inv.orderDate <= dateMax,
    );
    if (byAmount) {
      return {
        matchedType: "subscriptionWeeklyInvoice",
        matchedId: byAmount._id,
        fuzzyScore: FUZZY_MATCH_THRESHOLD,
        invoiceNumber: byAmount.invoiceNumber,
        subscriptionWeekId: byAmount.subscriptionWeekId,
      };
    }
  }

  // 2. externalRevenue — amount-first index on revenueGross+transactionDate (credit lines only)
  if (scanInflows) {
    const rows = await ctx.db
      .query("externalRevenue")
      .withIndex("by_amount_transactionDate", (q) =>
        q
          .eq("revenueGross", line.amountIdr)
          .gte("transactionDate", dateMin)
          .lte("transactionDate", dateMax),
      )
      .collect();
    let bestId: string | null = null;
    let bestScore = 0;
    for (const row of rows) {
      const descSource = row.productName ?? "";
      const score = similarityScore(descSource, line.rawDescription);
      if (score > bestScore) {
        bestScore = score;
        bestId = row._id;
      }
    }
    if (bestId && bestScore >= FUZZY_MATCH_THRESHOLD) {
      return { matchedType: "revenue", matchedId: bestId, fuzzyScore: bestScore };
    }
  }

  // 3. reimbursementBatches — amount-first index on totalAmount+createdAt (debit lines only).
  //    reimbursementBatches has no description column; fuzzy against batchNumber
  //    as a weak proxy. Callers typically reconcile by batch total alone.
  if (scanOutflows) {
    const rows = await ctx.db
      .query("reimbursementBatches")
      .withIndex("by_amount_createdAt", (q) =>
        q.eq("totalAmount", line.amountIdr).gte("createdAt", dateMin).lte("createdAt", dateMax),
      )
      .collect();
    let bestId: string | null = null;
    let bestScore = 0;
    for (const row of rows) {
      const score = similarityScore(row.batchNumber ?? "", line.rawDescription);
      if (score > bestScore) {
        bestScore = score;
        bestId = row._id;
      }
    }
    if (bestId && bestScore >= FUZZY_MATCH_THRESHOLD) {
      return { matchedType: "reimbursement", matchedId: bestId, fuzzyScore: bestScore };
    }
  }

  // 4. payrollEntries — amount-first index on amount+periodStart (debit lines only).
  //    SKIP if related_party flag present.
  if (scanOutflows && !skipPayroll) {
    const rows = await ctx.db
      .query("payrollEntries")
      .withIndex("by_amount_period", (q) =>
        q
          .eq("amount", line.amountIdr)
          .gte("periodStart", payrollMin)
          .lte("periodStart", payrollMax),
      )
      .collect();
    const descLower = line.rawDescription.toLowerCase();
    for (const row of rows) {
      const recipient = row.recipientName?.toLowerCase() ?? "";
      if (recipient.length > 0 && descLower.includes(recipient)) {
        return { matchedType: "payroll", matchedId: row._id, fuzzyScore: 1.0 };
      }
    }
  }

  return null;
}
