---
phase: 60-asset-register-depreciation
plan: 02
subsystem: api, database
tags: [convex, mutations, queries, depreciation, disposal, journal-engine, hooks, vitest, tdd]

# Dependency graph
requires:
  - phase: 60-01
    provides: fixedAssets schema, journalEngine types, pure helpers, GL accounts
  - phase: 42-journal-engine
    provides: createJournalEntryWithLines, createReversalEntry, buildDebitLine, buildCreditLine
  - phase: 41-schema-seed-counters
    provides: counters table, protectedMutation/protectedQuery, accounts table
provides:
  - 6 mutations: create, update, generateUploadUrl, runDepreciation, disposeAsset, voidDepreciationMonth
  - 4 queries: list, getById, getDepreciationPreview, getDepreciationReminder
  - 22 integration tests covering all mutation business logic
  - Frontend hooks with typed wrappers (useSessionQuery/createMutationHook)
  - Barrel re-export in src/hooks/convex/index.ts
affects: [60-03-PLAN, income-statement-reminder, asset-register-page]

# Tech tracking
tech-stack:
  added: []
  patterns: [batched thumbnail resolution in list query, compound JE for disposal, by_sourceType_date index usage for void]

key-files:
  created:
    - convex/fixedAssets/mutations.ts
    - convex/fixedAssets/queries.ts
    - convex/fixedAssets/mutations.test.ts
    - src/hooks/convex/useFixedAssets.ts
  modified:
    - src/hooks/convex/index.ts
    - convex/fixedAssets/helpers.ts

key-decisions:
  - "Disposal JEs use sourceType='manual' (not 'depreciation') to prevent voidDepreciationMonth from accidentally reversing them"
  - "GL accounts resolved ONCE at start of runDepreciation batch (Map cache), not per-iteration"
  - "voidDepreciationMonth recalculates lastDepreciationMonth from remaining non-reversed JEs using by_source index"
  - "Fixed calculateFinalMonthAmount rounding: returns full remainder when remaining < 2x monthly (prevents 1 IDR loss)"

patterns-established:
  - "Batch GL account resolution: resolve all needed accounts in parallel, cache in Map for iteration"
  - "Batched thumbnail resolution: collect first-attachment storageIds, resolve all URLs in single Promise.all pass"
  - "Compound JE pattern: disposal builds variable-length JE lines based on gain/loss direction"

requirements-completed: [ASSET-03, ASSET-04, ASSET-05, ASSET-06, ASSET-07, ASSET-08, DEPR-08, DEPR-09, DEPR-10, DISP-01, DISP-02, DISP-03, REMIND-01]

# Metrics
duration: 11min
completed: 2026-03-18
---

# Phase 60 Plan 02: Backend API + Integration Tests + Frontend Hooks Summary

**6 mutations (CRUD, batch depreciation, disposal, void) + 4 queries + 22 TDD tests + typed frontend hooks with batch GL resolution and compound disposal JEs**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-18T15:02:30Z
- **Completed:** 2026-03-18T15:13:30Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Complete backend API: create (FA-ABBR-YYMM-NNN numbering), update (non-financial fields), runDepreciation (batch catch-up with final-month accuracy), disposeAsset (compound gain/loss JE), voidDepreciationMonth (by_sourceType_date index, recalculates state from remaining JEs)
- 4 queries: list (batched thumbnail resolution), getById (enriched with category info + depreciation history), getDepreciationPreview (accurate totals), getDepreciationReminder (lightweight for Income Statement)
- 22 integration tests covering: CRUD (4), update (2), depreciation batch (4), disposal (4), void (3), preview accuracy (1), GL constants (2), numbering (2)
- Fixed calculateFinalMonthAmount rounding bug: prevents 1 IDR loss in final month of useful life
- Frontend hooks with createMutationHook factory (toast integration), barrel re-export in index.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend mutations (CRUD, depreciation batch, disposal, void, upload)** - `05e3229b` (feat)
2. **Task 2: Backend queries + frontend hooks + barrel export** - `4d76e4bc` (feat)
3. **Task 3: Backend mutation integration tests (TDD)** - `c58c3eb8` (test)

## Files Created/Modified
- `convex/fixedAssets/mutations.ts` - 6 mutations: create, update, generateUploadUrl, runDepreciation, disposeAsset, voidDepreciationMonth
- `convex/fixedAssets/queries.ts` - 4 queries: list, getById, getDepreciationPreview, getDepreciationReminder
- `convex/fixedAssets/mutations.test.ts` - 22 integration tests covering all mutation business logic
- `src/hooks/convex/useFixedAssets.ts` - React hooks wrapping all queries and mutations
- `src/hooks/convex/index.ts` - Barrel re-export of 10 hooks
- `convex/fixedAssets/helpers.ts` - Fixed calculateFinalMonthAmount rounding bug

## Decisions Made
- Disposal JEs use sourceType="manual" to prevent voidDepreciationMonth from accidentally reversing them -- distinct accounting events should not be conflated
- GL accounts resolved ONCE at start of runDepreciation (cached in Map), not per asset/month iteration -- reduces DB reads from O(assets*months) to O(categories)
- voidDepreciationMonth recalculates lastDepreciationMonth by querying remaining non-reversed JEs via by_source index, then finding max date -- handles non-consecutive void correctly
- Fixed calculateFinalMonthAmount: when remaining < 2x monthlyAmount, returns full remainder instead of min(monthly, remaining) -- prevents rounding loss in final month

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed calculateFinalMonthAmount rounding loss in final month**
- **Found during:** Task 3 (TDD tests revealed 1 IDR rounding loss)
- **Issue:** `min(monthlyAmount, remaining)` returns monthlyAmount when remaining exceeds it by 1 IDR due to rounding (e.g., 333334 remaining vs 333333 monthly), leaving asset 1 IDR short of fully_depreciated
- **Fix:** Changed to return `remaining` when `remaining < monthlyAmount * 2` (indicating final month), ensuring exact depreciation completion
- **Files modified:** convex/fixedAssets/helpers.ts
- **Verification:** All 39 existing helper tests + 22 new mutation tests pass, npm run build succeeds
- **Committed in:** c58c3eb8 (Task 3 commit)

**2. [Rule 3 - Blocking] Regenerated Convex _generated/api.ts after adding new files**
- **Found during:** Task 3 (build failed because `api.fixedAssets` not in generated types)
- **Issue:** New mutations.ts and queries.ts files were not reflected in auto-generated API types
- **Fix:** Ran `npx convex codegen` to regenerate types
- **Files modified:** convex/_generated/ (auto-generated, not committed)
- **Verification:** npm run build succeeds
- **Committed in:** Not separately committed (generated files)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 blocking)
**Impact on plan:** Bug fix was critical for correct fully_depreciated transition. Codegen regeneration is standard Convex workflow. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete backend API ready for Plan 03 (Asset Register page + Income Statement reminder)
- All hooks exported and ready for frontend consumption
- 61 tests total in fixedAssets (39 helper + 22 mutation) -- all green
- npm run build passes

---
*Phase: 60-asset-register-depreciation*
*Completed: 2026-03-18*
