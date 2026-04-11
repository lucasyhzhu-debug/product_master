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
import type { Id } from "../../convex/_generated/dataModel";

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
  _id: Id<"accounts">;
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

// ---------------------------------------------------------------------------
// Phase 71: Bulk Expense Import (name-based matching)
// ---------------------------------------------------------------------------

/** Reference for user name matching (owner column) */
export interface UserRef {
  _id: Id<"users">;
  name: string;
}

/** Per-cell error for the editable preview table */
export interface CellError {
  column: string;
  message: string;
}

/**
 * A single parsed row for the bulk expense preview table.
 * Contains both raw strings (for display/editing) and resolved IDs (for mutation).
 * Unresolved fields have null IDs + CellErrors.
 */
export interface BulkExpenseRow {
  rowIndex: number;
  date: number | null;
  dateStr: string;
  amount: number | null;
  amountStr: string;
  description: string;
  category: string;
  accountId: Id<"accounts"> | null;
  accountName: string | null;
  vendor: string;
  paymentMethod: string;
  owner: string;
  submitterId: Id<"users"> | null;
  ownerName: string | null;
  receiptUrl: string;
  assetCategory: string;
  assetName: string;
  trusted: boolean;
  errors: CellError[];
  warnings: CellError[];
}

/** Result of parsing CSV for bulk expense import */
export interface BulkExpenseParseResult {
  rows: BulkExpenseRow[];
  totalParsed: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
}

/** Template headers for the bulk expense CSV */
export const BULK_EXPENSE_TEMPLATE_HEADERS =
  "date,amount,description,category,vendor,payment_method,owner,receipt_url,asset_category,asset_name";

/** Example rows for the bulk expense CSV template */
export const BULK_EXPENSE_TEMPLATE_EXAMPLE =
  "2025-01-15,250000,Office supplies for January,Office Supplies,Toko ABC,company_paid,Irfan,,,\n" +
  "2025-02-01,150000,Internet bill February,Utilities,Telkom,company_paid,Irfan,,,\n" +
  "2025-03-01,5000000,Oven for kitchen,General & Administrative,Toko Mesin,company_paid,Irfan,,mesin_produksi,Kitchen Oven";

/** Raw CSV row shape for bulk expense import (all values are strings) */
interface RawBulkExpenseRow {
  date?: string;
  amount?: string;
  description?: string;
  category?: string;
  vendor?: string;
  payment_method?: string;
  owner?: string;
  receipt_url?: string;
  asset_category?: string;
  asset_name?: string;
}

/**
 * Parse a CSV string for the Phase 71 bulk expense import flow.
 *
 * Matches category against account names (not codes) and owner against
 * user display names. Produces per-cell errors for the editable preview table.
 */
export function parseAndValidateBulkExpenseCsv(
  csvText: string,
  accounts: AccountRef[],
  users: UserRef[],
  defaultTrusted: boolean
): BulkExpenseParseResult {
  // Build name-based lookup maps (case-insensitive, last wins on duplicates)
  const accountNameMap = new Map<string, AccountRef>();
  for (const a of accounts) {
    if (a.isActive) {
      accountNameMap.set(a.name.toLowerCase(), a);
    }
  }

  const userNameMap = new Map<string, UserRef>();
  for (const u of users) {
    userNameMap.set(u.name.toLowerCase(), u);
  }

  const paymentMethodSet = new Set<string>(VALID_PAYMENT_METHODS);
  const assetCategorySet = new Set<string>(VALID_ASSET_CATEGORIES);

  // Parse CSV
  const parsed = Papa.parse<RawBulkExpenseRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  const rows: BulkExpenseRow[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const raw = parsed.data[i];
    const errors: CellError[] = [];
    const warnings: CellError[] = [];

    // --- Date ---
    const dateStr = (raw.date ?? "").trim();
    let dateEpoch: number | null = null;
    if (!dateStr) {
      errors.push({ column: "date", message: "Date is required" });
    } else {
      const parsed = strictWibDateStrToUtcMs(dateStr);
      if (isNaN(parsed)) {
        errors.push({ column: "date", message: "Invalid date format. Use YYYY-MM-DD" });
      } else {
        dateEpoch = parsed;
      }
    }

    // --- Amount ---
    const amountStr = (raw.amount ?? "").trim();
    let amount: number | null = null;
    if (!amountStr) {
      errors.push({ column: "amount", message: "Amount is required" });
    } else {
      const n = parseInt(amountStr, 10);
      if (isNaN(n) || n <= 0) {
        errors.push({ column: "amount", message: "Amount must be a positive number" });
      } else if (String(n) !== amountStr) {
        // Handles floats like "123.45" -> parseInt gives 123 but string doesn't match
        const floatCheck = Number(amountStr);
        if (!isNaN(floatCheck) && floatCheck > 0 && Number.isInteger(floatCheck)) {
          amount = floatCheck;
        } else if (!isNaN(floatCheck) && floatCheck > 0) {
          errors.push({ column: "amount", message: "Amount must be an integer (IDR has no fractional component)" });
        } else {
          errors.push({ column: "amount", message: "Amount must be a positive number" });
        }
      } else {
        amount = n;
      }
    }
    // Warning: unusually high amount
    if (amount !== null && amount > 10_000_000) {
      warnings.push({ column: "amount", message: "Unusually high amount" });
    }

    // --- Description ---
    const description = (raw.description ?? "").trim();
    if (!description) {
      errors.push({ column: "description", message: "Description is required" });
    } else if (description.length > 500) {
      errors.push({ column: "description", message: "Description too long (max 500)" });
    }

    // --- Category (account name matching) ---
    const categoryRaw = (raw.category ?? "").trim();
    let accountId: Id<"accounts"> | null = null;
    let accountName: string | null = null;
    if (!categoryRaw) {
      errors.push({ column: "category", message: "Category is required" });
    } else {
      const matched = accountNameMap.get(categoryRaw.toLowerCase());
      if (!matched) {
        errors.push({ column: "category", message: `Category '${categoryRaw}' not found in Chart of Accounts` });
      } else {
        accountId = matched._id;
        accountName = matched.name;
      }
    }

    // --- Vendor ---
    const vendor = (raw.vendor ?? "").trim();
    if (vendor.length > 200) {
      errors.push({ column: "vendor", message: "Vendor name too long (max 200)" });
    } else if (!vendor) {
      warnings.push({ column: "vendor", message: "Vendor not specified" });
    }

    // --- Payment method ---
    const paymentMethod = (raw.payment_method ?? "").trim();
    if (!paymentMethod) {
      errors.push({ column: "payment_method", message: "Payment method is required" });
    } else if (!paymentMethodSet.has(paymentMethod)) {
      errors.push({
        column: "payment_method",
        message: "Invalid payment method. Use: employee_paid, company_paid, or payment_request",
      });
    }

    // --- Owner (user name matching) ---
    const ownerRaw = (raw.owner ?? "").trim();
    let submitterId: Id<"users"> | null = null;
    let ownerName: string | null = null;
    if (!ownerRaw) {
      errors.push({ column: "owner", message: "Owner is required" });
    } else {
      const matched = userNameMap.get(ownerRaw.toLowerCase());
      if (!matched) {
        errors.push({ column: "owner", message: `User '${ownerRaw}' not found in system` });
      } else {
        submitterId = matched._id;
        ownerName = matched.name;
      }
    }

    // --- Receipt URL ---
    const receiptUrl = (raw.receipt_url ?? "").trim();
    if (receiptUrl && !receiptUrl.startsWith("http://") && !receiptUrl.startsWith("https://")) {
      errors.push({ column: "receipt_url", message: "Receipt URL must be a valid URL" });
    }

    // --- Asset category ---
    const assetCategory = (raw.asset_category ?? "").trim();
    if (assetCategory && !assetCategorySet.has(assetCategory)) {
      errors.push({
        column: "asset_category",
        message: `Invalid asset category '${assetCategory}'. Valid: ${VALID_ASSET_CATEGORIES.join(", ")}`,
      });
    }

    // --- Asset name ---
    const assetName = (raw.asset_name ?? "").trim();
    if (assetCategory && !assetName) {
      errors.push({ column: "asset_name", message: "Asset name is required when asset category is specified" });
    }

    rows.push({
      rowIndex: i,
      date: dateEpoch,
      dateStr,
      amount,
      amountStr,
      description,
      category: categoryRaw,
      accountId,
      accountName,
      vendor,
      paymentMethod,
      owner: ownerRaw,
      submitterId,
      ownerName,
      receiptUrl,
      assetCategory,
      assetName,
      trusted: defaultTrusted,
      errors,
      warnings,
    });
  }

  const totalParsed = rows.length;
  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  const warningCount = rows.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length;
  const validCount = rows.filter((r) => r.errors.length === 0).length;

  return { rows, totalParsed, validCount, warningCount, errorCount };
}
