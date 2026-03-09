---
phase: 38-frontend-giant-file-splits
plan: 02
subsystem: ui
tags: [react, component-extraction, grabfood, code-splitting]

# Dependency graph
requires:
  - phase: 38-frontend-giant-file-splits
    provides: salesAnalytics directory pattern and formatters.ts
provides:
  - OrdersTab, StoreStatusTab, MenuTab, GrabFoodSettingsTab, WebhooksTab, OutletDialog components
  - GrabFoodManager.tsx slimmed from 1,486 to 173 LOC
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tab-per-file extraction pattern for page components with 5+ tabs"
    - "formatCurrency(amount ?? 0) pattern to get 'Rp 0' instead of '-' for null amounts"

key-files:
  created:
    - src/components/salesAnalytics/OrdersTab.tsx
    - src/components/salesAnalytics/StoreStatusTab.tsx
    - src/components/salesAnalytics/MenuTab.tsx
    - src/components/salesAnalytics/GrabFoodSettingsTab.tsx
    - src/components/salesAnalytics/WebhooksTab.tsx
    - src/components/salesAnalytics/OutletDialog.tsx
  modified:
    - src/pages/GrabFoodManager.tsx

key-decisions:
  - "Named GrabFoodSettingsTab (not SettingsTab) to avoid collision with existing SettingsTab in salesAnalytics barrel"
  - "Kept formatDateTime local to OrdersTab since it accepts ISO strings (GrabFood-specific), not numbers"
  - "Used formatCurrency(amount ?? 0) pattern at call sites to preserve 'Rp 0' behavior for null amounts"
  - "Did NOT add extracted components to salesAnalytics/index.ts barrel -- internal to GrabFoodManager only"

patterns-established:
  - "GrabFood tab components: self-contained with own hooks, no shared state between tabs"

requirements-completed: [FFS-02]

# Metrics
duration: 6min
completed: 2026-03-06
---

# Phase 38 Plan 02: GrabFoodManager Split Summary

**Split GrabFoodManager.tsx (1,486 LOC) into 6 tab components (OrdersTab, StoreStatusTab, MenuTab, GrabFoodSettingsTab, WebhooksTab, OutletDialog) reducing main file to 173 LOC (88% reduction)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T13:57:52Z
- **Completed:** 2026-03-06T14:04:35Z
- **Tasks:** 1
- **Files modified:** 7 (1 modified, 6 created)

## Accomplishments
- Extracted 5 tab components + OutletDialog into individual files in src/components/salesAnalytics/
- GrabFoodManager.tsx reduced from 1,486 LOC to 173 LOC (88% reduction, well under 600 target)
- Eliminated local formatCurrencyIDR, replaced with shared formatCurrency from utils.ts
- Replaced local formatRelativeTime with shared import from formatters.ts (with null guard at call sites)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract GrabFoodManager tab components and replace formatCurrencyIDR** - `fed6d42` (refactor)

## Files Created/Modified
- `src/components/salesAnalytics/OrdersTab.tsx` (286 LOC) - GrabFood orders sync history and revenue table
- `src/components/salesAnalytics/StoreStatusTab.tsx` (253 LOC) - Store status with pause/unpause controls
- `src/components/salesAnalytics/MenuTab.tsx` (247 LOC) - Menu item availability toggles with batch publish
- `src/components/salesAnalytics/GrabFoodSettingsTab.tsx` (265 LOC) - Settings with MerchantID management and OAuth
- `src/components/salesAnalytics/WebhooksTab.tsx` (205 LOC) - Webhook endpoints and error display
- `src/components/salesAnalytics/OutletDialog.tsx` (134 LOC) - Add/edit outlet dialog
- `src/pages/GrabFoodManager.tsx` (173 LOC) - Slim orchestrator importing extracted tab components

## Decisions Made
- Named `GrabFoodSettingsTab` instead of `SettingsTab` to avoid naming collision with the existing product mapping `SettingsTab` already exported from the salesAnalytics barrel index
- Kept `formatDateTime` local to OrdersTab.tsx since it accepts ISO strings (specific to GrabFood API), different from dateUtils.ts number-based formatters
- Used `formatCurrency(amount ?? 0)` pattern at call sites where the original `formatCurrencyIDR` would show "Rp 0" for null, preserving identical behavior
- Did NOT add extracted components to the salesAnalytics barrel (index.ts) since they are internal -- only consumed by GrabFoodManager

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused imports causing build failure**
- **Found during:** Task 1 verification (npm run build)
- **Issue:** `Loader2` in GrabFoodSettingsTab and `RefreshCw` in OrdersTab were imported but not used
- **Fix:** Removed the unused imports
- **Files modified:** src/components/salesAnalytics/GrabFoodSettingsTab.tsx, src/components/salesAnalytics/OrdersTab.tsx
- **Verification:** `npm run build` passes cleanly
- **Committed in:** fed6d42 (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial unused import cleanup. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GrabFoodManager fully split, build passes
- Ready for remaining phase 38 plans (other page splits)

## Self-Check: PASSED

- All 7 source files exist (6 created + 1 modified)
- SUMMARY.md exists
- Commit fed6d42 found in git log
- GrabFoodManager.tsx at 173 LOC (under 600 target)
- formatCurrencyIDR fully eliminated from codebase
- npm run build passes cleanly

---
*Phase: 38-frontend-giant-file-splits*
*Completed: 2026-03-06*
