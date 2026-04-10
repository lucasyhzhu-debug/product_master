---
phase: 51-bulk-upload-reimbursed-expenses
verified: 2026-03-15T03:30:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 51: Bulk Upload of Previously Reimbursed Expenses via Bank Transaction Mapping - Verification Report

**Phase Goal:** Admin can bulk-import 350+ historical employee expense records as journal entries via CSV upload, backfilling OpEx in the P&L for periods before the accounting system existed
**Verified:** 2026-03-15T03:30:00Z
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can download a CSV template and a Chart of Accounts reference file | VERIFIED | `HistoricalImportPage.tsx:149-169` -- `handleDownloadTemplate` generates CSV Blob with headers (date,amount,description,vendorName,accountCode,receiptUrl) and example rows; `handleDownloadCoaReference` generates CoA CSV from `useQuery(api.accounts.queries.list)` with proper escaping via `escapeCsv` helper |
| 2 | Admin can upload a CSV and see row-level validation errors with clear messages | VERIFIED | `HistoricalImportPage.tsx:175-209` -- FileReader reads CSV, calls `parseAndValidateCsv`, transitions to "review" state; `ReviewStep` component renders error table (row number + error message) at lines 508-537; CSV validation in `csvImportValidation.ts` produces `RowError[]` with 1-based row numbers |
| 3 | Admin can review summaries (by GL account, by period, total) before confirming | VERIFIED | `HistoricalImportPage.tsx:478-505` -- summary cards (valid rows, errors, total amount); lines 558-618 -- "By GL Account" table (code, name, entries, subtotal) via `groupByAccount`; "By Period" table (YYYY-MM, entries, subtotal) via `groupByPeriod` |
| 4 | Confirming creates one JE per valid row (DR expense account, CR 1100 Cash) with sourceType "manual" and [Historical Import] prefix | VERIFIED | `mutations.ts:190-209` -- loop creates one JE per row via `createJournalEntryWithLines` with `sourceType: "manual"`, description `[Historical Import] desc \| vendor`, lines array with DR expense account / CR cash (1100) |
| 5 | All JEs from one import share the same sourceId (importBatchId) for traceability | VERIFIED | `mutations.ts:123,194` -- `importBatchId: v.string()` arg passed as `sourceId: args.importBatchId`; `HistoricalImportPage.tsx:219` -- generates `crypto.randomUUID()` once and reuses on retry |
| 6 | Receipt URLs from CSV are preserved in journalEntries.metadata.receiptUrl | VERIFIED | Schema: `metadata: v.optional(v.object({ receiptUrl: v.optional(v.string()) }))` at schema.ts:1747-1749; Journal engine: `...(params.metadata ? { metadata: params.metadata } : {})` at journalEngine.ts:248; Mutation: `metadata: row.receiptUrl ? { receiptUrl: row.receiptUrl } : undefined` at mutations.ts:196 |
| 7 | Import handles 350+ rows via batched mutation calls (50/batch) with progress indication | VERIFIED | `mutations.ts:20` -- `MAX_BATCH_SIZE = 50`; `HistoricalImportPage.tsx:78-84` -- `chunkArray` helper; lines 233-258 -- sequential for-loop over batches with `await bulkCreate.mutateAsync`; lines 374-393 -- Progress bar with "X/Y (batch N of M)" text |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/schema.ts` | journalEntries metadata field | VERIFIED | Lines 1747-1749: `metadata: v.optional(v.object({ receiptUrl: v.optional(v.string()) }))` |
| `convex/lib/journalEngine.ts` | Extended CreateJournalEntryParams with metadata | VERIFIED | Line 55: `metadata?: { receiptUrl?: string }` in interface; Line 248: conditional spread in insert |
| `convex/journalImport/mutations.ts` | bulkCreateJournalEntries + validateImportRow | VERIFIED | 215 lines. Exports: `MAX_BATCH_SIZE`, `ImportRow`, `AccountMap`, `validateImportRow`, `bulkCreateJournalEntries` |
| `convex/journalImport/__tests__/mutations.test.ts` | Backend validation tests (TDD) | VERIFIED | 172 lines, 15 test cases covering validation edge cases |
| `src/lib/csvImportValidation.ts` | Client-side CSV parse + validate | VERIFIED | 214 lines. Exports: `AccountRef`, `ImportRow`, `RowError`, `CsvParseResult`, `parseAndValidateCsv`. Uses `strictWibDateStrToUtcMs` from dateUtils.ts (deviation from plan's `dateToWibEpoch` -- functionally equivalent, cleaner reuse) |
| `src/lib/__tests__/csvImportValidation.test.ts` | Client validation tests (TDD) | VERIFIED | 217 lines, 20 test cases covering happy path, validation errors, edge cases |
| `src/hooks/convex/useJournalImport.ts` | Hook wrapping mutation | VERIFIED | 17 lines. Uses `createMutationHook` factory pattern |
| `src/pages/HistoricalImportPage.tsx` | Linear wizard page with 5+ states | VERIFIED | 634 lines (well above min_lines: 200). Implements all 6 wizard states: upload, validating, review, importing, complete, error |
| `src/App.tsx` | Route at /import with admin guard | VERIFIED | Lines 110-111: lazy import; Lines 335-342: Route with `canManageReimbursements` ProtectedRoute |
| `src/pages/AccountsManager.tsx` | Navigation button to /import | VERIFIED | Lines 87-91: Button with Upload icon navigating to "/import" |
| `src/hooks/convex/index.ts` | Barrel re-export | VERIFIED | Line 470: `export { useBulkCreateJournalEntries } from "./useJournalImport"` |
| `docs/CHANGELOG.md` | Phase 51 changelog entry | VERIFIED | Contains "Historical Expense Journal Import (Phase 51)" with full feature list |
| `docs/SCHEMA.md` | metadata field documentation | VERIFIED | Documents `metadata` optional field on journalEntries |
| `docs/API_REFERENCE.md` | bulkCreateJournalEntries documentation | VERIFIED | Contains mutation documentation at line 1716 |
| `package.json` | papaparse runtime dep | VERIFIED | `"papaparse": "^5.5.3"` (runtime), `"@types/papaparse": "^5.5.2"` (dev) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `journalEngine.ts` | `schema.ts` | metadata spread in insert | WIRED | Line 248: `...(params.metadata ? { metadata: params.metadata } : {})` |
| `mutations.ts` | `journalEngine.ts` | createJournalEntryWithLines | WIRED | Line 12: import; Line 190: call per row in loop |
| `mutations.ts` | `lib/functions.ts` | protectedMutation wrapper | WIRED | Line 11: import; Line 120: `protectedMutation({ roles: ["admin"] })` |
| `csvImportValidation.ts` | `papaparse` | Papa.parse | WIRED | Line 8: `import Papa from "papaparse"`; Line 86: `Papa.parse<RawCsvRow>` |
| `csvImportValidation.ts` | `dateUtils.ts` | strictWibDateStrToUtcMs | WIRED | Line 9: import; Line 108: called for date conversion |
| `HistoricalImportPage.tsx` | `useJournalImport.ts` | useBulkCreateJournalEntries | WIRED | Line 22: import; Line 139: `useBulkCreateJournalEntries()`; Line 235: `bulkCreate.mutateAsync()` |
| `HistoricalImportPage.tsx` | `csvImportValidation.ts` | parseAndValidateCsv | WIRED | Lines 23-28: import; Line 196: `parseAndValidateCsv(csvText, accountRefs)` |
| `App.tsx` | `HistoricalImportPage.tsx` | lazyWithPreload + Route | WIRED | Lines 110-111: lazy import; Lines 335-342: Route element |
| `AccountsManager.tsx` | `/import` route | navigate button | WIRED | Line 88: `onClick={() => navigate("/import")}` |

### Requirements Coverage

No formal requirements for Phase 51 (one-off import tool). REQUIREMENTS.md has no entries for Phase 51. All plans declare `requirements: []`. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| -- | -- | No anti-patterns detected | -- | -- |

No TODO, FIXME, HACK, PLACEHOLDER, console.log, empty returns, or stub patterns found in any Phase 51 artifacts.

### Human Verification Required

Phase 51 Plan 04 included a human smoke test checkpoint that was marked as approved per the SUMMARY. The following items would benefit from re-confirmation if any changes have been made since:

### 1. End-to-end CSV Import Flow

**Test:** Log in as admin, navigate to /accounts, click "Import Historical Expenses", download template, create test CSV with valid and invalid rows, upload, review errors/summaries, fix CSV, re-upload, confirm import
**Expected:** Errors shown for invalid rows, button disabled; after fix, summary tables visible, import runs with progress bar, success message with count and amount
**Why human:** Visual flow, interactive behavior, progress bar rendering

### 2. P&L Verification

**Test:** After successful import, navigate to /financials
**Expected:** Imported journal entries appear in OpEx section of P&L for the correct periods
**Why human:** Cross-page data flow, date-period mapping in financial statements

### Deviations from Plan (Non-blocking)

1. **dateToWibEpoch replaced by strictWibDateStrToUtcMs:** Plan 02 specified `csvImportValidation.ts` should export `dateToWibEpoch` as a local function. Implementation instead imports `strictWibDateStrToUtcMs` from `dateUtils.ts`. This is functionally equivalent (strict YYYY-MM-DD regex validation, WIB midnight conversion) and is actually better design (shared utility, DRY). Tests verify identical behavior. Not a gap.

### Gaps Summary

No gaps found. All 7 ROADMAP success criteria are verified as implemented in the codebase. All artifacts exist, are substantive (no stubs), and are properly wired. The journal engine metadata extension is backward-compatible, the mutation validates and creates JEs through the canonical journal engine helper, the client-side CSV validation is comprehensive with Papa Parse, and the wizard page implements all 6 wizard states with template downloads, error reporting, summary tables, sequential batched import with progress, and retry-from-failure support.

---

_Verified: 2026-03-15T03:30:00Z_
_Verifier: Claude (gsd-verifier)_
