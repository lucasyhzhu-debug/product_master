---
phase: 33-income-statement-frontend
plan: 33-04
subsystem: ui
tags: [react, refactoring, css-variables, dark-mode, component-extraction]

# Dependency graph
requires:
  - phase: 33-01
    provides: FinancialStatement.tsx page component (951 lines)
  - phase: 33-02
    provides: DataQualityPanel, ConfidenceIndicator, PLRow/ChannelRow inline components
  - phase: 33-03
    provides: csvExport.ts with inline computeDelta
provides:
  - Shared financialHelpers.tsx module (constants, computeDelta, format helpers, sub-components)
  - Extracted PLRow.tsx component
  - Extracted ChannelRow.tsx component
  - FinancialStatement.tsx reduced from 951 to 438 lines
  - All dark mode colors using CSS variable tokens
affects: [income-statement-frontend, income-statement-testing]

# Tech tracking
tech-stack:
  added: []
  patterns: [css-variable-tokens-for-status-colors, shared-helpers-module-for-financial-components]

key-files:
  created:
    - src/lib/financialHelpers.tsx
    - src/components/financials/PLRow.tsx
    - src/components/financials/ChannelRow.tsx
  modified:
    - src/pages/FinancialStatement.tsx
    - src/hooks/convex/useFinancials.ts
    - src/lib/csvExport.ts
    - src/components/financials/DataQualityPanel.tsx

key-decisions:
  - "Used .tsx extension for financialHelpers instead of .ts (plan spec) since file contains JSX components"
  - "Re-export Confidence type from financialHelpers for consumer convenience"

patterns-established:
  - "CSS variable tokens: Use var(--color-status-success/error/warning) for semantic status colors, not raw dark: overrides"
  - "Shared constants: WIB_OFFSET_MS and WEEK_MS defined once in financialHelpers, imported everywhere"
  - "Component extraction: Sub-components over 50 lines get their own file in the feature component directory"

requirements-completed: [IS-07, IS-08, IS-09, IS-10, IS-11, IS-12]

# Metrics
duration: 7min
completed: 2026-03-02
---

# Phase 33 Plan 04: Review Fixes Summary

**Chevron fix, dark mode CSS variable tokens, and component extraction reducing FinancialStatement from 951 to 438 lines**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-02T08:52:12Z
- **Completed:** 2026-03-02T08:59:29Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Extracted shared financialHelpers.tsx with WIB constants, computeDelta, format helpers, and 4 sub-components
- Extracted PLRow and ChannelRow into dedicated component files, reducing main page from 951 to 438 lines
- Fixed ChevronUp -> ChevronRight in SectionHeaderRow collapsed state (UX consistency)
- Replaced all 6 raw `dark:` color overrides with CSS variable tokens across 3 files
- Deduplicated computeDelta between FinancialStatement.tsx and csvExport.ts
- Deduplicated WIB_OFFSET_MS/WEEK_MS between useFinancials.ts and FinancialStatement.tsx

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared helpers module and extract components** - `d742fd2` (refactor)
2. **Task 2: Update imports in FinancialStatement.tsx, useFinancials.ts, csvExport.ts, DataQualityPanel.tsx** - `d4c5d60` (refactor)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `src/lib/financialHelpers.tsx` - Shared constants (WIB_OFFSET_MS, WEEK_MS), computeDelta, formatWeekRange, formatNegative, formatWithConfidence, DeltaIndicator, SectionHeaderRow, PLTableSkeleton, ErrorCard
- `src/components/financials/PLRow.tsx` - Extracted PLRow component with PLRowProps interface
- `src/components/financials/ChannelRow.tsx` - Extracted ChannelRow component with ChannelRowProps interface, CSS variable token fix for gross margin delta
- `src/pages/FinancialStatement.tsx` - Reduced from 951 to 438 lines, all extracted code removed, imports updated
- `src/hooks/convex/useFinancials.ts` - WIB_OFFSET_MS/WEEK_MS imported from shared helpers
- `src/lib/csvExport.ts` - computeDelta imported from shared helpers via formatDeltaPct wrapper
- `src/components/financials/DataQualityPanel.tsx` - Coverage tint colors use CSS variable tokens

## Decisions Made
- Used `.tsx` extension for `financialHelpers` instead of `.ts` (plan specified `.ts`) because the file contains JSX components (DeltaIndicator, SectionHeaderRow, PLTableSkeleton, ErrorCard). Using `.ts` would require `React.createElement` calls which are verbose and harder to maintain.
- Re-exported `Confidence` type from `financialHelpers.tsx` for consumer convenience, even though consumers can also import directly from `ConfidenceIndicator.tsx`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Changed financialHelpers from .ts to .tsx**
- **Found during:** Task 1 (Create shared helpers module)
- **Issue:** Plan specified `src/lib/financialHelpers.ts` but the file contains JSX components that need JSX syntax
- **Fix:** Used `.tsx` extension instead. All imports use `@/lib/financialHelpers` (no extension) so this is transparent to consumers.
- **Files modified:** src/lib/financialHelpers.tsx
- **Verification:** npm run type-check and npm run build both pass
- **Committed in:** d742fd2 (Task 1 commit)

**2. [Rule 1 - Bug] Removed unused ConfidenceIndicator import**
- **Found during:** Task 2 (Update imports)
- **Issue:** `ConfidenceIndicator` was imported in financialHelpers.tsx but never used (only the `Confidence` type is needed)
- **Fix:** Changed to `import { type Confidence }` only
- **Files modified:** src/lib/financialHelpers.tsx
- **Verification:** npm run build passes (tsc -b strict mode catches unused imports)
- **Committed in:** d4c5d60 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Minimal. File extension change is transparent to consumers. Unused import removal is standard cleanup.

## Issues Encountered
None - all refactoring was mechanical code movement and import updates.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 33 fully complete (4/4 plans delivered)
- All review feedback addressed
- Ready for merge to main, then Phase 34 (Testing & Documentation)

## Self-Check: PASSED

All 7 files verified present. Both task commits (d742fd2, d4c5d60) confirmed in git log.

---
*Phase: 33-income-statement-frontend*
*Completed: 2026-03-02*
