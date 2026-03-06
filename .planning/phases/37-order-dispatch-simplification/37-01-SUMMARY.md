---
phase: 37-order-dispatch-simplification
plan: 01
status: complete
---

# Plan 37-01 Summary: Extract Helpers from orders/queries.ts

## What Was Done
Extracted 6 kitchen enrichment functions and 4 kanban builder functions from `orders/queries.ts` into dedicated helper modules.

### Task 1: Kitchen Enrichment (committed separately)
- Created `convex/orders/helpers/kitchenEnrichment.ts` with 6 exported functions:
  - `calculateBallStatsFromItems` — ball stats from production records
  - `calculateProductionStatsByType` — production stats per unit type
  - `getStatusPriority` / `sortByPriorityComparator` — kitchen priority sorting
  - `aggregateKitchenStats` — full kitchen stats aggregation (~130 LOC block)
  - `calculateOrderBallCounts` — per-order ball counts for completed-today

### Task 2: Kanban Builders (committed with review fixes)
- Created `convex/orders/helpers/kanbanBuilders.ts` with:
  - `KANBAN_COLUMNS` — column definitions (was inline in `listForKanban`)
  - `KanbanOrderCard` interface — typed with `Id<"orders">` (review fix I7)
  - `sortKanbanColumn` — column-specific sorting logic
  - `buildKanbanCard` — maps order+items+creator to lean card shape
- Updated `listForKanban` to use imported helpers

### Review Fixes Applied
- **C5**: Added `isCancelled` filtering in `productionByType` loops in `aggregateKitchenStats`
- **I3**: Fixed `_creationTime` → `completedAt` for completed-today filter (2 locations in queries.ts)
- **I7**: Used `Id<"orders">` and `Id<"orderItems">` instead of `string` in `KanbanOrderCard`

## LOC Impact
- `orders/queries.ts`: 1,279 → 940 LOC (−339, 26.5% reduction)
- Target was <800 — not fully met due to ctx-dependent DB code that can't be extracted to pure helpers

## Verification
- `npm run type-check` passes (zero errors)
- `npm run build` succeeds
- `npm run test` — 684/684 tests passing
- All Convex query registrations remain in queries.ts (zero API path changes)
