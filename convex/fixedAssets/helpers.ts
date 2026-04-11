/**
 * Pure helper functions for fixed asset management.
 *
 * Contains: PSAK-aligned category configuration, straight-line depreciation
 * calculation, missing month detection, asset numbering (YYMM format),
 * disposal gain/loss, and CSV characteristics parsing.
 *
 * All functions are pure (no Convex ctx required) and exported for testing.
 */

import { getWibComponents } from "../lib/periodRange";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * PSAK-aligned asset categories with depreciation/amortization defaults.
 *
 * 11 categories based on Indonesian accounting standards:
 * - PSAK 16 / PMK 72/2023: 8 tangible asset categories
 * - PSAK 19: 3 intangible asset categories (trademarks, patents, software)
 * - Tanah (Land) is not depreciable
 * - glAccumCode maps to per-category contra-asset GL accounts (1610-1670 tangible, 1710-1730 intangible)
 * - type distinguishes tangible (1500 Fixed Assets) from intangible (1700 Intangible Assets)
 */
export const ASSET_CATEGORIES = [
  { key: "tanah", label: "Tanah (Land)", abbr: "LND", usefulLifeYears: null, salvagePercent: 0, glAccumCode: null, depreciable: false, type: "tangible" as const },
  { key: "bangunan", label: "Bangunan (Buildings)", abbr: "BLD", usefulLifeYears: 20, salvagePercent: 5, glAccumCode: "1610", depreciable: true, type: "tangible" as const },
  { key: "kendaraan", label: "Kendaraan (Vehicles)", abbr: "VEH", usefulLifeYears: 8, salvagePercent: 10, glAccumCode: "1620", depreciable: true, type: "tangible" as const },
  { key: "peralatan_kantor", label: "Peralatan Kantor (Office Equipment)", abbr: "OFF", usefulLifeYears: 4, salvagePercent: 5, glAccumCode: "1630", depreciable: true, type: "tangible" as const },
  { key: "mesin_produksi", label: "Mesin & Peralatan Produksi (Kitchen/Production)", abbr: "KIT", usefulLifeYears: 8, salvagePercent: 5, glAccumCode: "1640", depreciable: true, type: "tangible" as const },
  { key: "mebelair", label: "Mebelair & Perabot (Furniture)", abbr: "FUR", usefulLifeYears: 4, salvagePercent: 5, glAccumCode: "1650", depreciable: true, type: "tangible" as const },
  { key: "perkakas", label: "Peralatan & Perkakas (Tools)", abbr: "TLS", usefulLifeYears: 4, salvagePercent: 5, glAccumCode: "1660", depreciable: true, type: "tangible" as const },
  { key: "perbaikan_sewa", label: "Perbaikan Sewa (Leasehold Improvements)", abbr: "LHI", usefulLifeYears: 4, salvagePercent: 0, glAccumCode: "1670", depreciable: true, type: "tangible" as const },
  { key: "merek_dagang", label: "Merek Dagang (Trademarks/Brands)", abbr: "TM", usefulLifeYears: 10, salvagePercent: 0, glAccumCode: "1710", depreciable: true, type: "intangible" as const },
  { key: "hak_paten", label: "Hak Paten (Patents)", abbr: "PAT", usefulLifeYears: 10, salvagePercent: 0, glAccumCode: "1720", depreciable: true, type: "intangible" as const },
  { key: "perangkat_lunak", label: "Perangkat Lunak (Software)", abbr: "SW", usefulLifeYears: 4, salvagePercent: 0, glAccumCode: "1730", depreciable: true, type: "intangible" as const },
] as const;

/** Derived type for asset category keys */
export type AssetCategoryKey = (typeof ASSET_CATEGORIES)[number]["key"];

/** Single source of truth for the depreciation expense GL account code */
export const DEPRECIATION_EXPENSE_CODE = "6150";

/** Single source of truth for the amortization expense GL account code (intangible assets, PSAK 19) */
export const AMORTIZATION_EXPENSE_CODE = "6160";

/**
 * Get the correct asset account code for a category.
 * Tangible assets use 1500 (Fixed Assets), intangible use 1700 (Intangible Assets).
 */
export function getAssetAccountCode(cat: (typeof ASSET_CATEGORIES)[number]): string {
  return cat.type === "intangible" ? "1700" : "1500";
}

/**
 * Get the correct expense account code for depreciation/amortization.
 * Tangible assets use 6150 (Depreciation Expense), intangible use 6160 (Amortization Expense).
 */
export function getExpenseAccountCode(cat: (typeof ASSET_CATEGORIES)[number]): string {
  return cat.type === "intangible" ? AMORTIZATION_EXPENSE_CODE : DEPRECIATION_EXPENSE_CODE;
}

// ---------------------------------------------------------------------------
// Reclassification Expense Mapping
// ---------------------------------------------------------------------------

/**
 * Default mapping from asset category to operating expense GL account code
 * when reclassifying an asset as an operating expense.
 *
 * All categories default to "6200" (General & Administrative Expense) since
 * the reclassification books the NBV as a general operating cost, not as
 * depreciation/amortization expense (which are time-based, not event-based).
 * The user can override via dropdown in the UI.
 */
export const CATEGORY_TO_EXPENSE_ACCOUNT: Record<string, string> = {
  tanah: "6200",
  bangunan: "6200",
  kendaraan: "6200",
  peralatan_kantor: "6200",
  mesin_produksi: "6200",
  mebelair: "6200",
  perkakas: "6200",
  perbaikan_sewa: "6200",
  merek_dagang: "6200",
  hak_paten: "6200",
  perangkat_lunak: "6200",
};

/**
 * Get the default expense account code for reclassifying an asset category.
 * Returns "6200" if category not found (safe fallback).
 */
export function getReclassificationExpenseCode(categoryKey: string): string {
  return CATEGORY_TO_EXPENSE_ACCOUNT[categoryKey] ?? "6200";
}

// ---------------------------------------------------------------------------
// Current Month Helper
// ---------------------------------------------------------------------------

/**
 * Get current month as "YYYY-MM" string in WIB timezone.
 * Used by both queries and mutations for depreciation range detection.
 */
export function getCurrentYYYYMM(): string {
  const now = Date.now();
  const { year, month } = getWibComponents(now);
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Depreciation Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate monthly straight-line depreciation amount.
 *
 * Returns integer IDR via Math.round. Returns 0 if:
 * - usefulLifeMonths <= 0
 * - depreciableAmount (cost - salvageValue) <= 0
 *
 * @param cost - Original asset cost in IDR (integer)
 * @param salvageValue - Estimated residual value in IDR (integer)
 * @param usefulLifeMonths - Useful life in months
 * @returns Monthly depreciation amount (integer IDR)
 */
export function calculateMonthlyDepreciation(
  cost: number,
  salvageValue: number,
  usefulLifeMonths: number
): number {
  if (usefulLifeMonths <= 0) return 0;
  const depreciableAmount = cost - salvageValue;
  if (depreciableAmount <= 0) return 0;
  return Math.round(depreciableAmount / usefulLifeMonths);
}

/**
 * Calculate the depreciation amount for a given month.
 *
 * Handles rounding remainder: when the remaining depreciable amount is less
 * than two monthly amounts (i.e., this is the last month of useful life),
 * returns the full remaining amount. This ensures the asset reaches exactly
 * the depreciable amount without losing IDR to rounding.
 *
 * Example: cost=1M, salvage=0, 3 months → monthly=333,333.
 * After 2 months (accum=666,666), remaining=333,334.
 * Without this fix, min(333333, 333334)=333333 → 1 IDR rounding loss.
 * With this fix, remaining(333334) < 2*monthly(666666) → returns 333,334.
 *
 * @param monthlyAmount - Standard monthly depreciation
 * @param accumulatedDepreciation - Total depreciation posted so far
 * @param depreciableAmount - Total depreciable amount (cost - salvageValue)
 * @returns Amount to depreciate this month (remainder for final month)
 */
export function calculateFinalMonthAmount(
  monthlyAmount: number,
  accumulatedDepreciation: number,
  depreciableAmount: number
): number {
  const remaining = depreciableAmount - accumulatedDepreciation;
  if (remaining <= 0) return 0;
  // If remaining is less than 2x monthly, this is the last month — take the full remainder
  // to avoid rounding loss (e.g., 333334 remaining vs 333333 monthly)
  if (remaining < monthlyAmount * 2) return remaining;
  return monthlyAmount;
}

// ---------------------------------------------------------------------------
// Missing Months Detection
// ---------------------------------------------------------------------------

/**
 * Compute YYYY-MM strings for months that need depreciation.
 *
 * Starts from acquisition month (if lastDepreciationMonth is null) or from
 * the month after lastDepreciationMonth. Stops at currentYYYYMM or when
 * useful life is exhausted. Skips if fully depreciated.
 *
 * @param acquisitionDate - Epoch ms of acquisition date
 * @param lastDepreciationMonth - "YYYY-MM" of last posted month, or null
 * @param currentYYYYMM - Current month as "YYYY-MM" (WIB)
 * @param usefulLifeMonths - Asset useful life in months
 * @param accumulatedDepreciation - Current accumulated depreciation
 * @param depreciableAmount - Total depreciable amount (cost - salvageValue)
 * @returns Array of "YYYY-MM" strings for months needing depreciation
 */
export function computeMissingMonths(
  acquisitionDate: number,
  lastDepreciationMonth: string | null,
  currentYYYYMM: string,
  usefulLifeMonths: number,
  accumulatedDepreciation: number,
  depreciableAmount: number
): string[] {
  // Already fully depreciated
  if (accumulatedDepreciation >= depreciableAmount) return [];

  // Determine acquisition month in WIB
  const acq = getWibComponents(acquisitionDate);
  const acqYear = acq.year;
  const acqMonth = acq.month + 1; // 0-indexed to 1-indexed

  // Determine start month
  let startYear: number;
  let startMonth: number;

  if (lastDepreciationMonth === null) {
    // Start from acquisition month
    startYear = acqYear;
    startMonth = acqMonth;
  } else {
    // Start from month after last depreciation
    const [yStr, mStr] = lastDepreciationMonth.split("-");
    startYear = parseInt(yStr, 10);
    startMonth = parseInt(mStr, 10) + 1;
    if (startMonth > 12) {
      startMonth = 1;
      startYear += 1;
    }
  }

  // Parse current month
  const [curYStr, curMStr] = currentYYYYMM.split("-");
  const curYear = parseInt(curYStr, 10);
  const curMonth = parseInt(curMStr, 10);

  // Calculate useful life end month (acquisition month + usefulLifeMonths - 1)
  let endYear = acqYear;
  let endMonth = acqMonth + usefulLifeMonths - 1;
  while (endMonth > 12) {
    endMonth -= 12;
    endYear += 1;
  }

  const result: string[] = [];
  let y = startYear;
  let m = startMonth;

  while (true) {
    // Stop if past current month
    if (y > curYear || (y === curYear && m > curMonth)) break;

    // Stop if past useful life end
    if (y > endYear || (y === endYear && m > endMonth)) break;

    result.push(`${y}-${String(m).padStart(2, "0")}`);

    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Asset Numbering
// ---------------------------------------------------------------------------

/**
 * Format an asset number in FA-{ABBR}-{YYMM}-{NNN} format.
 *
 * @param abbr - Category abbreviation (e.g., "KIT")
 * @param yymmDateStr - YYMM string (e.g., "2603" for March 2026)
 * @param sequence - Sequential number within category+month
 * @returns Formatted asset number (e.g., "FA-KIT-2603-001")
 */
export function formatAssetNumber(
  abbr: string,
  yymmDateStr: string,
  sequence: number
): string {
  return `FA-${abbr}-${yymmDateStr}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Get YYMM date string from UTC timestamp using WIB timezone.
 *
 * IMPORTANT: Uses YYMM format (year-first), different from counter.ts getWibDateStr
 * which returns MMDD format. YYMM is intentional for asset numbering: assets are
 * identified across years, so year comes first (e.g., "2603" for March 2026).
 *
 * @param utcMs - UTC timestamp in milliseconds
 * @returns YYMM string (e.g., "2603" for March 2026)
 */
export function getYYMMDateStr(utcMs: number): string {
  const { year, month } = getWibComponents(utcMs);
  const yy = String(year % 100).padStart(2, "0");
  const mm = String(month + 1).padStart(2, "0"); // 0-indexed to 1-indexed
  return `${yy}${mm}`;
}

// ---------------------------------------------------------------------------
// Disposal
// ---------------------------------------------------------------------------

/**
 * Calculate gain or loss on asset disposal.
 *
 * Net Book Value (NBV) = cost - accumulatedDepreciation
 * Result = saleProceeds - NBV
 *
 * Positive = gain, negative = loss, zero = break-even.
 * For scrap/write-off, saleProceeds = 0 (loss = -NBV).
 *
 * @param cost - Original asset cost
 * @param accumulatedDepreciation - Total depreciation posted
 * @param saleProceeds - Sale proceeds (0 for scrap/write-off)
 * @returns Gain (positive) or loss (negative)
 */
export function calculateDisposalGainLoss(
  cost: number,
  accumulatedDepreciation: number,
  saleProceeds: number
): number {
  const nbv = cost - accumulatedDepreciation;
  return saleProceeds - nbv;
}

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

/**
 * Parse multiline "key,value" CSV text into structured array.
 *
 * Trims whitespace from keys and values. Skips empty lines and lines
 * without a comma separator. Only splits on the first comma (values
 * may contain additional commas).
 *
 * @param text - Raw CSV text (e.g., "Serial,ABC123\nModel,X500")
 * @returns Array of {key, value} objects
 */
export function parseCharacteristicsCSV(
  text: string
): Array<{ key: string; value: string }> {
  if (!text.trim()) return [];

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const commaIdx = line.indexOf(",");
      if (commaIdx === -1) return null;
      const key = line.slice(0, commaIdx).trim();
      const value = line.slice(commaIdx + 1).trim();
      if (!key) return null;
      return { key, value };
    })
    .filter((item): item is { key: string; value: string } => item !== null);
}
