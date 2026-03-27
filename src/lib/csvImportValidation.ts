/**
 * Client-side CSV parse + validate + date conversion for bulk expense/asset import.
 *
 * Parses CSV via Papa Parse, validates against the active Chart of Accounts,
 * converts dates to WIB epoch, and detects potential duplicates as warnings.
 *
 * Supports two row types:
 * - Expense rows: accountCode maps to opex/cogs/other accounts → creates expense JE
 * - Asset rows: accountCode maps to asset accounts (1500/1700) → creates fixedAsset + acquisition JE
 */

import Papa from "papaparse";
import { strictWibDateStrToUtcMs } from "./dateUtils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid payment methods matching expenses schema */
export const VALID_PAYMENT_METHODS = [
  "employee_paid",
  "company_paid",
  "payment_request",
] as const;

export type PaymentMethod = (typeof VALID_PAYMENT_METHODS)[number];

/** Valid asset category keys from ASSET_CATEGORIES (convex/fixedAssets/helpers.ts) */
export const VALID_ASSET_CATEGORIES = [
  "tanah",
  "bangunan",
  "kendaraan",
  "peralatan_kantor",
  "mesin_produksi",
  "mebelair",
  "perkakas",
  "perbaikan_sewa",
  "merek_dagang",
  "hak_paten",
  "perangkat_lunak",
] as const;

export type AssetCategoryKey = (typeof VALID_ASSET_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Account reference from Chart of Accounts (frontend-friendly) */
export interface AccountRef {
  code: string;
  name: string;
  type: string;
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
  paymentMethod: PaymentMethod;
  submitterName: string;
  assetCategory?: AssetCategoryKey;
  assetName?: string;
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
  paymentMethod?: string;
  submitterName?: string;
  assetCategory?: string;
  assetName?: string;
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
 * 3. Validate paymentMethod and submitterName (required for all rows)
 * 4. For asset accounts: validate assetCategory and assetName
 * 5. Convert valid rows: date -> WIB epoch, amount -> number
 * 6. Detect duplicates (same date+amount+description) as warnings
 *
 * @param csvText - Raw CSV text content
 * @param accounts - Chart of Accounts reference list
 * @returns Parsed rows, errors, and warnings
 */
export function parseAndValidateCsv(
  csvText: string,
  accounts: AccountRef[]
): CsvParseResult {
  // Build account lookup map (now includes type for asset detection)
  const accountMap = new Map<
    string,
    { name: string; type: string; isActive: boolean }
  >(accounts.map((a) => [a.code, { name: a.name, type: a.type, isActive: a.isActive }]));

  // Build valid sets for O(1) lookups
  const paymentMethodSet = new Set<string>(VALID_PAYMENT_METHODS);
  const assetCategorySet = new Set<string>(VALID_ASSET_CATEGORIES);

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

    // --- Payment method validation (required) ---
    const paymentMethod = (raw.paymentMethod ?? "").trim();
    if (!paymentMethod) {
      errors.push({
        row: rowNum,
        error: "Missing required field: paymentMethod (employee_paid, company_paid, or payment_request)",
      });
      continue;
    }

    if (!paymentMethodSet.has(paymentMethod)) {
      errors.push({
        row: rowNum,
        error: `Invalid paymentMethod "${paymentMethod}" (must be: employee_paid, company_paid, or payment_request)`,
      });
      continue;
    }

    // --- Submitter name validation (required) ---
    const submitterName = (raw.submitterName ?? "").trim();
    if (!submitterName) {
      errors.push({
        row: rowNum,
        error: "Missing required field: submitterName",
      });
      continue;
    }

    // --- Asset-specific validation (only for asset-type accounts) ---
    const isAssetAccount = account.type === "asset";
    let assetCategory: AssetCategoryKey | undefined;
    let assetName: string | undefined;

    if (isAssetAccount) {
      const rawCategory = (raw.assetCategory ?? "").trim();
      if (!rawCategory) {
        errors.push({
          row: rowNum,
          error: `Account "${accountCode}" is an asset account — assetCategory is required (e.g., peralatan_kantor, merek_dagang)`,
        });
        continue;
      }

      if (!assetCategorySet.has(rawCategory)) {
        errors.push({
          row: rowNum,
          error: `Invalid assetCategory "${rawCategory}". Valid values: ${VALID_ASSET_CATEGORIES.join(", ")}`,
        });
        continue;
      }

      assetCategory = rawCategory as AssetCategoryKey;

      const rawAssetName = (raw.assetName ?? "").trim();
      if (!rawAssetName) {
        errors.push({
          row: rowNum,
          error: `Account "${accountCode}" is an asset account — assetName is required`,
        });
        continue;
      }

      assetName = rawAssetName;
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
      paymentMethod: paymentMethod as PaymentMethod,
      submitterName,
      ...(vendorName ? { vendorName } : {}),
      ...(receiptUrl ? { receiptUrl } : {}),
      ...(assetCategory ? { assetCategory } : {}),
      ...(assetName ? { assetName } : {}),
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
