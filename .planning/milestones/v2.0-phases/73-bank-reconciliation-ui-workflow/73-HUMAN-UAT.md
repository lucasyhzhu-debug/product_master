---
status: partial
phase: 73-bank-reconciliation-ui-workflow
source: [73-VERIFICATION.md]
started: 2026-04-16T00:35:00Z
updated: 2026-04-16T00:35:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Split-view renders with bank lines + candidates panes
expected: Log in as manager, open `/bank-reconciliation`. Two-pane split-view loads; selecting a bank line refreshes candidates on the right; action bar is sticky at bottom.
result: [pending]

### 2. Match → Unmatch → Confirm → Unmatch cycle
expected: Click `[Match selected]` on a candidate, then `[Unmatch]` the suggested line; then confirm, then unmatch again. Match toast appears; line status moves unmatched → suggested → confirmed → reversal; StatementProgressHeader live-updates the four counter chips; a reversal JE is posted on confirmed-line unmatch (`sourceType=bank_statement_reversal`).
result: [pending]

### 3. StatementHistoryList live progress column
expected: Open Statements tab. Mini progress bar and counts column populated for every row via `getStatementProgressBulk`; skeletons during load.
result: [pending]

### 4. Revenue Gap drill-down preserves filter
expected: Navigate to Revenue Gap tab, select a period, click a row. Drill-down navigates to `/bank-reconciliation?tab=review&channelFilter=...&period=YYYY-MM` and BankLinesPane applies the filter chip.
result: [pending]

### 5. Role-gated routing blocks kitchen + order_staff
expected: Kitchen and order_staff users attempt to access `/bank-reconciliation`. ProtectedRoute blocks both roles; sidebar entry not visible.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
