---
phase: 63-interactive-visual-expense-tutorials
plan: 01
subsystem: ui
tags: [react, framer-motion, walkthrough, accessibility, aria, mock-ui, tailwind]

# Dependency graph
requires:
  - phase: 56-expense-training-guide
    provides: "help center infrastructure (CalloutBox, GuideLayout, barrel exports)"
provides:
  - "WalkthroughStep, WalkthroughWorkflow (with getBreadcrumb), MockPanelProps type definitions"
  - "11 mock UI primitives with HIGHLIGHT_CLASSES indigo glow styling"
  - "Generic WalkthroughPlayer engine with tabs, step list, mock viewport, annotation, keyboard nav"
  - "Barrel exports in walkthrough/index.ts and help/index.ts"
affects: [63-02-PLAN, future-kitchen-walkthrough, future-orders-walkthrough]

# Tech tracking
tech-stack:
  added: []
  patterns: ["mock UI primitives with HIGHLIGHT_CLASSES for walkthrough highlight styling", "framer-motion AnimatePresence mode=wait with composite key for step transitions", "getBreadcrumb on workflow data model (not hardcoded in player) for reusability"]

key-files:
  created:
    - src/components/help/walkthrough/types.ts
    - src/components/help/walkthrough/MockElements.tsx
    - src/components/help/WalkthroughPlayer.tsx
    - src/components/help/__tests__/WalkthroughPlayer.test.tsx
    - src/components/help/walkthrough/index.ts
  modified:
    - src/components/help/index.ts

key-decisions:
  - "Mock framer-motion in JSDOM tests to avoid AnimatePresence exit animation blocking"
  - "Mobile step pills rendered before desktop sidebar for JSDOM test accessibility (mobile pills visible by default in no-media-query environment)"
  - "Breadcrumb derived from workflow.getBreadcrumb(step) keeping player fully generic"

patterns-established:
  - "WalkthroughPlayer pattern: generic engine accepts WalkthroughWorkflow[] with per-workflow getBreadcrumb and mockComponent"
  - "Mock UI primitives: styled divs with HIGHLIGHT_CLASSES indigo glow, not real shadcn/ui components"
  - "vi.mock('framer-motion') pattern for testing AnimatePresence components in JSDOM"

requirements-completed: [VWT-01, VWT-02, VWT-09, VWT-10]

# Metrics
duration: 8min
completed: 2026-03-17
---

# Phase 63 Plan 01: Walkthrough Infrastructure Summary

**Generic WalkthroughPlayer engine with 11 mock UI primitives, AnimatePresence crossfade, keyboard nav, full ARIA accessibility, and 8 unit tests**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-17T05:19:27Z
- **Completed:** 2026-03-17T05:27:07Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created 3 TypeScript interfaces (WalkthroughStep, WalkthroughWorkflow with getBreadcrumb, MockPanelProps) as the walkthrough data model
- Built 11 mock UI primitives (MockFrame, MockLabel, MockInput, MockSelect, MockButton, MockField, MockRow, MockTable, MockBadge, MockUploadZone, MockNavDropdown) with shared HIGHLIGHT_CLASSES indigo glow styling
- Implemented generic WalkthroughPlayer engine with tabbed workflow switching, desktop step sidebar, mobile pill bar, AnimatePresence crossfade (150ms), keyboard navigation (ArrowLeft/ArrowRight clamped at boundaries), and full ARIA support
- 8 unit tests covering tab switching reset, keyboard clamping, CalloutBox conditional rendering, free step navigation, and custom breadcrumb

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared types + 11 mock element primitives** - `2b65972` (feat)
2. **Task 2: WalkthroughPlayer engine + unit tests + barrel exports** - `7fccf4c` (feat)

## Files Created/Modified
- `src/components/help/walkthrough/types.ts` - WalkthroughStep, WalkthroughWorkflow (with getBreadcrumb), MockPanelProps type definitions
- `src/components/help/walkthrough/MockElements.tsx` - 11 mock UI primitives with HIGHLIGHT_CLASSES indigo glow styling
- `src/components/help/WalkthroughPlayer.tsx` - Generic reusable walkthrough engine (tabs, step nav, mock viewport, annotation, keyboard nav, AnimatePresence)
- `src/components/help/__tests__/WalkthroughPlayer.test.tsx` - 8 unit tests for WalkthroughPlayer
- `src/components/help/walkthrough/index.ts` - Barrel export for walkthrough sub-components
- `src/components/help/index.ts` - Updated barrel with WalkthroughPlayer + type re-exports

## Decisions Made
- Mocked framer-motion in tests (vi.mock) to avoid AnimatePresence exit animation blocking state updates in JSDOM
- Moved mobile step pills before desktop sidebar in component render order so pills are visible in JSDOM (no media query evaluation) for reliable test interaction
- Kept getBreadcrumb on WalkthroughWorkflow data model rather than hardcoding breadcrumb logic in the player -- enables future Kitchen/Orders walkthroughs without modifying the player
- Used styled divs (not real shadcn/ui components) for all 11 mock primitives per locked design decision

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed framer-motion AnimatePresence blocking tests in JSDOM**
- **Found during:** Task 2 (WalkthroughPlayer tests)
- **Issue:** AnimatePresence mode="wait" prevents new content from rendering until exit animation completes; JSDOM doesn't run requestAnimationFrame, causing state updates to appear stuck
- **Fix:** Added vi.mock("framer-motion") to replace AnimatePresence and motion.div with pass-through wrappers in tests
- **Files modified:** src/components/help/__tests__/WalkthroughPlayer.test.tsx
- **Verification:** All 8 tests pass, full test suite (1073 tests) green
- **Committed in:** 7fccf4c (Task 2 commit)

**2. [Rule 1 - Bug] Fixed step button visibility in JSDOM test environment**
- **Found during:** Task 2 (WalkthroughPlayer tests)
- **Issue:** Desktop sidebar with `hidden md:flex` is display:none in JSDOM (no media queries); mobile pills with different text format ("3. Step A3" vs "Step A3") caused test selectors to fail
- **Fix:** Restructured component to render mobile pills before desktop sidebar; updated test selectors to use mobile pill text format
- **Files modified:** src/components/help/WalkthroughPlayer.tsx, src/components/help/__tests__/WalkthroughPlayer.test.tsx
- **Verification:** All 8 tests pass, npm run build succeeds
- **Committed in:** 7fccf4c (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for test correctness in JSDOM environment. No scope creep. Component behavior unchanged in browser.

## Issues Encountered
None beyond the test environment issues documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Walkthrough infrastructure complete and tested, ready for Plan 02 to wire workflow-specific mock components (SubmitMocks, ApproveMocks, ReimburseMocks) and integrate with ExpenseGuide
- All barrel exports in place for Plan 02 consumption
- WalkthroughPlayer accepts any WalkthroughWorkflow[] -- Plan 02 only needs to create workflow data objects with steps and mock components

## Self-Check: PASSED

All 6 files verified on disk. Both task commits (2b65972, 7fccf4c) verified in git log.

---
*Phase: 63-interactive-visual-expense-tutorials*
*Completed: 2026-03-17*
