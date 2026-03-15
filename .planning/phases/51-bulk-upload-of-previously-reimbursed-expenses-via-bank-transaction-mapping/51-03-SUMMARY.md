---
phase: 51-bulk-upload-of-previously-reimbursed-expenses-via-bank-transaction-mapping
plan: 03
subsystem: ui, api
tags: [react, wizard, csv-import, progress-bar, lazy-route, convex-hooks]

# Dependency graph
requires:
  - phase: 51-02
    provides: bulkCreateJournalEntries mutation and parseAndValidateCsv helper
  - phase: 43-chart-of-accounts-management
    provides: accounts.queries.list for CoA reference download
provides:
  - HistoricalImportPage wizard page at /import with 5 wizard states
  - useBulkCreateJournalEntries hook for batched mutation calls
  - Route registration with canManageReimbursements guard (admin-only)
  - Navigation link from AccountsManager to /import
affects: [51-04-PLAN (verification and documentation)]

# Tech tracking
tech-stack:
  added: []
  patterns: [discriminated union wizard state, sequential batch import with progress, Blob CSV download]

key-files:
  created:
    - src/hooks/convex/useJournalImport.ts
    - src/pages/HistoricalImportPage.tsx
  modified:
    - src/App.tsx
    - src/pages/AccountsManager.tsx
    - src/hooks/convex/index.ts
    - convex/_generated/api.d.ts

key-decisions:
  - "Convex codegen required to register journalImport module in generated API types"
  - "Import button placed above EntityManager in AccountsManager (EntityManager has no action slot prop)"
  - "WIB date recovery in groupByPeriod adds 7h offset to stored epoch for correct month bucketing"

patterns-established:
  - "CSV download via Blob + URL.createObjectURL + synthetic anchor click"
  - "Discriminated union WizardState for type-safe step transitions"
  - "Sequential batch import with per-batch error recovery and retry-from-failure"

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-03-15
---

# Phase 51 Plan 03: Frontend Hook + Wizard Page + Route Registration Summary

**CSV import wizard at /import with template downloads, row-level validation review, summary tables, and sequential batched import with progress bar and retry-from-failure**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-15T02:46:16Z
- **Completed:** 2026-03-15T02:53:10Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Built HistoricalImportPage with 5+1 wizard states (upload, validating, review, importing, complete, error)
- Template CSV download and CoA reference CSV download with proper escaping
- Review state with error table, warning list, summary cards, by-GL-account table, and by-period table
- Sequential batch import (50 rows/batch) with radix-ui Progress bar and batch counter
- Retry-from-failure support re-enters importing from the failed batch index
- Route registration at /import with canManageReimbursements admin guard
- Navigation button from AccountsManager page to /import for discoverability

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useJournalImport hook and HistoricalImportPage** - `14ef042` (feat)
2. **Task 2: Register route and add navigation link** - `2d82cb8` (feat)

## Files Created/Modified
- `src/hooks/convex/useJournalImport.ts` - Hook wrapping bulkCreateJournalEntries via createMutationHook
- `src/pages/HistoricalImportPage.tsx` - Linear wizard page with 5+1 states (~370 lines)
- `src/App.tsx` - Lazy import + /import route with ProtectedRoute guard
- `src/pages/AccountsManager.tsx` - Added navigation button to /import
- `src/hooks/convex/index.ts` - Barrel re-export of useBulkCreateJournalEntries
- `convex/_generated/api.d.ts` - Regenerated to include journalImport module

## Decisions Made
- Ran `npx convex codegen` to regenerate API types -- the journalImport module from Plan 02 was not yet registered in the generated types, causing build failure (Rule 3 auto-fix)
- Placed import button above EntityManager in AccountsManager since EntityManager does not expose an action slot prop -- wrapping in a div with the button provides clean layout
- groupByPeriod adds WIB offset (7h) to stored epoch to recover the correct YYYY-MM for period bucketing display

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Regenerated Convex API types for journalImport module**
- **Found during:** Task 2 (build verification)
- **Issue:** `convex/_generated/api.d.ts` did not include the `journalImport` module created in Plan 02 -- `api.journalImport.mutations.bulkCreateJournalEntries` caused TS2339
- **Fix:** Ran `npx convex codegen` to regenerate the API types
- **Files modified:** `convex/_generated/api.d.ts`, `convex/_generated/api.js`
- **Verification:** `npm run build` passes, type-check clean
- **Committed in:** `2d82cb8` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for build to pass. No scope creep.

## Issues Encountered
None beyond the codegen deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend wizard fully functional at /import
- Admin can upload CSV, review validation, and confirm import
- Ready for Plan 04 (verification, documentation, smoke test)
- No blockers

## Self-Check: PASSED

- src/hooks/convex/useJournalImport.ts: FOUND
- src/pages/HistoricalImportPage.tsx: FOUND
- src/App.tsx (HistoricalImportPage import): FOUND
- src/pages/AccountsManager.tsx (navigate to /import): FOUND
- src/hooks/convex/index.ts (useBulkCreateJournalEntries export): FOUND
- Commit 14ef042: FOUND
- Commit 2d82cb8: FOUND

---
*Phase: 51-bulk-upload-of-previously-reimbursed-expenses-via-bank-transaction-mapping*
*Completed: 2026-03-15*
