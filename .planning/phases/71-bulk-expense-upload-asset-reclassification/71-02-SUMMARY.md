---
phase: 71-bulk-expense-upload-asset-reclassification
plan: "02"
subsystem: frontend
tags: [csv-validation, components, bulk-import, editable-table]
dependency_graph:
  requires: [71-01]
  provides: [parseAndValidateBulkExpenseCsv, SearchableSelect, EditableCell, useBulkCreateExpenses]
  affects: [src/lib/csvImportValidation.ts, src/hooks/convex/useJournalImport.ts]
tech_stack:
  added: []
  patterns: [popover-combobox, click-to-edit-cell, name-based-csv-matching]
key_files:
  created:
    - src/components/shared/SearchableSelect.tsx
    - src/components/import/EditableCell.tsx
  modified:
    - src/lib/csvImportValidation.ts
    - src/hooks/convex/useJournalImport.ts
    - convex/_generated/api.d.ts
decisions:
  - "Account name matching uses case-insensitive Map lookup (last wins on duplicates)"
  - "Updated Convex generated API types manually to include bulkMutations module (codegen unavailable in parallel worktree)"
metrics:
  duration: 7min
  completed: 2026-04-11
---

# Phase 71 Plan 02: CSV Validation Refactor + UI Components Summary

Name-based CSV validation with per-cell error tracking, Popover-based SearchableSelect component, click-to-edit EditableCell component, and useBulkCreateExpenses hook.

## What Was Done

### Task 1: CSV Validation Refactor for Name-Based Matching
- Added `BulkExpenseRow`, `BulkExpenseParseResult`, `UserRef`, `CellError` types
- Added `parseAndValidateBulkExpenseCsv` function that matches category against account names and owner against user display names (case-insensitive)
- Added `BULK_EXPENSE_TEMPLATE_HEADERS` and `BULK_EXPENSE_TEMPLATE_EXAMPLE` constants for CSV template downloads
- Per-cell error and warning tracking for the editable preview table
- Preserved original `parseAndValidateCsv` for backward compatibility with existing historical import flow

### Task 2: UI Components + Hook
- **SearchableSelect**: Popover-based filterable dropdown with `role="combobox"`, auto-focus search input, scrollable filtered list with `role="listbox"/"option"` accessibility
- **EditableCell**: Click-to-edit table cell supporting 5 input types (text, number, date, select, searchable). Error/warning ring styling with tooltip messages. Enter saves, Escape cancels, blur saves.
- **useBulkCreateExpenses**: Hook wrapping `api.expenses.bulkMutations.bulkCreateExpenses` via `createMutationHook` factory with suppressed toasts (page handles progress UI)
- Updated `convex/_generated/api.d.ts` to include the `expenses/bulkMutations` module (codegen not available in parallel worktree)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `4264e50b` | CSV validation with name-based matching |
| 2 | `e9b9bbbe` | SearchableSelect, EditableCell, useBulkCreateExpenses hook |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated Convex generated API types manually**
- **Found during:** Task 2
- **Issue:** `convex/_generated/api.d.ts` did not include `expenses/bulkMutations` module because `npx convex codegen` requires a deployment connection unavailable in a parallel worktree
- **Fix:** Manually added the import and mapping entry to `api.d.ts` to match what codegen would produce
- **Files modified:** `convex/_generated/api.d.ts`
- **Commit:** `e9b9bbbe`

## Verification

```
npx tsc --noEmit  -- PASSED (0 errors)
npm run build     -- PASSED
```

## Self-Check: PASSED

- All 4 created/modified files verified on disk
- Both commits (4264e50b, e9b9bbbe) verified in git log
- All 20 acceptance criteria grep checks passed (exports, patterns, accessibility attributes)
