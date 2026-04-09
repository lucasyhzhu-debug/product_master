---
phase: quick-260409-paq
plan: 01
subsystem: kitchen-production
tags: [data-unification, componentTypes, kitchen-components, tier-computation]
dependency_graph:
  requires: [componentTypes, productionComponentLinks, productionRecipes.queries.getComponentsWithTiers]
  provides: [seedLeafKitchenComponents mutation, unified tier-based kitchen component UI]
  affects: [useKitchenTargets, ManagerTargetSettings, EndOfShiftForm, ComponentProductionSection, ShiftEditDialog, KitchenViewV2]
tech_stack:
  added: []
  patterns: [tier-filtered componentTypes as single source for production + kitchen components]
key_files:
  created:
    - convex/componentTypes/seed.ts (seedLeafKitchenComponents mutation)
  modified:
    - src/hooks/convex/useKitchenTargets.ts
    - src/components/kitchen/ManagerTargetSettings.tsx
    - src/components/kitchen/EndOfShiftForm.tsx
    - src/components/kitchen/ComponentProductionSection.tsx
    - src/components/kitchen/ShiftEditDialog.tsx
    - src/pages/KitchenViewV2.tsx
decisions:
  - Reuse getComponentsWithTiers directly in each consumer (Convex deduplicates reactive queries) rather than creating a new lightweight query
  - Filter tier client-side (tier===0 for kitchen, tier>0 for production) rather than adding backend filter args
metrics:
  duration: 4m8s
  completed: 2026-04-09
  tasks_completed: 2
  tasks_total: 2
---

# Quick Task 260409-paq: Align Production Targets Toggles with Production Components Summary

Unified kitchen component data source from standalone `kitchenComponents` table to `componentTypes` (category="production") split by computed tier. Tier-1+ = "Production Components" (pieces), tier-0 = "Kitchen Components" (grams).

## One-liner

Migrate 6 kitchen UI consumers from kitchenComponents table to tier-filtered componentTypes via getComponentsWithTiers query

## Task Results

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Seed leaf kitchen components | `1b941f0d` | `convex/componentTypes/seed.ts` |
| 2 | Swap all frontend consumers | `36ad556c` | `useKitchenTargets.ts`, `ManagerTargetSettings.tsx`, `EndOfShiftForm.tsx`, `ComponentProductionSection.tsx`, `ShiftEditDialog.tsx`, `KitchenViewV2.tsx` |

## What Changed

### Task 1: Seed Mutation
- Added `seedLeafKitchenComponents` mutation creating 12 componentTypes rows (11 leaf ingredients with unit="g" + HAZELNUT_REGULAR with unit="pcs")
- Creates productionComponentLinks: 10 leaves linked to both BIG_BALL and MID_BALL, NUTELLA_FILLING linked to HAZELNUT_REGULAR
- Idempotent via by_code index checks and link existence checks

### Task 2: Frontend Migration
- **useKitchenTargets**: Replaced `kitchenComponents.queries.list` with `productionRecipes.queries.getComponentsWithTiers`, exposes both full array and tier-0 filtered `kitchenComponents`
- **ManagerTargetSettings**: Single `getComponentsWithTiers` query replaces two separate queries (`componentTypes.queries.getByCategory` + `kitchenComponents.queries.list`). Filters tier>0 for "Production Components" toggles, tier===0 for "Kitchen Components" toggles
- **EndOfShiftForm + ComponentProductionSection**: Updated prop types -- removed `ballTypeGroup`, added optional `tier`
- **ShiftEditDialog**: Replaced `kitchenComponents.queries.list` with `getComponentsWithTiers` filtered to tier===0
- **KitchenViewV2**: Updated hook destructuring (compatible -- `kitchenComponents` field still exists)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `npm run build` -- passed
- `grep -r "kitchenComponents.queries.list" src/` -- zero matches (all consumers migrated)
- `npm run type-check` -- passed (implicit in build)

## Self-Check: PASSED

All 7 files verified present. Both commits (1b941f0d, 36ad556c) verified in git log.
