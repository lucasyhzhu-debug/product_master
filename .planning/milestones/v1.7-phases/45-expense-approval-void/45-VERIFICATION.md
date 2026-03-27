---
phase: 45-expense-approval-void
verified: 2026-03-13T21:39:30Z
status: passed
score: 6/6 success criteria verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "Fraud flags are visible to approvers: duplicate detection, late submission, and rejection history chain"
  gaps_remaining: []
  regressions: []
---

# Phase 45: Expense Approval & Void -- Verification Report

**Phase Goal:** Managers and admins can approve or reject expenses following Delegation of Authority rules, with fraud detection flags shown inline
**Verified:** 2026-03-13T21:39:30Z
**Status:** passed
**Re-verification:** Yes -- after gap closure (commit b1086a4)

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Eligible approvers see pending expenses in their queue (broadcast routing, self-submitted excluded) | VERIFIED | `listPendingForApproval` query filters `status === "submitted"`, excludes `submittedBy !== ctx.user._id`, managers filtered by DoA threshold. ExpenseApproval page renders queue via `usePendingForApproval()` hook. Route at `/expenses/approve` guarded by `allowedRoles={["manager", "admin"]}`. |
| 2 | Expenses <= Rp 500K approvable by Manager/Admin; > 500K Admin only; comment mandatory >= 500K | VERIFIED | `canApproveExpense` helper enforces role+threshold. `requiresApproverComment` uses `>= 500K`. `approveExpense` mutation calls both. 46 unit tests cover all boundary cases. Frontend `ApprovalActions` shows comment dialog for >= 500K with disabled submit until comment provided. |
| 3 | Approving creates JE (DR OpEx, CR 2200/1100) and transitions to AwaitingPayment/Approved | VERIFIED | `approveExpense` mutation calls `createJournalEntryWithLines` with `buildDebitLine(expense.accountId)` and `buildCreditLine(creditAccount)`. Credit account lookup by code "1100" (company_card) or "2200" (personal). `getTargetStatusAfterApproval` routes company_card to "approved", personal to "awaiting_payment". Uses `expense.expenseDate` as JE date. |
| 4 | Rejected expenses include reason; submitter can revise via previousExpenseId chain (rejection count badge visible) | VERIFIED | `rejectExpense` mutation requires non-empty reason, patches `rejectionReason`. `createDraft` accepts `previousExpenseId` for resubmission. `getRejectionChain` query walks chain. RejectionChain component renders timeline. **Fix confirmed (b1086a4):** `useRejectionChain` hook now called in ExpenseApprovalCard (line 128), count derived from `rejectionChain?.length` (line 129), passed to FraudFlags as `rejectionCount={rejectionCount > 0 ? rejectionCount : undefined}` (line 157). Badge renders `{N}x rejected` via FraudFlags line 46-48. |
| 5 | Admin can void non-terminal expenses with reason + reversing JE; reimbursed blocked | VERIFIED | `voidExpense` mutation is admin-only (`roles: ["admin"]`). Checks `isVoidableStatus` (submitted/approved/awaiting_payment/rejected). Special case for reimbursed: "Cannot void a reimbursed expense." Creates `createReversalEntry` when `expense.journalEntryId` exists. Frontend Void button only shown to admin via `isAdmin` check. |
| 6 | Fraud flags visible: duplicate detection, late submission, rejection history chain | VERIFIED | FraudFlags component renders duplicate warning badge (from `expense.duplicateWarning`), late submission badge (from `expense.lateSubmission`), and rejection count badge (from `rejectionCount` prop). **Fix confirmed (b1086a4):** rejection count now correctly flows from `useRejectionChain` hook through `ExpenseApprovalCard` to `FraudFlags`. Full rejection timeline renders via `RejectionChain` component when `previousExpenseId` exists. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/expenses/helpers.ts` | DoA helpers: canApproveExpense, requiresApproverComment, getTargetStatusAfterApproval, isVoidableStatus | VERIFIED | All 4 functions exported, non-stub, tested |
| `convex/expenses/__tests__/helpers.test.ts` | Unit tests for DoA and void helpers | VERIFIED | 46 total tests, all passing |
| `convex/expenses/mutations.ts` | approveExpense, rejectExpense, voidExpense mutations | VERIFIED | All 3 mutations exported as `protectedMutation`, full JE integration, DoA enforcement |
| `convex/expenses/queries.ts` | listPendingForApproval, getRejectionChain, relaxed getById | VERIFIED | 2 new queries + getById/getStatusHistory allow manager/admin access |
| `convex/expenses/constants.ts` | APPROVER_ROLES, ALL_ROLES | VERIFIED | Both exported as `const` arrays |
| `src/hooks/convex/useExpenses.ts` | usePendingForApproval, useRejectionChain, useApproveExpense, useRejectExpense, useVoidExpense | VERIFIED | All 5 hooks exported, barrel-exported in index.ts |
| `src/components/expenses/FraudFlags.tsx` | Fraud flag badges | VERIFIED | Handles duplicateWarning, lateSubmission, rejectionCount. Renders null when no flags. |
| `src/components/expenses/ApprovalActions.tsx` | Approve/Reject/Void button group with dialogs | VERIFIED | 3 dialogs, comment enforcement for >= 500K, void admin-only |
| `src/components/expenses/RejectionChain.tsx` | Rejection history timeline | VERIFIED | Walks chain via hook, renders timeline with revision numbering and dates |
| `src/pages/ExpenseApproval.tsx` | Approval queue page | VERIFIED | Full page with loading/empty states, expense cards, fraud flags, actions, rejection chain. Rejection count fix confirmed. |
| `src/App.tsx` | Route at /expenses/approve | VERIFIED | Lazy import, ProtectedRoute with allowedRoles={["manager", "admin"]} at path "expenses/approve" |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| mutations.ts (approveExpense) | journalEngine.ts (createJournalEntryWithLines) | import and call | WIRED | Imported line 32, called line 406 |
| mutations.ts (voidExpense) | journalEngine.ts (createReversalEntry) | import and call | WIRED | Imported line 33, called line 541 |
| mutations.ts (approveExpense) | helpers.ts (canApproveExpense) | import and call | WIRED | Imported line 25, called line 376 |
| queries.ts (listPendingForApproval) | helpers.ts (DOA_ADMIN_ONLY_THRESHOLD) | import | WIRED | Imported line 13, used line 165 |
| useExpenses.ts (usePendingForApproval) | queries.ts (listPendingForApproval) | useSessionQuery | WIRED | Line 73 |
| useExpenses.ts (useApproveExpense) | mutations.ts (approveExpense) | createMutationHook | WIRED | Line 89 |
| useExpenses.ts (useRejectionChain) | queries.ts (getRejectionChain) | useSessionQuery | WIRED | Line 78-81 |
| ExpenseApproval.tsx | useRejectionChain | import and call | WIRED | Import line 14, called line 128 (gap fix in b1086a4) |
| ExpenseApproval.tsx | FraudFlags (rejectionCount) | prop passing | WIRED | Line 157: `rejectionCount={rejectionCount > 0 ? rejectionCount : undefined}` |
| App.tsx | ExpenseApproval.tsx | lazy route | WIRED | Lazy import, route at "expenses/approve" line 263 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| EXP-07 | 01, 02 | Eligible approvers see pending expenses in approval queue | SATISFIED | `listPendingForApproval` query + ExpenseApproval page |
| EXP-08 | 01, 02 | Expenses <= 500K approvable by Manager/Admin | SATISFIED | `canApproveExpense` helper + `approveExpense` mutation |
| EXP-09 | 01, 02 | Expenses > 500K require Admin | SATISFIED | DoA threshold check in `canApproveExpense` |
| EXP-10 | 01, 02 | Self-approval blocked | SATISFIED | Checked in `canApproveExpense`, double-checked in mutation |
| EXP-11 | 01, 02 | Comment mandatory >= 500K | SATISFIED | `requiresApproverComment` + backend + frontend enforcement |
| EXP-12 | 01, 02 | Approving auto-generates JE | SATISFIED | `createJournalEntryWithLines` in `approveExpense` |
| EXP-13 | 01, 02 | Rejected expenses include reason, can revise via previousExpenseId | SATISFIED | `rejectExpense` stores reason, `createDraft` accepts `previousExpenseId` |
| EXP-14 | 01 | Personal payment -> AwaitingPayment | SATISFIED | `getTargetStatusAfterApproval` returns "awaiting_payment" |
| EXP-15 | 01 | Company card -> Approved (terminal) | SATISFIED | `getTargetStatusAfterApproval` returns "approved" |
| EXP-16 | 01 | Admin void with reversing JE | SATISFIED | `voidExpense` admin-only, `createReversalEntry` when JE exists |
| EXP-17 | 01 | Reimbursed cannot be voided directly | SATISFIED | Explicit check: "Cannot void a reimbursed expense" |
| FRAUD-01 | 01, 02 | Duplicate detection (same amount+date within 7 days) | SATISFIED | `checkDuplicateExpense` + FraudFlags `duplicateWarning` badge |
| FRAUD-02 | 01 | Receipt SHA-256 duplicate hash hard block | SATISFIED | `submitExpense` checks `by_receipt_hash` index |
| FRAUD-03 | 01, 02 | Late submission flag (> 14 days) | SATISFIED | `isLateSubmission` + FraudFlags `lateSubmission` badge |
| FRAUD-04 | 01, 02 | Rejection history chain + count badge | SATISFIED | RejectionChain timeline + FraudFlags count badge. **Gap closed in b1086a4**: `useRejectionChain` hook called, count derived and passed to FraudFlags. |
| FRAUD-05 | 01 | Approved expenses immutable (void + resubmit only) | SATISFIED | `updateDraft` only works on drafts. No edit mutation for other statuses. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|

No TODOs, FIXMEs, placeholders, stub patterns, or empty implementations found in any phase files. The previous anti-pattern (no-op ternary on line 153) was resolved in commit b1086a4.

### Human Verification Required

### 1. Approval Queue Visual Layout

**Test:** Navigate to /expenses/approve as a manager with pending expenses in the system
**Expected:** See expense cards with expense number, amount, vendor, date, GL category, payment method badge, submitter name, and fraud flag badges. Cards should be ordered oldest-first (FIFO).
**Why human:** Visual layout, card styling, and responsive behavior cannot be verified programmatically.

### 2. Rejection Count Badge Rendering

**Test:** Submit expense as user A, reject as admin. User A revises and resubmits (via previousExpenseId). View approval queue as a different approver.
**Expected:** Resubmitted expense shows red "1x rejected" badge inline with other fraud flags.
**Why human:** Requires multi-step user flow across multiple roles to generate rejection chain data.

### 3. Approve Dialog with Comment Enforcement

**Test:** As a manager, click Approve on an expense >= Rp 500,000
**Expected:** Dialog opens with required comment textarea. Confirm button disabled until comment entered. After approval, expense disappears from queue in real-time.
**Why human:** Dialog interaction, button state, and real-time Convex subscription behavior.

### 4. Void Button Admin-Only Visibility

**Test:** View approval queue as manager vs admin
**Expected:** Manager sees only Approve/Reject buttons. Admin also sees Void button.
**Why human:** Role-conditional rendering needs live auth context.

### 5. Self-Submitted Exclusion

**Test:** Submit an expense as admin, then view approval queue as same admin
**Expected:** Your own submitted expense should NOT appear in the queue.
**Why human:** Requires multi-user testing scenario.

### Gaps Summary

No gaps remain. The previous verification identified one gap: FRAUD-04 rejection count badge never rendered due to a no-op ternary (`hasRejectionHistory ? undefined : undefined`) on line 153 of `ExpenseApproval.tsx`. Commit b1086a4 fixed this by importing `useRejectionChain`, calling it in `ExpenseApprovalCard` (line 128), computing the count from `rejectionChain?.length` (line 129), and passing it to `FraudFlags` as `rejectionCount={rejectionCount > 0 ? rejectionCount : undefined}` (line 157). The fix is verified in the codebase. All 16 requirements (EXP-07 through EXP-17, FRAUD-01 through FRAUD-05) are now fully satisfied. The test suite (46 unit tests) passes with no regressions. No new anti-patterns introduced.

---

_Verified: 2026-03-13T21:39:30Z_
_Verifier: Claude (gsd-verifier)_
