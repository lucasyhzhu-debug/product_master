# Staff Review: Phase 36 -- Sales Analytics Backend Simplification

**Reviewer:** Staff/Principal Engineer (automated review)
**Date:** 2026-03-05
**Branch:** `gsd/phase-36-sales-analytics-backend-simplification`
**Base:** `c7a3a1b` (main) | **Head:** `8e4975b`
**Commits reviewed:** 16 (9 refactor, 1 fix, 6 docs/planning)

---

## Summary

Phase 36 accomplished its core goal: decomposing `externalData/queries.ts` (1,832 LOC baseline, 1,773 post-Phase-35) and `k3martCockpit/queries.ts` (985 LOC) by extracting pure computation logic into well-organized helper modules. The implementation faithfully follows the CONTEXT.md architectural decisions: direct imports (no re-export bridges), pure extraction (zero logic changes), and pragmatic ctx handling. All 684 tests pass, `npm run type-check` and `npm run build` are clean, and zero Convex API paths changed.

The shared-lib consolidation (Plan 36-01) is particularly clean -- `convex/lib/confidence.ts`, the WIB helpers in `periodRange.ts`, and `sourceToPlatform` in `externalSource.ts` now serve as single sources of truth, eliminating three instances of duplicated analytics infrastructure. The helper extractions (Plans 36-02 and 36-03) deliver the promised LOC reductions with thoughtful grouping into 7 new helper files totaling 1,042 LOC.

The main concern is an out-of-scope commit (`5dfcd12`) that adds new mutation logic to `externalData/mutations.ts` (+58 LOC), which is a feature-level change unrelated to backend simplification. Additionally, the CHANGELOG omits the `externalData/queries.ts` helper extraction (the largest single reduction), and several extracted "pure" functions actually mutate their parameters. None of these are blocking, but they should be addressed before merge.

---

## Critical Issues

**(None)**

No critical issues identified. The implementation is sound, all verification gates pass, and the refactoring is behavior-preserving.

---

## Improvements

### IMP-01: Out-of-scope commit on the refactoring branch

**Commit `5dfcd12`** (`fix: autoMatchMenuProduct now checks externalProductMappings first`) adds +58 LOC of new mutation logic to `convex/externalData/mutations.ts`, including a brand-new `backfillMappingsToRevenueItems` internal mutation. This is a bug fix / feature enhancement, not a refactoring. It should either:

- Be cherry-picked to its own `fix/auto-match-menu-product` branch and merged separately, or
- Be explicitly documented in the CHANGELOG as a bug fix (not a refactoring)

**Why it matters:** Mixing feature changes with pure refactoring on the same branch undermines the "safe revert" guarantee. If the refactoring needs to be reverted, the bug fix goes with it. Conversely, if the bug fix introduces a regression, reverting it takes the refactoring too.

**Files:** `convex/externalData/mutations.ts`

### IMP-02: CHANGELOG missing externalData/queries.ts helper extraction

The CHANGELOG entry lists 6 bullet points but omits the largest single change: extracting 5 helper modules from `externalData/queries.ts` (1,773 -> 1,387 LOC, -21.8%). The k3martCockpit extraction is listed with LOC numbers, but the externalData extraction is not. Add a line such as:

```
- Extracted dashboard, time-series, lifetime, sell-through, and restock helpers from `externalData/queries.ts` into `helpers/` directory (1,773 -> 1,387 LOC, -21.8%)
```

**File:** `docs/CHANGELOG.md`

### IMP-03: `buildSellThroughProducts` mutates its `productMap` parameter

The function is documented as a "pure transformation" (line 39 of `sellThroughHelpers.ts`), but lines 49-61 mutate the input `productMap` by calling `.set()` to add stock-only products. This is not pure -- the caller's map is modified as a side effect.

Options:
- (a) Clone the map at the top of the function: `const map = new Map(productMap);`
- (b) Update the JSDoc to say "mutates productMap in-place" (matching the pattern used by `fillAutoSuggest` and `accumulateSnapshotStock`)

Option (b) is sufficient since the caller doesn't reuse the map after the call, but the "pure" label is misleading.

**File:** `convex/externalData/helpers/sellThroughHelpers.ts`

### IMP-04: `accumulateSnapshotStock` and `enrichMappingPrices` are labeled pure but mutate parameters

`stockHelpers.ts` header says "Pure functions that transform pre-fetched snapshot + revenue data into display-ready objects." However:

- `accumulateSnapshotStock` (line 253) mutates the `stockMap` parameter in-place
- `enrichMappingPrices` (line 267) mutates the `mappingByCode` parameter in-place
- `fillAutoSuggest` (dispatchHelpers.ts line 205) mutates `planCells` and `outletResults` in-place

These functions are correctly documented individually with mutation-indicating signatures (`void` return type), but the module-level "pure functions" header is inaccurate. Update the module headers to say "Helper functions" instead of "Pure functions" where mutation occurs.

**Files:** `convex/k3martCockpit/queryHelpers/stockHelpers.ts`, `convex/k3martCockpit/queryHelpers/dispatchHelpers.ts`

---

## Refinements

### REF-01: `as string` casts on Convex Id fields in lifetimeHelpers.ts

`lifetimeHelpers.ts` uses `ct._id as string`, `comp.componentTypeId as string`, and `comp.menuProductId as string` (lines 38, 45-47, 60). These casts are carried over from the original code but are technically unnecessary -- Convex `Id<T>` is already assignable to `string` in Set/Map operations. The casts add noise and suppress potential type safety.

Consider removing the `as string` casts and using the typed IDs directly, or aliasing them to `string` at the function boundary for clarity.

**File:** `convex/externalData/helpers/lifetimeHelpers.ts`

### REF-02: No unit tests for any of the 8 new helper modules

The extraction creates 8 new helper files (5 in `externalData/helpers/`, 2 in `k3martCockpit/queryHelpers/`, 1 in `convex/lib/`). None have dedicated unit tests. The existing test suite (684 tests) provides integration coverage via the parent query tests, but the pure functions are now individually testable -- which was a stated benefit of the extraction.

A follow-up phase should add targeted tests for at least:
- `aggregatePeriodRevenue` (dashboardHelpers) -- complex multi-channel aggregation
- `computeLifetimeTotals` (lifetimeHelpers) -- BOM ball counting logic
- `buildSellThroughProducts` (sellThroughHelpers) -- trend/suggestion calculations
- `worstConfidence` (confidence.ts) -- simple but critical

This is explicitly a refinement, not a blocker, since the existing integration tests validate the behavior end-to-end.

### REF-03: `buildStockAndPriceMaps` returns arrays of tuples instead of Maps

`stockHelpers.ts:buildStockAndPriceMaps` returns `{ stockEntries: Array<[string, number]>; priceEntries: Array<[string, number]> }` instead of returning `Map<string, number>` directly. The caller then iterates the arrays to populate Maps:

```typescript
for (const [key, qty] of stockEntries) {
  stockByOutletProduct.set(key, qty);
}
```

This could be simplified by returning Maps directly and using `Map.prototype.forEach` or spread to merge. The current pattern works but adds unnecessary intermediate data structures.

**File:** `convex/k3martCockpit/queryHelpers/stockHelpers.ts`

### REF-04: `buildPlanCellsAndTotals` uses `.find()` in a loop (O(n*m))

In `dispatchHelpers.ts:179`, `outletResults.find()` is called inside the `for (const plan of plans)` loop. For P plans and O outlets, this is O(P*O). With current data volumes (< 100 outlets, < 1000 plans), this is fine. But if data grows, pre-building a Map keyed by `outletId` would be O(P + O).

**File:** `convex/k3martCockpit/queryHelpers/dispatchHelpers.ts`

### REF-05: `PlanRecord.source` and `PlanRecord.destination` type includes `null`

In `dispatchHelpers.ts:47`, `PlanRecord` has `source?: string | null` and `destination?: string | null`. The `PlanCell` interface (line 34) has `source?: string` and `destination?: string`. The conversion at line 174 (`plan.source ?? undefined`) bridges the gap, but the type mismatch hints at schema inconsistency (optional + nullable). This is inherited from the original code, not introduced by the extraction.

---

## Plan Compliance Matrix

| Requirement | Status | Notes |
|------------|--------|-------|
| **BSH-01**: Extract Confidence type to shared module | PASS | `convex/lib/confidence.ts` created with `Confidence`, `CONFIDENCE_RANK`, `worstConfidence()` |
| **BSH-02**: Consolidate WIB helpers to periodRange.ts | PASS | 5 helpers added to `convex/lib/periodRange.ts`; zero local WIB helpers remain in queries.ts |
| **BSH-03**: Move sourceToPlatform to externalSource.ts | PASS | Moved with direct import update to all 3 consumers (no re-export bridges) |
| **BFS-01**: Split externalData/queries.ts | PASS | 5 helper files created; queries.ts reduced from 1,773 to 1,387 LOC (under 1,400 target) |
| **BFS-02**: Split k3martCockpit/queries.ts | PASS | 2 helper files in `queryHelpers/`; queries.ts reduced from 985 to 760 LOC (10 over 750 target) |
| **BFS-03**: Update incomeStatement imports | PASS | Imports `Confidence` from `../lib/confidence`, `sourceToPlatform` from `../lib/externalSource` |
| No re-export bridges (CONTEXT.md) | PASS | All importers updated directly |
| Pure extraction / zero logic changes (CONTEXT.md) | PASS | Functions moved as-is. Only change: `async` removed from `aggregatePeriodRevenue` (planned) |
| Module-level header comments (CONTEXT.md) | PASS | All 8 new files have header comments |
| Zero Convex API path changes | PASS | All `query()`/`internalQuery()` registrations remain in original files |
| `npm run type-check` passes | PASS | Verified clean |
| `npm run build` passes | PASS | Verified clean (CSS warning only, unrelated) |
| `npm run test` passes | PASS | 684 tests, 0 failures |
| CHANGELOG updated | PARTIAL | Missing externalData extraction line (see IMP-02) |
| `queryHelpers/` naming (Windows safety) | PASS | Correctly avoids `helpers/` collision with existing `helpers.ts` |

---

## LOC Analysis

| File | Baseline (pre-Phase-35) | Post-Phase-35 | Post-Phase-36 | Target | Delta | Status |
|------|------------------------|---------------|---------------|--------|-------|--------|
| `convex/externalData/queries.ts` | 1,832 | 1,773 | **1,387** | < 1,400 | -386 (-21.8%) | PASS |
| `convex/k3martCockpit/queries.ts` | 985 | 985 | **760** | < 750 | -225 (-22.8%) | NEAR MISS (+10) |
| `convex/reports/incomeStatement.ts` | 706 | 706 | **686** | ~696 | -20 (-2.8%) | PASS |

**New files created:**

| File | LOC | Purpose |
|------|-----|---------|
| `convex/externalData/helpers/dashboardHelpers.ts` | 122 | Dashboard period aggregation |
| `convex/externalData/helpers/lifetimeHelpers.ts` | 87 | BOM ball count / hero card |
| `convex/externalData/helpers/restockHelpers.ts` | 139 | K3Mart + demand-based restock builders |
| `convex/externalData/helpers/sellThroughHelpers.ts` | 126 | Sell-through product analysis |
| `convex/externalData/helpers/timeSeriesHelpers.ts` | 42 | Time bucket key/label formatting |
| `convex/k3martCockpit/queryHelpers/stockHelpers.ts` | 277 | Stock summary, settings, readiness |
| `convex/k3martCockpit/queryHelpers/dispatchHelpers.ts` | 231 | Dispatch grid, auto-suggest |
| `convex/lib/confidence.ts` | 18 | Shared confidence type + ranking |
| **Total new helper LOC** | **1,042** | |

**Net LOC change:** +1,192 added, -781 removed = +411 net. However, +58 of the additions are the out-of-scope `mutations.ts` fix, and the rest of the net increase is documentation/planning files. The actual code refactoring is approximately LOC-neutral by design (extraction, not deletion).

---

## Architectural Assessment

### Strengths

1. **Clean dependency graph**: All 7 helper modules import only from `convex/lib/` and `convex/_generated/`. No helpers import from sibling query files. Zero circular dependency risk.

2. **Consistent extraction pattern**: The `helpers/` and `queryHelpers/` directory conventions match the existing `orders/helpers/` precedent. New developers will find the pattern familiar.

3. **Pragmatic ctx handling**: Functions that can be pure receive pre-fetched data. The `aggregatePeriodRevenue` conversion from async closure to pure function (pre-fetching `orderDataMap`) is a textbook extraction.

4. **Type exports are clean**: `ProductAnalysis`, `Granularity`, `OutletResult`, `PlanRecord`, `ReadinessData` types are exported from helpers and imported as types where appropriate.

5. **Windows-safe directory naming**: Using `queryHelpers/` instead of `helpers/` to avoid collision with `helpers.ts` on case-insensitive filesystems shows attention to the target development environment.

### Concerns

1. **"Pure function" labeling is inconsistent**: Three helper functions (`accumulateSnapshotStock`, `enrichMappingPrices`, `fillAutoSuggest`) mutate their input parameters. The module headers claim "pure functions" which is technically false. This is a documentation issue, not a correctness issue.

2. **Out-of-scope mutation on the branch**: The `autoMatchMenuProduct` fix and `backfillMappingsToRevenueItems` mutation are not related to backend simplification. This muddies the branch's purpose.

3. **No unit test payoff yet**: The primary benefit of extraction is testability. Without follow-up tests, the extraction is purely organizational (still valuable, but the full ROI is unrealized).

---

## Verdict

**Ship with fixes**

The implementation is solid, well-structured, and faithfully executes the plan. All verification gates pass. The two improvements that should be addressed before merge are:

1. **IMP-01**: Separate or document the out-of-scope `mutations.ts` commit
2. **IMP-02**: Add the missing CHANGELOG line for externalData helper extraction

The remaining improvements (IMP-03, IMP-04) and refinements are nice-to-have and can be addressed in a follow-up.

---

*Reviewed: 2026-03-05*
*Phase: 36-sales-analytics-backend-simplification*
*Branch: gsd/phase-36-sales-analytics-backend-simplification*
