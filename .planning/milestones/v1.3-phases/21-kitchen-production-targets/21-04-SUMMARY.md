---
phase: 21-kitchen-production-targets
plan: "04"
subsystem: ui
tags: [react, convex, kitchen, manager, shadcn]

# Dependency graph
requires:
  - phase: 21-01
    provides: kitchenConfig mutations (updateConfig), kitchenDailyOverrides mutations (setDailyOverride, clearDailyOverride), kitchenShiftRecords mutations (updateShiftRecord)
  - phase: 21-02
    provides: kitchenShiftRecords queries (getShiftHistory, getShiftRecordsByDate) with product name enrichment
  - phase: 21-03
    provides: KitchenViewV2 restructured 3-section layout to wire manager components into
provides:
  - ManagerTargetSettings: default config form (maxTarget + bigBall + midBall + packaging mix) + today-only override panel with apply/clear
  - ShiftHistoryList: date-ranged grouped records with edit buttons (manager only)
  - ShiftEditDialog: pre-populated edit form with inventory impact confirmation before saving
  - Manager sections wired into KitchenViewV2 behind isManager role check
affects: [21-05, kitchen-page-management, production-targets]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "as unknown as ShiftRecord[] cast pattern for Convex query return type narrowing in ShiftHistoryList"
    - "groupByDate helper converts flat Convex records into date-keyed groups for UI display"
    - "two-phase confirmation: computeDeltas() before updateShiftRecord — inventory impact shown before committing"

key-files:
  created:
    - src/components/kitchen/ManagerTargetSettings.tsx
    - src/components/kitchen/ShiftHistoryList.tsx
    - src/components/kitchen/ShiftEditDialog.tsx
  modified:
    - src/pages/KitchenViewV2.tsx

key-decisions:
  - "ShiftHistoryList queries getShiftHistory with user.token directly (no prop) — token available via useAuth()"
  - "groupByDate uses ShiftRecord[] cast from unknown Convex return to avoid complex tsc-b inference issues"
  - "isManager check is UI-only gate; backend mutations enforce manager/admin via requireRole (standard project pattern)"
  - "ManagerTargetSettings defaultPackagingMix starts empty (getConfig doesn't expose it) — manager re-enters mix when editing defaults"

patterns-established:
  - "as unknown as T[] for Convex query return narrowing when local interface matches backend shape but tsc-b can't infer"

requirements-completed: [KIT-09, KIT-16, KIT-17, KIT-18]

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 21 Plan 04: Manager Kitchen Settings Summary

**ManagerTargetSettings + ShiftHistoryList + ShiftEditDialog components providing manager-only production config, daily override, and shift history editing with inventory impact confirmation, wired into KitchenViewV2 behind role-based visibility**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-22T16:34:40Z
- **Completed:** 2026-02-22T16:39:08Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ManagerTargetSettings: default config form (max target, bigBall, midBall, packaging mix editor with add/remove rows) + today-only override panel with active badge and clear button
- ShiftHistoryList: date range filter (last 7 days default), records grouped by date with product-name-enriched summaries, Edit button opens ShiftEditDialog
- ShiftEditDialog: pre-populated with existing produced + waste values, two-phase flow (edit form → inventory impact confirmation), updateShiftRecord mutation on confirm
- KitchenViewV2: imports all three components, adds `isManager` check, renders Manager Settings section below collapsible orders (separator + heading + ManagerTargetSettings + ShiftHistoryList)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ManagerTargetSettings, ShiftHistoryList, ShiftEditDialog** - `9eb5e33` (feat)
2. **Task 2: Wire manager components into KitchenViewV2** - `d5602da` (feat)

## Files Created/Modified
- `src/components/kitchen/ManagerTargetSettings.tsx` - Default config form + today override panel (KIT-09, KIT-18)
- `src/components/kitchen/ShiftHistoryList.tsx` - Date-ranged shift history grouped by date with edit buttons (KIT-16)
- `src/components/kitchen/ShiftEditDialog.tsx` - Pre-populated edit form + inventory impact confirmation (KIT-17)
- `src/pages/KitchenViewV2.tsx` - Added manager section behind isManager role check + kitchenConfig query

## Decisions Made
- ShiftHistoryList calls `useQuery(api.kitchenShiftRecords.queries.getShiftHistory, token ? { token, startDate, endDate } : "skip")` directly — no token prop needed
- ManagerTargetSettings defaultPackagingMix starts empty (getConfig doesn't return the packaging mix field) — manager re-enters when editing
- `as unknown as ShiftRecord[]` cast used in ShiftHistoryList to narrow Convex's inferred return type for groupByDate helper
- isManager = role === "manager" || role === "admin" — UI gate only, backend enforces auth via requireRole

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript build error in ShiftHistoryList groupByDate generic typing**
- **Found during:** Task 2 (build verification)
- **Issue:** `groupByDate` used `{ date: string; [key: string]: unknown }[]` generic; tsc-b couldn't assign `record._id` (type `unknown`) to React `key` prop
- **Fix:** Changed function signature to `ShiftRecord[]` and used `as unknown as ShiftRecord[]` cast at call site for Convex return type narrowing
- **Files modified:** src/components/kitchen/ShiftHistoryList.tsx
- **Verification:** `npm run build` passes cleanly
- **Committed in:** d5602da (included in Task 2 commit, same build verification pass)

---

**Total deviations:** 1 auto-fixed (Rule 1 - build error fix)
**Impact on plan:** Necessary for build to pass. No scope creep.

## Issues Encountered
None beyond the TypeScript type fix above.

## Next Phase Readiness
- Manager settings UI complete; kitchen staff sees targets + form only; managers see full management controls
- Plan 21-05 can proceed to final verification, integration testing, and CHANGELOG update
- Backend mutations (updateConfig, setDailyOverride, clearDailyOverride, updateShiftRecord) all enforced at server side

---
*Phase: 21-kitchen-production-targets*
*Completed: 2026-02-22*
