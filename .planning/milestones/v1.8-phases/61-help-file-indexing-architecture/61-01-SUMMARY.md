---
phase: 61-help-file-indexing-architecture
plan: 01
subsystem: infra
tags: [docs-manifest, documentation-drift, validation-script, component-refactor]

# Dependency graph
requires:
  - phase: 63-interactive-visual-expense-tutorials
    provides: Walkthrough-based ExpenseGuide with 6 sections (overview, walkthrough, payroll, analytics, pnl, faq)
provides:
  - docs-manifest.json mapping source file globs to tutorial section files
  - validate:docs-manifest npm script for manifest structural validation
  - ExpenseGuide refactored into 6 section-level files for granular drift detection
affects: [61-02, help-file-indexing, documentation-drift-detection]

# Tech tracking
tech-stack:
  added: []
  patterns: [docs-manifest-pattern, section-file-architecture]

key-files:
  created:
    - .planning/docs-manifest.json
    - scripts/validate-docs-manifest.cjs
    - src/pages/guides/ExpenseGuide/index.tsx
    - src/pages/guides/ExpenseGuide/OverviewSection.tsx
    - src/pages/guides/ExpenseGuide/WalkthroughSection.tsx
    - src/pages/guides/ExpenseGuide/PayrollSection.tsx
    - src/pages/guides/ExpenseGuide/AnalyticsSection.tsx
    - src/pages/guides/ExpenseGuide/PnlSection.tsx
    - src/pages/guides/ExpenseGuide/FaqSection.tsx
  modified:
    - package.json
    - src/pages/guides/ExpenseGuide.tsx (deleted)

key-decisions:
  - "Adapted plan from 8 sections to 6 -- Phase 63 merged submitting/approving/reimbursement into walkthrough"
  - "Walkthrough section includes old deep-link redirect anchors for backward compatibility"
  - "docs-manifest.json uses 6 mappings matching actual sections, not planned 8"
  - "FaqSection.tsx keeps React import with void suppression for JSX in constant definitions"

patterns-established:
  - "Section-file pattern: each guide section is a standalone component with co-located data constants"
  - "docs-manifest pattern: JSON mapping source globs to doc files with lastReviewedCommit for drift detection"
  - "Validation script pattern: CJS script in scripts/ with PASS/FAIL/WARN output and exit code semantics"

requirements-completed: [HIDX-01, HIDX-02, HIDX-03]

# Metrics
duration: 11min
completed: 2026-03-17
---

# Phase 61 Plan 01: Help File Indexing Architecture Summary

**docs-manifest.json with 6 expense guide mappings, validate:docs-manifest script, and ExpenseGuide refactored into 6 section files for granular drift detection**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-17T17:05:50Z
- **Completed:** 2026-03-17T17:17:37Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Created docs-manifest.json with version, guides registry, and 6 source-to-doc mappings for expense guide sections
- Built validate-docs-manifest.cjs with 6 validation checks (JSON structure, duplicate IDs, required fields, docFile existence, section coverage, orphan detection)
- Refactored monolithic ExpenseGuide.tsx (705 lines) into 6 section files + index.tsx composing them
- All verification passes: type-check, build, validate:docs-manifest

## Task Commits

Each task was committed atomically:

1. **Task 1: Create docs-manifest.json and validation script** - `d939665` (chore)
2. **Task 2: Refactor ExpenseGuide into section files** - `70119ea` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `.planning/docs-manifest.json` - Source-to-doc mapping manifest with 6 expense guide entries
- `scripts/validate-docs-manifest.cjs` - Manifest validation script (6 checks, exit code semantics)
- `package.json` - Added validate:docs-manifest npm script
- `src/pages/guides/ExpenseGuide/index.tsx` - Composing component importing all 6 sections
- `src/pages/guides/ExpenseGuide/OverviewSection.tsx` - Lifecycle diagram + role summary table
- `src/pages/guides/ExpenseGuide/WalkthroughSection.tsx` - Interactive submit/approve/reimburse walkthroughs + old deep-link anchors
- `src/pages/guides/ExpenseGuide/PayrollSection.tsx` - Payroll steps + FAQ accordion
- `src/pages/guides/ExpenseGuide/AnalyticsSection.tsx` - Dashboard cards + fraud flags
- `src/pages/guides/ExpenseGuide/PnlSection.tsx` - Journal entry flow diagram
- `src/pages/guides/ExpenseGuide/FaqSection.tsx` - 5-group FAQ with JSX answer values
- `src/pages/guides/ExpenseGuide.tsx` - DELETED (replaced by directory)

## Decisions Made
- Adapted plan from 8 section files to 6: Phase 63 had already merged submitting/approving/reimbursement into a single walkthrough section with WalkthroughPlayer. The plan was written before Phase 63 shipped.
- docs-manifest.json updated to 6 mappings matching actual sections. The walkthrough mapping covers source globs from all three original sections (mutations, helpers, fraudHelpers, queries).
- FaqSection.tsx retains `import React` with `void React` suppression because FULL_FAQ constant contains JSX expressions in `answer` values (outside component return). While react-jsx transform handles it, the explicit import documents the dependency clearly.
- Old deep-link anchors (submitting, approving, reimbursement) moved into WalkthroughSection to maintain backward compatibility for bookmarked URLs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan assumed 8 sections but current code has 6**
- **Found during:** Task 2 (Refactor ExpenseGuide)
- **Issue:** Plan was written before Phase 63 which merged submitting/approving/reimbursement sections into a single walkthrough section. The current ExpenseGuide.tsx has 6 sections, not 8.
- **Fix:** Created 6 section files (OverviewSection, WalkthroughSection, PayrollSection, AnalyticsSection, PnlSection, FaqSection) matching actual code. Updated docs-manifest.json from 8 mappings to 6.
- **Files modified:** All section files, docs-manifest.json
- **Verification:** npm run type-check, npm run build, npm run validate:docs-manifest all pass
- **Committed in:** 70119ea (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Section count adjusted to match reality. No scope creep -- same architecture, fewer files.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- docs-manifest.json is ready for Plan 02 to build the check-docs and update-docs skills on top of
- Section-file architecture established; future guides can follow the same pattern
- validate:docs-manifest passes cleanly with all 6 section files in place

## Self-Check: PASSED

All 9 created files found. Old ExpenseGuide.tsx confirmed deleted. Both task commits (d939665, 70119ea) found in git log.

---
*Phase: 61-help-file-indexing-architecture*
*Completed: 2026-03-17*
