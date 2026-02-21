---
phase: 20-production-ingredient-tracking-and-cogs
plan: 08
subsystem: ui
tags: [react, typescript, convex, ingredients, inventory, cogs, component-types]

# Dependency graph
requires:
  - phase: 20-production-ingredient-tracking-and-cogs
    provides: createIngredientComponentType mutation, createComponentAndReceiveStock with production category, SubComponentData with childBatchSize
provides:
  - SubComponentSection with correct (qty/batchSize)*unitCost formula and live COGS preview
  - IngredientsManager with Enable Tracking button per row and full unit labels
  - ComponentTypeDialog with unit Select dropdown and smart category-based defaults
  - ReceiveStockDialog with Packaging/Ingredient category toggle and weight units for production
  - useConvexCreateIngredientComponentType hook exported from barrel
affects: [production-recipe-ui, ingredient-inventory, inventory-manager, dispatch-planner-materials-check]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IIFE in JSX for conditional computed preview blocks: {condition && (() => { ... })()}"
    - "Category-driven unit defaults: production=g, packaging=pcs in both ComponentTypeDialog and ReceiveStockDialog"
    - "Read-only unit display (div with muted bg) when unit is auto-derived from selected child's batchSizeUnit"

key-files:
  created: []
  modified:
    - src/components/productionRecipes/SubComponentSection.tsx
    - src/pages/IngredientsManager.tsx
    - src/components/inventory/ComponentTypeDialog.tsx
    - src/components/inventory/ReceiveStockDialog.tsx
    - src/hooks/convex/useComponentTypes.ts
    - src/hooks/convex/index.ts

key-decisions:
  - "EnableTrackingButton as top-level component (not inline render fn) to safely use hooks"
  - "columns array defined inside IngredientsManager function body to reference EnableTrackingButton cleanly"
  - "ReceiveStockDialog category reset on dialog open (not just on category button click) to prevent stale state"
  - "For production category in ReceiveStockDialog: always pass consumptionStage=production to mutation"
  - "IIFE pattern (&&(() => { ... })()) for live COGS preview to avoid extracting to a separate component"

patterns-established:
  - "Category toggle button grids (Packaging=emerald, Ingredient=blue) for visual distinction"
  - "setSelectedLocationId(null) on category switch triggers useEffect re-run with correct Kitchen/default preference"
  - "IngredientsManager.tsx: columns defined inside component function when render fns depend on component-scoped hooks"

# Metrics
duration: 15min
completed: 2026-02-17
---

# Phase 20 Plan 08: UAT Gap Closure - Four Frontend UX Fixes Summary

**Four frontend UX gaps closed: correct sub-component COGS formula with live preview, full unit labels in Ingredients, ComponentTypeDialog unit Select with smart defaults, and ReceiveStockDialog Packaging/Ingredient category toggle with weight units**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-17T15:30:00Z
- **Completed:** 2026-02-17T15:45:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- SubComponentSection now shows `(qty / batchSize) * unitCost` COGS formula in display rows, auto-fills unit/qty from selected child, and shows live COGS preview as user adjusts quantity
- IngredientsManager shows full unit labels (Grams (g), Kilograms (kg), etc.) and an "Enable Tracking" button per ingredient row; green "Tracked" badge when already linked to inventory
- ComponentTypeDialog unit field is now a Select dropdown (not free-text Input), defaulting to "g" for production and "pcs" for packaging, updating when user changes category mid-dialog
- ReceiveStockDialog create-new form has Packaging/Ingredient toggle; production shows weight units (g/kg/ml/l) and defaults location to Kitchen

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix SubComponentSection cost formula, auto-unit, and live COGS preview** - `284ea97` (feat)
2. **Task 2: Fix unit labels in IngredientsManager and ComponentTypeDialog; add ingredient tracking button** - `625ad1c` (feat)
3. **Task 3: Extend ReceiveStockDialog to support Ingredient (production) category** - `ec99cf3` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/components/productionRecipes/SubComponentSection.tsx` - Fixed display cost formula; auto-set unit/qty from child on select; live COGS preview IIFE; read-only unit display when child selected
- `src/pages/IngredientsManager.tsx` - Full unit labels; EnableTrackingButton inline component; tracking column with green badge for tracked ingredients
- `src/components/inventory/ComponentTypeDialog.tsx` - Unit Input replaced with Select; smart defaults (g/pcs) on open and when category changes
- `src/components/inventory/ReceiveStockDialog.tsx` - Category state (packaging|production); toggle UI; weight unit buttons for production; Kitchen location default; production consumptionStage
- `src/hooks/convex/useComponentTypes.ts` - Added useConvexCreateIngredientComponentType hook
- `src/hooks/convex/index.ts` - Exported useConvexCreateIngredientComponentType from barrel

## Decisions Made
- `EnableTrackingButton` is a top-level function component (not an inline render function) so it can use React hooks safely
- `createIngredientComponentType` mutation takes `{ ingredientId, token }` — no `createdBy` arg (resolved server-side from session token)
- Category toggle resets `selectedLocationId` to null so the location useEffect fires again with the correct default (Kitchen for production, isDefault for packaging)
- IIFE pattern in JSX (`{condition && (() => { ... })()}`) avoids extracting a trivial component just for the COGS preview line

## Deviations from Plan

None - plan executed exactly as written. Minor note: `createIngredientComponentType` does not accept a `createdBy` arg (contrary to plan docs) — it resolves the creator from the session token server-side. This matched the actual mutation signature and required no fix.

## Issues Encountered
None — all three tasks were straightforward targeted frontend changes.

## User Setup Required
None - no external service configuration required. All changes are frontend-only.

## Next Phase Readiness
- All four UAT UX gaps resolved (20-08 complete)
- 20-09 gap-closure plan already executed on this branch
- Ready to merge feature/production-ingredient-tracking-cogs to main

---
*Phase: 20-production-ingredient-tracking-and-cogs*
*Completed: 2026-02-17*

## Self-Check: PASSED

- FOUND: src/components/productionRecipes/SubComponentSection.tsx
- FOUND: src/pages/IngredientsManager.tsx
- FOUND: src/components/inventory/ComponentTypeDialog.tsx
- FOUND: src/components/inventory/ReceiveStockDialog.tsx
- FOUND: src/hooks/convex/useComponentTypes.ts
- FOUND: .planning/phases/20-production-ingredient-tracking-and-cogs/20-08-SUMMARY.md
- FOUND: 284ea97 (Task 1 commit)
- FOUND: 625ad1c (Task 2 commit)
- FOUND: ec99cf3 (Task 3 commit)
