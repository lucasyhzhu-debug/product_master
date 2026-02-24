---
phase: 24-ingredient-simulation-id-linking
plan: 02
subsystem: backend
tags: [dispatch-planner, simulation, ingredient-linking, convex-query]

# Dependency graph
requires:
  - phase: 24-ingredient-simulation-id-linking
    provides: kitchenDailyOverrides.source field + linkIngredientToComponentType mutation
provides:
  - "simulateInventory: ID-based ingredient lookup, returns unlinkedIngredients[]"
  - "getBallTotalsForDispatchPlanDate: new query returning bigBalls/midBalls/packagingBreakdown per date"
  - "getKitchenTargetsForDate: returns overrideSource when source is 'override'"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ingredientToComponentTypeId map pattern: build lookup map from ingredients table, use in simulation instead of name-string matching"
    - "unlinkedIngredientSet: Set<string> accumulated during simulation, returned as array for UI warning"

key-files:
  created: []
  modified:
    - convex/dispatchPlanner/queries.ts
    - convex/kitchenConfig/queries.ts

key-decisions:
  - "simulateInventory builds a full ingredientToComponentTypeId map from the ingredients table on each call — no caching needed at this scale"
  - "unlinkedIngredients returns ingredient names (not IDs) since names are what admins recognize in the UI warning"
  - "getBallTotalsForDispatchPlanDate covers both dispatch plan entries and direct-sales orders for the date"

patterns-established:
  - "ID-based simulation: load all ingredients into map, resolve by ID not name string"

requirements-completed: []

# Metrics
duration: included in phase 24 single-commit implementation
completed: 2026-02-23
---

# Phase 24 Plan 02: Backend — simulateInventory ID Upgrade + New Queries Summary

**Fixed simulateInventory to use ingredientComponentTypeId for lookup instead of name-string matching, surfaced unlinked ingredient names, and added getBallTotalsForDispatchPlanDate query**

## Performance

- **Completed:** 2026-02-23
- **Commit:** `5cd8914` — feat(24): ID-based ingredient linking, save-to-kitchen, capacity cleanup

## Accomplishments

- `convex/dispatchPlanner/queries.ts` — `simulateInventory` builds `ingredientToComponentTypeId` map from the `ingredients` table at query time; uses ID-based lookup instead of name-string matching; accumulates `unlinkedIngredientSet` (ingredients used in simulation with no `ingredientComponentTypeId`); returns `unlinkedIngredients: string[]` of their names
- `convex/dispatchPlanner/queries.ts` — new `getBallTotalsForDispatchPlanDate` query: accepts `date: string`, returns `bigBalls`, `midBalls`, `packagingBreakdown` aggregated from both dispatch plan entries and direct-sales orders for that date
- `convex/kitchenConfig/queries.ts` — `getKitchenTargetsForDate` now includes `overrideSource: "manual" | "restock_planner"` in the return shape when source is `"override"`; `dispatch_plan` and `defaults` branches omit it (correct behaviour)
- Capacity reads from `kitchenConfig + kitchenDailyOverrides` priority chain — `dispatchPlannerSettings` no longer used for capacity

## Files Created/Modified

- `convex/dispatchPlanner/queries.ts` — simulateInventory refactored + getBallTotalsForDispatchPlanDate added
- `convex/kitchenConfig/queries.ts` — overrideSource field added to getKitchenTargetsForDate return

## Decisions Made

- `unlinkedIngredients` returns names not IDs — names are recognizable to admins who need to act on the warning
- `getBallTotalsForDispatchPlanDate` covers both dispatch plan and direct-sales to give the kitchen a complete picture

## Deviations from Plan

None.

## Issues Encountered

None.
