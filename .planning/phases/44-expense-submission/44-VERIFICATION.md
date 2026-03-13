---
phase: 44-expense-submission
verified: 2026-03-13T09:30:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 44: Expense Submission Verification Report

**Phase Goal:** Any authenticated user can create expense drafts, attach receipts, and submit them for approval
**Verified:** 2026-03-13T09:30:00Z
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create and save expense drafts with description, amount, GL category, date, payment method, vendor, and optional receipt | VERIFIED | `createDraft` mutation accepts all 7 fields (mutations.ts:67-130). ExpenseSubmit.tsx renders all 7 form fields with proper input types. `updateDraft` mutation enables re-editing drafts (mutations.ts:139-220). |
| 2 | Submitting a draft transitions it to Pending status and makes it visible in the approval queue | VERIFIED | `submitExpense` mutation patches status to "submitted" (mutations.ts:300-301). `listMyExpenses` query supports status filtering via `by_submitter_status` index (queries.ts:34-61). MyExpenses.tsx has "Pending" tab (line 39). |
| 3 | Receipt upload is enforced for expenses > Rp 50,000 (blocked at backend) and optional for <= Rp 50,000 | VERIFIED | `submitExpense` checks `requiresReceipt(expense.amount) && !receiptFileId` and throws "Receipt is required for expenses over Rp 50,000" (mutations.ts:252-255). `requiresReceipt` threshold is 50,000 (helpers.ts:6,13-15). Frontend shows warning label (ExpenseSubmit.tsx:400-418). |
| 4 | Uploading a receipt with a SHA-256 hash matching an existing receipt hard-blocks submission with reference to the duplicate expense | VERIFIED | `submitExpense` queries `by_receipt_hash` index and throws with duplicate expense number reference (mutations.ts:258-270). ReceiptUpload.tsx computes SHA-256 client-side via Web Crypto API (lines 15-19) and passes hash to parent via `onUpload` callback. |
| 5 | Every status transition is recorded in an immutable audit trail with actor, timestamp, and optional comment | VERIFIED | `recordStatusChange` internal helper writes to `expenseStatusHistory` table (mutations.ts:31-47). Called on createDraft (none->draft, line 126) and submitExpense (draft->submitted, line 313). `getStatusHistory` query returns chronological entries (queries.ts:101-114). MyExpenses.tsx renders timeline tracker panel with vertical timeline, status badges, timestamps, and comments (lines 128-192). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/expenses/helpers.ts` | Pure validation/fraud detection functions | VERIFIED (50 lines) | Exports: requiresReceipt, validateExpenseAmount, isLateSubmission, checkDuplicateExpense, RECEIPT_THRESHOLD, DUPLICATE_WINDOW_DAYS, LATE_SUBMISSION_DAYS |
| `convex/expenses/__tests__/helpers.test.ts` | Unit tests for all helpers (min 80 lines) | VERIFIED (154 lines) | 22 test cases covering all helper functions, edge cases, constants, and boundary conditions |
| `convex/expenses/mutations.ts` | Expense mutations with protectedMutation | VERIFIED (332 lines) | Exports: createDraft, updateDraft, submitExpense, generateUploadUrl. All use protectedMutation with ALL_ROLES. |
| `convex/expenses/queries.ts` | Expense queries with protectedQuery | VERIFIED (115 lines) | Exports: listMyExpenses, getById, getStatusHistory. All use protectedQuery with ALL_ROLES. Status arg uses schema-aligned validator. |
| `src/hooks/convex/useExpenses.ts` | Query and mutation hooks | VERIFIED (74 lines) | Exports: useMyExpenses, useExpense, useExpenseStatusHistory, useCreateExpenseDraft, useUpdateExpenseDraft, useSubmitExpense, useExpenseUploadUrl. Uses useSessionQuery (correct for protectedQuery). |
| `src/components/expenses/StatusBadge.tsx` | Color-coded status badge | VERIFIED (41 lines) | Exports: ExpenseStatusBadge. Covers all 7 statuses with distinct colors. |
| `src/components/expenses/ReceiptUpload.tsx` | Self-contained receipt upload with SHA-256 | VERIFIED (163 lines) | Exports: ReceiptUpload. Client-side SHA-256 via Web Crypto API, Convex storage upload, file type/size validation, hash preview display. |
| `src/components/expenses/ExpenseCard.tsx` | Expense list card | VERIFIED (62 lines) | Exports: ExpenseCard. Shows expense number, description, amount, vendor, date, status badge, fraud warning icons. |
| `src/pages/ExpenseSubmit.tsx` | Create/edit expense form page | VERIFIED (451 lines) | Exports: ExpenseSubmit. Full form with all 7 fields, Save Draft + Submit for Approval buttons, duplicate warning banner, receipt requirement warning, edit mode via query params. |
| `src/pages/MyExpenses.tsx` | Personal expense list with status tabs and timeline | VERIFIED (257 lines) | Exports: MyExpenses. 5 status filter tabs, ExpenseCard list, timeline tracker panel for non-draft expenses with chronological audit trail. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `convex/expenses/mutations.ts` | `convex/expenses/helpers.ts` | import pure helpers | WIRED | Line 18-23: imports requiresReceipt, validateExpenseAmount, isLateSubmission, checkDuplicateExpense |
| `convex/expenses/mutations.ts` | `convex/lib/counter.ts` | getNextNumber for EXP numbers | WIRED | Line 17: import, line 85: `getNextNumber(ctx, "EXP")` |
| `convex/expenses/mutations.ts` | `convex/lib/functions.ts` | protectedMutation wrapper | WIRED | Line 16: import, used on all 4 mutations |
| `convex/expenses/queries.ts` | `convex/lib/functions.ts` | protectedQuery wrapper | WIRED | Line 10: import, used on all 3 queries |
| `src/pages/ExpenseSubmit.tsx` | `src/hooks/convex/useExpenses.ts` | mutation + query hooks | WIRED | Lines 33-39: imports useExpense, useCreateExpenseDraft, useUpdateExpenseDraft, useSubmitExpense, useExpenseUploadUrl |
| `src/pages/ExpenseSubmit.tsx` | `src/hooks/convex/useAccounts.ts` | useAccounts(true) for GL dropdown | WIRED | Line 32: import, line 89: `useAccounts(true)` |
| `src/pages/MyExpenses.tsx` | `src/hooks/convex/useExpenses.ts` | query hooks | WIRED | Lines 26-29: imports useMyExpenses, useExpenseStatusHistory, ExpenseStatus type |
| `src/hooks/convex/useExpenses.ts` | `convex/expenses/mutations.ts` | api.expenses.mutations.* | WIRED | Lines 46-64: createDraft, updateDraft, submitExpense, generateUploadUrl via api |
| `src/hooks/convex/useExpenses.ts` | `convex/expenses/queries.ts` | api.expenses.queries.* | WIRED | Lines 26-39: listMyExpenses, getById, getStatusHistory via api |
| `src/App.tsx` | `src/pages/ExpenseSubmit.tsx` | lazyWithPreload route | WIRED | Lines 89-91: lazy import, lines 251-257: route at /expenses/new with bare ProtectedRoute |
| `src/App.tsx` | `src/pages/MyExpenses.tsx` | lazyWithPreload route | WIRED | Lines 92-94: lazy import, lines 243-249: route at /expenses with bare ProtectedRoute |
| `src/hooks/convex/index.ts` | `src/hooks/convex/useExpenses.ts` | barrel export | WIRED | Lines 396-406: all 7 hooks, Expense type, ExpenseStatus type, ExpenseStatusHistoryEntry type |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXP-01 | 44-01, 44-02 | Any authenticated user can create and save expense drafts with all required fields | SATISFIED | createDraft mutation with 7 args + ExpenseSubmit page with all form fields. ALL_ROLES on mutations. |
| EXP-02 | 44-01, 44-02 | User can submit a draft expense for approval | SATISFIED | submitExpense mutation transitions draft->submitted. Submit button in ExpenseSubmit page. |
| EXP-03 | 44-01, 44-02 | Receipt required for > Rp 50,000, optional for <= Rp 50,000 | SATISFIED | Backend enforcement in submitExpense (requiresReceipt check + throw). Frontend warning label. |
| EXP-04 | 44-01, 44-02 | Receipt stored via Convex file storage with SHA-256 hash for dedup | SATISFIED | generateUploadUrl mutation, ReceiptUpload component with client-side SHA-256, by_receipt_hash index for dedup in submitExpense. |
| EXP-05 | 44-02 | User can view expense history with status filters and timeline tracker | SATISFIED | MyExpenses page with 5 tabs (All/Drafts/Pending/Approved/Rejected), timeline tracker panel showing chronological audit trail from expenseStatusHistory. |
| EXP-18 | 44-01 | Every status transition recorded in immutable audit trail | SATISFIED | recordStatusChange helper writes to expenseStatusHistory on createDraft and submitExpense. getStatusHistory query returns chronological entries. |

No orphaned requirements. All 6 requirements mapped to Phase 44 in REQUIREMENTS.md are accounted for in the plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | -- | -- | -- |

No TODOs, FIXMEs, placeholders, stubs, or empty implementations found in any phase artifact. All "placeholder" text in ExpenseSubmit.tsx is legitimate HTML input placeholder attributes.

### Fraud Control Verification

| Control | Type | Location | Status |
|---------|------|----------|--------|
| FRAUD-01 | Soft duplicate warning (same amount + date within 7 days) | mutations.ts:87-104 (createDraft), 277-297 (submitExpense re-check) | VERIFIED |
| FRAUD-02 | Hard block on duplicate receipt hash | mutations.ts:258-270 (submitExpense, by_receipt_hash index) | VERIFIED |
| FRAUD-03 | Late submission flag (> 14 days) | mutations.ts:273-275 (submitExpense, isLateSubmission) | VERIFIED |

### Commit Verification

| Commit | Description | Verified |
|--------|-------------|----------|
| 54f986b | feat(44-01): add expense pure helpers with unit tests | YES |
| 3a686c3 | feat(44-01): add expense mutations and queries | YES |
| 11a948d | feat(44-02): add expense hooks, barrel exports, and shared components | YES |
| 9aff550 | feat(44-02): add ExpenseSubmit and MyExpenses pages with route registration | YES |

### Human Verification Required

### 1. Expense Form Rendering

**Test:** Navigate to `/expenses/new` as any authenticated role. Fill in all 7 fields (description, amount, GL category, date, vendor, payment method, receipt).
**Expected:** Form renders all fields correctly. GL category dropdown populates from accounts table. Date defaults to today.
**Why human:** Visual layout, dropdown population, date picker behavior cannot be verified programmatically.

### 2. Receipt Upload Flow

**Test:** Attach a receipt image (JPEG/PNG) in the expense form.
**Expected:** File is uploaded to Convex storage, SHA-256 hash is computed and displayed (first 12 chars), file can be removed.
**Why human:** File upload flow, hash preview display, and error handling for invalid file types require browser interaction.

### 3. Draft Save and Edit Roundtrip

**Test:** Save a draft, navigate to MyExpenses, click on the draft card.
**Expected:** Redirects to `/expenses/new?edit=EXPENSE_ID` with pre-filled form data. Editing and re-saving works.
**Why human:** Navigation flow, form pre-fill, and state persistence require browser interaction.

### 4. Submit and Status Transition

**Test:** Submit a draft expense. Check MyExpenses under "Pending" tab.
**Expected:** Expense appears under Pending tab with "Pending" status badge. Clicking shows timeline with "Created" (none->draft) and "Submitted" (draft->submitted) entries.
**Why human:** Status transition visibility, timeline rendering, and tab filtering require browser interaction.

### 5. Duplicate Warning Display

**Test:** Create two expenses with the same amount and nearby dates.
**Expected:** Second expense shows a warning banner (amber) but does not block submission.
**Why human:** Warning banner visibility and non-blocking behavior require browser interaction.

### Gaps Summary

No gaps found. All 5 success criteria from ROADMAP.md are fully verified in the codebase:

1. All 10 artifacts exist, are substantive (1,545 total lines), and contain no stubs or placeholders.
2. All 12 key links are wired (imports exist and are used).
3. All 6 requirements (EXP-01 through EXP-05, EXP-18) have implementation evidence.
4. All 3 fraud controls (FRAUD-01 soft warning, FRAUD-02 hard block, FRAUD-03 late flag) are implemented.
5. All 4 task commits are verified in git history.
6. No anti-patterns found.

Phase 44 goal is achieved: any authenticated user can create expense drafts, attach receipts, and submit them for approval.

---

_Verified: 2026-03-13T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
