---
phase: 21-kitchen-production-targets
plan: "03"
subsystem: frontend
tags: [react, kitchen, ui, shift-records, production-targets]

# Dependency graph
requires:
  - phase: 21-01
    provides: kitchenConfig.queries.getKitchenTargetsForDate returning bigBalls/midBalls/packagingBreakdown
  - phase: 21-02
    provides: kitchenShiftRecords mutations (submitShiftRecord) and queries (getShiftRecordsByDate)
provides:
  - useKitchenTargets hook: WIB date + getKitchenTargetsForDate + getShiftRecordsByDate
  - ProductionTargetsBar: Original/Jumbo ball stat cards + packaging breakdown badges
  - EndOfShiftForm: 3-step flow (input -> review -> success) with waste section
  - ShiftReviewModal: inline produced+waste review screen with Confirm/Back
  - ShiftSuccessScreen: green checkmark success view with Done reset
  - KitchenViewV2: simplified 3-section layout replacing the 4-panel boxing/stickering UI
affects: [kitchen-staff-ux, 21-04, 21-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useProtectedMutation pattern for submitShiftRecord (auto-injects auth token)"
    - "3-step form state machine: input | review | success controlled by useState"
    - "WIB (UTC+7) date computation via useMemo in useKitchenTargets hook"
    - "All hooks called before conditionals (CLAUDE.md pitfall #9 compliance)"

key-files:
  created:
    - src/hooks/convex/useKitchenTargets.ts
    - src/components/kitchen/ProductionTargetsBar.tsx
    - src/components/kitchen/EndOfShiftForm.tsx
    - src/components/kitchen/ShiftReviewModal.tsx
    - src/components/kitchen/ShiftSuccessScreen.tsx
  modified:
    - src/pages/KitchenViewV2.tsx
    - src/hooks/convex/index.ts
    - src/components/kitchen/index.ts

key-decisions:
  - "EndOfShiftForm waste entries are expandable (toggle), not always visible — reduces cognitive load for kitchen staff"
  - "Orders section hidden by default via collapsible toggle (per user decision in plan)"
  - "Loading guard only on packingOrders (isProductionLoading) — targets and shift records show skeletons inline"
  - "BoxingPanel/StickeringPanel files NOT deleted — Phase 24 handles legacy cleanup"

patterns-established:
  - "3-step form pattern: input -> review -> success with inline review (not dialog)"
  - "Shift records compact card: submittedBy + time + totals in single row"

requirements-completed:
  - KIT-12
  - KIT-13
  - KIT-14
  - KIT-15

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 21 Plan 03: Kitchen Page Redesign — Production Targets + End-of-Shift Form Summary

**Redesigned KitchenViewV2 from 4-panel boxing/stickering layout into simplified 3-section production UI: targets at top, end-of-shift form in middle, collapsible orders at bottom**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-22T16:27:39Z
- **Completed:** 2026-02-22T16:32:00Z
- **Tasks:** 2
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments

- Created `useKitchenTargets` hook that provides today's targets (via `getKitchenTargetsForDate`) and shift records (via `getShiftRecordsByDate`) using WIB timezone date computation
- Created `ProductionTargetsBar` component with Original (MID_BALL/45g) and Jumbo (BIG_BALL/80g) stat cards plus packaging breakdown badges; shows zeros instead of hiding; no source label
- Created `EndOfShiftForm` with full 3-step flow: input (produced quantities per product + expandable waste section with reason dropdown), review (ShiftReviewModal), success (ShiftSuccessScreen); validates waste <= produced; calls `submitShiftRecord` via `useProtectedMutation`
- Created `ShiftReviewModal` as inline review screen (not dialog) with produced+waste summary, inventory note, and Confirm/Back buttons
- Created `ShiftSuccessScreen` with green checkmark, produced+waste text summary, and Done button to reset form
- Restructured `KitchenViewV2.tsx` from ~567 lines to ~240 lines: removed BoxingPanel/StickeringPanel/SwipeableKitchenLayout from render tree; added 4-section layout (targets, form, shift records, collapsible orders)
- Today's shift records shown as compact cards with submitter name, time, and produced/waste totals
- Orders hidden behind collapsible toggle with count badge; DueDateOrderList preserved for when expanded

## Task Commits

Each task was committed atomically:

1. **Task 1: useKitchenTargets + ProductionTargetsBar + EndOfShiftForm components** - `c76f2cf` (feat)
2. **Task 2: Restructure KitchenViewV2 into simplified 3-section layout** - `e9bf16a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/hooks/convex/useKitchenTargets.ts` - WIB date + getKitchenTargetsForDate + getShiftRecordsByDate queries; exported from index.ts
- `src/components/kitchen/ProductionTargetsBar.tsx` - Original/Jumbo stat cards + packaging breakdown badges; KitchenTargets type exported
- `src/components/kitchen/EndOfShiftForm.tsx` - 3-step form (input/review/success) with produced quantities and waste section
- `src/components/kitchen/ShiftReviewModal.tsx` - Inline review screen with produced+waste summary, Confirm/Back buttons
- `src/components/kitchen/ShiftSuccessScreen.tsx` - Success screen with checkmark, summary text, Done button
- `src/pages/KitchenViewV2.tsx` - Heavily restructured: 4-panel -> 3-section simplified layout
- `src/hooks/convex/index.ts` - Added useKitchenTargets re-export
- `src/components/kitchen/index.ts` - Added Phase 21 component exports

## Decisions Made

- EndOfShiftForm waste section is expandable via toggle rather than always visible — reduces cognitive load for kitchen staff who won't have waste every shift
- Orders section is hidden by default via collapsible toggle per the user decision in the plan ("Orders are hidden by default, accessible via collapsible toggle")
- Loading guard is placed only on packingOrders (isProductionLoading) — targets and shift records show inline skeleton/loading states rather than blocking the full page render
- BoxingPanel, StickeringPanel, and SwipeableKitchenLayout files are NOT deleted per plan instruction ("Do NOT delete the component files — Phase 24 handles cleanup")

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused imports causing build failure**
- **Found during:** Task 2 (after writing KitchenViewV2)
- **Issue:** `boxProducts`, `stickerProducts` mutations declared but never used; `useMutation`/`useAction` imported but never used
- **Fix:** Removed `boxProducts` and `stickerProducts` declarations (they aren't needed in the new simplified layout — only `togglePackOrderLineItem`, `markOrderReady`, `sendBack`, `setProductTarget` remain for the orders collapsible); removed unused `useMutation`/`useAction` imports
- **Files modified:** src/pages/KitchenViewV2.tsx
- **Commit:** e9bf16a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — unused imports caught by `tsc -b` strict mode)
**Impact on plan:** Minimal — import cleanup only, no logic changes.

## Self-Check: PASSED

- src/hooks/convex/useKitchenTargets.ts: FOUND
- src/components/kitchen/ProductionTargetsBar.tsx: FOUND
- src/components/kitchen/EndOfShiftForm.tsx: FOUND
- src/components/kitchen/ShiftReviewModal.tsx: FOUND
- src/components/kitchen/ShiftSuccessScreen.tsx: FOUND
- Commit c76f2cf: FOUND
- Commit e9bf16a: FOUND
- npm run type-check: PASSED
- npm run build: PASSED

---
*Phase: 21-kitchen-production-targets*
*Completed: 2026-02-22*
