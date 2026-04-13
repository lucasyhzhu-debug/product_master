/**
 * Shared type contracts for BCA bank statement parsing + reconciliation.
 * Pure types — no imports from convex or react. Consumed by:
 *   - src/lib/bankStatement/parseBcaXlsx.ts
 *   - src/lib/bankStatement/parseBcaCsv.ts
 *   - src/lib/bankStatement/reconciliation.ts
 *   - Plan 03 match engine (convex/bankStatements/matchEngine.ts)
 *   - Plan 04 import mutation (convex/bankStatements/mutations.ts)
 *   - Plan 05 upload wizard UI
 */

export interface ParsedStatement {
  header: {
    accountNumber: string;
    accountHolder: string;
    reportedPeriodStart: number; // epoch ms (UTC, DD/MM/YYYY parsed as UTC midnight)
    reportedPeriodEnd: number; // epoch ms
    currency: string; // "Rp"
    openingBalance: number; // integer IDR
    closingBalance: number; // integer IDR
    reportedDebitTotal: number; // integer IDR — "Mutasi Debet"
    reportedCreditTotal: number; // integer IDR — "Mutasi Kredit"
  };
  lines: ParsedLine[];
}

export interface ParsedLine {
  rowIndex: number; // 1-indexed from first transaction row below header
  date: number; // epoch ms (UTC midnight for the DD-Mon date)
  rawDescription: string;
  direction: "debit" | "credit";
  amountIdr: number; // positive integer IDR
  runningBalanceIdr: number | null; // null when BCA blanked it on non-last-of-day
  parsedCounterparty: string | null; // heuristic, null when not confident
}

export interface ReconciliationDiff {
  debitDiff: number; // parsed debit sum − reported debit sum
  creditDiff: number; // parsed credit sum − reported credit sum
  balanceDiff: number; // (opening + reportedCredit − reportedDebit) − closing
}

export class ReconciliationError extends Error {
  diff: ReconciliationDiff;
  constructor(message: string, diff: ReconciliationDiff) {
    super(message);
    this.name = "ReconciliationError";
    this.diff = diff;
  }
}
