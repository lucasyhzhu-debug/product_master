/**
 * TDD tests for fixed asset depreciation helpers.
 * Tests PSAK-aligned categories, straight-line depreciation calculation,
 * missing month detection, asset numbering, disposal, and CSV parsing.
 */

import { describe, it, expect } from "vitest";
import {
  ASSET_CATEGORIES,
  DEPRECIATION_EXPENSE_CODE,
  calculateMonthlyDepreciation,
  calculateFinalMonthAmount,
  computeMissingMonths,
  formatAssetNumber,
  getYYMMDateStr,
  calculateDisposalGainLoss,
  parseCharacteristicsCSV,
} from "../helpers";
import type { AssetCategoryKey } from "../helpers";

// ---------------------------------------------------------------------------
// ASSET_CATEGORIES
// ---------------------------------------------------------------------------

describe("ASSET_CATEGORIES", () => {
  it("has exactly 8 entries", () => {
    expect(ASSET_CATEGORIES).toHaveLength(8);
  });

  it("Tanah (land) is not depreciable", () => {
    const tanah = ASSET_CATEGORIES.find((c) => c.key === "tanah");
    expect(tanah).toBeDefined();
    expect(tanah!.depreciable).toBe(false);
    expect(tanah!.usefulLifeYears).toBeNull();
    expect(tanah!.glAccumCode).toBeNull();
  });

  it("all categories except Tanah are depreciable", () => {
    const depreciable = ASSET_CATEGORIES.filter((c) => c.depreciable);
    expect(depreciable).toHaveLength(7);
  });

  it("each category has a unique abbr", () => {
    const abbrs = ASSET_CATEGORIES.map((c) => c.abbr);
    expect(new Set(abbrs).size).toBe(abbrs.length);
  });

  it("each depreciable category has a unique glAccumCode", () => {
    const codes = ASSET_CATEGORIES.filter((c) => c.glAccumCode !== null).map((c) => c.glAccumCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("all depreciable categories have valid usefulLifeYears", () => {
    for (const cat of ASSET_CATEGORIES) {
      if (cat.depreciable) {
        expect(cat.usefulLifeYears).toBeGreaterThan(0);
        expect(cat.glAccumCode).not.toBeNull();
      }
    }
  });

  it("DEPRECIATION_EXPENSE_CODE is 6150", () => {
    expect(DEPRECIATION_EXPENSE_CODE).toBe("6150");
  });
});

// ---------------------------------------------------------------------------
// calculateMonthlyDepreciation
// ---------------------------------------------------------------------------

describe("calculateMonthlyDepreciation", () => {
  it("returns correct integer IDR amount", () => {
    // (10,000,000 - 500,000) / 48 = 197,916.666... -> rounds to 197917
    const result = calculateMonthlyDepreciation(10_000_000, 500_000, 48);
    expect(result).toBe(197917);
  });

  it("returns 0 when usefulLifeMonths is 0", () => {
    expect(calculateMonthlyDepreciation(10_000_000, 500_000, 0)).toBe(0);
  });

  it("returns 0 when cost equals salvage value", () => {
    expect(calculateMonthlyDepreciation(1_000_000, 1_000_000, 48)).toBe(0);
  });

  it("returns 0 when cost is less than salvage value", () => {
    expect(calculateMonthlyDepreciation(500_000, 1_000_000, 48)).toBe(0);
  });

  it("handles large amounts correctly", () => {
    // (500,000,000 - 25,000,000) / 240 = 1,979,166.666... -> rounds to 1979167
    const result = calculateMonthlyDepreciation(500_000_000, 25_000_000, 240);
    expect(result).toBe(1979167);
  });
});

// ---------------------------------------------------------------------------
// calculateFinalMonthAmount
// ---------------------------------------------------------------------------

describe("calculateFinalMonthAmount", () => {
  it("returns remainder when accumulated + monthly would exceed depreciable", () => {
    // depreciable = 9,500,000, accumulated = 9,400,000, monthly = 197917
    // remaining = 9,500,000 - 9,400,000 = 100,000
    const result = calculateFinalMonthAmount(197917, 9_400_000, 9_500_000);
    expect(result).toBe(100_000);
  });

  it("returns monthly amount when not in final month", () => {
    // depreciable = 9,500,000, accumulated = 1,000,000, monthly = 197917
    // remaining = 9,500,000 - 1,000,000 = 8,500,000 > monthly
    const result = calculateFinalMonthAmount(197917, 1_000_000, 9_500_000);
    expect(result).toBe(197917);
  });

  it("returns 0 when already fully depreciated", () => {
    const result = calculateFinalMonthAmount(197917, 9_500_000, 9_500_000);
    expect(result).toBe(0);
  });

  it("returns 0 when accumulated exceeds depreciable (should not happen but safe)", () => {
    const result = calculateFinalMonthAmount(197917, 9_600_000, 9_500_000);
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeMissingMonths
// ---------------------------------------------------------------------------

describe("computeMissingMonths", () => {
  it("returns months from acquisition to current when lastDepreciationMonth is null", () => {
    // Asset acquired 2026-01, no depreciation yet, current month 2026-03
    // Acquisition date: January 15, 2026 WIB
    const acqDate = Date.UTC(2026, 0, 14, 17, 0, 0); // Jan 15 00:00 WIB = Jan 14 17:00 UTC
    const result = computeMissingMonths(
      acqDate,
      null,
      "2026-03",
      48,
      0,
      9_500_000
    );
    expect(result).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("returns months after lastDepreciationMonth", () => {
    const acqDate = Date.UTC(2026, 0, 14, 17, 0, 0); // Jan 15 WIB
    const result = computeMissingMonths(
      acqDate,
      "2026-01",
      "2026-03",
      48,
      197917,
      9_500_000
    );
    expect(result).toEqual(["2026-02", "2026-03"]);
  });

  it("returns empty array for fully depreciated asset", () => {
    const acqDate = Date.UTC(2026, 0, 14, 17, 0, 0);
    const result = computeMissingMonths(
      acqDate,
      "2026-01",
      "2026-03",
      48,
      9_500_000, // fully depreciated
      9_500_000
    );
    expect(result).toEqual([]);
  });

  it("skips months beyond useful life end", () => {
    // Asset acquired 2026-01, useful life = 2 months
    const acqDate = Date.UTC(2026, 0, 14, 17, 0, 0);
    const result = computeMissingMonths(
      acqDate,
      null,
      "2026-06",
      2, // Only 2 months useful life
      0,
      9_500_000
    );
    // Should only include 2026-01 and 2026-02 (months 1 and 2 of useful life)
    expect(result).toEqual(["2026-01", "2026-02"]);
  });

  it("returns empty when current month is before acquisition month", () => {
    const acqDate = Date.UTC(2026, 5, 14, 17, 0, 0); // June 15 WIB
    const result = computeMissingMonths(
      acqDate,
      null,
      "2026-03",
      48,
      0,
      9_500_000
    );
    expect(result).toEqual([]);
  });

  it("handles year boundary correctly", () => {
    const acqDate = Date.UTC(2025, 10, 14, 17, 0, 0); // Nov 15, 2025 WIB
    const result = computeMissingMonths(
      acqDate,
      "2025-12",
      "2026-02",
      48,
      1_000_000,
      9_500_000
    );
    expect(result).toEqual(["2026-01", "2026-02"]);
  });
});

// ---------------------------------------------------------------------------
// formatAssetNumber
// ---------------------------------------------------------------------------

describe("formatAssetNumber", () => {
  it("returns FA-{ABBR}-{YYMM}-{NNN} format", () => {
    expect(formatAssetNumber("KIT", "2603", 1)).toBe("FA-KIT-2603-001");
  });

  it("pads sequence to 3 digits", () => {
    expect(formatAssetNumber("VEH", "2603", 42)).toBe("FA-VEH-2603-042");
  });

  it("handles large sequence numbers", () => {
    expect(formatAssetNumber("OFF", "2512", 100)).toBe("FA-OFF-2512-100");
  });
});

// ---------------------------------------------------------------------------
// getYYMMDateStr
// ---------------------------------------------------------------------------

describe("getYYMMDateStr", () => {
  it("returns 2603 for March 2026 in WIB", () => {
    // March 15, 2026 00:00 WIB = March 14 17:00 UTC
    const utcMs = Date.UTC(2026, 2, 14, 17, 0, 0);
    expect(getYYMMDateStr(utcMs)).toBe("2603");
  });

  it("returns 2601 for January 2026", () => {
    const utcMs = Date.UTC(2026, 0, 14, 17, 0, 0); // Jan 15 WIB
    expect(getYYMMDateStr(utcMs)).toBe("2601");
  });

  it("returns 2512 for December 2025", () => {
    const utcMs = Date.UTC(2025, 11, 14, 17, 0, 0); // Dec 15 WIB
    expect(getYYMMDateStr(utcMs)).toBe("2512");
  });
});

// ---------------------------------------------------------------------------
// calculateDisposalGainLoss
// ---------------------------------------------------------------------------

describe("calculateDisposalGainLoss", () => {
  it("returns gain when proceeds exceed NBV", () => {
    // cost=10M, accum=7M, proceeds=5M -> NBV=3M -> gain=5M-3M=2M
    expect(calculateDisposalGainLoss(10_000_000, 7_000_000, 5_000_000)).toBe(2_000_000);
  });

  it("returns loss when proceeds are less than NBV", () => {
    // cost=10M, accum=7M, proceeds=1M -> NBV=3M -> loss=1M-3M=-2M
    expect(calculateDisposalGainLoss(10_000_000, 7_000_000, 1_000_000)).toBe(-2_000_000);
  });

  it("returns negative NBV as loss for scrap (0 proceeds)", () => {
    // cost=10M, accum=7M, proceeds=0 -> NBV=3M -> loss=0-3M=-3M
    expect(calculateDisposalGainLoss(10_000_000, 7_000_000, 0)).toBe(-3_000_000);
  });

  it("returns 0 when proceeds equal NBV", () => {
    // cost=10M, accum=7M, proceeds=3M -> NBV=3M -> 3M-3M=0
    expect(calculateDisposalGainLoss(10_000_000, 7_000_000, 3_000_000)).toBe(0);
  });

  it("returns gain when fully depreciated and sold", () => {
    // cost=10M, accum=10M, proceeds=500K -> NBV=0 -> gain=500K
    expect(calculateDisposalGainLoss(10_000_000, 10_000_000, 500_000)).toBe(500_000);
  });
});

// ---------------------------------------------------------------------------
// parseCharacteristicsCSV
// ---------------------------------------------------------------------------

describe("parseCharacteristicsCSV", () => {
  it("parses key,value CSV text into array", () => {
    const result = parseCharacteristicsCSV("Serial,ABC123\nModel,X500");
    expect(result).toEqual([
      { key: "Serial", value: "ABC123" },
      { key: "Model", value: "X500" },
    ]);
  });

  it("skips empty and whitespace-only lines", () => {
    const result = parseCharacteristicsCSV("Serial,ABC123\n\n  \nModel,X500\n");
    expect(result).toEqual([
      { key: "Serial", value: "ABC123" },
      { key: "Model", value: "X500" },
    ]);
  });

  it("trims whitespace from keys and values", () => {
    const result = parseCharacteristicsCSV("  Serial  ,  ABC123  ");
    expect(result).toEqual([{ key: "Serial", value: "ABC123" }]);
  });

  it("returns empty array for empty string", () => {
    expect(parseCharacteristicsCSV("")).toEqual([]);
  });

  it("handles value containing commas (only splits on first comma)", () => {
    const result = parseCharacteristicsCSV("Address,123 Main St, Suite 4");
    expect(result).toEqual([{ key: "Address", value: "123 Main St, Suite 4" }]);
  });

  it("skips lines with only a key (no comma)", () => {
    const result = parseCharacteristicsCSV("Serial,ABC123\nBadLine\nModel,X500");
    expect(result).toEqual([
      { key: "Serial", value: "ABC123" },
      { key: "Model", value: "X500" },
    ]);
  });
});
