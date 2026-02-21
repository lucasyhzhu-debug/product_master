---
phase: 20-production-ingredient-tracking-and-cogs
plan: 01
subsystem: database
tags: [convex, schema, bom, cogs, hierarchy, dfs]

requires:
  - phase: 16-inventory-management
    provides: componentTypes table, inventory batch tracking
provides:
  - productionComponentLinks table for hierarchical BOM
  - productionComponentIngredients table for direct ingredient links
  - componentTypes COGS fields (batchSize, cogsMode, cachedCalculatedCogs)
  - ingredients ingredientComponentTypeId field
  - hierarchyTraversal utility (wouldCreateCycle, traverseHierarchy, collectLeafIngredients)
affects: [20-02, 20-03, 20-04, 20-05, 20-06]

tech-stack:
  added: []
  patterns: [hierarchical-bom-traversal, dfs-cycle-detection, batch-size-conversion]

key-files:
  created:
    - convex/lib/hierarchyTraversal.ts
  modified:
    - convex/schema.ts

key-decisions:
  - "Used new Set(visited) per branch in DFS to avoid cross-branch false positives"
  - "batchSize conversion: childUnits = (qty * multiplier) / batchSize when batchSize > 0"

patterns-established:
  - "Hierarchy traversal pattern: recursive DFS with visited set and maxDepth guard"
  - "COGS cache pattern: cogsMode (manual/calculated), cachedCalculatedCogs, cogsMissingCount"

duration: 2min
completed: 2026-02-17
---

# Phase 20 Plan 01: Schema & Hierarchy Traversal Summary

**Two new BOM tables (productionComponentLinks, productionComponentIngredients) with 7 COGS fields on componentTypes and DFS-based hierarchy traversal utility enforcing max depth 3**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T10:46:14Z
- **Completed:** 2026-02-17T10:48:11Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added productionComponentLinks and productionComponentIngredients tables to schema with parent/child and component/ingredient indexes
- Extended componentTypes with batchSize, batchSizeUnit, cogsMode, manualUnitCostIdr, cachedCalculatedCogs, cogsCacheUpdatedAt, cogsMissingCount fields
- Extended ingredients table with ingredientComponentTypeId for inventory tracking link
- Created hierarchyTraversal.ts with cycle detection, recursive traversal, and leaf ingredient collection

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema extensions -- new tables + componentTypes fields** - `e669c78` (feat)
2. **Task 2: Hierarchy traversal utility with circular reference detection** - `c636be7` (feat)

## Files Created/Modified
- `convex/schema.ts` - Two new tables + componentTypes COGS fields + ingredients extension
- `convex/lib/hierarchyTraversal.ts` - wouldCreateCycle, traverseHierarchy, collectLeafIngredients

## Decisions Made
- Used new Set(visited) per branch in DFS traversal to prevent cross-branch false positives in cycle detection
- batchSize conversion formula: when child has batchSize > 0, childUnits = (quantityPerUnit * quantityMultiplier) / batchSize

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema foundation ready for Plan 02 (CRUD mutations for production component recipes)
- hierarchyTraversal utility ready for integration in Plans 04-05 (COGS calculation)
- No blockers

## Self-Check: PASSED

All files exist. All commit hashes verified.

---
*Phase: 20-production-ingredient-tracking-and-cogs*
*Completed: 2026-02-17*
