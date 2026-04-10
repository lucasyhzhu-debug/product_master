---
phase: 51-bulk-upload-reimbursed-expenses
plan: 02
subsystem: api, testing
tags: [convex, tdd, csv-parsing, papaparse, journal-import, validation]

# Dependency graph
requires:
  - phase: 51-01
    provides: journalEntries.metadata field and CreateJournalEntryParams metadata parameter
  - phase: 42-journal-engine
    provides: createJournalEntryWithLines helper for JE creation
provides:
  - bulkCreateJournalEntries protectedMutation for batch JE creation
  - validateImportRow pure function for backend row validation
  - parseAndValidateCsv helper for client-side CSV parsing and validation
  - dateToWibEpoch strict YYYY-MM-DD to WIB midnight converter
affects: [51-03-PLAN (frontend wizard uses parseAndValidateCsv and bulkCreateJournalEntries)]

# Tech tracking
tech-stack:
  added: [papaparse ^5.5.3, @types/papaparse ^5.5.2]
  patterns: [parallel ImportRow types in backend/frontend with cross-reference comments, strict date regex for CSV security]

key-files:
  created:
    - convex/journalImport/mutations.ts
    - convex/journalImport/__tests__/mutations.test.ts
    - src/lib/csvImportValidation.ts
    - src/lib/__tests__/csvImportValidation.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Separate dateToWibEpoch from wibDateStrToUtcMs -- strict YYYY-MM-DD regex for CSV import security vs permissive Date.parse"
  - "Parallel ImportRow types in backend and frontend with cross-reference comments (not shared, to avoid Convex bundling issues)"
  - "Duplicate detection as warnings not errors -- same date+amount+description flagged but still importable"

patterns-established:
  - "CSV import validation: Papa Parse with header mode + trimmed headers for robust parsing"
  - "TDD for pure validation functions: test interface first, implement to pass"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-03-15
---

# Phase 51 Plan 02: Backend Mutation & Client CSV Validation Summary

**TDD-built bulkCreateJournalEntries mutation and parseAndValidateCsv helper with Papa Parse, 33 tests covering validation, date conversion, and duplicate detection**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-15T02:36:59Z
- **Completed:** 2026-03-15T02:42:40Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Built `bulkCreateJournalEntries` protectedMutation with fail-fast batch validation (max 50 rows, admin-only)
- Built `validateImportRow` pure function validating description, amount (positive integer), account code (exists + active)
- Built `parseAndValidateCsv` with Papa Parse for CSV parsing, row-level validation, WIB date conversion, and duplicate warnings
- Built `dateToWibEpoch` with strict YYYY-MM-DD regex (intentionally separate from permissive wibDateStrToUtcMs)
- Installed Papa Parse as runtime dependency for browser-side CSV parsing
- 33 total tests passing (11 backend + 22 frontend), 931 full suite green

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend mutation tests (RED)** - `2bd0cbd` (test)
2. **Task 1: Backend mutation implementation (GREEN)** - `312fcc7` (feat)
3. **Task 2: Install Papa Parse** - `cfa4026` (deps)
4. **Task 2: Client CSV validation tests (RED)** - `e9d78a7` (test)
5. **Task 2: Client CSV validation implementation (GREEN)** - `0addd62` (feat)

## Files Created/Modified
- `convex/journalImport/mutations.ts` - bulkCreateJournalEntries mutation + validateImportRow pure function
- `convex/journalImport/__tests__/mutations.test.ts` - 11 backend validation tests
- `src/lib/csvImportValidation.ts` - parseAndValidateCsv + dateToWibEpoch helpers
- `src/lib/__tests__/csvImportValidation.test.ts` - 22 client validation tests
- `package.json` - Added papaparse runtime + @types/papaparse dev dependency
- `package-lock.json` - Lock file updated

## Decisions Made
- Intentionally did NOT import `wibDateStrToUtcMs` from `dateUtils.ts` -- `dateToWibEpoch` uses strict YYYY-MM-DD regex for CSV import security, whereas `wibDateStrToUtcMs` accepts any `Date.parse`-able string
- Parallel `ImportRow` types in backend (`convex/journalImport/mutations.ts`) and frontend (`src/lib/csvImportValidation.ts`) with cross-reference comments -- sharing would require Convex to bundle the frontend module
- Duplicate rows produce warnings (not errors) -- users may intentionally have same-date same-amount expenses

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend mutation ready for frontend wizard to call via batched requests
- CSV validation helpers ready for import preview UI
- Receipt URL metadata flows through journal engine to JE records
- No blockers for Plan 03 (frontend hook + wizard page)

## Self-Check: PASSED

- convex/journalImport/mutations.ts: FOUND
- convex/journalImport/__tests__/mutations.test.ts: FOUND
- src/lib/csvImportValidation.ts: FOUND
- src/lib/__tests__/csvImportValidation.test.ts: FOUND
- package.json (papaparse): FOUND
- Commit 2bd0cbd: FOUND
- Commit 312fcc7: FOUND
- Commit cfa4026: FOUND
- Commit e9d78a7: FOUND
- Commit 0addd62: FOUND

---
*Phase: 51-bulk-upload-reimbursed-expenses*
*Completed: 2026-03-15*
