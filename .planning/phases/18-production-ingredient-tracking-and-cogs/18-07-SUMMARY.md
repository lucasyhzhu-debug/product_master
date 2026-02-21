---
phase: 20-production-ingredient-tracking-and-cogs
plan: 07
subsystem: database
tags: [convex, cogs, hierarchy, inventory, dispatch-planner, schema]

# Dependency graph
requires:
  - phase: 20-production-ingredient-tracking-and-cogs
    provides: hierarchyTraversal.ts, productionComponentLinks, productionComponentIngredients tables, componentTypes schema with cogsMode/manualUnitCostIdr
provides:
  - traverseHierarchy cost-leaf branch returning synthetic cost entries for manual-cost children
  - createComponentAndReceiveStock accepting production category with gramsPerUnit
  - dispatchPlans.outletId union type accepting both externalOutlets and dispatchConsignmentOutlets IDs
affects: [20-08, 20-09, dispatch-planner, ingredient-inventory, cogs-calculation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cost-leaf detection: check child has no ingredients AND no sub-links before recursing hierarchy"
    - "Category canonicalization: production passes through, legacy packaging variants map to packaging"
    - "Schema union type for cross-table ID references in dispatchPlans.outletId"

key-files:
  created: []
  modified:
    - convex/lib/hierarchyTraversal.ts
    - convex/inventory/mutations.ts
    - convex/schema.ts
    - convex/dispatchPlanner/mutations.ts

key-decisions:
  - "Cost-leaf uses isCostLeaf (no ingredients + no sub-links) OR cogsMode=manual to synthesize entry from stored unit cost"
  - "manualUnitCostIdr ?? unitCostIdr as fallback chain for stored cost in synthetic entries"
  - "Canonicalize category in createComponentAndReceiveStock rather than accepting only canonical values"
  - "Remove type cast in removeConsignmentOutlet now that outletId union type is correct in schema"

patterns-established:
  - "Synthetic IngredientUsage: cast childComponentId as unknown as Id<ingredients> for COGS summation (no DB lookup on ID in cost path)"
  - "consumptionStage defaults differ by category: production=undefined, packaging=boxing"

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 20 Plan 07: UAT Gap Closure - Three Backend Bug Fixes Summary

**Three backend data-layer bugs patched: hierarchy traversal cost-leaf for manual-cost sub-components, inventory receive-stock accepting production category, and dispatch plan outletId union type for consignment outlets**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-17T15:16:49Z
- **Completed:** 2026-02-17T15:19:34Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- traverseHierarchy now emits synthetic cost entries for children with no ingredients and no sub-links (or cogsMode=manual), fixing incomplete auto-COGS for manual-cost sub-components
- createComponentAndReceiveStock accepts production category and gramsPerUnit, enabling ingredient componentTypes to be created via the Receive Stock UI
- dispatchPlans.outletId in schema.ts and savePlanCell validator now accept IDs from both externalOutlets and dispatchConsignmentOutlets, unblocking consignment outlet dispatch plan saves

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix traverseHierarchy cost-leaf branch** - `e2a7327` (fix)
2. **Task 2: Extend createComponentAndReceiveStock for production** - `b8c9c1b` (fix)
3. **Task 3: Fix dispatchPlans outletId union type** - `cf8e7d4` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `convex/lib/hierarchyTraversal.ts` - Added cost-leaf detection + synthetic IngredientUsage entries before recursive call
- `convex/inventory/mutations.ts` - Added production literal to category validator, gramsPerUnit arg, canonicalized category/consumptionStage
- `convex/schema.ts` - dispatchPlans.outletId changed from v.id("externalOutlets") to v.union of both outlet tables
- `convex/dispatchPlanner/mutations.ts` - savePlanCell validator updated to match schema union; removed type cast in removeConsignmentOutlet

## Decisions Made
- Used `isCostLeaf || cogsMode === "manual"` to handle both truly empty children and explicitly manual-cost components
- manualUnitCostIdr ?? unitCostIdr as cost fallback chain (manual override first, then stored COGS)
- consumptionStage for production category defaults to undefined (not "boxing") since production components don't consume at boxing stage
- Type cast `(p.outletId as unknown as string) === (args.outletId as string)` removed in removeConsignmentOutlet since union type now makes comparison type-safe

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed incorrect type cast in removeConsignmentOutlet**
- **Found during:** Task 3 (dispatchPlanner/mutations.ts review)
- **Issue:** removeConsignmentOutlet compared outletId with type cast `as unknown as string` due to schema type mismatch
- **Fix:** Now that outletId is union type, comparison `p.outletId === args.outletId` is type-safe — cast removed
- **Files modified:** convex/dispatchPlanner/mutations.ts
- **Verification:** npm run type-check passes
- **Committed in:** cf8e7d4 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug cleanup)
**Impact on plan:** Auto-fix was a direct consequence of the schema fix. No scope creep.

## Issues Encountered
None - all three bugs were straightforward targeted fixes as described in the plan.

## User Setup Required
None - no external service configuration required. Schema change (additive union type) is safe for existing records.

## Next Phase Readiness
- Three UAT bugs resolved: auto-COGS for manual-cost children, ingredient inventory creation, and dispatch plan saving
- Ready for 20-08 and 20-09 gap closure plans
- Build passes (tsc + vite) with zero TypeScript errors

---
*Phase: 20-production-ingredient-tracking-and-cogs*
*Completed: 2026-02-17*

## Self-Check: PASSED

- FOUND: convex/lib/hierarchyTraversal.ts
- FOUND: convex/inventory/mutations.ts
- FOUND: convex/schema.ts
- FOUND: convex/dispatchPlanner/mutations.ts
- FOUND: .planning/phases/20-production-ingredient-tracking-and-cogs/20-07-SUMMARY.md
- FOUND: e2a7327 (Task 1 commit)
- FOUND: b8c9c1b (Task 2 commit)
- FOUND: cf8e7d4 (Task 3 commit)
