---
phase: 56-expense-training-guide
plan: 01
subsystem: ui
tags: [react, help-center, guide, workflow-diagram, step-card, faq]

# Dependency graph
requires:
  - phase: 55-help-center-infrastructure
    provides: 7 reusable help components (WorkflowDiagram, StepCard, CalloutBox, FaqAccordion, RoleTag, GuideSection, GuideLayout), guide registry, GuideRouter, navigation integration
provides:
  - ExpenseGuide.tsx with 4 complete content sections (Overview, Submitting, Approving, Reimbursement) and 4 placeholder sections
  - Expenses guide registry entry set to "live" with component wired
  - Updated test expectations for live/coming-soon status split
affects: [56-02-expense-training-guide]

# Tech tracking
tech-stack:
  added: []
  patterns: [guide-metadata-duplication-for-circular-import-avoidance]

key-files:
  created:
    - src/pages/guides/ExpenseGuide.tsx
  modified:
    - src/lib/helpGuides.ts
    - src/lib/__tests__/helpGuides.test.ts

key-decisions:
  - "Duplicated guide metadata (title, description, sections, readTime) inline in ExpenseGuide.tsx to avoid circular import between helpGuides.ts and ExpenseGuide.tsx"

patterns-established:
  - "Guide metadata duplication: Guide pages define their own metadata constants instead of importing from helpGuides.ts to avoid circular dependency"

requirements-completed: [EGUIDE-01, EGUIDE-02, EGUIDE-03, EGUIDE-04, EGUIDE-05]

# Metrics
duration: 5min
completed: 2026-03-16
---

# Phase 56 Plan 01: Expense Guide Sections 1-4 Summary

**ExpenseGuide page with lifecycle/DoA/batch workflow diagrams, 16 StepCards, 8 CalloutBoxes, and FaqAccordion wired as first live help guide**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-16T11:53:19Z
- **Completed:** 2026-03-16T11:58:23Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Created ExpenseGuide.tsx with 4 fully rendered content sections and 4 placeholder sections for TOC completeness
- Wired expenses guide as "live" in the registry with component import, making the help center functional for the first time
- Updated test suite to verify expenses=live with component while others remain coming-soon

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ExpenseGuide.tsx with sections 1-4 and registry wiring** - `305ea70` (feat)

## Files Created/Modified
- `src/pages/guides/ExpenseGuide.tsx` - Full expense guide with 8 GuideSection blocks (4 complete, 4 placeholder), 3 WorkflowDiagrams, 16 StepCards, 8 CalloutBoxes, 1 FaqAccordion
- `src/lib/helpGuides.ts` - Added ExpenseGuide import, set expenses status to "live", wired component property
- `src/lib/__tests__/helpGuides.test.ts` - Updated registry tests: expenses=live with component, others=coming-soon

## Decisions Made
- Duplicated guide metadata inline in ExpenseGuide.tsx instead of importing from helpGuides.ts to break a circular import (helpGuides.ts imports ExpenseGuide, ExpenseGuide would import HELP_GUIDES from helpGuides.ts). The metadata is static and small (title, description, sections array, read time).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed circular import between helpGuides.ts and ExpenseGuide.tsx**
- **Found during:** Task 1 (initial implementation)
- **Issue:** Plan specified `const GUIDE = HELP_GUIDES.find(g => g.id === "expenses")!` in ExpenseGuide.tsx, but helpGuides.ts imports ExpenseGuide creating a circular dependency. HELP_GUIDES was undefined at module init time.
- **Fix:** Replaced HELP_GUIDES import with inline metadata constants (GUIDE_TITLE, GUIDE_DESCRIPTION, GUIDE_SECTIONS, GUIDE_READ_TIME) matching the registry entry
- **Files modified:** src/pages/guides/ExpenseGuide.tsx
- **Verification:** All 14 tests pass, type-check clean, build succeeds
- **Committed in:** 305ea70 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for module initialization. No scope creep. Guide metadata is duplicated but static and small.

## Issues Encountered
None beyond the circular import deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sections 5-8 (Payroll, Analytics, P&L, FAQ) are placeholder stubs ready for Plan 56-02 to fill in
- All 8 GuideSection IDs match the registry sections array, so TOC and deep links work for all sections
- Help center landing page now shows expenses guide as live (not dimmed)

## Self-Check: PASSED

- FOUND: src/pages/guides/ExpenseGuide.tsx
- FOUND: src/lib/helpGuides.ts
- FOUND: src/lib/__tests__/helpGuides.test.ts
- FOUND: .planning/phases/56-expense-training-guide/56-01-SUMMARY.md
- FOUND: commit 305ea70

---
*Phase: 56-expense-training-guide*
*Completed: 2026-03-16*
