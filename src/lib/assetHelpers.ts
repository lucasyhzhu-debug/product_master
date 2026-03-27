/**
 * Frontend-side asset helpers.
 *
 * Duplicates essential constants and pure functions from convex/fixedAssets/helpers.ts
 * for use in React components. Kept in sync with the backend source of truth.
 * This avoids importing convex server code (which has non-src dependencies) into the
 * Vite frontend build.
 */

// ---------------------------------------------------------------------------
// PSAK-aligned categories (mirror of convex/fixedAssets/helpers.ts ASSET_CATEGORIES)
// IMPORTANT: Must stay in sync with convex/fixedAssets/helpers.ts ASSET_CATEGORIES.
// If you add/remove/rename a category there, update this array to match.
// ---------------------------------------------------------------------------

export const ASSET_CATEGORIES = [
  { key: "tanah", label: "Tanah (Land)", abbr: "LND", usefulLifeYears: null as number | null, salvagePercent: 0, glAccumCode: null as string | null, depreciable: false, type: "tangible" as const },
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

export type AssetCategoryKey = (typeof ASSET_CATEGORIES)[number]["key"];

// ---------------------------------------------------------------------------
// Account label helpers (for JE preview in CreateAssetDialog)
// ---------------------------------------------------------------------------

export function getAssetAccountLabel(cat: (typeof ASSET_CATEGORIES)[number]): string {
  return cat.type === "intangible" ? "1700 Intangible Assets" : "1500 Fixed Assets";
}

export function getCreditAccountLabel(paymentMethod: "company_paid" | "employee_paid"): string {
  return paymentMethod === "company_paid" ? "1100 Cash" : "2200 Employee Reimbursements Payable";
}

// ---------------------------------------------------------------------------
// CSV Parsing (mirror of convex/fixedAssets/helpers.ts parseCharacteristicsCSV)
// ---------------------------------------------------------------------------

/**
 * Parse multiline "key,value" CSV text into structured array.
 * Only splits on the first comma (values may contain additional commas).
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

// ---------------------------------------------------------------------------
// Disposal calculation (mirror of convex/fixedAssets/helpers.ts)
// ---------------------------------------------------------------------------

/**
 * Calculate gain or loss on asset disposal.
 * Positive = gain, negative = loss, zero = break-even.
 */
export function calculateDisposalGainLoss(
  cost: number,
  accumulatedDepreciation: number,
  saleProceeds: number
): number {
  const nbv = cost - accumulatedDepreciation;
  return saleProceeds - nbv;
}
