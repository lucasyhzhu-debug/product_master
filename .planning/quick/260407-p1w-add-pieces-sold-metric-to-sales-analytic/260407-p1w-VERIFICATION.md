---
phase: 260407-p1w
verified: 2026-04-07T18:32:00Z
status: human_needed
score: 4/4
overrides_applied: 0
human_verification:
  - test: "Open Sales Analytics page, verify Pieces Sold card appears between Delivery Fees and lifetime section"
    expected: "Card shows a number with GrowthIndicator, changes when period filter changes"
    why_human: "Visual rendering and period filter interaction cannot be verified programmatically"
---

# Quick Task 260407-p1w: Add Pieces Sold Metric Verification Report

**Task Goal:** Add pieces sold metric to sales analytics with BOM-resolved component counts filtered by date range
**Verified:** 2026-04-07T18:32:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Sales Analytics hero section shows a Pieces Sold card with BOM-resolved ball count for the selected period | VERIFIED | HeroCards.tsx lines 134-153: "Pieces Sold" card renders `currentPeriod.totalPiecesSold` with `CircleDot` icon. Backend `computePiecesSold` in lifetimeHelpers.ts resolves BOM via `menuProductComponents` + `componentTypes` (category=production). |
| 2 | Pieces Sold card shows period-over-period growth comparison via GrowthIndicator | VERIFIED | HeroCards.tsx lines 144-147: `<GrowthIndicator current={currentPeriod.totalPiecesSold ?? 0} previous={previousPeriod.totalPiecesSold ?? 0} />` |
| 3 | Items without linkedMenuProductId use estimation fallback (periodGross / avgRevenuePerBall) | VERIFIED | lifetimeHelpers.ts lines 136-141: `avgRevenuePerBall = knownBalls > 0 ? knownRevenue / knownBalls : FALLBACK_REVENUE_PER_BALL` (35000). Test "uses fallback (35000) for all unlinked items" passes. Test "uses dynamic avgRevenuePerBall from linked items for estimation" passes. |
| 4 | Lifetime Balls Sold card remains unchanged in the bottom lifetime section | VERIFIED | Git diff 709aab34..4af960e7 shows only a 21-line insertion (the new Pieces Sold card). Lifetime "Balls Sold" card at lines 158-171 is untouched. 16/16 existing lifetimeBallCount tests pass. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/externalData/helpers/lifetimeHelpers.ts` | `computePiecesSold` reusable helper | VERIFIED | 143 lines. Function exported at line 102, 42-line implementation with BOM resolution and fallback logic. |
| `convex/externalData/__tests__/lifetimeHelpers.test.ts` | Unit tests for computePiecesSold | VERIFIED | 103 lines. 4 test cases: linked items (7 balls), zero items, all unlinked (fallback), mixed (dynamic avg). All pass. |
| `convex/externalData/queries.ts` | `totalPiecesSold` in `getDashboardSummaryByPeriodInternal` return | VERIFIED | Lines 589-590: `computePiecesSold` called for both current/previous periods. Lines 612, 618: `totalPiecesSold` included in both `currentPeriod` and `previousPeriod` return objects. |
| `src/components/salesAnalytics/HeroCards.tsx` | Pieces Sold hero card | VERIFIED | Lines 134-153: Card with "Pieces Sold" title, `CircleDot` icon, `toLocaleString()` formatting, `GrowthIndicator`, period label subtitle. Positioned after Delivery Fees, before lifetime section. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `convex/externalData/queries.ts` | `convex/externalData/helpers/lifetimeHelpers.ts` | `import computePiecesSold` | WIRED | Line 13: `import { computeLifetimeTotals, computePiecesSold } from "./helpers/lifetimeHelpers"`. Lines 589-590: both periods call `computePiecesSold(...)`. |
| `src/components/salesAnalytics/HeroCards.tsx` | `src/components/salesAnalytics/overviewUtils.ts` | `PeriodData.totalPiecesSold` | WIRED | overviewUtils.ts line 30: `totalPiecesSold?: number` in PeriodData type. HeroCards.tsx lines 142, 145-146: reads `currentPeriod.totalPiecesSold` and `previousPeriod.totalPiecesSold`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| HeroCards.tsx | `currentPeriod.totalPiecesSold` | `getDashboardSummaryByPeriodInternal` via `computePiecesSold` | Yes -- DB queries `menuProductComponents`, `componentTypes`, `externalRevenueItems` via `fetchPeriodItems` fan-out | FLOWING |
| HeroCards.tsx | `previousPeriod.totalPiecesSold` | Same query, previous period data | Yes -- same DB queries for previous period | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| computePiecesSold tests pass | `npx vitest run convex/externalData/__tests__/lifetimeHelpers.test.ts` | 4/4 pass | PASS |
| No regression in existing lifetime tests | `npx vitest run tests/convex/lifetimeBallCount.test.ts` | 16/16 pass | PASS |
| Type check passes | `npx tsc --noEmit` | Clean exit | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PIECES-SOLD | 260407-p1w-PLAN | Add pieces sold metric to sales analytics | SATISFIED | Backend helper + query + frontend card all implemented and wired |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | - |

No TODO/FIXME/placeholder markers found in any modified files.

### Human Verification Required

### 1. Pieces Sold Card Visual and Interaction

**Test:** Open Sales Analytics page. Verify the "Pieces Sold" card appears in the hero section after the Delivery Fees card and before the lifetime section. Change the period filter (e.g., 7d, 30d, custom) and confirm the card value and growth indicator update accordingly.
**Expected:** Card shows a formatted number (e.g., "1,234") with a green/red growth indicator comparing current vs previous period. Value changes when period filter changes.
**Why human:** Visual rendering position, card styling, and period filter reactivity cannot be verified programmatically.

### Gaps Summary

No gaps found. All 4 must-have truths verified with full Level 1-4 evidence. All artifacts exist, are substantive, wired, and data flows through from DB queries to rendered UI. One human verification item remains for visual confirmation.

---

_Verified: 2026-04-07T18:32:00Z_
_Verifier: Claude (gsd-verifier)_
