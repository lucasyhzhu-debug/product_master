---
phase: 71-bulk-expense-upload-asset-reclassification
plan: "03"
subsystem: frontend
tags: [bulk-import, editable-table, csv, trust-mode, expense]
dependency_graph:
  requires: [71-01, 71-02]
  provides: [BulkImportPage]
  affects: [HistoricalImportPage, expense-import-flow]
tech_stack:
  added: []
  patterns: [editable-preview-table, SearchableSelect-inline, per-row-trust-toggle, batch-import-with-retry]
key_files:
  created: []
  modified:
    - src/pages/HistoricalImportPage.tsx
decisions:
  - Kept export name HistoricalImportPage for route compatibility; internal comment notes BulkImportPage rename
  - useBulkCreateJournalEntries kept as unused import for legacy compatibility
metrics:
  duration: "8m 33s"
  completed: "2026-04-11T01:19:43Z"
  tasks_completed: 1
  tasks_total: 2
  status: checkpoint-pending
---

# Phase 71 Plan 03: Editable Preview Table & Trust Mode Summary

Refactored HistoricalImportPage into an Airtable-style BulkImportPage with editable preview table, name-based category/owner matching via SearchableSelect dropdowns, batch and per-row trust mode controls, and sequential batch import via bulkCreateExpenses mutation.

## Completed Tasks

### Task 1: Refactor HistoricalImportPage into BulkImportPage

**Commit:** `c1351c84`
**Files modified:** `src/pages/HistoricalImportPage.tsx` (711 insertions, 352 deletions)

Changes:
- **Page header:** Title changed to "Bulk Import", backTo="/expenses", backLabel="My Expenses"
- **Template download:** Uses `BULK_EXPENSE_TEMPLATE_HEADERS` and `BULK_EXPENSE_TEMPLATE_EXAMPLE` from csvImportValidation (name-based columns)
- **CSV parsing:** Calls `parseAndValidateBulkExpenseCsv` with accounts, users, defaultTrusted args
- **Editable preview table:** Each cell renders `EditableCell` with click-to-edit; category/owner use `type="searchable"` with `SearchableSelect`; payment method uses `type="select"` dropdown
- **Validation coloring:** 3px left border (green/amber/red) per row; row background tint for warning/error; red highlight on error cells via EditableCell
- **Trust mode:** Batch toggle via `Switch` ("These expenses are already paid") visible only for admin/manager; per-row toggle via CheckCircle2/ArrowRight icons; non-approvers see info banner
- **Cell save + revalidation:** `handleCellSave` updates field and re-runs per-cell validation to clear/add errors dynamically
- **Import:** Generates `crypto.randomUUID()` importBatchId; chunks valid rows by 50; calls `bulkCreateExpenses.mutateAsync` sequentially; tracks autoApproved/submitted counts
- **Complete step:** Shows "N expense records created" with auto-approved and submitted breakdown; CTA to "/expenses"
- **Error step:** Retry-from-failed-batch pattern preserved

### Task 2: Verify bulk expense import flow (CHECKPOINT -- PENDING)

Human verification required for end-to-end import flow.

## Deviations from Plan

None -- plan executed exactly as written.

## Threat Mitigations Applied

- **T-71-09 (Tampering):** All cell values rendered as React text content (JSX escapes by default). No innerHTML or eval.
- **T-71-10 (Elevation of Privilege):** Trust toggle hidden for non-approvers via `isApprover` check. Backend also enforces role check (defense in depth).

## Known Stubs

None -- all data paths are wired to live queries and mutations.

## Self-Check: PASSED

- [x] `src/pages/HistoricalImportPage.tsx` exists and contains all acceptance criteria strings
- [x] Commit `c1351c84` exists in git log
- [x] `npx tsc --noEmit` exits 0
