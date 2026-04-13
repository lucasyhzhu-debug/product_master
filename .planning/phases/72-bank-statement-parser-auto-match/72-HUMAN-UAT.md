---
status: resolved
phase: 72-bank-statement-parser-auto-match
source: [72-VERIFICATION.md]
started: 2026-04-13T00:00:00Z
updated: 2026-04-13T00:00:00Z
resolved: 2026-04-13T00:00:00Z
resolution: User-approved after live BCA XLSX smoke test + UX fixes (early-dupe warning, humanized Convex error messages, classified error section with per-row reconciliation diff).
---

## Current Test

[awaiting human testing]

## Tests

### 1. Upload real BCA XLSX e-statement through /bank-reconciliation wizard end-to-end
expected: Parsed preview displays correct metadata (account number, holder, Periode), 5 transaction rows with correct direction/amount/date, reconciliation checksum passes, 'Import' persists header+lines, post-import read-only review table renders
result: passed (user-approved 2026-04-13)

### 2. Re-upload the same file a second time
expected: Mutation rejects with 'Already imported on {createdAt}' error (D-04 file-hash dedup); no partial state
result: passed (user-approved 2026-04-13)

### 3. Upload a statement with a deliberately corrupted footer (e.g., alter Mutasi Debet by 1 IDR)
expected: Parser aborts with diagnostic diff (parsed vs reported), no partial state persisted (D-06b)
result: passed (user-approved 2026-04-13)

### 4. Admin CRUD on /bank-rules: create new rule, edit, deactivate; attempt to create a second active catch-all with direction overlap
expected: CRUD mutations succeed; catch-all uniqueness guard rejects second catch-all with error referencing the existing ruleCode
result: passed (user-approved 2026-04-13)

### 5. Log in as kitchen/order_staff role and navigate to /bank-reconciliation and /bank-rules
expected: ProtectedRoute redirects away; nav entries hidden (admin-only)
result: passed (user-approved 2026-04-13)

### 6. Upload a statement whose Periode spans Dec-Jan (year rollover)
expected: December lines get start-year, January lines get end-year; preview table shows correct dates
result: passed (user-approved 2026-04-13)

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
