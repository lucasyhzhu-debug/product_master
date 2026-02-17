---
phase: 20-production-ingredient-tracking-and-cogs
plan: 02
subsystem: api
tags: [convex, mutations, queries, cogs, bom, cost-cascade, production-recipes]

requires:
  - phase: 20-01
    provides: schema tables (productionComponentLinks, productionComponentIngredients), hierarchyTraversal utility
provides:
  - productionRecipes CRUD mutations (sub-component + ingredient links)
  - COGS recalculation internal mutation with lazy caching
  - Recipe queries (getRecipeForComponent, calculateCogs, getComponentsWithTiers)
  - Cost invalidation cascade from ingredients through production component hierarchy
  - cogsMode toggle (manual/calculated) with manual fallback preservation
affects: [20-03, 20-04, 20-05, 20-06]

tech-stack:
  added: []
  patterns: [lazy-cogs-recalculation, cost-cascade-upward, cogsmode-toggle-with-fallback]

key-files:
  created:
    - convex/productionRecipes/mutations.ts
    - convex/productionRecipes/queries.ts
  modified:
    - convex/componentTypes/mutations.ts
    - convex/lib/costInvalidation.ts
    - convex/ingredients/mutations.ts

key-decisions:
  - "recalculateComponentCogs only writes to componentTypes table (forward-only COGS: historical orders keep original costs)"
  - "Cost invalidation walks upward via productionComponentLinks.by_child to cascade stale markers"
  - "cogsMode toggle preserves manualUnitCostIdr as fallback when switching to calculated"

patterns-established:
  - "Production recipe CRUD pattern: mutation triggers scheduler.runAfter(0, recalculateComponentCogs)"
  - "Cost cascade pattern: ingredient change -> mark stale -> walk parents -> schedule recalc for calculated-mode components"

duration: 4min
completed: 2026-02-17
---

# Phase 20 Plan 02: Production Recipe CRUD & COGS Calculation Summary

**Production recipe CRUD with sub-component and ingredient linking, lazy COGS recalculation via hierarchy traversal, and upward cost invalidation cascade from ingredient changes**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T10:50:41Z
- **Completed:** 2026-02-17T10:54:19Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created productionRecipes module with 7 mutations (6 user-facing + 1 internal) and 3 queries
- Circular reference prevention and max depth 3 enforcement on sub-component addition
- Lazy COGS recalculation triggered on every composition change, with missing ingredient count tracking
- Cost invalidation cascade: ingredient cost changes walk upward through BOM hierarchy to recalculate all affected components
- cogsMode toggle between manual and calculated, preserving manual value as fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Production recipe CRUD mutations + queries** - `e4f3818` (feat)
2. **Task 2: Extend componentTypes mutations + cost invalidation cascade** - `0c64966` (feat)

## Files Created/Modified
- `convex/productionRecipes/mutations.ts` - 6 user mutations + 1 internal (recalculateComponentCogs) + depth helpers
- `convex/productionRecipes/queries.ts` - getRecipeForComponent, calculateCogs, getComponentsWithTiers
- `convex/componentTypes/mutations.ts` - Extended create/update with batchSize, batchSizeUnit, cogsMode toggle
- `convex/lib/costInvalidation.ts` - Added invalidateProductionComponentCosts with upward cascade
- `convex/ingredients/mutations.ts` - Extended update to also schedule production component cost invalidation

## Decisions Made
- recalculateComponentCogs only patches componentTypes fields (cachedCalculatedCogs, cogsCacheUpdatedAt, cogsMissingCount, unitCostIdr) -- never writes to orderItems or orders, preserving forward-only COGS
- Cost invalidation uses BFS-style upward walk through productionComponentLinks.by_child to find all parent components
- cogsMode toggle saves current unitCostIdr to manualUnitCostIdr before switching to calculated, restores from it when switching back to manual

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Production recipe CRUD ready for frontend integration in Plans 04-05
- Cost invalidation cascade complete, ingredient changes auto-propagate through BOM
- No blockers

## Self-Check: PASSED

All files exist. All commit hashes verified.

---
*Phase: 20-production-ingredient-tracking-and-cogs*
*Completed: 2026-02-17*
