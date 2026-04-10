---
phase: 71-bulk-expense-upload-asset-reclassification
plan: 01
subsystem: database, api
tags: [convex, expenses, fixed-assets, journal-entries, bulk-import, reclassification]

requires:
  - phase: 60-asset-register-depreciation
    provides: disposeAsset mutation, ASSET_CATEGORIES, resolveAccount
  - phase: 44-expense-submission
    provides: expense creation pattern, auditTrail, constants
provides:
  - bulkCreateExpenses protectedMutation with trust-mode branching
  - disposeAsset reclassify_to_expense disposal type with compound JE
  - CATEGORY_TO_EXPENSE_ACCOUNT mapping + getReclassificationExpenseCode helper
  - Schema fields: sourceAssetId, importBatchId on expenses table
affects: [71-03-csv-upload-ui, 71-04-asset-reclassification-ui]

tech-stack:
  added: []
  patterns: [trust-mode-branching, compound-je-reclassification]

key-files:
  created: [convex/expenses/bulkMutations.ts]
  modified: [convex/schema.ts, convex/fixedAssets/mutations.ts, convex/fixedAssets/helpers.ts]

key-decisions:
  - "Reuse sourceType 'manual' for reclassification JEs (consistent with existing disposal JEs)"
  - "All categories default to GL 6200 (G&A Expense) for reclassification, overridable via UI"
  - "Expense status is 'recorded' for reclassification (admin-approved disposal, no DoA queue)"
  - "Reuse sourceType 'expense_approval' for bulk import trusted JEs (consistent with single-expense approval flow)"

patterns-established:
  - "Trust-mode branching: trusted rows bypass approval queue, untrusted enter DoA"
  - "Asset reclassification creates expense record + compound JE in single transaction"

requirements-completed: [EXP-01, EXP-02, EXP-03, EXP-04]

duration: 8min
completed: 2026-04-11
---

# Phase 71 Plan 01: Backend Mutations Summary

**Bulk expense import mutation with trust-mode branching + asset reclassification disposal creating compound JE and expense record**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-11
- **Completed:** 2026-04-11
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `bulkCreateExpenses` mutation creates expense records with trust-mode branching (trusted → recorded + JE, untrusted → submitted)
- `disposeAsset` extended with `reclassify_to_expense` creating expense record (NBV amount, recorded status) + compound JE (DR expense + DR accum depr, CR asset cost)
- `CATEGORY_TO_EXPENSE_ACCOUNT` mapping with `getReclassificationExpenseCode` helper for default account resolution
- Schema updated: `reclassify_to_expense` disposal type, `sourceAssetId` and `importBatchId` on expenses

## Task Commits

1. **Task 1+2: Schema + bulkCreateExpenses + asset reclassification** - `85e45bcd` (feat)

## Files Created/Modified
- `convex/expenses/bulkMutations.ts` - New bulk expense import mutation with trust-mode branching
- `convex/fixedAssets/mutations.ts` - Extended disposeAsset with reclassify_to_expense branch
- `convex/fixedAssets/helpers.ts` - Added CATEGORY_TO_EXPENSE_ACCOUNT mapping + getReclassificationExpenseCode
- `convex/schema.ts` - Added reclassify_to_expense to disposalType, sourceAssetId + importBatchId to expenses

## Decisions Made
- Used `sourceType: "manual"` for reclassification JEs (consistent with existing disposal JEs, no schema change needed)
- All 11 categories default to "6200" (G&A) for reclassification expense account — user can override via UI dropdown
- `expenseId as string` cast for sourceId since Convex IDs are typed strings but JE sourceId is plain string

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend mutations ready for Plan 03 (CSV upload UI) and Plan 04 (asset reclassification UI)
- `bulkCreateExpenses` accepts parsed row array — frontend CSV parser will resolve account/user names to IDs
- `disposeAsset` reclassification branch accepts optional `targetExpenseAccountId` override and required `submitterId`

---
*Phase: 71-bulk-expense-upload-asset-reclassification*
*Completed: 2026-04-11*
