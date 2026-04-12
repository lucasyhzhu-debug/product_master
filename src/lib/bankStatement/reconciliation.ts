/**
 * BCA bank statement reconciliation check.
 * Stub — implemented in Task 2 (GREEN).
 */

import type { ParsedLine, ReconciliationDiff } from "./types";
export { ReconciliationError } from "./types";

export interface ReportedTotals {
  debitTotal: number;
  creditTotal: number;
  openingBalance: number;
  closingBalance: number;
}

export function validateReconciliation(
  _lines: ParsedLine[],
  _reported: ReportedTotals,
): { ok: boolean; diff: ReconciliationDiff } {
  throw new Error("NOT IMPLEMENTED");
}
