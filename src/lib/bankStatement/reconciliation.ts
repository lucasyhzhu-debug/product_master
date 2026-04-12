/**
 * BCA bank statement reconciliation check.
 *
 * Contract (D-06b):
 *   - sum(parsed debit amounts) === reported `Mutasi Debet`
 *   - sum(parsed credit amounts) === reported `Mutasi Kredit`
 *   - openingBalance + reportedCreditTotal − reportedDebitTotal === closingBalance
 *
 * EXACT integer comparison — no epsilon tolerance. Symmetric with the
 * server-side `!==` re-validation in Plan 04 (staffreview 2026-04-13).
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
  lines: ParsedLine[],
  reported: ReportedTotals,
): { ok: boolean; diff: ReconciliationDiff } {
  let sumDebits = 0;
  let sumCredits = 0;
  for (const line of lines) {
    if (line.direction === "debit") {
      sumDebits += line.amountIdr;
    } else {
      sumCredits += line.amountIdr;
    }
  }

  const debitDiff = sumDebits - reported.debitTotal;
  const creditDiff = sumCredits - reported.creditTotal;
  // Balance equation: opening + reportedCredit − reportedDebit should equal closing.
  // We compare against reported totals (not parsed sums) so that a debit/credit
  // diff does not mask a separate closing-balance footer typo.
  const expectedClosing =
    reported.openingBalance + reported.creditTotal - reported.debitTotal;
  const balanceDiff = expectedClosing - reported.closingBalance;

  const ok = debitDiff === 0 && creditDiff === 0 && balanceDiff === 0;
  return { ok, diff: { debitDiff, creditDiff, balanceDiff } };
}
