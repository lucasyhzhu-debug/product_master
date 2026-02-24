---
phase: 19-gofood-depot-management-and-kitchen-production-targets
plan: 07
subsystem: ui
tags: [inventory, finished-goods, dark-mode, grouping, platform, react, convex]

# Dependency graph
requires:
  - phase: 19-04
    provides: "FinishedGoodsTab with product/location grouping modes, bucketLocationType helper, locationTypeLabel helper, PlatformGroupedView component"
provides:
  - "By Platform grouping mode in Finished Goods tab (Internal Inventory / GoFood / K3Mart sections)"
  - "Location platform type editor in Settings panel (admin only)"
  - "Dark-mode compatible Alerts stat card in FinishedGoodsHero"
  - "Consistent label text: Internal Inventory, GoFood, K3Mart throughout hero and tab"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useSessionMutation for protectedMutation calls (SessionId-based auth, no token arg)"

key-files:
  created: []
  modified:
    - src/components/inventory/FinishedGoodsTab.tsx
    - src/components/inventory/FinishedGoodsHero.tsx

key-decisions:
  - "Location type editor uses useSessionMutation (not useMutation+token) since storageLocations.mutations.update uses protectedMutation/SessionIdArg pattern"
  - "By Platform toggle button uses Layers icon; already-present PlatformGroupedView needed only the button wired in"

patterns-established:
  - "Dark mode warning card: border-orange-300/50 bg-orange-500/10 with dark: variant overrides using /20 and /30 opacity"

requirements-completed: [GF-04]

# Metrics
duration: 10min
completed: 2026-02-22
---

# Phase 19 Plan 07: By Platform Grouping + Dark Mode Fix Summary

**Three-mode grouping toggle (By Product / By Location / By Platform) for Finished Goods tab with admin location type editor and dark-mode-compatible Alerts stat card**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-22T11:37:00Z
- **Completed:** 2026-02-22T11:47:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added "By Platform" button to the three-button grouping toggle; wired PlatformGroupedView (already implemented in prior plan) to display Internal Inventory / GoFood / K3Mart sections
- Added location platform type editor to Settings panel (admin only) — inline Select per active location using useSessionMutation for instant persistence
- Fixed Alerts card dark mode by replacing hard-coded light orange classes with opacity-based variants that adapt to both light and dark themes
- Updated hero stat card label "Internal" to "Internal Inventory" for label consistency

## Task Commits

Each task was committed atomically:

1. **Task 1: Add By Platform grouping mode + location type editor to FinishedGoodsTab** - `ac9c94b` (feat)
2. **Task 2: Fix Alerts card dark mode + update Internal label in FinishedGoodsHero** - `0f527ac` (fix)

## Files Created/Modified
- `src/components/inventory/FinishedGoodsTab.tsx` - Added By Platform toggle button, useSessionMutation import for updateLocationTypeMut, location type editor in Settings panel (admin section)
- `src/components/inventory/FinishedGoodsHero.tsx` - Dark-mode-aware warning variant classes on StatCard, renamed "Internal" label to "Internal Inventory"

## Decisions Made
- Used `useSessionMutation` from `convex-helpers/react/sessions` (not `useMutation` with `token`) because `storageLocations.mutations.update` uses `protectedMutation` (SessionIdArg pattern), unlike `productInventory` mutations which use the older `token`-based auth.
- The `PlatformGroupedView` component was already fully implemented in a prior iteration (visible in existing file before this plan); this plan only needed to wire the toggle button and the Settings editor.

## Deviations from Plan

None - plan executed exactly as written. The plan specified adding both the toggle button and the location type editor; both were added. The only discovery was that `protectedMutation` uses `useSessionMutation`, not the `token` pattern the plan's pseudocode suggested — this was handled automatically with no scope change.

## Issues Encountered
- Duplicate `useSessionMutation` import: the linter auto-organized imports causing a duplicate when I added the import at line 23 while one was also added at line 66. The linter resolved this on the second pass, leaving only one import. Build passed cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three grouping modes work in Finished Goods tab
- Location type labels are consistent: "Internal Inventory", "GoFood", "K3Mart" throughout
- Alerts card readable in both light and dark mode
- Settings panel gives admin users inline platform type tagging without needing to navigate to LocationsManager

---
*Phase: 19-gofood-depot-management-and-kitchen-production-targets*
*Completed: 2026-02-22*
