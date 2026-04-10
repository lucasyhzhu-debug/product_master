---
phase: 19-gofood-depot-kitchen-targets
plan: 08
subsystem: ui
tags: [react, react-router, navigation, ux, restock-planner]

# Dependency graph
requires:
  - phase: 19-gofood-depot-kitchen-targets
    provides: GoFoodRestockSection component on Restock Planner page
provides:
  - Always-visible usage guidance on GoFoodRestockSection explaining restock calculation and workflow
  - Transfer link per product row navigating to /inventory for stock transfer
  - /restock-planner route and nav label "Restock" (already in place, confirmed)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Always-visible contextual guidance above collapsible sections so users understand the data even when expanded/collapsed"
    - "Transfer navigation link pattern: inline button navigating to relevant management page"

key-files:
  created: []
  modified:
    - src/components/restockPlanner/GoFoodRestockSection.tsx

key-decisions:
  - "Usage guidance placed above collapsible content so it remains visible whether section is expanded or collapsed"
  - "Transfer link navigates to /inventory (no pre-filter) — simple, direct, consistent with inventory workflow"

patterns-established:
  - "Contextual guidance block pattern: orange-tinted border/background, always-visible, explains numbers + action workflow"

requirements-completed: [GF-05]

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 19 Plan 08: Restock Planner UX Fixes Summary

**GoFood Depot Restock section now has always-visible usage guidance (explaining 3-day avg calculation + inventory workflow) and a Transfer link per product row navigating to /inventory.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-22T11:43:33Z
- **Completed:** 2026-02-22T11:47:20Z
- **Tasks:** 2
- **Files modified:** 1 (GoFoodRestockSection.tsx)

## Accomplishments
- Confirmed /restock-planner route and "Restock" nav label were already correctly in place
- Added always-visible contextual guidance block above GoFood depot outlet tables, explaining restock numbers and how to act on them
- Added "Transfer →" link per product row that navigates to /inventory
- Build passes with no type errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Route, nav, and text rename** - Pre-existing (route and nav already correct, no commit needed)
2. **Task 2: Usage guidance + Transfer links** - `47d2fa7` (feat)

**Plan metadata:** (docs commit forthcoming)

## Files Created/Modified
- `src/components/restockPlanner/GoFoodRestockSection.tsx` - Added useNavigate import, usage guidance block above collapsible content, Transfer column in OutletRestockTable

## Decisions Made
- Usage guidance placed above `{expanded && ...}` so it shows in both expanded and collapsed states
- Transfer link uses `navigate('/inventory')` directly (no deep-link parameters) — keeps it simple

## Deviations from Plan

### Auto-fixed Issues

None related to task scope. There was a pre-existing stale TypeScript incremental cache false-positive for `FinishedGoodsTab.tsx` (TS6133 "declared but never read" for `useSessionMutation`) which resolved correctly — the import IS used at line 904, and `npm run build` passes.

**Total deviations:** 0 (plan executed as specified)

## Issues Encountered
- `tsc -b` initially showed a false-positive TS6133 error on `FinishedGoodsTab.tsx` for `useSessionMutation` which is actually used at line 904. This was a stale incremental build cache artifact — the full build (`npm run build`) passes cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 19 all gap-closure plans complete
- Ready to merge to main and start next phase

---
*Phase: 19-gofood-depot-kitchen-targets*
*Completed: 2026-02-22*
