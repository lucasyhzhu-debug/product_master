---
phase: 60-asset-register-depreciation
plan: 01
subsystem: database, api
tags: [convex, schema, journal-engine, depreciation, psak, tdd, vitest, gl-accounts]

# Dependency graph
requires:
  - phase: 42-journal-engine
    provides: journalEngine.ts with createJournalEntryWithLines, createReversalEntry, validateVoidPairing
  - phase: 41-schema-seed-counters
    provides: accounts table, seedDefaults mutation, counter.ts
provides:
  - fixedAssets table definition in convex/schema.ts with 3 indexes
  - journalEntries sourceType extended with depreciation/depreciation_void
  - journalEntries by_sourceType_date compound index for efficient depreciation queries
  - journalEngine.ts types synchronized across 5 locations
  - 10 new GL accounts in seedDefaults (6150, 1610-1670, 7300, 7400)
  - Pure helper functions for depreciation calculation, missing months, disposal, CSV parsing
  - ASSET_CATEGORIES constant with 8 PSAK-aligned entries
  - DEPRECIATION_EXPENSE_CODE constant ("6150")
affects: [60-02-PLAN, 60-03-PLAN, income-statement, expense-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns: [YYMM asset numbering (distinct from MMDD counter), per-category contra-asset GL accounts, final-month remainder handling]

key-files:
  created:
    - convex/fixedAssets/helpers.ts
    - convex/fixedAssets/__tests__/helpers.test.ts
  modified:
    - convex/schema.ts
    - convex/lib/journalEngine.ts
    - convex/lib/__tests__/journalEngine.test.ts
    - convex/accounts/mutations.ts
    - convex/accounts/__tests__/seed.test.ts

key-decisions:
  - "GL code 6150 for Depreciation Expense (6300 already taken by Transportation)"
  - "1600 Accumulated Depreciation deactivated, replaced by per-category 1610-1670"
  - "YYMM format for asset numbers (year-first for cross-year identification)"
  - "computeMissingMonths uses WIB timezone via getWibComponents for acquisition month"

patterns-established:
  - "ASSET_CATEGORIES as const array with derived AssetCategoryKey type (matches TEMPLATE_TYPES pattern)"
  - "DEPRECIATION_EXPENSE_CODE as single source of truth for GL code reference"
  - "Final month remainder via calculateFinalMonthAmount to prevent over-depreciation"
  - "First-comma split in parseCharacteristicsCSV to support values containing commas"

requirements-completed: [ASSET-01, ASSET-02, DEPR-01, DEPR-02, DEPR-03, DEPR-04, DEPR-05, DEPR-06, DEPR-07, GL-01]

# Metrics
duration: 10min
completed: 2026-03-18
---

# Phase 60 Plan 01: Schema + Journal Engine + Helpers Summary

**fixedAssets table with 3 indexes, journalEngine extended with depreciation types, 10 GL accounts seeded, 39 TDD-tested pure helpers for straight-line depreciation, disposal, and PSAK categories**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-18T14:46:58Z
- **Completed:** 2026-03-18T14:57:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- fixedAssets table in schema with all required fields (25 columns) and 3 indexes (by_status, by_category, by_asset_number)
- journalEntries sourceType union extended with depreciation/depreciation_void and new by_sourceType_date compound index
- journalEngine.ts types synchronized across all 5 locations (JournalSourceType, VoidSourceType, ReversibleSourceType, VALID_VOID_PAIRS, NON_REVERSIBLE_TYPES)
- 10 new GL accounts: 6150 Depreciation Expense, 1610-1670 per-category Accum Depr, 7300/7400 disposal gain/loss
- 8 PSAK-aligned categories with correct defaults (Tanah non-depreciable, correct useful life and salvage percentages)
- All pure helpers tested with edge cases: final month remainder, fully depreciated assets, year boundaries, CSV with commas in values

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema extension + journal engine sync + GL account seeding** - `0393dbb7` (feat)
2. **Task 2: Pure helper functions with TDD tests** - `60a54e1f` (feat)

_Both tasks followed TDD: RED (failing tests) -> GREEN (implementation) -> verified_

## Files Created/Modified
- `convex/schema.ts` - Added fixedAssets table, extended journalEntries sourceType, added by_sourceType_date index
- `convex/lib/journalEngine.ts` - Extended 5 type definitions with depreciation/depreciation_void
- `convex/lib/__tests__/journalEngine.test.ts` - Added 5 depreciation void pairing tests
- `convex/accounts/mutations.ts` - Added 10 GL accounts, deactivated 1600
- `convex/accounts/__tests__/seed.test.ts` - Updated counts (49 total), added Phase 60 assertions
- `convex/fixedAssets/helpers.ts` - 9 exports: ASSET_CATEGORIES, calculateMonthlyDepreciation, calculateFinalMonthAmount, computeMissingMonths, formatAssetNumber, getYYMMDateStr, calculateDisposalGainLoss, parseCharacteristicsCSV, DEPRECIATION_EXPENSE_CODE
- `convex/fixedAssets/__tests__/helpers.test.ts` - 39 comprehensive tests across 8 describe blocks

## Decisions Made
- Used 6150 for Depreciation Expense (CONTEXT.md said 6300 but that code is already assigned to Transportation (Local))
- Deactivated 1600 Accumulated Depreciation (isActive: false) and added per-category 1610-1670 accounts
- YYMM format for asset numbering (distinct from counter.ts MMDD) -- year-first is intentional for cross-year identification
- First-comma-only split in parseCharacteristicsCSV to support values containing commas (e.g., addresses)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated seed test counts after adding new accounts**
- **Found during:** Task 1 (GL account seeding)
- **Issue:** Existing seed.test.ts hardcoded 39 accounts, 11 opex, 3 other, 6 assets; also asserted all isActive: true
- **Fix:** Updated to 49 accounts, 12 opex, 5 other, 13 assets; separated isSystem test from isActive; added 1600 deactivation test
- **Files modified:** convex/accounts/__tests__/seed.test.ts
- **Verification:** All 8 seed tests pass
- **Committed in:** 0393dbb7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug fix)
**Impact on plan:** Necessary to keep existing test suite green after adding GL accounts. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. New GL accounts will be seeded on next `accounts:seedDefaults` run.

## Next Phase Readiness
- Schema and types ready for Plan 02 (CRUD mutations, depreciation batch, disposal, void)
- All pure helpers available for import from convex/fixedAssets/helpers.ts
- journalEngine fully synchronized -- no type mismatches when using depreciation sourceType
- 1151 tests passing, npm run build succeeds

---
*Phase: 60-asset-register-depreciation*
*Completed: 2026-03-18*
