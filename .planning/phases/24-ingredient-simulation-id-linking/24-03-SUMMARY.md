---
phase: 24-ingredient-simulation-id-linking
plan: 03
subsystem: frontend
tags: [dispatch-planner, kitchen, components, dark-mode]

# Dependency graph
requires:
  - phase: 24-ingredient-simulation-id-linking
    provides: simulateInventory with unlinkedIngredients + getKitchenTargetsForDate with overrideSource
provides:
  - "ChannelSettingsDialog: 2-tab dialog (Channels, Outlets) — Capacity tab removed"
  - "MaterialsCheckPanel: amber banner for unlinked ingredients"
  - "ProductionTargetsBar: 'from Restock Planner' badge when overrideSource === 'restock_planner'"
  - "ManagerTargetSettings: passes source: 'manual' explicitly on setDailyOverride calls"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional badge pattern: show 'from Restock Planner' badge only when targets.source === 'override' && targets.overrideSource === 'restock_planner'"

key-files:
  created: []
  modified:
    - src/components/dispatchPlanner/ChannelSettingsDialog.tsx
    - src/components/dispatchPlanner/MaterialsCheckPanel.tsx
    - src/components/kitchen/ProductionTargetsBar.tsx
    - src/components/kitchen/ManagerTargetSettings.tsx

key-decisions:
  - "Capacity tab fully removed (not hidden) — standalone capacity override is replaced by kitchenConfig + daily override chain"
  - "Amber banner shows count and names of unlinked ingredients — actionable, not just a generic warning"

patterns-established: []

requirements-completed: []

# Metrics
duration: included in phase 24 single-commit implementation
completed: 2026-02-23
---

# Phase 24 Plan 03: Frontend Components — Dialog, Panels, Badges, Source Passing Summary

**Removed Capacity tab from ChannelSettingsDialog, added unlinked ingredients amber banner to MaterialsCheckPanel, added 'from Restock Planner' badge to ProductionTargetsBar, and wired source: 'manual' on ManagerTargetSettings saves**

## Performance

- **Completed:** 2026-02-23
- **Commit:** `5cd8914` — feat(24): ID-based ingredient linking, save-to-kitchen, capacity cleanup

## Accomplishments

- `ChannelSettingsDialog.tsx` — Capacity tab removed; dialog is now a 2-tab layout (`Channels`, `Outlets`) using `grid-cols-2`. `DailyCapacityEditor` component removed from render tree entirely
- `MaterialsCheckPanel.tsx` — when `simulationData?.unlinkedIngredients?.length > 0`, shows amber bordered banner (`border-amber-300 bg-amber-50 dark:bg-amber-950/20`) with `AlertTriangle` icon listing count and ingredient names
- `ProductionTargetsBar.tsx` — when `targets.source === "override" && targets.overrideSource === "restock_planner"`, renders a `Badge` with `border-blue-300 text-blue-700` reading "from Restock Planner"
- `ManagerTargetSettings.tsx` — `setDailyOverride` call now explicitly passes `source: "manual"`; after a manager save, the "from Restock Planner" badge disappears as the override source changes

## Files Created/Modified

- `src/components/dispatchPlanner/ChannelSettingsDialog.tsx` — Capacity tab removed, 2-tab grid layout
- `src/components/dispatchPlanner/MaterialsCheckPanel.tsx` — unlinked ingredients amber warning added
- `src/components/kitchen/ProductionTargetsBar.tsx` — Restock Planner source badge added
- `src/components/kitchen/ManagerTargetSettings.tsx` — explicit source: 'manual' on override calls

## Decisions Made

- Capacity tab fully removed rather than disabled — the old standalone capacity UI was superseded by the kitchenConfig override chain; keeping it would cause confusion
- 'from Restock Planner' badge disappears when manager saves manually — correct UX: manager override supersedes restock planner, badge should reflect current source

## Deviations from Plan

None.

## Issues Encountered

None.
