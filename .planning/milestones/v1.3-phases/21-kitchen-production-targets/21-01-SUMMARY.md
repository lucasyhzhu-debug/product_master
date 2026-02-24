---
phase: 21-kitchen-production-targets
plan: "01"
subsystem: kitchen-backend
tags: [schema, backend, kitchen, production-targets, bom]
dependency_graph:
  requires: []
  provides:
    - kitchenShiftRecords table
    - kitchenDailyOverrides table
    - kitchenConfig.defaultPackagingMix field
    - getKitchenTargetsForDate query
    - setDailyOverride mutation
    - clearDailyOverride mutation
    - updateConfig (extended)
  affects:
    - convex/schema.ts
    - convex/kitchenConfig/queries.ts
    - convex/kitchenConfig/mutations.ts
    - convex/kitchenDailyOverrides/mutations.ts
tech_stack:
  added: []
  patterns:
    - BOM traversal for ball totals (menuProductComponents + componentTypes)
    - Priority chain query pattern (override > plan > defaults)
    - Upsert pattern via withIndex().first() + patch/insert
key_files:
  created:
    - convex/kitchenDailyOverrides/mutations.ts
  modified:
    - convex/schema.ts
    - convex/kitchenConfig/queries.ts
    - convex/kitchenConfig/mutations.ts
decisions:
  - "getKitchenTargetsForDate uses dispatchPlans.by_date index to aggregate ALL channels (direct + gofood + k3mart + consignment) for a date — no channel filter"
  - "Removed bigBall + midBall === max sum validation from updateConfig — targets are now independent absolute numbers"
  - "Packaging breakdown in override source: empty list when packagingOverrides not set (no BOM derivation needed for override — caller can combine override balls with plan packaging if needed)"
  - "resolvePackagingBreakdown helper typed inline with structural ctx type to avoid circular import from _generated/server"
metrics:
  duration: "3 minutes"
  completed_date: "2026-02-22"
  tasks_completed: 2
  files_modified: 4
---

# Phase 21 Plan 01: Kitchen Backend — Schema + Core Target Query Summary

Schema changes and core backend for kitchen production target derivation with 3-level priority chain (override > dispatch plan > defaults) plus manager mutations for configuring defaults and daily overrides.

## What Was Built

### Schema (convex/schema.ts)
- **kitchenShiftRecords** table: Per-shift audit log with `produced`, `waste`, and `inventoryUpdates` arrays. Indexed by `by_date` and `by_date_submitted`.
- **kitchenDailyOverrides** table: Per-day production target overrides with optional `bigBallOverride`, `midBallOverride`, `packagingOverrides`. Indexed by `by_date`.
- **kitchenConfig.defaultPackagingMix**: Optional field added — array of `{ menuProductId, quantity }` for fallback when no dispatch plan exists.

### getKitchenTargetsForDate Query (convex/kitchenConfig/queries.ts)
Implements the 3-level priority chain:
1. **Override**: Queries `kitchenDailyOverrides` by date. If found, returns `bigBallOverride`/`midBallOverride` and `packagingOverrides` (if set). Source = `"override"`.
2. **Dispatch plan**: Queries `dispatchPlans` by date across ALL channels. Uses BOM traversal (`menuProductComponents` + `componentTypes`) to accumulate `BIG_BALL`/`MID_BALL` totals. Builds packaging breakdown from all menu products in plan. Source = `"dispatch_plan"`.
3. **Defaults**: Falls through to `kitchenConfig.bigBallTarget`/`midBallTarget` and `defaultPackagingMix`. Source = `"defaults"`.

Returns shape: `{ bigBalls, midBalls, packagingBreakdown, source }`.

### updateConfig Mutation (convex/kitchenConfig/mutations.ts)
- Added optional `defaultPackagingMix` arg (array of `{ menuProductId, quantity }`)
- Removed `bigBall + midBall === max` sum validation — targets are now independent absolute numbers
- Keeps positive-number validations

### setDailyOverride + clearDailyOverride Mutations (convex/kitchenDailyOverrides/mutations.ts)
- **setDailyOverride**: Upserts a `kitchenDailyOverrides` row for the date. All fields optional (partial override valid). Manager/admin auth.
- **clearDailyOverride**: Deletes the override for a date (falls through to plan/defaults). Manager/admin auth.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| convex/schema.ts | FOUND |
| convex/kitchenConfig/queries.ts | FOUND |
| convex/kitchenConfig/mutations.ts | FOUND |
| convex/kitchenDailyOverrides/mutations.ts | FOUND |
| kitchenShiftRecords in schema | FOUND (1 occurrence) |
| kitchenDailyOverrides in schema | FOUND (1 occurrence) |
| defaultPackagingMix in schema | FOUND (1 occurrence) |
| getKitchenTargetsForDate exported | FOUND at line 58 |
| setDailyOverride exported | FOUND at line 14 |
| clearDailyOverride exported | FOUND at line 59 |
| Priority chain sources (override/dispatch_plan/defaults) | FOUND at lines 86, 148, 169 |
| Commit ab80c3c (schema) | EXISTS |
| Commit c9272e4 (queries/mutations) | EXISTS |
| npm run type-check | PASSES |
| npm run build | PASSES |
