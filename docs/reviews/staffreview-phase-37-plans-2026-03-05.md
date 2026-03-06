# Staff Review: Phase 37 Plans

**Date:** 2026-03-05
**Reviewer:** Staff Engineer Agent
**Phase:** 37 - Order & Dispatch Backend Simplification
**Status:** Plan Review (pre-execution)

## Summary

Phase 37 proposes extracting helpers from the three largest backend files: `orders/queries.ts` (1,279 LOC), `orders/mutations/orderCrud.ts` (1,085 LOC), and `dispatchPlanner/queries.ts` (1,226 LOC). The architectural approach is sound -- it mirrors the established `helpers/` directory pattern and preserves all Convex API paths. However, **two of the three plans have critically underestimated their LOC reduction targets**, and several frontmatter inconsistencies will confuse executors. Plan 37-03 is well-designed and will comfortably hit its target.

## Critical Issues

### C-01: Plan 37-01 cannot hit 800 LOC target -- actual reduction is ~320 LOC, leaving ~959 LOC

**Files:** `.planning/phases/37-order-dispatch-simplification/37-01-PLAN.md`, `convex/orders/queries.ts`

The plan claims a ~480 LOC reduction (1,279 to <800). Independent LOC analysis of every extraction candidate:

| Extraction | Lines Removed | Lines Added Back |
|---|---|---|
| `calculateBallStatsFromItems` (L379-407) | 29 | 0 (import) |
| `calculateProductionStatsByType` (L413-442) | 30 | 0 |
| `getStatusPriority` (L452-463) | 12 | 0 |
| `sortByPriorityComparator` (L468-491) | 24 | 0 |
| `aggregateKitchenStats` computation block (L664-791) | 128 | ~10 (call + WIB calc) |
| `calculateOrderBallCounts` ball counting (L1064-1081) | 18 | ~1 |
| Kanban `columns` const (L1112-1120) | 9 | 0 |
| Kanban result type inline (L1122-1152) | 31 | 0 |
| Kanban sorting logic (L1165-1180) | 16 | 0 |
| Kanban card mapping (L1198-1236) | 39 | ~1 |
| Import lines for new helpers | 0 | ~4 |
| **Total** | **336** | **~16** |

**Net reduction: ~320 LOC. Result: 1,279 - 320 = ~959 LOC (159 LOC over target).**

The plan's fallback ("If still over 800, look for additional extraction opportunities") lists `getPackagingOrders` (~70 LOC) and `debugProductionRecords` (~65 LOC), which would yield ~135 more LOC -- still 24 LOC short. The executor must extract ALL fallback candidates plus find ~25 more LOC to extract, which the plan does not identify.

**Recommendation:** Either lower the target to "under 950 LOC" (honest given the extraction candidates) or add explicit extraction of `getPackagingOrders` enrichment, `debugProductionRecords` enrichment, AND `getTrayInventory` (~37 LOC of enrichment logic at L977-1013) as required tasks, not fallback. Together these would reach ~820 LOC, close to target.

### C-02: Plan 37-02 cannot hit 700 LOC target -- actual reduction is ~179 LOC, leaving ~906 LOC

**Files:** `.planning/phases/37-order-dispatch-simplification/37-02-PLAN.md`, `convex/orders/mutations/orderCrud.ts`

The plan claims a ~385 LOC reduction (1,085 to <700). Independent analysis:

| Extraction | Lines Removed | Lines Added Back |
|---|---|---|
| `generateOrderNumber` local (L38-80) | 43 | ~1 |
| Customer resolution in `create` (L122-147) | 26 | ~4 |
| Customer resolution in `createDraft` (L684-707) | 24 | ~4 |
| BOM enrichment (L166-216) | 51 | ~1 |
| Item building/mapping (L218-238) | 21 | ~2 |
| Order-level discount calc (L240-248) | 9 | ~1 |
| Item-linked voucher (L273-292) | 20 | ~3 |
| Import lines for new helpers | 0 | ~3 |
| **Total** | **194** | **~19** |

**Net reduction: ~175 LOC. Result: 1,085 - 175 = ~910 LOC (210 LOC over target).**

The plan's fallback mentions `copyFromCancelled` (~112 LOC) and `updateDraft` voucher handling (~50 LOC) but both are complex mutations with unique DB-write patterns that resist clean extraction without introducing ctx-dependent helpers with substantial parameters. Even extracting both would only reach ~748 LOC, barely under 700. The extraction of `copyFromCancelled` is non-trivial because it does its own total recalculation and production record creation inline.

**Recommendation:** Revise target to "under 900 LOC" or "under 850 LOC with aggressive extraction." The 700 LOC target requires extracting more than the plan identifies, and the remaining code is tightly coupled to DB writes.

### C-03: Both 37-01 and 37-02 modify `helpers/index.ts` in Wave 1 -- merge conflict risk

**Files:** Both plans list `convex/orders/helpers/index.ts` in `files_modified` and both add `export *` lines.

Both plans are Wave 1 with `depends_on: []`. If executed in parallel (as the wave system allows), they will both append to the same 9-line file. The second merge will conflict.

**Recommendation:** Either make 37-02 depend on 37-01 (`depends_on: ["37-01"]`), or note in both plans that the executor must coordinate the barrel file edits. Alternatively, have each plan add its own export line and the conflict is trivially resolvable via git merge, but this should be called out explicitly.

## Important Improvements

### I-01: Phantom export name in 37-01 frontmatter

**File:** `.planning/phases/37-order-dispatch-simplification/37-01-PLAN.md`, line 24

The frontmatter `exports` for `kitchenEnrichment.ts` lists `aggregateCompletedTodayBalls`, but the task body (line 160) defines `calculateOrderBallCounts` instead. The executor will follow the task body, then the verification step checking frontmatter exports will fail or confuse a reviewer.

**Fix:** Change frontmatter line 24 from `"aggregateCompletedTodayBalls"` to `"calculateOrderBallCounts"`.

### I-02: Phantom export name in 37-01 frontmatter for kanbanBuilders

**File:** `.planning/phases/37-order-dispatch-simplification/37-01-PLAN.md`, line 27

The frontmatter lists `enrichOrderForKanban` as an export of `kanbanBuilders.ts`, but the task body defines `buildKanbanCard` (line 325). These are different names for the same function.

**Fix:** Change `"enrichOrderForKanban"` to `"buildKanbanCard"` in line 27.

### I-03: Incorrect query registration count in 37-01 verification

**File:** `.planning/phases/37-order-dispatch-simplification/37-01-PLAN.md`, line 429

The verification says `grep "^export const" convex/orders/queries.ts | wc -l` should be 16 (unchanged). Actual count is **19** (`getOrderProductionRecords`, `list`, `listPaginated`, `countOrders`, `get`, `getByOrderNumber`, `getKitchenOrders`, `getOrderEvents`, `getByCustomer`, `getProductSuggestions`, `getSellerSuggestions`, `getChannelSuggestions`, `getKitchenStats`, `getPackagingOrders`, `debugProductionRecords`, `getTrayInventory`, `getCompletedToday`, `listForKanban`, `getAuditTrail`). Also includes `orderStatusLiteral` which uses `const` but is not a query.

**Fix:** Change "16" to "19" (or remove the count check -- it's brittle if other phases add queries).

### I-04: Incorrect mutation registration count in 37-02 verification

**File:** `.planning/phases/37-order-dispatch-simplification/37-02-PLAN.md`, line 451

The verification says exported consts should be 11 (unchanged). Actual count is **12** (`create`, `cancel`, `remove`, `completeOrder`, `revertToConfirmed`, `updateOrderDiscount`, `completeBalls`, `createDraft`, `updateDraft`, `submitOrder`, `copyFromCancelled`, `updateDeliveryFee`).

**Fix:** Change "11" to "12".

### I-05: `buildOrderItems` near-duplicates existing `calculateOrderTotals` in `helpers.ts`

**File:** `convex/orders/helpers.ts` (lines 80-101), `37-02-PLAN.md` (proposed `buildOrderItems`)

The existing `calculateOrderTotals` in `helpers.ts` (the pure helpers file) already computes `totalAmount` and `totalCost` by iterating items and calling `calculateLineTotals`. The proposed `buildOrderItems` does the same computation PLUS returns the enriched items array. This creates a near-duplicate.

**Recommendation:** Have `buildOrderItems` internally call `calculateOrderTotals` for the totals computation, or document why the overlap is intentional (the enriched items array output is the differentiator).

### I-06: `calculateOrderLevelDiscount` overlaps with `recalculateFinalTotal` in `helpers.ts`

**File:** `convex/orders/helpers.ts` (lines 116-133), `37-02-PLAN.md` (proposed `calculateOrderLevelDiscount`)

`recalculateFinalTotal` already handles percentage-vs-amount discount calculation. The proposed `calculateOrderLevelDiscount` returns just the discount amount (not the final total), which is a valid distinct purpose, but the computation is identical. Consider whether one should delegate to the other.

### I-07: `helpers/` directory alongside `helpers.ts` -- Windows fragility for dispatchPlanner

**File:** `convex/dispatchPlanner/helpers.ts` (existing), `convex/dispatchPlanner/helpers/` (proposed)

MEMORY.md explicitly warns: "helpers/ directory alongside helpers.ts file is fragile on Windows. Node.js distinguishes them, but IDE auto-imports may resolve wrongly. Use a distinct name like queryHelpers/ when a file with the same base name exists."

The orders module already has this pattern (`orders/helpers.ts` + `orders/helpers/`) and it works. But the Phase 36 review specifically recommended `queryHelpers/` for new modules. CONTEXT.md says "Mirror the existing orders pattern" without acknowledging this lesson.

**Recommendation:** Since orders already uses `helpers/` + `helpers.ts` successfully, keep it for consistency. But add a comment to `37-03-PLAN.md` Task 1, Step 2 noting: "This creates helpers/ alongside helpers.ts. The import path `./helpers` resolves to the flat file; `./helpers/weeklyPlanBuilder` resolves to the directory child. This pattern works in Node.js/Convex. If IDE auto-import issues arise, consider renaming the directory to `queryHelpers/`."

### I-08: CONTEXT.md says "no re-export bridges" but 37-01/02 plans use barrel re-exports

**File:** `37-CONTEXT.md` does not explicitly say "no re-export bridges," but the Phase 36 review lesson says "When CONTEXT.md overrides a design doc, say so in the plan." Here, all three plans create barrel re-export files (`helpers/index.ts`), which follows the existing orders pattern. This is fine, but it contradicts the Phase 36 CONTEXT.md which said "no re-export bridges." The Phase 37 CONTEXT.md should explicitly state that barrel re-exports ARE the pattern for helpers/ directories.

**Current state:** 37-CONTEXT.md does say "Update helpers/index.ts barrel re-export" which is clear enough. No action needed beyond awareness.

## Minor Refinements

### M-01: Plan 37-01 `aggregateKitchenStats` parameter list is very long (7 params)

The proposed function takes 7 parameters. Consider grouping into fewer objects:
```typescript
aggregateKitchenStats({
  pendingOrders, completedTodayOrders,
  itemsByOrder, productionByItem,
  productionUnitTypes,
  wibDayStart: wibDayStartUtc,
  wibDayEnd: wibDayEndUtc,
})
```
This is cleaner than 7 positional arguments and less error-prone at call sites. Not a blocker.

### M-02: Plan 37-03 Task 1 creates barrel with `inventorySimulation` export before file exists

**File:** `37-03-PLAN.md`, line 213-215

The plan initially writes `export * from "./inventorySimulation"` in the barrel, then backtracks and says "Actually, create the barrel with only weeklyPlanBuilder for now." This self-contradictory instruction will confuse the executor.

**Fix:** Remove lines 210-216 and only keep lines 221-224 (the corrected version).

### M-03: Plan 37-03 `computeBallTotals` uses `ctx: { db: any }` type -- loses type safety

**File:** Plan 37-03 Task 1, proposed `computeBallTotals` signature

Using `ctx: { db: any }` is acknowledged as a Convex limitation (MEMORY.md: "Convex helper functions lose index type inference"). The existing channel assembly functions already use this pattern. However, CONTEXT.md says "Add explicit return types to all extracted helper functions." The plan provides return types for `computeBallTotals` and `simulateInventoryForDates` but not for the 4 channel assembly functions (they return `void` implicitly).

**Fix:** Add explicit `Promise<void>` return type to channel assembly function signatures in the plan.

### M-04: CHANGELOG LOC numbers correctly use TBD pattern

**File:** `37-03-PLAN.md`, lines 409-410

The plan uses `[ACTUAL] -> [ACTUAL]` placeholders for CHANGELOG LOC numbers, correctly following the Phase 36 lesson: "CHANGELOG LOC numbers should be TBD until measured." Good.

### M-05: No unit tests planned for extracted helpers

CONTEXT.md explicitly defers this: "Unit tests for the new extracted helper functions -- Phase 39 (E2E Test Foundation) is the testing phase." This is acceptable for now but should be tracked as tech debt.

## LOC Feasibility Analysis

### Plan 37-01: orders/queries.ts

| Source | Claimed Reduction | Actual Reduction | Achievable? |
|--------|-------------------|------------------|-------------|
| Kitchen enrichment locals (4 functions) | ~95 | 95 | Yes |
| `aggregateKitchenStats` block | ~130 | ~118 (128 removed, 10 added) | Yes |
| `calculateOrderBallCounts` | ~18 | ~17 | Yes |
| Kanban builders (const+type+sort+card) | ~95 | ~90 (95 removed, 5 added) | Yes |
| Import overhead | -5 | -4 | Yes |
| **Total net** | **~480** | **~316** | **NO -- gap of 164 LOC** |
| **Resulting LOC** | **<800** | **~963** | **MISS** |

Even with fallback extractions (`getPackagingOrders` ~70 LOC, `debugProductionRecords` ~65 LOC), result would be ~828. Still above 800.

### Plan 37-02: orders/mutations/orderCrud.ts

| Source | Claimed Reduction | Actual Reduction | Achievable? |
|--------|-------------------|------------------|-------------|
| `generateOrderNumber` | ~43 | ~42 | Yes |
| Customer resolution dedup (2 copies) | ~45 | ~42 | Yes |
| BOM enrichment | ~51 | ~50 | Yes |
| Item building + discount + voucher | ~50 | ~47 | Yes |
| Import overhead | -5 | -6 | Yes |
| **Total net** | **~385** | **~175** | **NO -- gap of 210 LOC** |
| **Resulting LOC** | **<700** | **~910** | **MISS** |

Even with `copyFromCancelled` extraction (~90 LOC net), result would be ~820. Still 120 above target.

### Plan 37-03: dispatchPlanner/queries.ts

| Source | Claimed Reduction | Actual Reduction | Achievable? |
|--------|-------------------|------------------|-------------|
| Interface definitions to types.ts | ~49 | 49 | Yes |
| 4 channel assembly functions | ~530 | ~525 (532 removed, 7 added) | Yes |
| BOM ball computation block | ~47 | ~44 | Yes |
| `simulateInventory` handler body | ~300 | ~295 | Yes |
| Import overhead | -10 | -10 | Yes |
| **Total net** | **~430** | **~903** | **YES -- exceeds claim** |
| **Resulting LOC** | **<800** | **~323** | **HIT (comfortably)** |

Plan 37-03 actually under-claims its reduction. The four channel assembly functions alone (532 LOC) plus simulateInventory (301 LOC) already reduce by 833 LOC. The plan's "~430 LOC" claim in the objective was calculated incorrectly.

## Wave Parallelism Assessment

All three plans are Wave 1 with no dependencies. Actual conflicts:

| File | Modified by | Conflict Risk |
|------|-------------|---------------|
| `convex/orders/helpers/index.ts` | 37-01, 37-02 | **HIGH** -- both append export lines |
| `convex/orders/queries.ts` | 37-01 only | None |
| `convex/orders/mutations/orderCrud.ts` | 37-02 only | None |
| `convex/dispatchPlanner/queries.ts` | 37-03 only | None |

37-01 and 37-02 conflict on `helpers/index.ts`. Resolution is trivial (both add a line), but the executor must be aware. 37-03 is fully independent.

**Recommendation:** Run 37-03 in parallel with either 37-01 or 37-02, but sequence 37-01 before 37-02 (or vice versa) to avoid the barrel conflict.

## Documentation Update Assessment

- CHANGELOG.md: Handled correctly by 37-03 with TBD LOC numbers
- API_REFERENCE.md: Handled by 37-03 for dispatch planner helpers; 37-01 and 37-02 do NOT update API_REFERENCE.md for the new order helpers -- should they?
- CONTEXT.md deferred decisions are all covered

## Requirements Coverage

| Requirement | Plan | Coverage | Status |
|-------------|------|----------|--------|
| BFS-04: orders/queries.ts <800 LOC | 37-01 | Extraction planned, LOC target at risk | **AT RISK** |
| BFS-05: orderCrud.ts <700 LOC | 37-02 | Extraction planned, LOC target at risk | **AT RISK** |
| BFS-06: dispatchPlanner/queries.ts <800 LOC | 37-03 | Extraction planned, target comfortably achievable | OK |

## Verdict

**APPROVE WITH CONDITIONS**

The conditions are:

1. **[MUST] Revise LOC targets for 37-01 and 37-02.** Either:
   - Lower targets to achievable numbers (37-01: <950, 37-02: <900), or
   - Add explicit extraction tasks for the fallback candidates (not optional "if still over" guidance), identifying enough code to actually hit the original targets.

2. **[MUST] Fix phantom export names in 37-01 frontmatter.** Change `aggregateCompletedTodayBalls` to `calculateOrderBallCounts` and `enrichOrderForKanban` to `buildKanbanCard`.

3. **[MUST] Fix incorrect registration counts.** 37-01: 16 -> 19 queries. 37-02: 11 -> 12 mutations.

4. **[SHOULD] Address `helpers/index.ts` merge conflict between 37-01 and 37-02.** Add `depends_on: ["37-01"]` to 37-02, or document the trivial conflict resolution.

5. **[SHOULD] Clean up the self-contradictory barrel export instruction in 37-03 Task 1** (lines 210-224).

6. **[NICE] Consider using object parameter for `aggregateKitchenStats`** (7 positional params is high).

---

*Review generated: 2026-03-05*
*Files examined: 37-01-PLAN.md, 37-02-PLAN.md, 37-03-PLAN.md, 37-CONTEXT.md, ROADMAP.md, REQUIREMENTS.md, orders/queries.ts (1,279 LOC), orderCrud.ts (1,085 LOC), dispatchPlanner/queries.ts (1,226 LOC), orders/helpers.ts, orders/helpers/index.ts, dispatchPlanner/helpers.ts, CODE_STYLE.md*
