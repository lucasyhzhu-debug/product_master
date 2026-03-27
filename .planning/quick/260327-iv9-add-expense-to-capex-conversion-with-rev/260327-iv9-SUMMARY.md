---
phase: 260327-iv9
plan: 01
subsystem: accounting
tags: [capex, fixed-assets, journal-engine, expense-conversion, depreciation, psak]

# Dependency graph
requires:
  - phase: 60-asset-register-depreciation
    provides: fixedAssets table, ASSET_CATEGORIES, depreciation helpers, asset numbering
  - phase: 45-expense-approval
    provides: expense approval queue, ApprovalActions component, voidExpense flow
provides:
  - convertToCapex mutation for atomic expense-to-fixed-asset conversion
  - CapexConversionModal with category auto-detection and depreciation preview
  - asset_acquisition journal source type
  - sourceExpenseId linkage between fixedAssets and expenses
affects: [fixed-assets, expense-approval, journal-entries, income-statement]

# Tech tracking
tech-stack:
  added: []
  patterns: [expense-to-asset conversion, keyword-based category detection, atomic multi-step mutation]

key-files:
  created:
    - src/components/expenses/CapexConversionModal.tsx
  modified:
    - convex/schema.ts
    - convex/lib/journalEngine.ts
    - convex/expenses/helpers.ts
    - convex/expenses/mutations.ts
    - src/components/expenses/ApprovalActions.tsx
    - src/hooks/convex/useExpenses.ts
    - src/pages/ExpenseApproval.tsx

key-decisions:
  - "Two-step Void + New Asset approach: reversal JE for original expense, then acquisition JE (DR 1500, CR 1100/2200)"
  - "asset_acquisition added to NON_REVERSIBLE_TYPES — requires manual correction, not automated reversal"
  - "Credit account determined by original payment method: employee_paid->2200, company_paid/payment_request->1100"
  - "Category auto-detection via regex keyword matching with user override in modal dropdown"
  - "Receipt attachmentIds carried over from expense to fixed asset (no re-upload)"
  - "AssetCategoryKey cast needed for Select onValueChange (shadcn Select returns string)"

patterns-established:
  - "detectAssetCategory: pure keyword regex function for expense description categorization"
  - "CapEx conversion modal: reusable pattern for expense reclassification with preview"

requirements-completed: [CAPEX-CONVERT]

# Metrics
duration: 23min
completed: 2026-03-27
---

# Quick Task 260327-iv9: Expense-to-CapEx Conversion Summary

**Atomic expense-to-fixed-asset conversion with reversal JE, PSAK-aligned categorization, depreciation preview, and acquisition JE (DR 1500, CR credit account)**

## Performance

- **Duration:** 23 min
- **Started:** 2026-03-27T06:55:37Z
- **Completed:** 2026-03-27T07:18:30Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Backend mutation `convertToCapex` atomically voids expense (with reversal JE), creates fixed asset, and creates acquisition journal entry
- Schema extended with `sourceExpenseId` on fixedAssets and `asset_acquisition` sourceType on journalEntries
- CapexConversionModal with auto-suggested category from description keywords, real-time depreciation preview, and collapsible JE preview
- "Convert to CapEx" button integrated into approval queue for admin users on convertible expense statuses
- Receipt attachments carried over from expense to asset record

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema + JournalEngine + Backend Mutation** - `1d7b2439` (feat)
2. **Task 2: Frontend -- Conversion Modal + Button Integration + Hooks** - `102fbf5b` (feat)

## Files Created/Modified
- `convex/schema.ts` - Added sourceExpenseId to fixedAssets, asset_acquisition to journalEntries sourceType
- `convex/lib/journalEngine.ts` - Added asset_acquisition to JournalSourceType union and NON_REVERSIBLE_TYPES
- `convex/expenses/helpers.ts` - Added detectAssetCategory pure function for keyword-based category detection
- `convex/expenses/mutations.ts` - Added convertToCapex mutation with atomic void + create asset + create JE
- `src/components/expenses/CapexConversionModal.tsx` - New modal with category dropdown, depreciation preview, JE preview
- `src/components/expenses/ApprovalActions.tsx` - Added Convert to CapEx button, CapexConversionModal integration
- `src/hooks/convex/useExpenses.ts` - Added useConvertToCapex mutation hook
- `src/pages/ExpenseApproval.tsx` - Pass full expense object to ApprovalActions for modal data

## Decisions Made
- Used two-step Void + New Asset approach per accounting treatment (reversal JE then acquisition JE)
- asset_acquisition is non-reversible (added to NON_REVERSIBLE_TYPES) -- requires manual correction if needed
- Credit account dynamically determined: employee_paid -> 2200, company_paid/payment_request -> 1100
- Category auto-detection uses regex patterns on expense description (mesin/sealer/mixer -> mesin_produksi, etc.)
- Filtered ASSET_CATEGORIES to depreciable only in modal (excluded tanah/land since not equipment)
- Cast AssetCategoryKey for Select onValueChange since shadcn Select returns generic string

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type errors in CapexConversionModal**
- **Found during:** Task 2 (build verification)
- **Issue:** Two type errors: (a) Select onValueChange passes `string` but state is `AssetCategoryKey`, (b) `years !== 1` comparison impossible since depreciable categories have years in {4, 8, 20}
- **Fix:** (a) Cast via `v as AssetCategoryKey`, (b) Removed impossible comparison, always use plural "years"
- **Files modified:** src/components/expenses/CapexConversionModal.tsx
- **Verification:** `npm run build` passes
- **Committed in:** 102fbf5b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor type alignment fix. No scope creep.

## Issues Encountered
None

## Known Stubs
None -- all data paths are wired end-to-end.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Expense-to-CapEx conversion is fully functional
- 11 pending equipment purchases can now be reclassified from opex (6600) to fixed assets (1500)
- Monthly depreciation will auto-calculate from the new assets via existing Phase 60 depreciation batch

## Self-Check: PASSED

All 8 files verified present. Both commit hashes (1d7b2439, 102fbf5b) confirmed in git log.

---
*Quick Task: 260327-iv9*
*Completed: 2026-03-27*
