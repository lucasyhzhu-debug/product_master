---
phase: 24-ingredient-simulation-id-linking
plan: 01
subsystem: backend
tags: [schema, kitchenDailyOverrides, ingredients, convex]

# Dependency graph
requires: []
provides:
  - "kitchenDailyOverrides.source field: optional 'manual' | 'restock_planner' union"
  - "setDailyOverride: accepts optional source arg, defaults to 'manual'"
  - "linkIngredientToComponentType mutation for admin ingredient-to-BOM mapping"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional source field with default coercion: args.source ?? 'manual' in mutation handler"

key-files:
  created: []
  modified:
    - convex/schema.ts
    - convex/kitchenDailyOverrides/mutations.ts
    - convex/ingredients/mutations.ts

key-decisions:
  - "source defaults to 'manual' in mutation handler (not schema) — existing callers that omit source are unaffected"
  - "linkIngredientToComponentType is a separate mutation rather than part of update — single-purpose, easier to guard with admin-only access"

patterns-established: []

requirements-completed: []

# Metrics
duration: included in phase 24 single-commit implementation
completed: 2026-02-23
---

# Phase 24 Plan 01: Backend Schema — Source Field + Link Mutation Summary

**Added optional source field to kitchenDailyOverrides schema, updated setDailyOverride to accept and store source, and added linkIngredientToComponentType mutation for admin ingredient mapping**

## Performance

- **Completed:** 2026-02-23
- **Commit:** `5cd8914` — feat(24): ID-based ingredient linking, save-to-kitchen, capacity cleanup
- **Merged:** `a24b76d` — Merge branch 'feature/ingredient-simulation-id-linking'

## Accomplishments

- `convex/schema.ts` — `kitchenDailyOverrides` table gains `source: v.optional(v.union(v.literal("manual"), v.literal("restock_planner")))` field
- `convex/kitchenDailyOverrides/mutations.ts` — `setDailyOverride` accepts optional `source` arg, stores `args.source ?? "manual"` — all existing callers continue working without modification
- `convex/ingredients/mutations.ts` — `linkIngredientToComponentType` mutation added; allows admin to set `ingredientComponentTypeId` on an ingredient to link it to the BOM system

## Files Created/Modified

- `convex/schema.ts` — source field added to kitchenDailyOverrides table
- `convex/kitchenDailyOverrides/mutations.ts` — source arg + default added to setDailyOverride
- `convex/ingredients/mutations.ts` — linkIngredientToComponentType mutation added

## Decisions Made

- Default of `"manual"` applied at mutation handler level (`args.source ?? "manual"`) rather than schema level — keeps schema clean and ensures backwards compat with all existing callers

## Deviations from Plan

None.

## Issues Encountered

None.
