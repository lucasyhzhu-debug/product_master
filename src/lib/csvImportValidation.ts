/**
 * Client-side CSV parse + validate + date conversion for historical expense import.
 *
 * Parses CSV via Papa Parse, validates against the active Chart of Accounts,
 * converts dates to WIB epoch, and detects potential duplicates as warnings.
 */

import Papa from "papaparse";
import { strictWibDateStrToUtcMs } from "./dateUtils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Account reference from Chart of Accounts (frontend-friendly) */
export interface AccountRef {
  code: string;
  name: string;
  isActive: boolean;
}

/**
 * A single validated import row ready for mutation submission.
 * // Parallel type exists in convex/journalImport/mutations.ts for backend use
 */
export interface ImportRow {
  date: number;
  amount: number;
  description: string;
  vendorName?: string;
  accountCode: string;
  receiptUrl?: string;
}

/** Per-row validation error (row is 1-based: header=1, first data=2) */
export interface RowError {
  row: number;
  error: string;
}

/** Result of parsing and validating a CSV file */
export interface CsvParseResult {
  validRows: ImportRow[];
  errors: RowError[];
  warnings: string[];
}

/** Raw CSV row shape from Papa Parse (all values are strings) */
interface RawCsvRow {
  date?: string;
  amount?: string;
  description?: string;
  vendorName?: string;
  accountCode?: string;
  receiptUrl?: string;
}

// ---------------------------------------------------------------------------
// CSV parsing and validation
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string and validate each row against the Chart of Accounts.
 *
 * Flow:
 * 1. Parse CSV with Papa Parse (header mode, skip empty lines)
 * 2. Validate each row: required fields, date format, amount, account code
 * 3. Convert valid rows: date -> WIB epoch, amount -> number
 * 4. Detect duplicates (same date+amount+description) as warnings
 *
 * @param csvText - Raw CSV text content
 * @param accounts - Chart of Accounts reference list
 * @returns Parsed rows, errors, and warnings
 */
export function parseAndValidateCsv(
  csvText: string,
  accounts: AccountRef[]
): CsvParseResult {
  // Build account lookup map
  const accountMap = new Map<
    string,
    { name: string; isActive: boolean }
  >(accounts.map((a) => [a.code, { name: a.name, isActive: a.isActive }]));

  // Parse CSV
  const parsed = Papa.parse<RawCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  const validRows: ImportRow[] = [];
  const errors: RowError[] = [];
  const duplicateKeys = new Set<string>();
  const warnings: string[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const raw = parsed.data[i];
    const rowNum = i + 2; // 1-based: header=1, first data=2

    // --- Date validation ---
    const dateStr = (raw.date ?? "").trim();
    if (!dateStr) {
      errors.push({ row: rowNum, error: "Missing required field: date" });
      continue;
    }

    const dateEpoch = strictWibDateStrToUtcMs(dateStr);
    if (isNaN(dateEpoch)) {
      errors.push({
        row: rowNum,
        error: `Invalid date format "${dateStr}" (expected YYYY-MM-DD)`,
      });
      continue;
    }

    // --- Description validation ---
    const description = (raw.description ?? "").trim();
    if (!description) {
      errors.push({
        row: rowNum,
        error: "Missing required field: description",
      });
      continue;
    }

    // --- Amount validation ---
    const amountStr = (raw.amount ?? "").trim();
    if (!amountStr) {
      errors.push({ row: rowNum, error: "Missing required field: amount" });
      continue;
    }

    const amount = Number(amountStr);
    if (isNaN(amount)) {
      errors.push({
        row: rowNum,
        error: `Invalid amount "${amountStr}" (must be a number)`,
      });
      continue;
    }

    if (amount <= 0) {
      errors.push({
        row: rowNum,
        error: "Amount must be a positive number",
      });
      continue;
    }

    if (!Number.isInteger(amount)) {
      errors.push({
        row: rowNum,
        error: "Amount must be an integer (IDR has no fractional component)",
      });
      continue;
    }

    // --- Account code validation ---
    const accountCode = (raw.accountCode ?? "").trim();
    if (!accountCode) {
      errors.push({
        row: rowNum,
        error: "Missing required field: accountCode",
      });
      continue;
    }

    const account = accountMap.get(accountCode);
    if (!account) {
      errors.push({
        row: rowNum,
        error: `Account code "${accountCode}" not found in Chart of Accounts`,
      });
      continue;
    }

    if (!account.isActive) {
      errors.push({
        row: rowNum,
        error: `Account code "${accountCode}" is inactive`,
      });
      continue;
    }

    // --- Optional fields ---
    const vendorName = (raw.vendorName ?? "").trim() || undefined;
    const receiptUrl = (raw.receiptUrl ?? "").trim() || undefined;

    // --- Build valid row ---
    const importRow: ImportRow = {
      date: dateEpoch,
      amount,
      description,
      accountCode,
      ...(vendorName ? { vendorName } : {}),
      ...(receiptUrl ? { receiptUrl } : {}),
    };

    validRows.push(importRow);

    // --- Duplicate detection (warning, not error) ---
    const dupKey = `${dateStr}|${amount}|${description}`;
    if (duplicateKeys.has(dupKey)) {
      warnings.push(
        `Row ${rowNum}: Possible duplicate (same date, amount, and description as a previous row)`
      );
    } else {
      duplicateKeys.add(dupKey);
    }
  }

  return { validRows, errors, warnings };
}
