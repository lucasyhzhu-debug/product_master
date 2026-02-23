---
phase: 21-kitchen-production-targets
plan: "08"
subsystem: kitchen-backend
tags:
  - schema
  - kitchen
  - shift-records
  - kitchen-config
  - chef-attribution
  - production-toggles
dependency_graph:
  requires: []
  provides:
    - kitchenShiftRecords.chefName
    - kitchenShiftRecords.chefUserId
    - kitchenConfig.enabledProductionComponents
  affects:
    - convex/kitchenShiftRecords/mutations.ts
    - convex/kitchenShiftRecords/queries.ts
    - convex/kitchenConfig/mutations.ts
    - convex/kitchenConfig/queries.ts
tech_stack:
  added: []
  patterns:
    - optional-field-spread (chefName/chefUserId only written when truthy)
    - backward-compat-derived-field (showJumbo derived from enabledProductionComponents)
    - null-means-all (null enabledProductionComponents = all components enabled)
key_files:
  created: []
  modified:
    - convex/schema.ts
    - convex/kitchenShiftRecords/mutations.ts
    - convex/kitchenShiftRecords/queries.ts
    - convex/kitchenConfig/mutations.ts
    - convex/kitchenConfig/queries.ts
    - docs/CHANGELOG.md
decisions:
  - "enabledProductionComponents null = all enabled — frontend resolves actual component list from componentTypes; avoids hardcoding codes in schema default"
  - "showJumbo preserved and auto-derived — when enabledProductionComponents is set, showJumbo = includes('BIG_BALL'); existing callers still get correct value during migration"
  - "chefUserId passed through queries as string to match enrichRecord parameter type contract; Id<users> typing preserved in schema"
metrics:
  duration_minutes: 3
  completed_date: "2026-02-23"
  tasks_completed: 2
  files_modified: 6
---

# Phase 21 Plan 08: Chef Attribution + Per-Component Production Toggle Schema Summary

One-liner: Added `chefName`/`chefUserId` to shift records and `enabledProductionComponents` array to kitchenConfig, with backward-compatible `showJumbo` derivation.

## What Was Built

Two schema extensions enabling UAT-r2 gap closure:

**Gap 8 — Chef Attribution (kitchenShiftRecords):**
- `chefName: v.optional(v.string())` and `chefUserId: v.optional(v.id("users"))` added after `submittedByUserId`
- `submitShiftRecord` mutation now accepts and persists these optional fields (only written when truthy)
- `updateShiftRecord` mutation accepts `chefName`/`chefUserId` for manager correction of who cooked
- Both query functions (`getShiftRecordsByDate`, `getShiftHistory`) pass chef fields through `enrichRecord` and return them in results

**Gap 7 Schema — Per-Component Production Toggles (kitchenConfig):**
- `enabledProductionComponents: v.optional(v.array(v.string()))` added to `kitchenConfig`
- `getConfig` returns `enabledProductionComponents` (null = all enabled) and derives `showJumbo` for backward compat: if array set and includes "BIG_BALL" → showJumbo true
- `updateConfig` accepts `enabledProductionComponents`; auto-syncs `showJumbo` for any callers that still read it directly
- Legacy `showJumbo` field retained in schema for migration safety

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 0ad8925 | feat(21-08): add chefName/chefUserId fields to kitchenShiftRecords |
| Task 2 | ad7ac9c | feat(21-08): add enabledProductionComponents to kitchenConfig; backward-compat showJumbo |

## Verification Results

- `npm run type-check` — PASS (clean after each task)
- `npm run build` — PASS (8.46s, no errors, only pre-existing CSS warnings)
- `chefName` in schema.ts kitchenShiftRecords — CONFIRMED (line 1452)
- `enabledProductionComponents` in schema.ts kitchenConfig — CONFIRMED (line 1436)
- `getConfig` returns `enabledProductionComponents` — CONFIRMED
- `showJumbo` backward compatibility maintained — CONFIRMED (derived from enabledProductionComponents when set)
- `submitShiftRecord` and `updateShiftRecord` accept chef fields — CONFIRMED
- `updateConfig` accepts `enabledProductionComponents` array — CONFIRMED

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files exist:
- `convex/schema.ts` — FOUND, contains chefName (line 1452) and enabledProductionComponents (line 1436)
- `convex/kitchenShiftRecords/mutations.ts` — FOUND, contains chefName
- `convex/kitchenShiftRecords/queries.ts` — FOUND, contains chefName in enrichRecord
- `convex/kitchenConfig/mutations.ts` — FOUND, contains enabledProductionComponents
- `convex/kitchenConfig/queries.ts` — FOUND, contains enabledProductionComponents

Commits exist:
- 0ad8925 — FOUND
- ad7ac9c — FOUND
