---
phase: 260407-p1w
reviewed: 2026-04-07T18:36:00Z
depth: deep
files_reviewed: 6
files_reviewed_list:
  - convex/externalData/__tests__/lifetimeHelpers.test.ts
  - convex/externalData/helpers/lifetimeHelpers.ts
  - convex/externalData/queries.ts
  - src/components/salesAnalytics/HeroCards.tsx
  - src/components/salesAnalytics/overviewUtils.ts
  - src/hooks/convex/useExternalData.ts
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Phase 260407-p1w: Code Review Report

**Reviewed:** 2026-04-07T18:36:00Z
**Depth:** deep
**Files Reviewed:** 6
**Status:** clean

## Summary

The "Pieces Sold" hero card implementation is well-structured and correct. The new `computePiecesSold` helper cleanly extracts the BOM-resolution logic from `computeLifetimeTotals`, the type chain from backend through hooks to components is consistent, and all edge cases (zero revenue, missing BOM, unlinked items, growth-from-zero) are properly handled.

### Correctness Analysis

1. **BOM resolution is correct.** Filters `componentTypes` by `category === "production"`, builds a `menuProductId -> ballCount` map from `menuProductComponents`, then multiplies by item quantity. Packaging components are correctly excluded.

2. **Revenue source consistency.** `computePiecesSold` receives `periodGrossRevenue` summed from `externalRevenue.revenueGross` records (line 587-588 in queries.ts), which matches the same revenue baseline used by item-level `totalPrice` for `avgRevenuePerBall` calculation. This keeps the numerator and denominator internally consistent, even though `aggregatePeriodRevenue` adjusts internal order gross via real order lookups. The comment on line 586 correctly explains this design choice.

3. **Fallback behavior.** When no BOM-linked items exist (cold start), falls back to `FALLBACK_REVENUE_PER_BALL = 35,000` IDR -- consistent with the existing `computeLifetimeTotals` behavior documented in CLAUDE.md.

4. **Edge cases handled:**
   - Zero items + zero revenue -> returns 0 (line 140-141)
   - Negative `periodGrossRevenue` (refunds) -> returns 0 (same guard)
   - Missing `linkedMenuProductId` -> item skipped, uses estimation (line 129)
   - BOM exists but no production components -> `ballsPerProduct` is undefined, item skipped (line 130-131)

### Type Safety Analysis

The type chain is consistent across all layers:
- **Backend** (`queries.ts` line 612, 618): `totalPiecesSold: number` added via spread to both `currentPeriod` and `previousPeriod`
- **Hook** (`useExternalData.ts` line 22): `PeriodSummary.totalPiecesSold?: number` (optional to match spread pattern)
- **Frontend type** (`overviewUtils.ts` line 30): `PeriodData.totalPiecesSold?: number`
- **Component** (`HeroCards.tsx` line 142, 145-146): Uses `?? 0` fallback for both display and growth comparison

The `optional` typing in the hook/frontend is appropriate since the backend always provides the field now, but the `?? 0` guards protect against older cached data or action failures.

### UI Edge Cases

- **0 pieces, 0 previous:** `GrowthIndicator` shows "0%" with dash icon (line 13-20 in GrowthIndicator.tsx)
- **Current > 0, previous = 0:** Shows "New" label (line 21-27) -- correct for first-period data
- **Both > 0:** Shows percentage change with arrow -- standard behavior

### Test Coverage

4 test cases cover the key paths: linked items with mixed BOM, empty data, all-unlinked fallback, and dynamic avgRevenuePerBall estimation with mixed linked/unlinked items. Coverage is sufficient for the pure function.

All reviewed files meet quality standards. No critical or warning issues found.

## Info

### IN-01: BOM-building logic duplicated between computeLifetimeTotals and computePiecesSold

**File:** `convex/externalData/helpers/lifetimeHelpers.ts:34-49` and `convex/externalData/helpers/lifetimeHelpers.ts:109-134`
**Issue:** The `productionComponentIds` set construction and `menuProductBallCount` map building (~15 lines) plus the `knownRevenue/knownBalls` accumulation loop (~10 lines) are duplicated between the two functions. Both functions also share the `avgRevenuePerBall` fallback logic.
**Fix:** Could extract a shared helper like `buildBallCountMap(bomComponents, componentTypes)` and `computeAvgRevenuePerBall(items, ballCountMap)`. However, the duplication is small (~25 lines), the functions are co-located in the same file, and the extraction would add indirection for modest benefit. Acceptable as-is for v1 -- flag for future consolidation if a third consumer appears.

---

_Reviewed: 2026-04-07T18:36:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
