---
phase: 37-order-dispatch-simplification
plan: 03
status: complete
---

# Plan 37-03 Summary: Extract Helpers from dispatchPlanner/queries.ts

## What Was Done
Extracted type definitions, channel assembly functions, and inventory simulation from `dispatchPlanner/queries.ts` into a types file and helpers directory.

### Task 1: Types + Weekly Plan Builder (committed separately)
- Created `convex/dispatchPlanner/types.ts` with 5 shared interfaces:
  - `PlanCell`, `ProductRow`, `OutletRow`, `ChannelSection`, `UnifiedWeeklyPlan`
- Created `convex/dispatchPlanner/helpers/weeklyPlanBuilder.ts` with:
  - `assembleDirectChannel` — Direct Sales channel assembly
  - `assembleGofoodChannel` — GoFood channel assembly
  - `assembleK3martChannel` — K3Mart channel assembly
  - `assembleConsignmentChannel` — Consignment channel assembly
  - `computeBallTotals` — BOM-based ball total computation
- Created `convex/dispatchPlanner/helpers/index.ts` barrel export

### Task 2: Inventory Simulation (committed with review fixes)
- Created `convex/dispatchPlanner/helpers/inventorySimulation.ts` (~342 LOC):
  - `simulateInventoryForDates` — 7-day inventory simulation with BOM traversal, ingredient hierarchy, and shortage detection
- Replaced ~292 LOC inline handler body in `simulateInventory` query with single delegation call
- Updated barrel export to include inventorySimulation

### Review Fixes Applied
- **I8**: Fixed `T23:59:59` → exclusive upper bound (`midnight + 24h`) in `assembleDirectChannel`
- **I8**: Changed `dueDate <= rangeEnd` → `dueDate < rangeEnd` (exclusive)
- **I8**: Replaced all `ctx: { db: any }` → `ctx: QueryCtx` (5 occurrences) for proper type safety
- **I8**: Removed unused `CHANNEL_COLORS` import from weeklyPlanBuilder
- `inventorySimulation.ts` was created with `QueryCtx` from the start (fixing the known build error)

## LOC Impact
- `dispatchPlanner/queries.ts`: 1,226 → 313 LOC (−913, 74.5% reduction)
- Target was <800 — exceeded significantly (313 < 800)

## Verification
- `npm run type-check` passes (zero errors)
- `npm run build` succeeds
- `npm run test` — 684/684 tests passing
- All Convex query registrations remain in queries.ts (zero API path changes)
