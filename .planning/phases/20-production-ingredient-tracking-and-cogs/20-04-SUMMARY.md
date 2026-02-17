---
phase: 20-production-ingredient-tracking-and-cogs
plan: 04
subsystem: ui
tags: [react, shadcn, convex, recipe-editor, cogs, modal, production-components]

# Dependency graph
requires:
  - phase: 20-02
    provides: "productionRecipes queries/mutations, hierarchyTraversal, COGS calculation"
provides:
  - "Recipe editor modal for production components (sub-components + ingredients)"
  - "useProductionRecipes hooks wrapping backend queries/mutations"
  - "COGSPreview component for live cost display"
  - "ProductionComponentsManager with tier sorting + recipe modal trigger"
affects: [20-05, 20-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recipe editor modal as overlay on list page (click row = recipe, edit button = settings)"
    - "ComponentWithTier extended type for tier+COGS metadata display"
    - "COGSPreview component reusable for any componentTypeId"

key-files:
  created:
    - src/hooks/convex/useProductionRecipes.ts
    - src/components/productionRecipes/RecipeEditorModal.tsx
    - src/components/productionRecipes/SubComponentSection.tsx
    - src/components/productionRecipes/IngredientSection.tsx
    - src/components/productionRecipes/COGSPreview.tsx
  modified:
    - src/pages/ProductionComponentsManager.tsx

key-decisions:
  - "Row click opens recipe modal; separate Edit button opens settings dialog (dual interaction)"
  - "Tier-grouped view with section headers (Tier 2, Tier 1, Leaf) when sorted by tier"
  - "COGS mode toggle only shown in edit dialog (not create -- defaults to manual)"
  - "Unit cost field conditionally hidden when cogsMode=calculated"

patterns-established:
  - "Inline create pattern: Select dropdown with __create_new__ sentinel value triggering inline form"
  - "COGSPreview as composable footer component for any recipe context"

# Metrics
duration: 7min
completed: 2026-02-17
---

# Phase 20 Plan 04: Recipe Editor Modal + Tier Sorting Summary

**Production recipe editor modal with sub-component/ingredient sections, live COGS preview, and tier-sorted component list with mode badges**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-17T10:56:56Z
- **Completed:** 2026-02-17T11:04:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Recipe editor modal opens on component row click with two stacked sections (sub-components + ingredients)
- Live COGS preview in modal footer shows manual/calculated mode with missing data warnings
- Add dropdowns include "Create new" inline option for both sub-components and ingredients
- ProductionComponentsManager now shows tier badges, groups by tier, with sort toggle (By Tier / A-Z)
- Create/edit dialogs extended with batchSize, batchSizeUnit, and cogsMode toggle

## Task Commits

Each task was committed atomically:

1. **Task 1: Production recipe hooks + Recipe editor modal** - `929faee` (feat)
2. **Task 2: Extend ProductionComponentsManager** - `24b6d88` (feat)

## Files Created/Modified
- `src/hooks/convex/useProductionRecipes.ts` - Hooks for recipe queries, COGS, and CRUD mutations
- `src/components/productionRecipes/RecipeEditorModal.tsx` - Main dialog with two sections + COGS footer
- `src/components/productionRecipes/SubComponentSection.tsx` - Sub-component list with add/edit/remove + create new
- `src/components/productionRecipes/IngredientSection.tsx` - Ingredient list with add/edit/remove + create new
- `src/components/productionRecipes/COGSPreview.tsx` - Live COGS display component
- `src/pages/ProductionComponentsManager.tsx` - Extended with tier sorting, recipe modal, COGS badges

## Decisions Made
- Row click opens recipe modal; separate Edit button opens settings dialog -- dual interaction avoids modal conflicts
- Tier-grouped view shows section headers (Tier 2, Tier 1, Leaf Components) for visual hierarchy
- COGS mode toggle only appears in edit dialog, not create -- new components default to manual mode via backend
- Unit cost field conditionally hidden when switching to calculated mode (COGS comes from recipe)
- Used `__create_new__` sentinel value in Select dropdown to trigger inline creation form

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Recipe editor modal fully functional for composing production component recipes
- Frontend hooks ready for Plan 06 barrel export registration
- Plan 05 (COGS dashboard/reports) can build on COGSPreview pattern
- All type checks pass cleanly

---
*Phase: 20-production-ingredient-tracking-and-cogs*
*Completed: 2026-02-17*
