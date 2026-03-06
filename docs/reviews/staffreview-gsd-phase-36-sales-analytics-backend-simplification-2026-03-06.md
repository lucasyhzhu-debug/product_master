---
type: staffreview
phase: 36
branch: gsd/phase-36-sales-analytics-backend-simplification
date: 2026-03-06
reviewer: staff-engineer-agent
base: c7a3a1b (main)
head: 8e4975b
---

# Staff Review: Phase 36 -- Sales & Analytics Backend Simplification

## Summary

Phase 36 is a mechanical backend refactoring that decomposes two oversized query files (`externalData/queries.ts` at 1,832 LOC and `k3martCockpit/queries.ts` at 985 LOC) by extracting pure computation logic into dedicated helper modules. Additionally, three shared modules were created in `convex/lib/` to eliminate duplicated confidence types, WIB timezone helpers, and the `sourceToPlatform()` function.

The implementation faithfully executes the three-plan structure (36-01: shared helpers, 36-02: externalData extraction, 36-03: k3martCockpit extraction). All six requirement IDs (BSH-01/02/03, BFS-01/02/03) are satisfied. The LOC targets are met: `externalData/queries.ts` landed at 1,387 (target: <1,400), `k3martCockpit/queries.ts` at 760 (target: <750, missed by 10), and `incomeStatement.ts` at 686 (target: ~696). All 684 tests pass, `npm run type-check` and `npm run build` are clean, and zero Convex API paths were changed.

The main concerns are: (1) an out-of-scope bug fix commit (`5dfcd12`) mixed into this pure refactoring branch, (2) the CHANGELOG omits the largest single extraction (externalData helpers), (3) six functions labeled "pure" in documentation actually mutate their input parameters, and (4) ten new helper files were created but zero new unit tests were added. The prior review from 2026-03-05 identified all of these except the mutation count is higher than originally reported. None are blocking, but items 1-3 should be fixed before merge.

## Critical Issues

**(None)**

No critical issues found. The refactoring is behavior-preserving, all verification gates pass, and the dependency graph is clean (no circular imports, no re-export bridges, all helpers import only from `convex/lib/` and `convex/_generated/`).

## Improvements

### IMP-01: Out-of-scope commit on the refactoring branch (CARRIED FROM PRIOR REVIEW)

**Commit `5dfcd12`** (`fix: autoMatchMenuProduct now checks externalProductMappings first`) adds +58 LOC of new mutation logic to `convex/externalData/mutations.ts`, including a new `backfillMappingsToRevenueItems` internal mutation. This is a bug fix, not a refactoring. It was identified in the prior review and has not been addressed.

This commit should either be cherry-picked to its own `fix/auto-match-menu-product` branch or at minimum documented in the CHANGELOG as a bug fix (separate from the refactoring section).

**Why it matters:** Mixing feature/fix changes with pure refactoring undermines the "safe revert" guarantee. If the refactoring needs reverting, the bug fix goes with it.

**Status:** UNRESOLVED from prior review.

### IMP-02: CHANGELOG missing externalData/queries.ts helper extraction (CARRIED FROM PRIOR REVIEW)

The CHANGELOG lists six refactoring bullets but omits the single largest change: extracting 5 helper modules from `externalData/queries.ts` (1,832 -> 1,387 LOC, -24.3%). The k3martCockpit extraction is listed with LOC numbers, but the externalData extraction is not.

Add a line such as:
```
- Extracted dashboard, time-series, lifetime, sell-through, and restock helpers from `externalData/queries.ts` into `helpers/` directory (1,832 -> 1,387 LOC, -24.3%)
```

**Status:** UNRESOLVED from prior review.

### IMP-03: Six functions labeled "pure" actually mutate their input parameters (EXPANDED FROM PRIOR REVIEW)

The prior review identified 3 mutating functions. A deeper audit finds 6 total:

| Function | File | Mutation |
|----------|------|----------|
| `buildSellThroughProducts` | `externalData/helpers/sellThroughHelpers.ts:48-61` | Calls `productMap.set()` to add stock-only products |
| `accumulateSnapshotStock` | `k3martCockpit/queryHelpers/stockHelpers.ts:253-261` | Calls `stockMap.set()` on input map |
| `enrichMappingPrices` | `k3martCockpit/queryHelpers/stockHelpers.ts:267-277` | Mutates `mapping.snapshotPrice` in-place |
| `fillAutoSuggest` | `k3martCockpit/queryHelpers/dispatchHelpers.ts:205-231` | Adds entries to `planCells` in-place |
| `buildPlanCellsAndTotals` | `k3martCockpit/queryHelpers/dispatchHelpers.ts:145-196` | Mutates `outletResult.subtotalByDay` (line 183) |
| `buildProductionReadinessMap` | `k3martCockpit/queryHelpers/stockHelpers.ts:176-225` | Creates and returns map, but mutates entries via `existing.plannedToday +=` |

The module-level headers claim "Pure functions that transform..." in both `stockHelpers.ts` (line 3), `dispatchHelpers.ts` (line 3), and `sellThroughHelpers.ts` (line 3). Individual function docs vary -- `fillAutoSuggest` correctly says "Mutates planCells in-place" but the others do not.

**Recommendation:** Replace "Pure functions" in module headers with "Helper functions" for files containing mutating functions. For `buildSellThroughProducts`, either clone the map at function entry or update the JSDoc to say "mutates productMap in-place."

### IMP-04: k3martCockpit/queries.ts at 760 LOC, 10 lines over the 750 target

The plan specified "<750 LOC" as the target. The actual result is 760. This is a near miss and not functionally significant, but the plan compliance matrix should note it. The remaining functions (`getProductionReadiness`, `getInventorySources`, `getOutletDetail`, `getStockMovementHistory`, `getOutletSettings`) are all heavily ctx-dependent, so further extraction under the "pure extraction" constraint would yield diminishing returns.

**Recommendation:** Accept as-is. Update the CHANGELOG to reflect the actual number (760, not a rounded-down estimate).

## Refinements

### REF-01: No unit tests for any of the 10 new helper files (CARRIED FROM PRIOR REVIEW)

Phase 36 creates 10 new files:
- `convex/lib/confidence.ts` (18 LOC)
- `convex/lib/periodRange.ts` (WIB helpers added: 43 LOC)
- `convex/lib/externalSource.ts` (sourceToPlatform added: 15 LOC)
- `convex/externalData/helpers/dashboardHelpers.ts` (122 LOC)
- `convex/externalData/helpers/lifetimeHelpers.ts` (87 LOC)
- `convex/externalData/helpers/restockHelpers.ts` (139 LOC)
- `convex/externalData/helpers/sellThroughHelpers.ts` (126 LOC)
- `convex/externalData/helpers/timeSeriesHelpers.ts` (42 LOC)
- `convex/k3martCockpit/queryHelpers/stockHelpers.ts` (277 LOC)
- `convex/k3martCockpit/queryHelpers/dispatchHelpers.ts` (231 LOC)

Only one test file was modified: `sourceToPlatform.test.ts` (import path update). Zero new test files were created.

The existing 684 tests provide integration coverage via parent query tests, but the stated benefit of extraction is testability. The pure functions (`aggregatePeriodRevenue`, `computeLifetimeTotals`, `buildK3MartOutletProducts`, `bucketKey`, `formatBucketLabel`, `worstConfidence`) are now directly testable without Convex mocking. A follow-up phase should add targeted tests.

Priority targets for testing:
1. `computeLifetimeTotals` -- BOM ball counting with fallback logic
2. `aggregatePeriodRevenue` -- multi-channel aggregation with internal order discount correction
3. `buildK3MartOutletProducts` -- demand-to-stock merging with edge cases (demand-only, stock-only products)
4. `worstConfidence` -- simple but foundational

### REF-02: `buildStockAndPriceMaps` returns arrays of tuples instead of Maps (CARRIED FROM PRIOR REVIEW)

`stockHelpers.ts:103-120` returns `{ stockEntries: Array<[string, number]>; priceEntries: Array<[string, number]> }` instead of `Map<string, number>` directly. The caller at `k3martCockpit/queries.ts:220-229` then iterates the arrays to populate Maps. Returning Maps directly would eliminate the intermediate data structure and the manual iteration loop.

### REF-03: `as string` casts on Convex Id fields in lifetimeHelpers.ts (CARRIED FROM PRIOR REVIEW)

`lifetimeHelpers.ts` uses `ct._id as string`, `comp.componentTypeId as string`, and `comp.menuProductId as string` (lines 38, 45-47, 60). Convex `Id<T>` is already usable as a Map key and in Set operations. These casts are carried over from the original code and are technically unnecessary.

### REF-04: `buildPlanCellsAndTotals` uses `.find()` in a loop (CARRIED FROM PRIOR REVIEW)

`dispatchHelpers.ts:179`: `outletResults.find()` is called inside the `for (const plan of plans)` loop. For P plans and O outlets this is O(P*O). Current data volumes (<100 outlets, <1000 plans) make this negligible, but a pre-built Map keyed by `outletId` would be O(P + O).

### REF-05: `PlanRecord.source` and `PlanRecord.destination` type includes `null`

In `dispatchHelpers.ts:46-47`, `PlanRecord` has `source?: string | null` and `destination?: string | null`. The `PlanCell` interface (line 34) uses `source?: string` and `destination?: string`. The conversion at line 174 (`plan.source ?? undefined`) bridges the gap. This is inherited from the original code (Convex stores null for optional fields), not introduced by the extraction.

### REF-06: WIB formatting helpers added to `periodRange.ts` have no dedicated tests

The `periodRange.test.ts` file only tests `calculatePeriodRange`. The 5 new functions (`utcToWibDateStr`, `isWeekend`, `getIsoWeekNumber`, `utcToWibMonthStr`, `utcToWibHourStr`) are untested directly. They are exercised indirectly through query integration tests, but edge cases (midnight boundary, year crossover for week numbering) are not covered.

## Plan Compliance Matrix

| Requirement | Plan | Implementation | Status |
|---|---|---|---|
| **BSH-01**: Extract Confidence type to shared module | 36-01 Task 1 | `convex/lib/confidence.ts` created with `Confidence`, `CONFIDENCE_RANK`, `worstConfidence()`. `incomeStatement.ts` imports from shared module, zero local definitions remain. | PASS |
| **BSH-02**: Consolidate WIB helpers to periodRange.ts | 36-01 Task 2 | 5 helpers added to `convex/lib/periodRange.ts`. Zero local WIB helper definitions remain in `externalData/queries.ts`. | PASS |
| **BSH-03**: Move sourceToPlatform to externalSource.ts | 36-01 Task 3 | `sourceToPlatform` moved to `convex/lib/externalSource.ts`. All 3 importers updated directly (no re-export bridges). Test file updated. | PASS |
| **BFS-01**: Split externalData/queries.ts | 36-02 Tasks 1-4 | 5 helper files created in `externalData/helpers/`. `queries.ts` reduced from 1,832 to 1,387 LOC (under 1,400 target). | PASS |
| **BFS-02**: Split k3martCockpit/queries.ts | 36-03 Tasks 1-2 | 2 helper files in `queryHelpers/`. `queries.ts` reduced from 985 to 760 LOC (10 over 750 target). | NEAR MISS (+10 LOC) |
| **BFS-03**: Update incomeStatement imports | 36-01 T1/T3 + 36-03 T3 | `incomeStatement.ts` imports `Confidence`/`worstConfidence` from `../lib/confidence`, `sourceToPlatform` from `../lib/externalSource`. Zero local duplicates. | PASS |
| No re-export bridges (CONTEXT.md) | All plans | All importers updated directly. No `export { x } from "old/path"` patterns. | PASS |
| Pure extraction / zero logic changes (CONTEXT.md) | All plans | Functions moved as-is. Only structural change: `aggregate()` closure became pure `aggregatePeriodRevenue` with pre-fetched `orderDataMap`. | PASS |
| Module-level header comments (CONTEXT.md) | All plans | All 7 new helper files have module-level header comments. | PASS |
| Zero Convex API path changes | All plans | All `query()`/`internalQuery()` registrations remain in original files. | PASS |
| `queryHelpers/` naming (Windows safety) | 36-03 | Correctly uses `queryHelpers/` to avoid collision with existing `helpers.ts` on case-insensitive filesystems. | PASS |
| `npm run type-check` passes | All plans | Verified clean. | PASS |
| `npm run build` passes | All plans | Verified clean. | PASS |
| `npm run test` passes | All plans | 684 tests, 0 failures. | PASS |
| CHANGELOG updated | 36-03 Task 3 | Updated but missing externalData extraction line. | PARTIAL |

## LOC Verification

| File | Before (base c7a3a1b) | After (head 8e4975b) | Target | Delta | Status |
|---|---|---|---|---|---|
| `convex/externalData/queries.ts` | 1,832 | 1,387 | < 1,400 | -445 (-24.3%) | PASS |
| `convex/k3martCockpit/queries.ts` | 985 | 760 | < 750 | -225 (-22.8%) | NEAR MISS (+10) |
| `convex/reports/incomeStatement.ts` | 706 | 686 | ~696 | -20 (-2.8%) | PASS |

**New files created (total: 1,042 LOC across 7 helper files + 3 shared lib additions):**

| File | LOC | Purpose |
|---|---|---|
| `convex/externalData/helpers/dashboardHelpers.ts` | 122 | Dashboard period aggregation |
| `convex/externalData/helpers/lifetimeHelpers.ts` | 87 | BOM ball count / hero card |
| `convex/externalData/helpers/restockHelpers.ts` | 139 | K3Mart + demand-based restock builders |
| `convex/externalData/helpers/sellThroughHelpers.ts` | 126 | Sell-through product analysis |
| `convex/externalData/helpers/timeSeriesHelpers.ts` | 42 | Time bucket key/label formatting |
| `convex/k3martCockpit/queryHelpers/stockHelpers.ts` | 277 | Stock summary, settings, readiness |
| `convex/k3martCockpit/queryHelpers/dispatchHelpers.ts` | 231 | Dispatch grid, auto-suggest |
| `convex/lib/confidence.ts` | 18 | Shared confidence type + ranking |
| `convex/lib/periodRange.ts` additions | +43 | WIB date formatting helpers |
| `convex/lib/externalSource.ts` additions | +15 | sourceToPlatform function |

## Prior Review Findings Disposition

The prior staff review (2026-03-05) identified 5 improvements and 5 refinements. Here is their current status:

| Prior Finding | Status | Notes |
|---|---|---|
| IMP-01: Out-of-scope commit | **UNRESOLVED** | Commit `5dfcd12` still on branch |
| IMP-02: CHANGELOG missing externalData extraction | **UNRESOLVED** | Still missing |
| IMP-03: `buildSellThroughProducts` mutates productMap | **UNRESOLVED** | Plus 2 additional mutating functions found |
| IMP-04: Module headers claim "pure" incorrectly | **UNRESOLVED** | `fillAutoSuggest` JSDoc is correct, but 5 others are not |
| REF-01: `as string` casts in lifetimeHelpers | **UNRESOLVED** | Cosmetic, acceptable |
| REF-02: No unit tests for new helpers | **UNRESOLVED** | Acceptable as follow-up |
| REF-03: `buildStockAndPriceMaps` returns tuple arrays | **UNRESOLVED** | Minor inefficiency |
| REF-04: `.find()` in loop (O(n*m)) | **UNRESOLVED** | Not a problem at current scale |
| REF-05: PlanRecord null vs undefined types | **UNRESOLVED** | Inherited from original code |
| I2: Simpler Promise.all pattern for dashboard | **RESOLVED** | Lines 556-561 use the clean pattern |

## Test Coverage Assessment

**What is tested:**
- `sourceToPlatform` function: 10 tests covering all 8 known sources + fallback + empty string (via `sourceToPlatform.test.ts` at new import path)
- `calculatePeriodRange`: 13 tests covering all presets (via `periodRange.test.ts`)
- All parent queries: integration coverage via 684 existing tests across 39 test files

**What is NOT tested (new helper functions):**
- `worstConfidence` (confidence.ts) -- no test
- `utcToWibDateStr`, `isWeekend`, `getIsoWeekNumber`, `utcToWibMonthStr`, `utcToWibHourStr` (periodRange.ts) -- no tests
- `aggregatePeriodRevenue` (dashboardHelpers.ts) -- no test
- `computeLifetimeTotals` (lifetimeHelpers.ts) -- no test
- `buildK3MartOutletProducts`, `buildDemandProducts` (restockHelpers.ts) -- no tests
- `countDayTypes`, `buildSellThroughProducts` (sellThroughHelpers.ts) -- no tests
- `bucketKey`, `formatBucketLabel` (timeSeriesHelpers.ts) -- no tests
- `buildOutletProducts`, `buildStockAndPriceMaps`, `buildProductSettings`, `buildProductionReadinessMap`, `aggregateStockByMenuProduct`, `accumulateSnapshotStock`, `enrichMappingPrices` (stockHelpers.ts) -- no tests
- `aggregatePreviousWeek`, `buildOutletProductRows`, `buildPlanCellsAndTotals`, `fillAutoSuggest` (dispatchHelpers.ts) -- no tests

**Assessment:** The extraction was correctly scoped as "pure extraction, zero logic changes," so existing integration tests provide full behavioral coverage. However, the primary stated benefit of extraction is testability. The ROI of extraction is only partially realized until targeted unit tests are added for the pure helper functions. This should be a near-term follow-up.

## Architectural Assessment

### Strengths

1. **Clean dependency graph.** All 7 helper modules import only from `convex/lib/` and `convex/_generated/`. No helpers import from sibling query files. Zero circular dependency risk confirmed via grep.

2. **Consistent extraction pattern.** The `helpers/` and `queryHelpers/` directory conventions match the existing `orders/helpers/` precedent. New developers will find the pattern familiar.

3. **Pragmatic ctx handling.** Functions that can be pure receive pre-fetched data. The `aggregatePeriodRevenue` conversion from async closure to pure function (pre-fetching `orderDataMap` via `Promise.all`) is a textbook extraction that also simplified the calling pattern.

4. **Windows-safe directory naming.** Using `queryHelpers/` instead of `helpers/` to avoid collision with `helpers.ts` on case-insensitive filesystems shows attention to the target development environment.

5. **No API surface changes.** All Convex function registrations remain in their original files. The generated `api.d.ts` has no new or removed entries for `externalData` or `k3martCockpit`.

### Concerns

1. **"Pure function" labeling is broadly incorrect.** Six of the extracted functions mutate their input parameters. While this matches the original code's behavior, the documentation claims are misleading and could cause confusion when writing unit tests.

2. **Out-of-scope mutation on the branch.** The `autoMatchMenuProduct` fix is unrelated to backend simplification and muddies the branch's purpose.

3. **No unit test payoff yet.** Without follow-up tests, the extraction is purely organizational (still valuable, but the full ROI is unrealized).

## Verdict

**APPROVE WITH CONDITIONS**

The implementation is solid, well-structured, and faithfully executes the plan. All verification gates pass. Three conditions should be addressed before merge:

1. **IMP-01:** Either cherry-pick commit `5dfcd12` to its own branch, or document it as a separate bug fix in the CHANGELOG.
2. **IMP-02:** Add the missing CHANGELOG line for the externalData helper extraction.
3. **IMP-03:** Update module headers that claim "Pure functions" to say "Helper functions" where mutation occurs (at minimum: `stockHelpers.ts`, `dispatchHelpers.ts`, `sellThroughHelpers.ts`).

All other findings (REF-01 through REF-06) are acceptable for follow-up and should not block merge.

---

*Reviewed: 2026-03-06*
*Phase: 36-sales-analytics-backend-simplification*
*Branch: gsd/phase-36-sales-analytics-backend-simplification*
