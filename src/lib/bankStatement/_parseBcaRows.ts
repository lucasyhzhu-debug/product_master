/**
 * Shared parser helpers for BCA bank statement row matrices.
 *
 * Both `parseBcaXlsx` and `parseBcaCsv` reduce their inputs to the same
 * `string[][]` row matrix (SheetJS `sheet_to_json` with `header:1`, or Papa
 * Parse with `header:false`) and then hand off to this module. Extracted
 * unconditionally per staffreview 2026-04-13 Issue 3 — ≥40 LOC duplication
 * across the two parsers is a foregone conclusion.
 *
 * Module prefixed with `_` to denote internal/private (not exported from a barrel).
 * Security notes:
 *   - All metadata regexes are anchored at `^` with bounded quantifiers — no ReDoS risk.
 *   - Error messages NEVER include `accountNumber` or `accountHolder` (D-T-72-10).
 *   - Row count capped at MAX_ROWS (T-72-06).
 */

import {
  parseIndonesianDate,
  resolveYearForRollover,
  INDONESIAN_MONTHS,
} from "../../../convex/lib/indonesianDate";
import { validateReconciliation } from "./reconciliation";
import { ReconciliationError } from "./types";
import type { ParsedLine, ParsedStatement } from "./types";

/** T-72-06 cap: reject statements with more than this many transaction rows. */
export const MAX_ROWS = 5000;

// -------------------------------------------------------------------------
// Metadata regexes (anchored, bounded — safe from ReDoS)
// -------------------------------------------------------------------------

const RE_ACCOUNT = /^No\. rekening\s*:\s*(\S+)/;
const RE_NAME = /^Nama\s*:\s*(.+)$/;
const RE_PERIOD =
  /^Periode\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/;
const RE_CURRENCY = /^Kode Mata Uang\s*:\s*(\w+)/;
const RE_SALDO_AWAL = /^Saldo Awal\s*:\s*(.+)$/;
const RE_MUTASI_DEBET = /^Mutasi Debet\s*:\s*(.+)$/;
const RE_MUTASI_KREDIT = /^Mutasi Kredit\s*:\s*(.+)$/;
const RE_SALDO_AKHIR = /^Saldo Akhir\s*:\s*(.+)$/;

/**
 * Counterparty heuristic: trailing run of 2..11 capitalized/all-caps words.
 * Bounded quantifier cap 10 (T-72-07 ReDoS mitigation).
 */
const RE_COUNTERPARTY = /([A-Z][A-Z0-9]+(?:\s+[A-Z][A-Z0-9]+){1,10})\s*$/;

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/** Safe string access: returns "" for undefined/null and trims. */
function cell(row: string[] | undefined, col: number): string {
  if (!row) return "";
  const v = row[col];
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Parse a BCA amount string like " Rp1,000,000 " or "76956615.00" into
 * integer IDR. Returns null on blank. Throws on non-numeric.
 */
function parseAmount(raw: string, rowIdxForDiag: number): number | null {
  const s = raw.replace(/\s+/g, "").replace(/Rp/g, "").replace(/,/g, "").trim();
  if (s === "") return null;
  // Parse as float to tolerate ".00" suffix then round.
  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new Error(`Row ${rowIdxForDiag}: cannot parse amount`);
  }
  // BCA exports always use positive amounts with a separate DB/CR direction
  // column. A negative value indicates a non-standard export variant (e.g.,
  // mobile CSV with signed amounts) which would confuse reconciliation math.
  if (n < 0) {
    throw new Error(
      `Row ${rowIdxForDiag}: negative amount not supported — use the standard BCA XLSX e-statement format`,
    );
  }
  return Math.round(n);
}

/** Parse DD/MM/YYYY → UTC epoch ms. */
function parseSlashDate(s: string): number {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`Invalid period date: ${s}`);
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const year = parseInt(m[3], 10);
  return Date.UTC(year, month, day);
}

// -------------------------------------------------------------------------
// Metadata extraction
// -------------------------------------------------------------------------

export interface ParsedMetadata {
  accountNumber: string;
  accountHolder: string;
  reportedPeriodStart: number;
  reportedPeriodEnd: number;
  currency: string;
}

/**
 * Extract header metadata from the first ~6 rows by regexing column A.
 * Per D-06a we DO NOT trust header labels — scan the block for any row
 * matching each regex.
 */
export function extractMetadata(rows: string[][]): ParsedMetadata {
  let accountNumber: string | null = null;
  let accountHolder: string | null = null;
  let periodStart: number | null = null;
  let periodEnd: number | null = null;
  let currency: string | null = null;

  // Scan rows 0..9 inclusive — metadata always in the top block.
  const limit = Math.min(rows.length, 10);
  for (let i = 0; i < limit; i++) {
    const colA = cell(rows[i], 0);
    if (!colA) continue;
    let m: RegExpMatchArray | null;
    if (accountNumber === null && (m = colA.match(RE_ACCOUNT))) {
      accountNumber = m[1];
      continue;
    }
    if (accountHolder === null && (m = colA.match(RE_NAME))) {
      accountHolder = m[1].trim();
      continue;
    }
    if (periodStart === null && (m = colA.match(RE_PERIOD))) {
      periodStart = parseSlashDate(m[1]);
      periodEnd = parseSlashDate(m[2]);
      continue;
    }
    if (currency === null && (m = colA.match(RE_CURRENCY))) {
      currency = m[1];
      continue;
    }
  }

  if (!accountNumber) throw new Error("BCA metadata missing: account number");
  if (!accountHolder) throw new Error("BCA metadata missing: account holder");
  if (periodStart === null || periodEnd === null)
    throw new Error("BCA metadata missing: statement period");
  if (!currency) throw new Error("BCA metadata missing: currency code");

  if (currency !== "Rp") {
    throw new Error(`Unsupported currency: ${currency}. Only IDR (Rp) supported.`);
  }

  return {
    accountNumber,
    accountHolder,
    reportedPeriodStart: periodStart,
    reportedPeriodEnd: periodEnd,
    currency,
  };
}

// -------------------------------------------------------------------------
// Header row location
// -------------------------------------------------------------------------

/**
 * Find the column-header row where col A === "Tanggal Transaksi".
 * Throws if not found.
 */
export function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if (cell(rows[i], 0) === "Tanggal Transaksi") return i;
  }
  throw new Error("BCA header row not found — unexpected file shape");
}

// -------------------------------------------------------------------------
// Transaction row parsing
// -------------------------------------------------------------------------

export interface TransactionParseContext {
  headerRowIndex: number;
  periodStart: number;
  periodEnd: number;
}

/**
 * Parse a single transaction row. `rowIdx` is the 1-based index below the
 * column-header row (used in error diagnostics and ParsedLine.rowIndex).
 */
export function parseTransactionRow(
  row: string[],
  rowIdx: number,
  ctx: TransactionParseContext,
): ParsedLine {
  const dateRaw = cell(row, 0);
  const descRaw = cell(row, 1);
  const amountRaw = cell(row, 2);
  const dirRaw = cell(row, 3);
  const saldoRaw = cell(row, 4);

  // Date: "DD-Mon" in Indonesian
  const dateParts = dateRaw.split("-");
  if (dateParts.length !== 2) {
    throw new Error(`Row ${rowIdx}: cannot parse date`);
  }
  const monStr = dateParts[1].trim();
  const monthIdx = INDONESIAN_MONTHS[monStr];
  if (monthIdx === undefined) {
    throw new Error(`Row ${rowIdx}: unknown Indonesian month token`);
  }
  const year = resolveYearForRollover({
    monthIdx,
    periodStart: ctx.periodStart,
    periodEnd: ctx.periodEnd,
  });
  const date = parseIndonesianDate(dateRaw, year);

  // Amount — integer IDR, reject zero (would create spurious Layer B matches)
  const amt = parseAmount(amountRaw, rowIdx);
  if (amt === null) {
    throw new Error(`Row ${rowIdx}: missing amount`);
  }
  if (amt === 0) {
    throw new Error(`row-${rowIdx}: zero amount not allowed`);
  }

  // Direction — col D: "DB" = debit, empty = credit
  let direction: "debit" | "credit";
  if (dirRaw === "DB") {
    direction = "debit";
  } else if (dirRaw === "") {
    direction = "credit";
  } else {
    throw new Error(`Row ${rowIdx}: unknown direction flag`);
  }

  // Saldo — null when blank
  const saldo = parseAmount(saldoRaw, rowIdx);

  // Counterparty heuristic — null if no confident match
  const cpMatch = descRaw.match(RE_COUNTERPARTY);
  const parsedCounterparty = cpMatch ? cpMatch[1].trim() : null;

  return {
    rowIndex: rowIdx,
    date,
    rawDescription: descRaw,
    direction,
    amountIdr: amt,
    runningBalanceIdr: saldo,
    parsedCounterparty,
  };
}

/**
 * Scan from `startIdx` (inclusive) for all transaction rows. Stops at the
 * first row whose col A AND col B are both empty (terminator) OR at a row
 * whose col A matches a footer label.
 */
export function extractTransactions(
  rows: string[][],
  startIdx: number,
  ctx: { periodStart: number; periodEnd: number },
): { lines: ParsedLine[]; footerStartIdx: number } {
  const lines: ParsedLine[] = [];
  let i = startIdx;
  let txnCount = 0;
  for (; i < rows.length; i++) {
    const colA = cell(rows[i], 0);
    const colB = cell(rows[i], 1);

    // Footer start?
    if (
      colA.match(RE_SALDO_AWAL) ||
      colA.match(RE_MUTASI_DEBET) ||
      colA.match(RE_MUTASI_KREDIT) ||
      colA.match(RE_SALDO_AKHIR)
    ) {
      break;
    }

    // Blank row — terminator if both A and B empty. BCA uses blank spacer
    // rows between transactions and footer; we break on first such row.
    if (!colA && !colB) {
      break;
    }

    txnCount++;
    if (txnCount > MAX_ROWS) {
      throw new Error(
        `Too many transaction rows — bank statements capped at ${MAX_ROWS}`,
      );
    }
    lines.push(
      parseTransactionRow(rows[i], txnCount, {
        headerRowIndex: startIdx - 1,
        periodStart: ctx.periodStart,
        periodEnd: ctx.periodEnd,
      }),
    );
  }
  return { lines, footerStartIdx: i };
}

// -------------------------------------------------------------------------
// Footer extraction
// -------------------------------------------------------------------------

export interface ParsedFooter {
  openingBalance: number;
  reportedDebitTotal: number;
  reportedCreditTotal: number;
  closingBalance: number;
}

export function extractFooter(
  rows: string[][],
  startIdx: number,
): ParsedFooter {
  let openingBalance: number | null = null;
  let totalDebit: number | null = null;
  let totalCredit: number | null = null;
  let closingBalance: number | null = null;

  for (let i = startIdx; i < rows.length; i++) {
    const colA = cell(rows[i], 0);
    if (!colA) continue;
    let m: RegExpMatchArray | null;
    if (openingBalance === null && (m = colA.match(RE_SALDO_AWAL))) {
      openingBalance = parseAmount(m[1], i) ?? 0;
      continue;
    }
    if (totalDebit === null && (m = colA.match(RE_MUTASI_DEBET))) {
      totalDebit = parseAmount(m[1], i) ?? 0;
      continue;
    }
    if (totalCredit === null && (m = colA.match(RE_MUTASI_KREDIT))) {
      totalCredit = parseAmount(m[1], i) ?? 0;
      continue;
    }
    if (closingBalance === null && (m = colA.match(RE_SALDO_AKHIR))) {
      closingBalance = parseAmount(m[1], i) ?? 0;
      continue;
    }
  }

  if (openingBalance === null)
    throw new Error("BCA footer missing: Saldo Awal");
  if (totalDebit === null)
    throw new Error("BCA footer missing: Mutasi Debet");
  if (totalCredit === null)
    throw new Error("BCA footer missing: Mutasi Kredit");
  if (closingBalance === null)
    throw new Error("BCA footer missing: Saldo Akhir");

  return {
    openingBalance,
    reportedDebitTotal: totalDebit,
    reportedCreditTotal: totalCredit,
    closingBalance,
  };
}

// -------------------------------------------------------------------------
// Top-level orchestration
// -------------------------------------------------------------------------

/**
 * End-to-end: rows → ParsedStatement. Throws `ReconciliationError` on
 * checksum failure (sum(parsed) vs reported).
 *
 * `rows` must be a single-sheet representation (caller enforces single-sheet
 * for XLSX before calling this).
 */
export function parseRowsToStatement(rows: string[][]): ParsedStatement {
  const meta = extractMetadata(rows);
  const headerIdx = findHeaderRowIndex(rows);

  const { lines, footerStartIdx } = extractTransactions(rows, headerIdx + 1, {
    periodStart: meta.reportedPeriodStart,
    periodEnd: meta.reportedPeriodEnd,
  });

  const footer = extractFooter(rows, footerStartIdx);

  // Reconciliation check (D-06b)
  const recon = validateReconciliation(lines, {
    debitTotal: footer.reportedDebitTotal,
    creditTotal: footer.reportedCreditTotal,
    openingBalance: footer.openingBalance,
    closingBalance: footer.closingBalance,
  });
  if (!recon.ok) {
    throw new ReconciliationError(
      "Reconciliation checksum failed",
      recon.diff,
    );
  }

  return {
    header: {
      accountNumber: meta.accountNumber,
      accountHolder: meta.accountHolder,
      reportedPeriodStart: meta.reportedPeriodStart,
      reportedPeriodEnd: meta.reportedPeriodEnd,
      currency: meta.currency,
      openingBalance: footer.openingBalance,
      closingBalance: footer.closingBalance,
      reportedDebitTotal: footer.reportedDebitTotal,
      reportedCreditTotal: footer.reportedCreditTotal,
    },
    lines,
  };
}
