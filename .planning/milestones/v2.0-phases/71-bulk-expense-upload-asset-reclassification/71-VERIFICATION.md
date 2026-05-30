---
phase: 71-bulk-expense-upload-asset-reclassification
verified: 2026-04-11T02:30:00Z
status: human_needed
score: 4/4
overrides_applied: 0
human_verification:
  - test: "Upload CSV with mixed valid/invalid rows and verify editable preview table"
    expected: "Red borders on error rows, red cells on unmatched category/owner, SearchableSelect dropdown to fix"
    why_human: "Visual layout, cell interaction, and inline editing behavior require browser testing"
  - test: "Toggle trust mode and per-row override, then confirm import"
    expected: "Admin sees Switch toggle, per-row checkmarks toggle, import creates expenses with correct status"
    why_human: "Trust mode UI visibility and import result verification require live Convex backend"
  - test: "Dispose asset with Reclassify to Expense option"
    expected: "Auto-mapped expense account, owner dropdown, NBV preview, success toast with expense number"
    why_human: "Dialog conditional fields and toast content require browser interaction"
---

# Phase 71: Bulk Expense Upload & Asset Reclassification Verification Report

**Phase Goal:** Users can efficiently import batches of expenses from CSV and reclassify disposed assets as operating expenses
**Verified:** 2026-04-11T02:30:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can upload a CSV file that creates individual expense records (not raw journal entries) with proper categorization | VERIFIED | `bulkCreateExpenses` in `convex/expenses/bulkMutations.ts` creates expense records via `ctx.db.insert("expenses", {...})`. Frontend calls `parseAndValidateBulkExpenseCsv` with name-based matching (accountNameMap, userNameMap) and `useBulkCreateExpenses` hook. |
| 2 | Trusted CSV batches can be auto-approved, creating expenses in Recorded status with journal entries generated immediately | VERIFIED | Line 112: `row.trusted ? "recorded" : "submitted"`. Lines 151-169: trusted path calls `createJournalEntryWithLines` and patches `journalEntryId`. Lines 64-70: `APPROVER_ROLES` check enforced server-side. |
| 3 | Untrusted CSV batches can be submitted for approval, routing each expense through the existing DoA approval queue | VERIFIED | Untrusted rows get `"submitted"` status (line 112). No JE created. `recordStatusChange` audit trail recorded (line 141). Frontend shows non-approver info banner and hides trust toggle. |
| 4 | User can dispose a fixed asset with "Reclassify to Expense" type, which reverses capitalization and books the net book value as an operating expense | VERIFIED | `fixedAssets/mutations.ts` lines 396-516: creates expense (NBV amount, recorded status, sourceAssetId), compound JE (DR expense NBV + DR accum depr + CR asset cost), updates asset to disposed. `DisposeAssetDialog.tsx` shows "Reclassify to Expense" option with auto-mapped account and owner dropdown. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/expenses/bulkMutations.ts` | bulkCreateExpenses protectedMutation | VERIFIED | 183 lines, exports `bulkCreateExpenses`, uses `protectedMutation`, `ALL_ROLES`, `APPROVER_ROLES`, `getNextNumber`, `recordStatusChange`, `createJournalEntryWithLines` |
| `convex/fixedAssets/mutations.ts` | Extended disposeAsset with reclassify_to_expense | VERIFIED | Lines 396-516 contain full reclassification branch, args include `targetExpenseAccountId`, `submitterId` |
| `convex/fixedAssets/helpers.ts` | CATEGORY_TO_EXPENSE_ACCOUNT mapping | VERIFIED | Lines 79-91: 11-category mapping, `getReclassificationExpenseCode` function at line 97 |
| `convex/schema.ts` | Updated disposalType union + expense fields | VERIFIED | Line 1994: `reclassify_to_expense` in union. Line 1769: `sourceAssetId`. Line 1770: `importBatchId` |
| `src/lib/csvImportValidation.ts` | Name-based CSV parser with per-cell errors | VERIFIED | Exports `BulkExpenseRow`, `BulkExpenseParseResult`, `UserRef`, `CellError`, `parseAndValidateBulkExpenseCsv`, `BULK_EXPENSE_TEMPLATE_HEADERS`. Uses `accountNameMap` and `userNameMap` with `.toLowerCase()` matching |
| `src/components/shared/SearchableSelect.tsx` | Reusable filterable dropdown | VERIFIED | 123 lines, Popover-based, `role="combobox"`, `role="listbox"/"option"`, auto-focus search, case-insensitive filter |
| `src/components/import/EditableCell.tsx` | Click-to-edit table cell | VERIFIED | 204 lines, 5 input types (text/number/date/select/searchable), Enter/Escape/Tab/blur handling, error ring styling |
| `src/hooks/convex/useJournalImport.ts` | useBulkCreateExpenses hook | VERIFIED | Line 20: `useBulkCreateExpenses` wraps `api.expenses.bulkMutations.bulkCreateExpenses` |
| `src/pages/HistoricalImportPage.tsx` | BulkImportPage with editable preview table | VERIFIED | Contains `parseAndValidateBulkExpenseCsv`, `useBulkCreateExpenses`, `EditableCell` (9 columns), `batchTrusted`/`editingCell` state, `isApprover` role check, `crypto.randomUUID()`, "These expenses are already paid" toggle |
| `src/components/assets/DisposeAssetDialog.tsx` | Extended disposal dialog | VERIFIED | `reclassify_to_expense` type, `SearchableSelect` for account/owner, `CATEGORY_DEFAULT_EXPENSE_CODE` mapping, NBV preview, contextual success toast with `expenseNumber` |
| `src/components/assets/AssetDetailPanel.tsx` | Passes category to dialog | VERIFIED | Line 295: `category: asset.category` passed to DisposeAssetDialog |
| `src/hooks/convex/useFixedAssets.ts` | useDisposeAsset with empty successMessage | VERIFIED | Line 79: `successMessage: ""` -- dialog handles toasts contextually |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bulkMutations.ts` | `journalEngine.ts` | `createJournalEntryWithLines` | WIRED | Lines 152-162: called for trusted rows with debit/credit lines |
| `bulkMutations.ts` | `auditTrail.ts` | `recordStatusChange` | WIRED | Line 141: called for every expense created |
| `fixedAssets/mutations.ts` | `bulkMutations.ts` | Reclassification imports expense helpers | WIRED | Uses `getNextNumber`, `recordStatusChange` directly (not via bulkMutations import, but same helpers) |
| `HistoricalImportPage.tsx` | `csvImportValidation.ts` | `parseAndValidateBulkExpenseCsv` | WIRED | Line 237: called on CSV upload |
| `HistoricalImportPage.tsx` | `useJournalImport.ts` | `useBulkCreateExpenses` | WIRED | Line 52: imported, line 144: instantiated, line 421+: called in batch loop |
| `HistoricalImportPage.tsx` | `EditableCell.tsx` | `EditableCell` | WIRED | Line 50: imported, 9 column instances in table rows |
| `HistoricalImportPage.tsx` | `SearchableSelect.tsx` | Via EditableCell searchable type | WIRED | EditableCell line 24: imports SearchableSelect, used for category/owner columns |
| `DisposeAssetDialog.tsx` | `fixedAssets/mutations.ts` | `reclassify_to_expense` | WIRED | Lines 136-138: passes `targetExpenseAccountId` and `submitterId` with `reclassify_to_expense` type |
| `DisposeAssetDialog.tsx` | `SearchableSelect.tsx` | Direct import | WIRED | Line 13: imported, lines 214+226: used for account/owner selection |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `HistoricalImportPage.tsx` | `accountsList` / `usersList` | `useQuery(api.accounts.queries.list)` / `useQuery(api.auth.queries.getActiveUsers)` | Yes -- live Convex queries | FLOWING |
| `HistoricalImportPage.tsx` | `rows` (BulkExpenseRow[]) | `parseAndValidateBulkExpenseCsv` from CSV upload | Yes -- user-uploaded data | FLOWING |
| `DisposeAssetDialog.tsx` | `accounts` / `users` | `useQuery(api.accounts.queries.list)` / `useQuery(api.auth.queries.getActiveUsers)` | Yes -- live Convex queries | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles | `npx tsc --noEmit` | Exit 0, no errors | PASS |
| bulkCreateExpenses export exists | grep for `export const bulkCreateExpenses` | Found at line 38 | PASS |
| Schema has reclassify_to_expense | grep in schema.ts | Found at line 1994 | PASS |
| CSV parser exports new function | grep for `parseAndValidateBulkExpenseCsv` | Found at line 419 | PASS |
| Name-based matching implemented | grep for `accountNameMap` | Found at lines 426-429 with `.toLowerCase()` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXP-01 | 71-01, 71-02, 71-03 | User can bulk upload expenses via CSV that creates actual expense records | SATISFIED | `bulkCreateExpenses` creates expenses, not raw JEs. CSV parser validates name-based columns. UI provides editable preview table. |
| EXP-02 | 71-01, 71-03 | Bulk upload supports auto-approve mode (expenses created as recorded with JEs) | SATISFIED | Trust-mode branching: `trusted=true` -> "recorded" + JE via `createJournalEntryWithLines`. Backend enforces `APPROVER_ROLES`. Frontend shows Switch toggle for admin/manager only. |
| EXP-03 | 71-01, 71-02, 71-03 | Bulk upload supports submit-for-approval mode (expenses created as submitted) | SATISFIED | `trusted=false` -> "submitted" status, no JE. Enters DoA approval queue. Non-approvers see info banner. |
| EXP-04 | 71-01, 71-04 | Fixed asset disposal supports "Reclassify to Expense" | SATISFIED | Backend: compound JE (DR expense NBV + DR accum depr, CR asset cost), expense record with NBV amount. Frontend: "Reclassify to Expense" option, auto-mapped account, owner dropdown, NBV preview. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | -- | No TODOs, FIXMEs, placeholders, empty returns, or stub patterns found | -- | -- |

### Human Verification Required

### 1. Bulk Expense CSV Upload Flow

**Test:** Upload a CSV with 3 rows (one valid, one with bad category, one with bad owner). Verify editable preview table with validation coloring, SearchableSelect dropdowns for fixing errors, and batch import.
**Expected:** Green/amber/red left borders, red cells on unmatched fields, dropdowns resolve errors, "Confirm Import" enables after all fixes, sequential batch creates expense records.
**Why human:** Visual layout, cell click-to-edit interaction, SearchableSelect dropdown positioning, and live mutation results require browser testing with running Convex backend.

### 2. Trust Mode Toggle and Per-Row Override

**Test:** As admin, toggle "These expenses are already paid" Switch ON/OFF. Toggle individual row overrides. Confirm import and check resulting expense statuses.
**Expected:** Batch toggle flips all rows. Per-row toggle overrides individual rows. Auto-approved rows get "recorded" status with JE, submitted rows get "submitted" without JE.
**Why human:** Switch component visibility per role, per-row toggle icons, and resulting database state require live testing.

### 3. Asset Reclassification Disposal

**Test:** Navigate to /assets, dispose an active asset with accumulated depreciation using "Reclassify to Expense". Verify auto-mapped account, override via dropdown, owner selection, and result.
**Expected:** NBV preview shows correct breakdown. Confirm creates expense record visible in /expenses. Asset status changes to "disposed". Toast shows expense number.
**Why human:** Dialog conditional field rendering, SearchableSelect within dialog, toast content, and cross-page data verification require browser interaction.

### Gaps Summary

No automated gaps found. All 4 roadmap success criteria verified against the codebase. All 4 requirement IDs (EXP-01 through EXP-04) satisfied with implementation evidence across backend mutations, frontend CSV validation, editable preview table, and asset reclassification dialog.

Three human verification items remain: the bulk import end-to-end flow, trust mode toggle behavior, and asset reclassification dialog interaction. These require a running Convex dev backend and browser testing.

---

_Verified: 2026-04-11T02:30:00Z_
_Verifier: Claude (gsd-verifier)_
