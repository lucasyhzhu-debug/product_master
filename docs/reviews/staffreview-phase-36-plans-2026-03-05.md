# Staff Review: Phase 36 Implementation Plans

**Date:** 2026-03-05
**Reviewer:** Senior/Principal Engineer (automated)
**Scope:** Plans 36-01, 36-02, 36-03 for Phase 36 — Sales & Analytics Backend Simplification
**Requirements:** BSH-01, BSH-02, BSH-03, BFS-01, BFS-02, BFS-03
**Branch:** `feature/simplify-sales-analytics`

---

## Summary

Phase 36 plans describe a mechanical code extraction: move duplicated helpers (confidence, WIB timezone, sourceToPlatform) into shared `convex/lib/` modules, then split two large query files (`externalData/queries.ts` at 1,832 LOC and `k3martCockpit/queries.ts` at 985 LOC) by extracting aggregation logic into `helpers/` directories. The plans are well-structured with precise line references, copy-paste-ready code, and clear verification steps.

**Verdict:** Plans are safe to execute with a few targeted corrections. The main risks are an aggressive LOC target for `k3martCockpit/queries.ts` (aiming for <500 but realistic extraction yields ~300-350 LOC moved), a contradiction between the design doc (which specifies re-export bridges) and CONTEXT.md (which says no re-export bridges), and the evolving analysis in Plan 36-02 that may confuse an autonomous executor.

---

## Critical Issues

### C1: Design doc says "barrel re-exports for backward compat," CONTEXT.md says "no re-export bridges" — plans follow CONTEXT.md but design doc not updated

**Files:** `docs/plans/2026-03-03-sales-analytics-simplification-design.md` (line 20: "Barrel re-exports — all existing import paths must continue working"), `36-CONTEXT.md` (line 27: "Update ALL importers directly — no re-export bridges")

The design doc lists as a constraint: "Barrel re-exports — all existing import paths must continue working." The original implementation plan (Task 3) says: "Keep `export { sourceToPlatform } from '../lib/externalSource';` as a re-export so any other file importing from here still works."

But the Phase 36 CONTEXT.md explicitly overrides this: "Update ALL importers directly — no re-export bridges for backward compatibility." Plan 36-01 Task 3 correctly follows CONTEXT.md (removes from queries.ts, updates all importers to new path).

This is safe because `sourceToPlatform` only has 2 backend importers (`externalData/queries.ts` itself and `reports/incomeStatement.ts`), plus the test file. No external consumers exist. However, the contradiction should be documented so the executor does not second-guess the approach if they read the design doc.

**Recommendation:** Add a one-liner note to Plan 36-01 Task 3 clarifying: "Design doc mentions re-export bridges, but CONTEXT.md decision supersedes this — only 2 importers exist, all updated directly."

### C2: Plan 36-02's <1,000 LOC target for externalData/queries.ts requires uncertain sell-through extraction

**Files:** `36-02-PLAN.md` (lines 63-83), `convex/externalData/queries.ts` (lines 1158-1486)

The plan's own analysis shows the math does not add up to reach <1,000 LOC with the first three tasks:
- Plan 36-01 removes ~90 LOC (WIB helpers + sourceToPlatform)
- Task 1 (dashboard): ~106 LOC
- Task 2 (time-series + lifetime): ~83 LOC
- Total: ~279 LOC removed -> 1,832 - 279 = ~1,553

The plan acknowledges this ("To push below 1,000, we need to extract the sell-through product analysis builder") and adds Task 3 for sell-through extraction, estimating ~240 LOC. Even with this: 1,553 - 240 = ~1,313. The plan then revises to include more sell-through code + restock helpers, reaching 610 LOC extracted, but the must_haves checklist still says "under 1,000 LOC."

The sell-through function (`getChannelSellThrough`, lines 1158-1486) is heavily ctx-dependent — it fetches from 5 different tables with conditional branches based on `args.channel`. Only the final product list builder (lines 1406-1467, ~62 LOC) and the `ProductAnalysis` type + `getOrCreate` factory (lines 1226-1255, ~30 LOC) are pure. Plus the weekday/weekend counting loop (lines 1170-1178, ~9 LOC). That is ~101 LOC extractable, not the ~240 claimed.

Realistic extraction total: 90 (36-01) + 106 (dashboard) + 83 (time-series + lifetime) + 101 (sell-through) = ~380 LOC. Result: 1,832 - 380 = ~1,452. This is far from <1,000.

**Recommendation:** Revise the LOC target to <1,300 (realistic) or acknowledge in the plan that <1,000 may require extracting `getRevenueByOutletInternal` (94 LOC, lines 1656-1749, partially pure once data is fetched) and/or the entire `getRestockOverviewInternal` (lines 759-1037, ~278 LOC) which has substantial pure computation after the data fetching phase. The executor needs clear guidance on what to extract if the target is not met after Task 3, rather than the vague "Use Claude's discretion to extract enough to hit the target."

---

## Important Improvements

### I1: Plan 36-02 analysis section is a stream-of-consciousness narrative that will confuse an executor

**Files:** `36-02-PLAN.md` (lines 34-83)

The analysis section contains three revisions of the extraction strategy: first estimating ~400-500 LOC, then realizing it is only ~380, then adding sell-through, then revising the sell-through estimate upward. An autonomous executor reading top-to-bottom will encounter contradictory numbers and unclear guidance.

**Recommendation:** Replace the analysis section with a single definitive extraction list with realistic LOC estimates. Move the "revised analysis" narrative to a design rationale section or delete it. The task descriptions (Tasks 1-3) are already clear — the analysis section should summarize, not narrate.

### I2: Plan 36-02 Task 1 makes `aggregate()` pure but the current implementation is async (calls `fetchInternalOrderDataMap`)

**Files:** `36-02-PLAN.md` (Task 1), `convex/externalData/queries.ts` (lines 538-643)

The plan correctly identifies that `aggregate()` is async because it calls `fetchInternalOrderDataMap(ctx, internalRecords)` at line 569. The refactoring approach (pre-fetch `orderDataMap` in the caller, pass as parameter to a pure synchronous `aggregatePeriodRevenue`) is sound.

However, the plan's code example wraps each call in an `async () => {}` IIFE inside `Promise.all`, which is unnecessary since `fetchInternalOrderDataMap` is already being called before `aggregatePeriodRevenue`. The simpler pattern would be:

```typescript
const [currentOrderDataMap, previousOrderDataMap] = await Promise.all([
  fetchInternalOrderDataMap(ctx, currentRevenue),
  fetchInternalOrderDataMap(ctx, previousRevenue),
]);
const currentAgg = aggregatePeriodRevenue(currentRevenue, currentOrderDataMap);
const previousAgg = aggregatePeriodRevenue(previousRevenue, previousOrderDataMap);
```

This is cleaner and avoids unnecessary IIFE closures.

**Recommendation:** Simplify the caller pattern in Plan 36-02 Task 1 to fetch both order data maps in parallel, then call the pure function synchronously.

### I3: Plan 36-03's <500 LOC target for k3martCockpit/queries.ts requires extracting ~485 LOC — this is over-ambitious

**Files:** `36-03-PLAN.md` (lines 56-64), `convex/k3martCockpit/queries.ts` (985 LOC)

The plan identifies best extraction candidates totaling ~150-200 LOC, then says "Revised approach: To reach <500, we need more aggressive extraction" and targets ~500 LOC extracted. The realistic pure-computation blocks are:

- `getOutletStockSummaryInternal` product builder (lines 105-138): ~34 LOC
- `getWeeklyDispatchPlans` outlet product building (lines 301-344): ~44 LOC
- `getWeeklyDispatchPlans` plan cell aggregation (lines 362-410): ~49 LOC
- `getWeeklyDispatchPlans` auto-suggest (lines 413-432): ~20 LOC
- `getWeeklyDispatchPlans` prev week aggregation (lines 270-282): ~13 LOC
- `getOutletSettings` product settings builder (lines 956-971): ~16 LOC
- Type declarations and intermediate variable setup: ~30 LOC

Total extractable: ~206 LOC. Result: 985 - 206 = ~779.

To reach <500, the plan would need to extract `getProductionReadiness` deficit calculation (ctx-dependent, needs `ctx.db.get` for menu product names) and `getInventorySources` aggregation (also ctx-dependent). Forcing these into pure functions means passing 5+ pre-fetched data maps as arguments, which trades file length for function signature complexity.

**Recommendation:** Revise the target to <700 LOC (realistic with pure extraction only) and note that <500 would require ctx-dependent extraction (passing ctx or pre-fetched maps), which contradicts the "pure extraction for testability" design goal.

### I4: Plan 36-03 CHANGELOG LOC reduction claims are inflated

**Files:** `36-03-PLAN.md` (lines 203-204)

The CHANGELOG entry claims "~830 LOC reduction" for externalData and "~485 LOC reduction" for k3martCockpit. These numbers represent best-case estimates and should be finalized after execution, not pre-written. The executor should update these numbers to reflect actual line counts.

**Recommendation:** Mark the CHANGELOG LOC numbers as `TBD` in the plan and instruct the executor to fill in actual numbers from `wc -l` after all extractions.

### I5: Design doc's `bomResolver.ts` extraction is absent from all three plans — intentional scope cut but not documented

**Files:** `docs/plans/2026-03-03-sales-analytics-simplification-design.md` (Part 1b, lines 41-48), all plan files

The design doc proposes `convex/lib/bomResolver.ts` as a shared module, deduplicating BOM resolution from `incomeStatement.ts`, `externalData/queries.ts`, and `k3martCockpit/mutations.ts`. None of the three plans include this extraction. The CONTEXT.md does not mention it either.

This appears to be an intentional scope cut (CONTEXT.md says "COGS resolution helpers stay where they are"), but the gap between design doc and plans is not explicitly called out.

**Recommendation:** Add a "Deferred from design doc" note in Plan 36-01 or CONTEXT.md: "bomResolver.ts extraction deferred — COGS resolution patterns are sufficiently different across consumers to not benefit from a shared module at current scale."

---

## Minor Refinements

### M1: Plan 36-01 Task 2 line references may drift if Task 1 modifies incomeStatement.ts first

**Files:** `36-01-PLAN.md` (Task 2), `convex/reports/incomeStatement.ts`

Task 1 modifies `incomeStatement.ts` (removes lines 24, 119-129). Task 2 then references line numbers in `externalData/queries.ts` which is unaffected. However, if an executor runs verification between tasks and makes any adjustments, the line numbers in Task 2 may drift. Since Tasks are sequential and the plan says "each task builds on previous," this is low risk but worth noting.

**Recommendation:** The line references are accurate as of the current snapshot. No change needed, but the executor should use string-matching (grep for function names) rather than relying solely on line numbers.

### M2: Plan 36-02 Task 2 imports `bucketKey as getBucketKey` — unnecessary aliasing

**Files:** `36-02-PLAN.md` (Task 2, Step 2)

The import `import { bucketKey as getBucketKey, formatBucketLabel } from "./helpers/timeSeriesHelpers"` renames `bucketKey` to `getBucketKey`. Since the local `bucketKey` closure will be removed, there is no name conflict. The alias adds cognitive overhead.

**Recommendation:** Import as `bucketKey` directly (no alias). The local closure is being deleted, so no naming conflict exists.

### M3: Plan 36-02 Task 2 exports `Granularity` type but then Plan 36-02 casts `args.granularity as Granularity`

**Files:** `36-02-PLAN.md` (Task 2)

The Convex args validator already ensures `args.granularity` is one of the four valid literals. Casting to `Granularity` is unnecessary if the type is defined correctly. A better approach: define the `Granularity` type in the helper file and use it in the Convex query args type validation — but since Convex validators generate their own types, the cast is pragmatic.

**Recommendation:** Accept the cast as pragmatic. No change needed.

### M4: Plan 36-01 Task 3 should verify `getRevenueTimeSeries` also uses `sourceToPlatform`

**Files:** `convex/externalData/queries.ts` (line 1644)

`sourceToPlatform` is used at line 1644 in `getRevenueTimeSeries` and at line 1738 in `getRevenueByOutletInternal` (via local function reference). After Plan 36-01 Task 3, these references will still work because `sourceToPlatform` is being imported at the file's top-level from `../lib/externalSource`. The plan correctly handles this (Task 3 Step 2 adds the import). But the plan only mentions removing the local definition and updating 2 importers. The fact that `sourceToPlatform` is used ~4 more times within the same file (queries.ts) is fine since the import replaces the local definition, but worth confirming in the executor's mind.

**Recommendation:** No change to the plan needed — the import replaces the local definition, so all in-file usages automatically resolve.

### M5: Plan 36-03 creates `helpers/` directory alongside existing `helpers.ts` — works but unusual

**Files:** `convex/k3martCockpit/helpers.ts`, proposed `convex/k3martCockpit/helpers/`

Having both `helpers.ts` (file) and `helpers/` (directory) is unusual and can cause confusion. The `orders/` module already uses this pattern successfully in this codebase, so it is an established precedent. However, the plan should note this explicitly to prevent the executor from being surprised.

**Recommendation:** Add a note to Plan 36-03 Task 1: "This mirrors the established `convex/orders/helpers.ts` + `convex/orders/helpers/` pattern already in the codebase."

### M6: Plan 36-02 creates 4 helper files but original plan lists `restockHelpers.ts` in `files_modified` — not actually created

**Files:** `36-02-PLAN.md` frontmatter (line 13)

The frontmatter lists `restockHelpers.ts` as a file to be created, but the tasks only create `dashboardHelpers.ts`, `timeSeriesHelpers.ts`, `lifetimeHelpers.ts`, and `sellThroughHelpers.ts`. The restock helpers extraction was part of the initial analysis but was dropped in favor of sell-through extraction. The frontmatter is stale.

**Recommendation:** Remove `convex/externalData/helpers/restockHelpers.ts` from the frontmatter `files_modified` list.

---

## Nitpicks

### N1: Plan 36-02 Task 2 `computeLifetimeTotals` casts `ct._id as string` and `comp.componentTypeId as string`

These casts are copied from the original source code. They work but are unnecessary — Convex IDs are already strings at runtime. Low priority but could be cleaned up in a future pass.

### N2: Design doc estimates `externalData/queries.ts` will slim to ~300 LOC; plans target <1,000

The design doc (Part 2a) says the slim orchestrator will be ~300 LOC. The plans are far more conservative at <1,000. The design doc estimate was unrealistic — it assumed extracting all enrichment, aggregation, and revenue helper logic, which the plans correctly decided against for ctx-dependent functions. No action needed, but the design doc's estimate should not be treated as a contract.

### N3: Plan 36-03 CHANGELOG date says `2026-03-05` but design doc says `2026-03-03`

The CHANGELOG template in Plan 36-03 uses `2026-03-05` (the current date), which is correct since this is when the changes will be made. The design doc's original plan used `2026-03-03`. No conflict — just different dates for different artifacts.

### N4: Plan 36-01 Task 1 type export uses `export type Confidence` — Convex supports this but verify `isolatedModules`

TypeScript `export type` is safe in Convex. The project uses TypeScript 5.9 which handles type-only exports correctly. No issue.

### N5: The `WIB_OFFSET_HOURS` constant will exist in both `periodRange.ts` (line 26, unexported) and the new `WIB_OFFSET_MS` (derived, also unexported)

After Plan 36-01, `periodRange.ts` will have `const WIB_OFFSET_HOURS = 7;` (existing, unexported) and `const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;` (new, unexported). Both are module-private. This is clean — no redundancy since `WIB_OFFSET_MS` is derived from `WIB_OFFSET_HOURS`.

---

## Plan-to-Design Fidelity Summary

| Design Doc Item | Plan Coverage | Status |
|-----------------|---------------|--------|
| 1a. `periodRange.ts` WIB helpers | Plan 36-01 Task 2 | Covered |
| 1b. `bomResolver.ts` | Not in scope | Intentional cut (undocumented) |
| 1c. `confidence.ts` | Plan 36-01 Task 1 | Covered |
| 2a. Split `externalData/queries.ts` | Plan 36-02 (all tasks) | Covered (LOC target unrealistic) |
| 2b. Split `k3martCockpit/queries.ts` | Plan 36-03 Tasks 1-2 | Covered (LOC target unrealistic) |
| 2c. Slim `incomeStatement.ts` | Plan 36-01 T1/T3 + Plan 36-03 T3 | Covered |
| 3a. `src/lib/timezoneHelpers.ts` | Not in scope | Correctly deferred to Phase 38 (FFS-01) |
| 4a. Split `OverviewTab.tsx` | Not in scope | Correctly deferred to Phase 38 (FFS-01) |
| `sourceToPlatform` shared module | Plan 36-01 Task 3 | Covered |

## Requirements Coverage

| Requirement | Plan | Covered | Risk |
|-------------|------|---------|------|
| BSH-01 | 36-01 Task 1 | Yes | Low |
| BSH-02 | 36-01 Task 2 | Yes | Low |
| BSH-03 | 36-01 Task 3 | Yes | Low |
| BFS-01 | 36-02 | Yes | Medium (LOC target) |
| BFS-02 | 36-03 Tasks 1-2 | Yes | Medium (LOC target) |
| BFS-03 | 36-01 T1/T3 + 36-03 T3 | Yes | Low |

---

## Overall Assessment

Phase 36 plans are **safe to execute with corrections**. The plans follow established patterns (orders/helpers precedent), maintain API path stability, and correctly identify pure-computation extraction candidates. The three critical issues are: (1) design doc vs CONTEXT.md contradiction on re-exports needs documenting, (2) `externalData/queries.ts` <1,000 LOC target is unrealistic and should be revised to <1,300, and (3) `k3martCockpit/queries.ts` <500 LOC target is unrealistic and should be revised to <700.

Plan 36-01 (shared helpers) is the strongest plan — precise, mechanically verifiable, low risk. Plans 36-02 and 36-03 (file splits) need their LOC targets adjusted to avoid the executor over-extracting ctx-dependent code or spending cycles on diminishing returns.

**Risk Rating:** Low-Medium (pure refactoring, no schema/API changes, but LOC targets need calibration)

---

*Review completed: 2026-03-05*
