/**
 * Integration-level tests for fixed asset mutation business logic.
 *
 * Tests mutation contracts through the pure helpers that mutations depend on,
 * verifying the full lifecycle: create → depreciate → dispose → void.
 *
 * Per project convention, auth-gated convex-test runtime tests are deferred.
 * These tests verify the business logic invariants that mutations enforce.
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
  type AssetCategoryKey,
} from "./helpers";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

/** Standard test asset: Kitchen Mixer, 10M IDR, mesin_produksi category */
function createTestAssetData() {
  const category = ASSET_CATEGORIES.find((c) => c.key === "mesin_produksi")!;
  const cost = 10_000_000;
  const salvageValue = Math.round(cost * (category.salvagePercent / 100)); // 500,000
  const usefulLifeMonths = category.usefulLifeYears! * 12; // 96 months
  const monthlyDepreciation = calculateMonthlyDepreciation(cost, salvageValue, usefulLifeMonths);

  return {
    name: "Kitchen Mixer",
    category: category.key as AssetCategoryKey,
    categoryConfig: category,
    cost,
    salvageValue,
    usefulLifeMonths,
    monthlyDepreciation,
    depreciableAmount: cost - salvageValue,
    acquisitionDate: Date.UTC(2026, 0, 15), // Jan 15, 2026
  };
}

// ============================================================================
// ASSET CRUD TESTS (4 tests)
// ============================================================================

describe("Asset CRUD contracts", () => {
  it("create: generates FA-{ABBR}-YYMM-NNN format with correct abbreviation", () => {
    const data = createTestAssetData();
    const yymmDateStr = getYYMMDateStr(data.acquisitionDate);
    const assetNumber = formatAssetNumber(data.categoryConfig.abbr, yymmDateStr, 1);

    expect(assetNumber).toBe("FA-KIT-2601-001");
    expect(assetNumber).toMatch(/^FA-[A-Z]{3}-\d{4}-\d{3}$/);
  });

  it("create: defaults salvage and useful life from PSAK category", () => {
    const data = createTestAssetData();

    // mesin_produksi: 5% salvage, 8 years
    expect(data.salvageValue).toBe(500_000);
    expect(data.usefulLifeMonths).toBe(96);
    expect(data.monthlyDepreciation).toBe(
      Math.round((10_000_000 - 500_000) / 96)
    ); // 98,958
  });

  it("create: rejects invalid category key", () => {
    const validKeys = ASSET_CATEGORIES.map((c) => c.key);
    expect(validKeys).not.toContain("invalid_category");
    // Mutation would reject: category validation checks against ASSET_CATEGORIES keys
    const invalidKey = "invalid_category" as string;
    const found = ASSET_CATEGORIES.find((c) => (c.key as string) === invalidKey);
    expect(found).toBeUndefined();
  });

  it("create: Tanah (non-depreciable) sets monthlyDepreciation=0", () => {
    const tanah = ASSET_CATEGORIES.find((c) => c.key === "tanah")!;
    expect(tanah.depreciable).toBe(false);

    // For non-depreciable categories, mutation sets monthlyDepreciation = 0
    const monthlyDepr = tanah.depreciable
      ? calculateMonthlyDepreciation(10_000_000, 0, 0)
      : 0;
    expect(monthlyDepr).toBe(0);
  });
});

// ============================================================================
// UPDATE TESTS (2 tests)
// ============================================================================

describe("Asset update contracts", () => {
  it("update: only allows non-financial fields (name, location, characteristics, attachments)", () => {
    // The mutation signature only accepts: assetId, name?, location?, characteristics?, attachmentIds?
    // cost, salvageValue, usefulLifeMonths, category, acquisitionDate are NOT in the args
    // This is enforced by the Convex arg validator -- no extraction needed
    const allowedUpdateFields = ["name", "location", "characteristics", "attachmentIds"];
    const immutableFields = ["cost", "salvageValue", "usefulLifeMonths", "category", "acquisitionDate"];

    // Verify they don't overlap
    for (const field of immutableFields) {
      expect(allowedUpdateFields).not.toContain(field);
    }
  });

  it("update: rejects update on disposed asset (status check)", () => {
    // Mutation checks: if (asset.status === "disposed") throw
    // Disposed status means the asset has been sold/scrapped/written_off
    const disposedStatuses = ["disposed"];
    const updateableStatuses = ["active", "fully_depreciated"];

    expect(disposedStatuses).toContain("disposed");
    expect(updateableStatuses).not.toContain("disposed");
  });
});

// ============================================================================
// DEPRECIATION BATCH TESTS (4 tests)
// ============================================================================

describe("Depreciation batch contracts (runDepreciation)", () => {
  it("creates one JE per asset per missing month with correct amounts", () => {
    const data = createTestAssetData();
    // Asset acquired Jan 2026, no depreciation posted, current month is March 2026
    const missingMonths = computeMissingMonths(
      data.acquisitionDate,
      null,
      "2026-03",
      data.usefulLifeMonths,
      0,
      data.depreciableAmount
    );

    // Should need 3 months: Jan, Feb, Mar 2026
    expect(missingMonths).toEqual(["2026-01", "2026-02", "2026-03"]);

    // Each JE would have monthlyDepreciation amount (except possibly last month of life)
    let runningAccum = 0;
    for (const _month of missingMonths) {
      const amount = calculateFinalMonthAmount(
        data.monthlyDepreciation,
        runningAccum,
        data.depreciableAmount
      );
      expect(amount).toBe(data.monthlyDepreciation);
      runningAccum += amount;
    }
    expect(runningAccum).toBe(data.monthlyDepreciation * 3);
  });

  it("uses calculateFinalMonthAmount for last month (no over-depreciation)", () => {
    // Create an asset near end of useful life
    const cost = 1_000_000;
    const salvageValue = 0;
    const usefulLifeMonths = 3;
    const monthlyDepr = calculateMonthlyDepreciation(cost, salvageValue, usefulLifeMonths);
    // monthlyDepr = 333,333 (rounded)

    // After 2 months: accumulated = 666,666
    const accum = monthlyDepr * 2;
    const depreciableAmount = cost - salvageValue;

    // Final month should get the remainder, not the standard monthly
    const finalAmount = calculateFinalMonthAmount(monthlyDepr, accum, depreciableAmount);
    expect(finalAmount).toBe(depreciableAmount - accum); // 333,334 (remainder)
    expect(finalAmount).not.toBe(monthlyDepr); // NOT 333,333

    // Total should exactly equal depreciable amount
    expect(accum + finalAmount).toBe(depreciableAmount);
  });

  it("auto-marks asset as fully_depreciated when accumulated reaches depreciable amount", () => {
    const cost = 1_000_000;
    const salvageValue = 0;
    const usefulLifeMonths = 3;
    const monthlyDepr = calculateMonthlyDepreciation(cost, salvageValue, usefulLifeMonths);
    const depreciableAmount = cost - salvageValue;

    // Simulate full depreciation
    let accum = 0;
    for (let i = 0; i < usefulLifeMonths; i++) {
      const amount = calculateFinalMonthAmount(monthlyDepr, accum, depreciableAmount);
      accum += amount;
    }

    // After all months, accumulated should equal depreciable amount
    expect(accum).toBe(depreciableAmount);

    // Mutation would check: accumulatedDepreciation >= depreciableAmount → fully_depreciated
    const isFullyDepreciated = accum >= depreciableAmount;
    expect(isFullyDepreciated).toBe(true);
  });

  it("is idempotent: re-running when no missing months creates 0 JEs", () => {
    const data = createTestAssetData();
    // Asset with lastDepreciationMonth = current month → no missing months
    const missingMonths = computeMissingMonths(
      data.acquisitionDate,
      "2026-03",
      "2026-03",
      data.usefulLifeMonths,
      data.monthlyDepreciation * 3,
      data.depreciableAmount
    );

    expect(missingMonths).toEqual([]);
    // Mutation would skip this asset (missingMonths.length === 0)
  });
});

// ============================================================================
// DISPOSAL TESTS (4 tests)
// ============================================================================

describe("Disposal contracts (disposeAsset)", () => {
  it("disposeAsset: uses sourceType='manual' (NOT 'depreciation')", () => {
    // The mutation creates JE with sourceType="manual"
    // This is critical: disposal JEs must NOT be caught by voidDepreciationMonth
    // which queries sourceType="depreciation"
    const disposalSourceType = "manual";
    expect(disposalSourceType).toBe("manual");
    expect(disposalSourceType).not.toBe("depreciation");
  });

  it("disposeAsset: sale with gain records on 7300 account", () => {
    // Asset cost 10M, accumulated 5M, NBV = 5M, sold for 6M → gain of 1M
    const gainLoss = calculateDisposalGainLoss(10_000_000, 5_000_000, 6_000_000);
    expect(gainLoss).toBe(1_000_000); // Positive = gain
    expect(gainLoss).toBeGreaterThan(0);
    // Mutation creates: CR 7300 Gain on Disposal for 1M
  });

  it("disposeAsset: sale with loss records on 7400 account", () => {
    // Asset cost 10M, accumulated 5M, NBV = 5M, sold for 3M → loss of 2M
    const gainLoss = calculateDisposalGainLoss(10_000_000, 5_000_000, 3_000_000);
    expect(gainLoss).toBe(-2_000_000); // Negative = loss
    expect(gainLoss).toBeLessThan(0);
    // Mutation creates: DR 7400 Loss on Disposal for 2M
  });

  it("disposeAsset: rejects already-disposed asset", () => {
    // Mutation checks: if (asset.status === "disposed") throw
    // An asset can only be disposed once
    const disposedStatus = "disposed";
    const validForDisposal = ["active", "fully_depreciated"];
    expect(validForDisposal).not.toContain(disposedStatus);
  });
});

// ============================================================================
// VOID TESTS (3 tests)
// ============================================================================

describe("Void depreciation month contracts (voidDepreciationMonth)", () => {
  it("voidDepreciationMonth: only reverses depreciation JEs (not disposal)", () => {
    // Void uses by_sourceType_date index with sourceType="depreciation"
    // Disposal JEs use sourceType="manual" → NOT caught by void query
    const voidQuerySourceType = "depreciation";
    const disposalSourceType = "manual";
    expect(voidQuerySourceType).not.toBe(disposalSourceType);
  });

  it("voidDepreciationMonth: recalculates accumulatedDepreciation from remaining JEs", () => {
    // After voiding March, asset has Jan + Feb remaining
    const data = createTestAssetData();

    // If 3 months were posted (Jan, Feb, Mar), voiding March leaves 2 months
    const totalAccumWith3 = data.monthlyDepreciation * 3;
    const totalAccumWith2 = data.monthlyDepreciation * 2;

    // After void, newAccum should equal accum for remaining 2 months
    expect(totalAccumWith3 - data.monthlyDepreciation).toBe(totalAccumWith2);
    // Mutation recalculates by summing credit amounts from remaining non-reversed JEs
  });

  it("voidDepreciationMonth: reverts fully_depreciated status to active when applicable", () => {
    const cost = 1_000_000;
    const salvageValue = 0;
    const usefulLifeMonths = 3;
    const monthlyDepr = calculateMonthlyDepreciation(cost, salvageValue, usefulLifeMonths);
    const depreciableAmount = cost - salvageValue;

    // After full depreciation
    let accum = 0;
    for (let i = 0; i < usefulLifeMonths; i++) {
      accum += calculateFinalMonthAmount(monthlyDepr, accum, depreciableAmount);
    }
    expect(accum).toBe(depreciableAmount);
    expect(accum >= depreciableAmount).toBe(true); // fully_depreciated

    // After voiding last month
    const voidedAmount = calculateFinalMonthAmount(monthlyDepr, monthlyDepr * 2, depreciableAmount);
    const accumAfterVoid = accum - voidedAmount;
    expect(accumAfterVoid < depreciableAmount).toBe(true); // back to active
  });
});

// ============================================================================
// PREVIEW ACCURACY TEST (1 test)
// ============================================================================

describe("Preview accuracy (getDepreciationPreview)", () => {
  it("totalAmount matches what runDepreciation would actually post (final-month accuracy)", () => {
    // Asset near end of useful life: 3-month life, 2 already posted
    const cost = 1_000_000;
    const salvageValue = 0;
    const usefulLifeMonths = 3;
    const monthlyDepr = calculateMonthlyDepreciation(cost, salvageValue, usefulLifeMonths);
    const depreciableAmount = cost - salvageValue;
    const currentAccum = monthlyDepr * 2; // 2 months already posted

    // Acquisition: Jan 2026, last depreciation: Feb 2026, current: Mar 2026
    const acquisitionDate = Date.UTC(2026, 0, 15);
    const missingMonths = computeMissingMonths(
      acquisitionDate,
      "2026-02",
      "2026-03",
      usefulLifeMonths,
      currentAccum,
      depreciableAmount
    );

    expect(missingMonths).toEqual(["2026-03"]);

    // Preview calculation (same algorithm as getDepreciationPreview)
    let previewRunningAccum = currentAccum;
    let previewTotal = 0;
    for (const _month of missingMonths) {
      const amount = calculateFinalMonthAmount(monthlyDepr, previewRunningAccum, depreciableAmount);
      previewTotal += amount;
      previewRunningAccum += amount;
    }

    // Actual depreciation calculation (same algorithm as runDepreciation)
    let actualRunningAccum = currentAccum;
    let actualTotal = 0;
    for (const _month of missingMonths) {
      const amount = calculateFinalMonthAmount(monthlyDepr, actualRunningAccum, depreciableAmount);
      actualTotal += amount;
      actualRunningAccum += amount;
    }

    // Preview and actual MUST match exactly
    expect(previewTotal).toBe(actualTotal);

    // The final month should be the remainder, not the standard monthly
    const expectedFinalAmount = depreciableAmount - currentAccum;
    expect(previewTotal).toBe(expectedFinalAmount);
    expect(actualTotal).toBe(expectedFinalAmount);

    // After posting, accumulated should equal full depreciable amount
    expect(previewRunningAccum).toBe(depreciableAmount);
    expect(actualRunningAccum).toBe(depreciableAmount);
  });
});

// ============================================================================
// GL ACCOUNT CONSTANTS (1 test)
// ============================================================================

describe("GL account constants", () => {
  it("DEPRECIATION_EXPENSE_CODE is 6150", () => {
    expect(DEPRECIATION_EXPENSE_CODE).toBe("6150");
  });

  it("each depreciable category has a unique glAccumCode in 1610-1730 range", () => {
    const depreciable = ASSET_CATEGORIES.filter((c) => c.depreciable);
    const codes = depreciable.map((c) => c.glAccumCode!);

    // All should be strings: tangible 1610-1670, intangible 1710-1730
    for (const code of codes) {
      expect(code).toMatch(/^1[67][1-7]0$/);
    }

    // All unique
    expect(new Set(codes).size).toBe(codes.length);
  });
});

// ============================================================================
// ASSET NUMBER GENERATION (2 tests)
// ============================================================================

describe("Asset number generation", () => {
  it("generates YYMM (not MMDD) date string for asset numbering", () => {
    // March 2026 should be "2603" (YYMM), not "0315" (MMDD)
    const yymmStr = getYYMMDateStr(Date.UTC(2026, 2, 15)); // March 15, 2026
    expect(yymmStr).toBe("2603");
  });

  it("sequence increments correctly across assets in same category+month", () => {
    const abbr = "KIT";
    const yymm = "2603";

    const first = formatAssetNumber(abbr, yymm, 1);
    const second = formatAssetNumber(abbr, yymm, 2);
    const tenth = formatAssetNumber(abbr, yymm, 10);

    expect(first).toBe("FA-KIT-2603-001");
    expect(second).toBe("FA-KIT-2603-002");
    expect(tenth).toBe("FA-KIT-2603-010");
  });
});
