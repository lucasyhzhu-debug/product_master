---
phase: 20-production-ingredient-tracking-and-cogs
plan: 05
subsystem: ui, api
tags: [inventory, cogs, ingredients, dispatch-planner, tooltip, simulation]

requires:
  - phase: 20-03
    provides: "Ingredient stock tracking via componentTypes with trackInventory=true"
  - phase: 20-04
    provides: "Recipe editor modal with COGS calculation via hierarchyTraversal"
provides:
  - "Ingredient rows visible in Inventory Production tab with type badges"
  - "Negative stock red highlight with AlertTriangle warning icon"
  - "COGSBreakdownTooltip shared component for hierarchical cost display"
  - "Dispatch planner ingredient simulation with projected resupply dates"
affects: [20-06, dispatch-planner, inventory]

tech-stack:
  added: []
  patterns:
    - "COGSBreakdownTooltip using useProductionCogs + useProductionRecipe for hierarchy display"
    - "Ingredient/Ball type badges on ComponentRow using trackInventory flag"

key-files:
  created:
    - src/components/shared/COGSBreakdownTooltip.tsx
  modified:
    - src/components/inventory/ComponentRow.tsx
    - src/components/inventory/LowStockAlertsBanner.tsx
    - convex/dispatchPlanner/queries.ts
    - src/components/dispatchPlanner/PlannerGrid.tsx
    - src/pages/DispatchPlanner.tsx

key-decisions:
  - "Type badges: Ball (blue) for non-tracking production, Ingredient (green) for trackInventory production"
  - "Negative stock: red-50 bg + red text + AlertTriangle, prioritized over low-stock styling"
  - "COGS tooltip: TooltipProvider with 300ms delay, shows flat leaf breakdown for multi-tier components"
  - "Ingredient simulation: name-based matching between raw ingredients and componentType inventory trackers"
  - "simulateInventory return shape changed from flat array to { days, ingredientStatus } object"

patterns-established:
  - "COGSBreakdownTooltip: reusable shared component for any componentType with calculated COGS"
  - "Ingredient stock simulation via collectLeafIngredients cached per production component"

duration: 4min
completed: 2026-02-17
---

# Phase 20 Plan 05: Inventory Ingredient Display + COGS Tooltip + Dispatch Simulation Summary

**Ingredient inventory display with type badges, negative stock highlighting, COGS breakdown tooltip, and 7-day dispatch planner ingredient consumption simulation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T12:17:57Z
- **Completed:** 2026-02-17T12:22:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Ingredients appear in Production tab flat list with green "Ingredient" badge (blue "Ball" for production components)
- Negative stock rows show red background, red text, and AlertTriangle warning icon
- COGSBreakdownTooltip shows hierarchical cost breakdown on hover with leaf ingredient detail
- Dispatch planner simulateInventory walks production hierarchy to calculate ingredient requirements per day
- Projected resupply dates calculated for each ingredient over 7-day horizon
- ingredientStatus summary returned alongside packaging simulation results

## Task Commits

Each task was committed atomically:

1. **Task 1: Inventory page ingredient display + negative stock + COGS tooltip** - `87791d4` (feat)
2. **Task 2: Dispatch planner ingredient simulation** - `6ad0712` (feat)

## Files Created/Modified
- `src/components/shared/COGSBreakdownTooltip.tsx` - New shared tooltip for hierarchical COGS breakdown
- `src/components/inventory/ComponentRow.tsx` - Type badges (Ball/Ingredient), negative stock highlight, COGS inline display
- `src/components/inventory/LowStockAlertsBanner.tsx` - Ingredient badge on low-stock alerts
- `convex/dispatchPlanner/queries.ts` - Extended simulateInventory with ingredient consumption + resupply dates
- `src/components/dispatchPlanner/PlannerGrid.tsx` - Extended SimulationResult type with ingredientShortages
- `src/pages/DispatchPlanner.tsx` - Updated consumer to handle new { days, ingredientStatus } response shape

## Decisions Made
- Type badges use trackInventory flag: production + trackInventory=true = Ingredient (green), production + trackInventory=false = Ball (blue)
- Negative stock styling takes priority over low-stock/critical in CSS class hierarchy
- COGS tooltip shows both recipe hierarchy (sub-components) and flat leaf breakdown when multi-tier
- Ingredient simulation caches collectLeafIngredients per production componentType to avoid repeated hierarchy walks
- Ingredient stock matching uses case-insensitive name comparison between raw ingredients and componentType inventory trackers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated simulateInventory consumers for new return shape**
- **Found during:** Task 2 (Dispatch planner ingredient simulation)
- **Issue:** Changing simulateInventory return from flat array to `{ days, ingredientStatus }` broke DispatchPlanner.tsx and PlannerGrid.tsx consumers
- **Fix:** Updated DispatchPlanner.tsx to extract `.days` from response, extended SimulationResult interface with ingredientShortages field
- **Files modified:** src/pages/DispatchPlanner.tsx, src/components/dispatchPlanner/PlannerGrid.tsx
- **Verification:** npm run type-check passes
- **Committed in:** 6ad0712 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to maintain compatibility with existing dispatch planner UI. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ingredient inventory UX complete with display, stock tracking, and COGS visibility
- Dispatch planner now simulates both packaging and ingredient sufficiency
- Ready for Plan 20-06 (final integration testing and polish)

---
*Phase: 20-production-ingredient-tracking-and-cogs*
*Completed: 2026-02-17*
