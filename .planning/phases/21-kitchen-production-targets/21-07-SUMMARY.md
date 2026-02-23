---
phase: 21-kitchen-production-targets
plan: "07"
subsystem: ui
tags: [react, convex, kitchen, production-targets, uat-gap-closure]

# Dependency graph
requires:
  - phase: 21-06
    provides: ManagerTargetSettings interface + getConfig defaultPackagingMix + food-only filter
  - phase: 21-03
    provides: KitchenViewV2 structure + collapsible orders section
provides:
  - KitchenOrderSummary read-only 3-column component replacing DueDateOrderList
  - kitchenConfig.showJumbo schema field + updateConfig arg + getConfig return
  - showJumbo toggle UI in ManagerTargetSettings Default Daily Targets card
  - ProductionTargetsBar conditionally hides Jumbo stat card when showJumbo=false
affects: [kitchen-view, production-targets, order-summary]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only summary component: query-only component with no mutation hooks; data comes from existing listForKanban query"
    - "Conditional grid layout: showJumbo prop switches between grid-cols-1 and grid-cols-2 for stat cards"
    - "Optional schema field with ?? true default: showJumbo stored as optional boolean, defaulted to true in query return and component state"

key-files:
  created:
    - src/components/kitchen/KitchenOrderSummary.tsx
  modified:
    - convex/schema.ts
    - convex/kitchenConfig/mutations.ts
    - convex/kitchenConfig/queries.ts
    - src/components/kitchen/ManagerTargetSettings.tsx
    - src/components/kitchen/ProductionTargetsBar.tsx
    - src/pages/KitchenViewV2.tsx

key-decisions:
  - "KitchenOrderSummary uses listForKanban (existing kanban query) cast to Record<string, OrderRow[]> — avoids creating a new backend query for a simple read-only view"
  - "showJumbo toggle implemented as inline button[role=switch] — no additional shadcn/ui Switch import needed"
  - "PackagingMixEditor product list NOT filtered based on showJumbo — toggle controls ProductionTargetsBar stat card only, not the settings form dropdown"
  - "isProductionLoading early return and useKitchenProduction hook removed from KitchenViewV2 — page no longer blocks on production data; KitchenOrderSummary handles its own loading state"

patterns-established:
  - "Order count badge removed from collapsible toggle button — KitchenOrderSummary shows counts inline in column headers"

requirements-completed:
  - KIT-09
  - KIT-12
  - KIT-13

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 21 Plan 07: UAT Gap Closure — Read-only Order Summary and showJumbo Toggle Summary

**Closed two UAT gaps: kitchen orders section replaced with read-only 3-column KitchenOrderSummary; showJumbo toggle added to Manager Settings with kitchenConfig persistence and ProductionTargetsBar conditional rendering**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-23T01:01:04Z
- **Completed:** 2026-02-23T01:04:24Z
- **Tasks:** 3
- **Files modified:** 6 (1 new)

## Accomplishments

- `convex/schema.ts`: added `showJumbo: v.optional(v.boolean())` to kitchenConfig table
- `convex/kitchenConfig/mutations.ts`: `updateConfig` now accepts and persists `showJumbo` via conditional spread
- `convex/kitchenConfig/queries.ts`: `getConfig` returns `showJumbo` in both branches (defaults to `true` when unset)
- `src/components/kitchen/KitchenOrderSummary.tsx`: new read-only component — 3 columns (Payment Received / Being Prepared / Awaiting Delivery) using `listForKanban` data; shows order number, customer name, item summary; no action buttons
- `src/pages/KitchenViewV2.tsx`: removed `DueDateOrderList`, `useKitchenProduction`, all order mutation hooks and handlers (`handleTogglePack`, `handleMarkOrderReady`, `handleSendBack`, `handleOverride`, `handleSetProductTarget`); removed `isProductionLoading` early return; renders `KitchenOrderSummary` in collapsible section; passes `config?.showJumbo ?? true` to `ProductionTargetsBar`
- `src/components/kitchen/ManagerTargetSettings.tsx`: added `showJumbo: boolean` to `KitchenConfig` interface; added `showJumbo` state initialized to `true`; `useEffect` populates from config; `handleSaveDefaults` passes `showJumbo` to `updateConfig`; inline toggle button[role=switch] rendered between ball inputs grid and Default Packaging Mix section
- `src/components/kitchen/ProductionTargetsBar.tsx`: accepts `showJumbo?: boolean` (default true); Jumbo stat card wrapped in `{showJumbo && ...}`; grid switches between `grid-cols-2` and `grid-cols-1`; skeleton loading state also conditional

## Task Commits

Each task was committed atomically:

1. **Task 1: Add showJumbo to schema, updateConfig mutation, and getConfig return** - `570bf99` (feat)
2. **Task 2: Read-only KitchenOrderSummary component + KitchenViewV2 rewire** - `5833a59` (feat)
3. **Task 3: showJumbo toggle in ManagerTargetSettings and conditional Jumbo card in ProductionTargetsBar** - `0505b6f` (feat)

## Files Created/Modified

- `convex/schema.ts` - Added showJumbo optional boolean to kitchenConfig table
- `convex/kitchenConfig/mutations.ts` - Added showJumbo arg to updateConfig
- `convex/kitchenConfig/queries.ts` - Added showJumbo to getConfig return (both branches)
- `src/components/kitchen/KitchenOrderSummary.tsx` - New read-only 3-column order summary component
- `src/pages/KitchenViewV2.tsx` - Removed DueDateOrderList + mutation hooks; renders KitchenOrderSummary; passes showJumbo to ProductionTargetsBar
- `src/components/kitchen/ManagerTargetSettings.tsx` - showJumbo interface field, state, useEffect, save, and toggle UI
- `src/components/kitchen/ProductionTargetsBar.tsx` - showJumbo? prop with conditional Jumbo card and grid layout

## Decisions Made

- Used `listForKanban` (existing kanban board query) in KitchenOrderSummary rather than creating a new backend query. Cast return value as `Record<string, OrderRow[]>` since the query returns a typed Record keyed by column name.
- Inline toggle button with role="switch" used instead of shadcn/ui Switch to avoid adding a new import for a trivial control.
- PackagingMixEditor product list not filtered by showJumbo — the toggle only controls the stat card visibility on the kitchen page, not the settings form. This matches the plan's final decision.
- `isProductionLoading` early return removed along with `useKitchenProduction` — the page no longer blocks on production data. KitchenOrderSummary handles its own loading state with skeleton columns.

## Deviations from Plan

None — plan executed exactly as written. All must_haves truths satisfied:
- Kitchen orders section shows read-only 3-column summary with no action buttons
- DueDateOrderList is not rendered anywhere in KitchenViewV2
- Manager Settings has a "Show Jumbo" toggle
- showJumbo persists in kitchenConfig schema and is returned by getConfig
- ProductionTargetsBar hides Jumbo stat card when showJumbo=false
- PackagingMixEditor shows all food-type products regardless of showJumbo

## Issues Encountered

None — type check and build passed on first attempt for all three tasks.

## Self-Check

- [x] `src/components/kitchen/KitchenOrderSummary.tsx` created
- [x] `570bf99` commit exists
- [x] `5833a59` commit exists
- [x] `0505b6f` commit exists
- [x] `npm run type-check` passed
- [x] `npm run build` succeeded

## Self-Check: PASSED

## Next Phase Readiness

- Phase 21 gap closure complete: all 7 plans done
- Ready to merge `gsd/phase-21-kitchen-production-targets` to main
- Update CHANGELOG.md and SCHEMA.md after merge

---
*Phase: 21-kitchen-production-targets*
*Completed: 2026-02-23*
