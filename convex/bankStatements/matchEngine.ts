/**
 * Two-layer match engine for bank statement lines.
 *
 * - Layer A (classifyLine): pure, ctx-free. Evaluates bankKeywordRules against a
 *   line's rawDescription + direction per D-11/D-17b. Catch-all rules evaluate
 *   LAST regardless of priority.
 * - Layer B (findLinkedRecord): ctx-dependent. Scans expenses, externalRevenue,
 *   reimbursementBatches, payrollEntries for amount+date+fuzzy matches.
 * - computeConfidence: merges rule-derived confidence, hint elevation, and
 *   linkage strength into the final "exact" | "strong" | "suggested" | "none".
 *
 * See 72-CONTEXT.md D-11/D-12/D-13/D-14/D-15/D-17b and 72-RESEARCH.md §4.
 */

import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export type BankKeywordRule = Doc<"bankKeywordRules">;

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
  matchedType: "expense" | "revenue" | "reimbursement" | "payroll";
  matchedId: string;
  fuzzyScore: number;
};

export function classifyLine(
  _line: ClassifyContext,
  _rules: BankKeywordRule[],
): ClassifyResult | null {
  throw new Error("NOT IMPLEMENTED");
}

export function computeConfidence(
  _rule: BankKeywordRule | null,
  _hintHit: boolean,
  _linkage: { found: boolean; fuzzyScore?: number } | null,
): "exact" | "strong" | "suggested" | "none" {
  throw new Error("NOT IMPLEMENTED");
}

export async function findLinkedRecord(
  _ctx: QueryCtx,
  _line: {
    amountIdr: number;
    direction: "debit" | "credit";
    date: number;
    rawDescription: string;
    flags?: string[];
  },
): Promise<LinkageResult | null> {
  throw new Error("NOT IMPLEMENTED");
}
