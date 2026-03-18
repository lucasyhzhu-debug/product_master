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
 * PSAK-aligned asset categories with depreciation defaults.
 *
 * 8 categories based on Indonesian accounting standards (PSAK 16 / PMK 72/2023):
 * - Tanah (Land) is not depreciable
 * - All others have PSAK default useful life and salvage percentages
 * - glAccumCode maps to per-category contra-asset GL accounts (1610-1670)
 */
export const ASSET_CATEGORIES = [
  { key: "tanah", label: "Tanah (Land)", abbr: "LND", usefulLifeYears: null, salvagePercent: 0, glAccumCode: null, depreciable: false },
  { key: "bangunan", label: "Bangunan (Buildings)", abbr: "BLD", usefulLifeYears: 20, salvagePercent: 5, glAccumCode: "1610", depreciable: true },
  { key: "kendaraan", label: "Kendaraan (Vehicles)", abbr: "VEH", usefulLifeYears: 8, salvagePercent: 10, glAccumCode: "1620", depreciable: true },
  { key: "peralatan_kantor", label: "Peralatan Kantor (Office Equipment)", abbr: "OFF", usefulLifeYears: 4, salvagePercent: 5, glAccumCode: "1630", depreciable: true },
  { key: "mesin_produksi", label: "Mesin & Peralatan Produksi (Kitchen/Production)", abbr: "KIT", usefulLifeYears: 8, salvagePercent: 5, glAccumCode: "1640", depreciable: true },
  { key: "mebelair", label: "Mebelair & Perabot (Furniture)", abbr: "FUR", usefulLifeYears: 4, salvagePercent: 5, glAccumCode: "1650", depreciable: true },
  { key: "perkakas", label: "Peralatan & Perkakas (Tools)", abbr: "TLS", usefulLifeYears: 4, salvagePercent: 5, glAccumCode: "1660", depreciable: true },
  { key: "perbaikan_sewa", label: "Perbaikan Sewa (Leasehold Improvements)", abbr: "LHI", usefulLifeYears: 4, salvagePercent: 0, glAccumCode: "1670", depreciable: true },
] as const;

/** Derived type for asset category keys */
export type AssetCategoryKey = (typeof ASSET_CATEGORIES)[number]["key"];

/** Single source of truth for the depreciation expense GL account code */
export const DEPRECIATION_EXPENSE_CODE = "6150";

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
 * Calculate the depreciation amount for the final month.
 *
 * Handles rounding remainder: returns min(monthlyAmount, remaining depreciable).
 * Prevents over-depreciation when monthly * months doesn't exactly equal depreciable.
 *
 * @param monthlyAmount - Standard monthly depreciation
 * @param accumulatedDepreciation - Total depreciation posted so far
 * @param depreciableAmount - Total depreciable amount (cost - salvageValue)
 * @returns Amount to depreciate this month (may be less than monthly for final month)
 */
export function calculateFinalMonthAmount(
  monthlyAmount: number,
  accumulatedDepreciation: number,
  depreciableAmount: number
): number {
  const remaining = depreciableAmount - accumulatedDepreciation;
  if (remaining <= 0) return 0;
  return Math.min(monthlyAmount, remaining);
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
