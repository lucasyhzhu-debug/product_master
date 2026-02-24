---
phase: 24-ingredient-simulation-id-linking
plan: 04
subsystem: frontend
tags: [dispatch-planner, ingredients-manager, hooks, save-to-kitchen]

# Dependency graph
requires:
  - phase: 24-ingredient-simulation-id-linking
    provides: setDailyOverride with source + getBallTotalsForDispatchPlanDate + linkIngredientToComponentType
provides:
  - "SaveTargetButton: per-day 'Save targets for kitchen' button in DispatchPlanner calendar header"
  - "LinkIngredientButton: admin mapping UI in IngredientsManager for unlinked ingredients"
  - "useGetBallTotalsForDate, useSetKitchenDailyOverride, useLinkIngredientToComponentType hooks"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "renderColumnAction prop pattern: PlannerGrid accepts ReactNode factory per date — grid stays unaware of Save to Kitchen semantics"

key-files:
  created: []
  modified:
    - src/pages/DispatchPlanner.tsx
    - src/pages/IngredientsManager.tsx
    - src/hooks/convex/useDispatchPlanner.ts
    - src/hooks/convex/useIngredients.ts
    - src/hooks/convex/index.ts

key-decisions:
  - "SaveTargetButton lives in DispatchPlanner.tsx as a local component using renderColumnAction prop — loose coupling with PlannerGrid"
  - "LinkIngredientButton shown only for ingredients with no ingredientComponentTypeId — admin-only action"

patterns-established:
  - "renderColumnAction prop: allows DispatchPlanner to inject per-column header actions into PlannerGrid without grid knowing about kitchen overrides"

requirements-completed: []

# Metrics
duration: included in phase 24 single-commit implementation
completed: 2026-02-23
---

# Phase 24 Plan 04: Frontend Pages + Hooks — Save to Kitchen + Link Ingredient Summary

**Added per-day 'Save targets for kitchen' button to DispatchPlanner, LinkIngredientButton to IngredientsManager, and all supporting hooks**

## Performance

- **Completed:** 2026-02-23
- **Commit:** `5cd8914` — feat(24): ID-based ingredient linking, save-to-kitchen, capacity cleanup

## Accomplishments

- `src/pages/DispatchPlanner.tsx` — `SaveTargetButton` component added; renders per date column via `renderColumnAction` prop on `PlannerGrid`; calls `useSetKitchenDailyOverride` with `source: "restock_planner"` and full packaging breakdown from `getBallTotalsForDispatchPlanDate`
- `src/pages/IngredientsManager.tsx` — `LinkIngredientButton` component renders for ingredients without `ingredientComponentTypeId`; opens dialog for admin to select a `componentType` and call `useLinkIngredientToComponentType`; unlinked rows visually distinct (no "Tracked" badge, action buttons shown instead)
- `src/hooks/convex/useDispatchPlanner.ts` — `useGetBallTotalsForDate(date)` and `useSetKitchenDailyOverride()` hooks added
- `src/hooks/convex/useIngredients.ts` — `useLinkIngredientToComponentType()` hook added
- `src/hooks/convex/index.ts` — new hooks exported

## Files Created/Modified

- `src/pages/DispatchPlanner.tsx` — SaveTargetButton + renderColumnAction integration
- `src/pages/IngredientsManager.tsx` — LinkIngredientButton + unlinked ingredient indicator
- `src/hooks/convex/useDispatchPlanner.ts` — useGetBallTotalsForDate + useSetKitchenDailyOverride
- `src/hooks/convex/useIngredients.ts` — useLinkIngredientToComponentType
- `src/hooks/convex/index.ts` — new hook exports

## Decisions Made

- `renderColumnAction` prop pattern: PlannerGrid is given a ReactNode factory per date, keeps the grid component unaware of Save to Kitchen semantics — reusable for future per-column actions
- `SaveTargetButton` uses the existing `getBallTotalsForDispatchPlanDate` query to derive override values — no duplicate calculation

## Deviations from Plan

None.

## Issues Encountered

None.
