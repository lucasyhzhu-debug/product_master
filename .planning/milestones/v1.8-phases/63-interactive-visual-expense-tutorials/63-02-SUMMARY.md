---
phase: 63-interactive-visual-expense-tutorials
plan: 02
subsystem: ui
tags: [react, walkthrough, mock-ui, help-center, framer-motion]

# Dependency graph
requires:
  - phase: 63-interactive-visual-expense-tutorials (plan 01)
    provides: WalkthroughPlayer engine, MockElements primitives, walkthrough types
  - phase: 56-expense-training-guide
    provides: ExpenseGuide component, helpGuides registry, GuideSection/StepCard/FaqAccordion
provides:
  - 3 workflow-specific mock components (Submit 4 steps, Approve 3 steps, Reimburse 6 steps)
  - ExpenseGuide consolidated from 8 sections to 6 with WalkthroughPlayer integration
  - Updated helpGuides registry with walkthrough section and corrected POPULAR_QUESTIONS anchors
  - Redirect anchors for old deep links (#submitting, #approving, #reimbursement)
  - 2 FAQ items migrated from deleted SUBMITTING_FAQ to FULL_FAQ Submission group
affects: [help-center, expense-guide, future-walkthrough-guides]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Workflow-owned breadcrumb via getBreadcrumb function on WalkthroughWorkflow"
    - "Redirect anchors for deprecated deep links using sr-only hidden divs"
    - "Direct import of mock components (not barrel) to avoid circular imports"

key-files:
  created:
    - src/components/help/walkthrough/SubmitMocks.tsx
    - src/components/help/walkthrough/ApproveMocks.tsx
    - src/components/help/walkthrough/ReimburseMocks.tsx
  modified:
    - src/pages/guides/ExpenseGuide.tsx
    - src/lib/helpGuides.ts
    - src/lib/__tests__/helpGuides.test.ts
    - src/components/help/walkthrough/index.ts
    - docs/superpowers/specs/2026-03-16-help-center-design.md
    - docs/UI_BRAND_REFERENCE.md
    - docs/CODE_STYLE.md
    - CLAUDE.md
    - docs/CHANGELOG.md

key-decisions:
  - "Workflow data owns breadcrumb logic via getBreadcrumb (expense-specific knowledge stays in ExpenseGuide, not generic player)"
  - "2 FAQ items migrated to FULL_FAQ Submission group; third (duplicate handling) covered by walkthrough annotations"
  - "Old deep link anchors preserved as sr-only hidden divs, not removed"
  - "readTimeMinutes reduced from 15 to 10 to reflect faster interactive format"
  - "Walkthrough section has no role field (visible to all users, not role-gated)"

patterns-established:
  - "Workflow mock components receive MockPanelProps and conditionally render/highlight based on currentStep"
  - "Redirect anchors pattern: hidden sr-only divs with old IDs placed before new section"

requirements-completed: [VWT-03, VWT-04, VWT-05, VWT-06, VWT-07, VWT-08]

# Metrics
duration: 16min
completed: 2026-03-17
---

# Phase 63 Plan 02: Expense Walkthrough Content Summary

**3 workflow mock components (13 steps) wired into ExpenseGuide via WalkthroughPlayer, sections consolidated from 8 to 6 with redirect anchors for old deep links**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-17T05:20:08Z
- **Completed:** 2026-03-17T05:36:00Z
- **Tasks:** 2 (of 3 -- Task 3 is human verification checkpoint)
- **Files modified:** 14

## Accomplishments
- Created 3 workflow-specific mock components with 13 total interactive steps using MockElements primitives
- Replaced 3 text-heavy guide sections with single WalkthroughPlayer section, consolidating from 8 to 6 sections
- Migrated 2 FAQ items from deleted SUBMITTING_FAQ to FULL_FAQ Submission group (now 5 items)
- Added hidden redirect anchors for backward-compatible deep links (#submitting, #approving, #reimbursement)
- Updated helpGuides registry (6 sections, readTimeMinutes 10, walkthrough anchors in POPULAR_QUESTIONS)
- Updated 3 test assertions to use explicit counts instead of fragile toBeGreaterThan
- Updated 5 documentation files in separate commit for clean git history
- All 1073 tests pass, build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Three workflow mock components** - `56124ae` (feat)
2. **Task 2a: ExpenseGuide + helpGuides + tests** - `0375309` (feat)
3. **Task 2b: Documentation updates** - `b13e319` (docs)

## Files Created/Modified

**Created:**
- `src/components/help/walkthrough/SubmitMocks.tsx` - 4-step Submit Expense mock panels (navigate, fill, receipt, save)
- `src/components/help/walkthrough/ApproveMocks.tsx` - 3-step Approve Expense mock panels (queue, review, approve/reject)
- `src/components/help/walkthrough/ReimburseMocks.tsx` - 6-step Reimburse mock panels (open, review, batch, transfer, confirm, done)

**Modified:**
- `src/components/help/walkthrough/index.ts` - Added 3 mock component barrel exports
- `src/pages/guides/ExpenseGuide.tsx` - Replaced sections 2-4 with WalkthroughPlayer, deleted 5 constants, added workflow data, migrated FAQ items, added redirect anchors
- `src/lib/helpGuides.ts` - 6 sections, readTimeMinutes 10, walkthrough anchors
- `src/lib/__tests__/helpGuides.test.ts` - Updated 3 test assertions for new section structure
- `docs/superpowers/specs/2026-03-16-help-center-design.md` - WalkthroughPlayer API and mock element documentation
- `docs/UI_BRAND_REFERENCE.md` - Tutorial walkthrough pattern section
- `docs/CODE_STYLE.md` - Mock element convention entry
- `CLAUDE.md` - Tutorial walkthroughs row in Quick File Finder
- `docs/CHANGELOG.md` - Phase 63 changelog entry

## Decisions Made
- Workflow data owns breadcrumb logic via getBreadcrumb (not hardcoded in player) -- keeps player generic for future guides
- 2 of 3 SUBMITTING_FAQ items migrated to FULL_FAQ; third (duplicate handling) covered by walkthrough step warnings
- Old deep link anchors preserved as hidden sr-only divs rather than removed -- ensures backward compatibility
- readTimeMinutes reduced from 15 to 10 to reflect faster interactive walkthrough format
- Walkthrough section has no role field -- visible to all users regardless of role

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created Plan 01 infrastructure (WalkthroughPlayer, types, MockElements, tests)**
- **Found during:** Pre-execution dependency check
- **Issue:** Plan 02 depends on Plan 01 which had not been fully executed (only types.ts and MockElements.tsx were committed). WalkthroughPlayer, tests, and barrel exports were missing.
- **Fix:** Created remaining Plan 01 files: WalkthroughPlayer.tsx, WalkthroughPlayer.test.tsx, walkthrough/index.ts, updated help/index.ts
- **Files modified:** src/components/help/WalkthroughPlayer.tsx, src/components/help/__tests__/WalkthroughPlayer.test.tsx, src/components/help/walkthrough/index.ts, src/components/help/index.ts
- **Verification:** 8 WalkthroughPlayer tests pass, type-check passes
- **Committed in:** 7fccf4c

**2. [Rule 1 - Bug] Fixed WalkthroughPlayer test targeting for JSDOM environment**
- **Found during:** Rule 3 deviation (creating Plan 01 tests)
- **Issue:** Tests targeted desktop sidebar buttons (hidden via `hidden md:flex` in JSDOM where responsive classes don't apply). Clicks on hidden elements had no effect.
- **Fix:** Updated tests to target mobile pill buttons (visible in JSDOM) using "N. Step Title" format. Added framer-motion mock to prevent AnimatePresence blocking re-renders.
- **Files modified:** src/components/help/__tests__/WalkthroughPlayer.test.tsx
- **Verification:** All 8 tests pass
- **Committed in:** 7fccf4c

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both deviations were necessary to create the missing dependency. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Task 3 (human visual verification) is a checkpoint -- requires manual inspection of the running app
- All code is committed and build passes; ready for visual review
- Future walkthrough guides (Kitchen, Orders) can reuse the WalkthroughPlayer engine by providing new WalkthroughWorkflow arrays

## Self-Check: PASSED

All 12 created/modified files verified present on disk. All 4 task commits verified in git log.

---
*Phase: 63-interactive-visual-expense-tutorials*
*Completed: 2026-03-17*
