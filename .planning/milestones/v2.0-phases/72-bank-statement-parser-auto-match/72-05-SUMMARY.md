---
phase: 72
plan: 05
subsystem: bank-reconciliation-ui
tags: [react, ui, admin, wizard, crud, bank-reconciliation, read-only]
requires:
  - "Plan 02: parseBcaXlsx / parseBcaCsv / computeSha256 / ReconciliationError / ParsedStatement"
  - "Plan 04: api.bankStatements.{createFromParsedStatement,listStatements,getStatement,listLines}"
  - "Plan 04: api.bankKeywordRules.{seedDefaults,list,create,update,deactivate}"
provides:
  - "/bank-reconciliation — admin-only upload wizard + read-only review + history"
  - "/bank-rules — admin-only CRUD on 26 canonical classifier rules"
  - "src/hooks/convex/useBankReconciliation.ts — typed Convex wrappers"
  - "Reusable StatementReviewTable with two modes (preview vs. imported)"
affects:
  - "src/App.tsx — two new nested routes under root"
  - "src/components/layout/Header.tsx — Accounting dropdown + rolesAllowed filter"
  - "docs/CHANGELOG.md — new Unreleased entry"
tech-stack:
  added: []
  patterns:
    - "Wizard state as discriminated union (upload | validating | review | importing | complete | error)"
    - "Client-side size cap BEFORE parser (T-72-25 DoS mitigation)"
    - "Extension-dispatched parser with file.arrayBuffer() / file.text() — NOT FileReader (T-72-31)"
    - "Read-only review table (P72 scope: no split-view, no manual match, no inline expense — P73)"
    - "Chip-style multi-value editor for pattern arrays"
    - "Role-based NavItem filter (rolesAllowed) instead of inventing new permission key"
key-files:
  created:
    - src/hooks/convex/useBankReconciliation.ts
    - src/pages/BankReconciliationPage.tsx
    - src/pages/BankRulesManager.tsx
    - src/components/bankReconciliation/StatementUploadStep.tsx
    - src/components/bankReconciliation/StatementReviewTable.tsx
    - src/components/bankReconciliation/StatementHistoryList.tsx
    - src/components/bankReconciliation/RuleFormDialog.tsx
    - .planning/phases/72-bank-statement-parser-auto-match/72-05-SUMMARY.md
  modified:
    - src/App.tsx
    - src/components/layout/Header.tsx
    - docs/CHANGELOG.md
decisions:
  - "ProtectedRoute prop is `allowedRoles` (not `roles`) — the codebase convention differs from the plan's literal suggestion; semantics identical. No new permission key added (per staffreview)."
  - "Nav entry lives in the Accounting dropdown (not a new section) — mirrors Journal Entry / Historical Import placement."
  - "Lazy-loaded pages via lazyWithPreload (matches the 30+ existing route imports)."
  - "StatementReviewTable has two modes on a discriminated union so pre-import preview and post-import review share one component — avoids two near-identical tables."
  - "Account picker uses radix Select (native keyboard + ARIA) rather than SearchableSelect — the 60-row account list is small enough that a scrollable select is faster than popover+filter."
  - "isCatchAll auto-syncs when matchType=catch_all so admins can't save an inconsistent rule (matches plan 03 engine's runtime guard)."
  - "description_regex patterns are compile-checked client-side on submit (try/catch new RegExp) — plan 03 also guards, but fail-fast UX avoids a round-trip."
metrics:
  completed: 2026-04-13
  tasks: 3
  files_created: 7
  files_modified: 3
---

# Phase 72 Plan 05: Bank Reconciliation UI Summary

## One-liner

Shipped the admin-only bank statement upload wizard (upload → parse → preview → confirm → read-only review), a statement history list, and a full CRUD page for the 26 classifier rules — all wired to the plan-04 Convex surface and gated via `allowedRoles={["admin"]}` on both the router and the header dropdown. P72 UI is intentionally minimal: no split-view, no manual match, no inline expense create (those are P73).

## Commits

| # | Hash | Task | Message |
|---|------|------|---------|
| 1 | `97ebda7e` | Task 1 | `feat(72-05): bank reconciliation upload wizard + read-only review table` |
| 2 | `69592fb2` | Task 2 | `feat(72-05): bank rules admin CRUD page + form dialog` |
| 3 | `df459179` | Task 3 | `feat(72-05): wire /bank-reconciliation and /bank-rules routes + nav` |
| 4 | `2fae0d8c` | Docs   | `docs(72-05): changelog entry for bank reconciliation UI` |

## UI Surfaces

### `/bank-reconciliation` — Bank Reconciliation Page

**Wizard states (in order):**

1. **upload** — Card with dashed-border drop zone, 10 MB cap notice, "Choose File" button. Accept `.xlsx,.xls,.csv`.
2. **validating** — (short-lived) spinner + "Validating file…".
3. **review** — Reconciled pre-import preview:
   - Header strip with 4 summary tiles: Account (masked `****0994` + holder name), Period (DD/MM/YYYY range), Opening → Closing balance, Totals (debit / credit).
   - Green success Alert: `"Reconciled — ready to import. N transactions (D debit, C credit). Totals match the header footer."`
   - Full 17-column read-only table: classification columns (Updated Category, Match Method, JE Debit/Credit, Confidence) render em-dash since the server match engine hasn't run yet.
   - Actions: `Cancel` / `Confirm Import`.
4. **importing** — Spinner + "Importing and auto-matching transactions…".
5. **complete** — Success Alert with line/match counts; `Upload Another Statement` button resets wizard.
6. **error** — Destructive Alert with full server message. When the failure is a reconciliation mismatch, the `ReconciliationDiff` is shown in a sub-card (debitDiff / creditDiff / balanceDiff in IDR). `Start Over` resets wizard.

**Below the wizard:**

- **Statement History** card — 50 most-recent uploads, sortable by createdAt desc, with columns: File | Account (masked) | Period | Lines | Matched (N/N = X%) | Uploaded (DD/MM/YYYY HH:MM) | `View` button. Selecting a row drives the post-import review below.
- **Review** card (shown only when a statement is selected) — read-only 17-column table (same component as preview, `mode="imported"`), with account labels resolved via the `accounts.queries.list` query.

### `/bank-rules` — Bank Rules Manager

- **Header actions:** `Seed Defaults` (confirm dialog → idempotent `bankKeywordRules.seedDefaults`) + `New Rule`.
- **Rules table** (sorted priority DESC, ruleCode ASC): Rule | P&L (colored badge) | Dir. | Match Type (+ catch-all badge) | Counterparty (truncated) | Description (truncated) | Priority | Confidence | Category Account | Active | Actions (Edit ✏️ / Deactivate 🔌).
- **Show inactive** checkbox toggles between active-only and all rules.
- **Empty state:** guides user to run `accounts:seedDefaults` then `Seed Defaults`.

### RuleFormDialog

- All 16 persisted fields on a scrollable dialog (max 90vh) with a 2-column grid.
- `ruleCode` locked on edit; uppercased on change for create.
- `matchType` drives required-field matrix (counterpartyPatterns shown only when needed, descriptionPatterns likewise; `descriptionPatternsMode` select appears alongside).
- `ChipsInput` helper: Enter or comma adds, X badge removes.
- `flags` has toggle buttons for the 6 known flags + chip input for custom flags.
- Client-side validation matches the plan: rule code regex, required-pattern matrix, regex compile-check, priority 0–200, account required fields.
- Errors render in a destructive-bordered panel above the footer; success fires a Sonner toast and closes the dialog.

## Accessibility & UX notes

- All primary actions have visible labels (no icon-only buttons except the compact edit/deactivate icons, which carry `aria-label`).
- Loading states visible everywhere (`useQuery === undefined` → inline "Loading…" text or skeleton).
- Error messages never leak stack traces — parser errors are surfaced as `err.message` only, and account numbers are masked to last-4 across toasts and history.
- Review table uses `tabular-nums` for all currency columns so digits align.
- Confidence badges use green/blue/amber/gray to match the plan's confidence ladder (exact/strong/suggested/none).

## Threat Model — mitigation evidence

| Threat ID | Category | Mitigation |
|---|---|---|
| T-72-25 | DoS (oversized upload) | `MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024` enforced BEFORE any `file.arrayBuffer()` or `xlsx.read` call in `StatementUploadStep.tsx`. Grep: `10 \* 1024 \* 1024` → 1 hit in `StatementUploadStep.tsx`. |
| T-72-26 | Tampering (XSS via raw desc) | React default-escapes text. Grep: `dangerouslySetInnerHTML` → **0** across `src/components/bankReconciliation/**` and both new pages. |
| T-72-27 | Spoofing (non-admin access) | Both routes wrapped in `ProtectedRoute allowedRoles={["admin"]}`; backend still gates every query (defense in depth). |
| T-72-28 | Info disclosure (PII in UI) | Account numbers masked to `****0994` in history + wizard header; no `console.log` of account fields in the new files. |
| T-72-29 | DoS via ReDoS in user-authored regex | `RuleFormDialog.handleSubmit` compiles each `description_regex` pattern in try/catch before hitting the mutation; plan 03 match engine also guards. |
| T-72-31 | DoS / data loss via FileReader.readAsText on XLSX | `StatementUploadStep.tsx` uses `file.arrayBuffer()` for `.xlsx`/`.xls` and `file.text()` for `.csv`. Grep: `readAsText` → **0** hits. |

## Verification Evidence

All automated acceptance grepped clean:

| Criterion | Expected | Actual |
|---|---|---|
| `grep -c "10 \* 1024 \* 1024\|10485760" src/components/bankReconciliation/StatementUploadStep.tsx` | ≥1 | 1 |
| `grep -c "readAsText" src/components/bankReconciliation/StatementUploadStep.tsx` | 0 | 0 |
| `grep -c "dangerouslySetInnerHTML" src/components/bankReconciliation/` | 0 | 0 |
| `grep -c "parseBcaXlsx\|parseBcaCsv" src/components/bankReconciliation/StatementUploadStep.tsx` | ≥1 | 6 |
| `grep -c "computeSha256" src/components/bankReconciliation/StatementUploadStep.tsx` | ≥1 | 3 |
| `grep -c "ReconciliationError" src/pages/BankReconciliationPage.tsx` | ≥1 | 1 |
| `grep -c "seedDefaults" src/pages/BankRulesManager.tsx` | ≥1 | 5 |
| `grep -c "deactivate" src/pages/BankRulesManager.tsx` | ≥1 | 9 |
| `grep -c "ruleCode" src/components/bankReconciliation/RuleFormDialog.tsx` | ≥2 | 12 |
| `grep -c "isCatchAll" src/components/bankReconciliation/RuleFormDialog.tsx` | ≥1 | 11 |
| `grep -c "descriptionPatternsMode" src/components/bankReconciliation/RuleFormDialog.tsx` | ≥1 | 7 |
| `grep -c "dangerouslySetInnerHTML" src/pages/BankRulesManager.tsx src/components/bankReconciliation/RuleFormDialog.tsx` | 0 | 0 |
| `grep -c '/bank-reconciliation' src/App.tsx` | ≥1 | 1 |
| `grep -c '/bank-rules' src/App.tsx` | ≥1 | 1 |
| `grep -c "BankReconciliationPage" src/App.tsx` | ≥1 | 3 |
| `grep -c "BankRulesManager" src/App.tsx` | ≥1 | 3 |
| `grep -c "/bank-reconciliation\|/bank-rules" src/components/layout/Header.tsx` | ≥2 | 2 |

Build + type-check:

- `npm run type-check` → **PASS** (clean)
- `npm run build` → **PASS** (clean, `✓ built in 19.16s`)
- `npm run lint` → No new errors in the P72 files; only pre-existing hints (React Compiler memoization on `useCallback` wrappers — same pattern as `useBigSeller`, accepted).

## Deviations from Plan

### [Rule 3 — Prop rename] `ProtectedRoute` uses `allowedRoles`, not `roles`

- **Found during:** Task 3
- **Issue:** The plan text suggests `ProtectedRoute roles={["admin"]}`, but this codebase's `ProtectedRoute` component exposes the prop as `allowedRoles: UserRole[]`.
- **Fix:** Used `allowedRoles={["admin"]}` for both routes. Semantics identical. No plan spirit violated.
- **Files:** `src/App.tsx`
- **Commit:** `df459179`

### [Rule 3 — Sidebar name] Nav lives in `Header.tsx`, not `Sidebar.tsx`

- **Found during:** Task 3
- **Issue:** Plan lists `src/components/layout/Sidebar.tsx` as the nav file. This codebase does not have a `Sidebar.tsx`; the nav is implemented inside the top bar (`src/components/layout/Header.tsx`) with dropdowns (Financials, Accounting, Configurations, Admin).
- **Fix:** Added both entries to `accountingItems` in `Header.tsx`. Extended the `NavItem` type with `rolesAllowed?: UserRole[]` and the filter function to respect it (no new permission key, per staffreview refinement).
- **Files:** `src/components/layout/Header.tsx`
- **Commit:** `df459179`

### [Rule 2 — Empty-state UX] Bank Rules empty state guides to seed

- Added a helpful empty-state message in BankRulesManager guiding admins to run `accounts:seedDefaults` first, then click `Seed Defaults`. This wasn't in the plan but matches CLAUDE.md's pragmatic UX directive ("loading states visible, error messages clear, workflows logical").
- No scope expansion — pure UX affordance.

## Authentication Gates

None during this plan. Admin-gate enforcement is already exercised client-side via `ProtectedRoute` and server-side in plan 04.

## Known Stubs

None. Every field, button, and table cell renders live data.

No intentional placeholder text (no "coming soon", no hardcoded empty arrays flowing to UI rendering).

## Checkpoint outcome

Task 4 (`checkpoint:human-verify`) was **not executed** as an interactive checkpoint per the orchestrator's `autonomous_checkpoint_policy` (executor ran in full-phase headless mode). The manual verification flow is fully scripted in `72-05-PLAN.md §Task 4` — user will run the 5 verification steps (upload real BCA XLSX, check parser + dedup errors, rule CRUD, non-admin gate) and report back. No pre-flight issues observed in the automated checks.

## Threat Flags

None. No new endpoints, no new auth paths, no new file access patterns outside the plan's threat register.

## Open Items for Plan 06

Plan 06 is the journal-posting flow. This plan intentionally stopped at classification/review; the following are ready for 06:

- `bankStatementLines.{jeDebitAccountId, jeCreditAccountId}` are populated as PROPOSALS by plan 04's ingest mutation — ready to be posted as real `journalEntries` rows.
- `bankStatementLines.matchedRuleId` links each line back to the classifier rule for audit.
- `bankStatements.matchedCount` denormalized counter supports progress display on a future "Post JEs for this statement" wizard.
- Future P73 additions (expected but OUT OF SCOPE here): split-view (CSV rows ↔ existing expenses/revenue), manual match/unmatch, inline "Create expense from this line" flow, override-category edit.

## Self-Check: PASSED

**Files verified present on disk:**
- `src/hooks/convex/useBankReconciliation.ts` — FOUND
- `src/pages/BankReconciliationPage.tsx` — FOUND
- `src/pages/BankRulesManager.tsx` — FOUND
- `src/components/bankReconciliation/StatementUploadStep.tsx` — FOUND
- `src/components/bankReconciliation/StatementReviewTable.tsx` — FOUND
- `src/components/bankReconciliation/StatementHistoryList.tsx` — FOUND
- `src/components/bankReconciliation/RuleFormDialog.tsx` — FOUND
- `.planning/phases/72-bank-statement-parser-auto-match/72-05-SUMMARY.md` — FOUND (this file)

**Commits verified in `git log --oneline`:**
- `97ebda7e` — FOUND
- `69592fb2` — FOUND
- `df459179` — FOUND
- `2fae0d8c` — FOUND
