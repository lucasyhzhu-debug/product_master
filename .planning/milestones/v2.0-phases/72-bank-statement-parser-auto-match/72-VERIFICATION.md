---
phase: 72-bank-statement-parser-auto-match
verified: 2026-04-13T00:00:00Z
status: passed
score: 3/3 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Upload real BCA XLSX e-statement through /bank-reconciliation wizard end-to-end"
    expected: "Parsed preview displays correct metadata (account number, holder, Periode), 5 transaction rows with correct direction/amount/date, reconciliation checksum passes, 'Import' persists header+lines, post-import read-only review table renders"
    why_human: "Requires the live BCA XLSX file (kept outside repo for privacy at D:/OneDrive/Documents/Malo Financials/2025/2511/Mutasi - BCA - 2511.xlsx) and a running dev stack; parser + reconciliation are unit-tested with synthetic fixtures but real-file smoke test is visual only"
  - test: "Re-upload the same file a second time"
    expected: "Mutation rejects with 'Already imported on {createdAt}' error (D-04 file-hash dedup)"
    why_human: "Convex mutation invariant; needs live DB to confirm the block surfaces in the wizard error state rather than partially persisting"
  - test: "Upload a statement with a deliberately corrupted footer (e.g., alter Mutasi Debet by 1 IDR)"
    expected: "Parser aborts with diagnostic diff (parsed vs reported), no partial state persisted (D-06b)"
    why_human: "End-to-end audit integrity guarantee; unit test proves parser throws, but user-visible error surface needs confirmation"
  - test: "Admin CRUD on /bank-rules: create new rule, edit, deactivate; attempt to create a second active catch-all with direction overlap"
    expected: "CRUD mutations succeed; catch-all uniqueness guard rejects second catch-all with message referencing existing ruleCode"
    why_human: "Form validation + error toast rendering; backend enforcement is unit-tested"
  - test: "Log in as kitchen/order_staff role and navigate to /bank-reconciliation and /bank-rules"
    expected: "ProtectedRoute redirects away; sidebar nav entries hidden (admin-only)"
    why_human: "Auth role gating; requires actual session"
  - test: "Upload a statement whose Periode spans Dec-Jan (year rollover)"
    expected: "December lines get start-year, January lines get end-year; unit test covers algorithm but real user flow should show correct dates in preview"
    why_human: "Visual check on the preview table year resolution"
---

# Phase 72: Bank Statement Parser & Auto-Match Verification Report

**Phase Goal:** BCA XLSX/CSV upload with reconciliation checksum and auto-matching engine (Mandiri deferred per D-07)
**Verified:** 2026-04-13
**Status:** human_needed
**Re-verification:** No — initial verification (post-merge of all 6 plans)

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can upload a BCA XLSX e-statement (CSV fallback accepted) and see a preview of parsed transactions before importing. Mandiri deferred (D-07). | VERIFIED | `src/lib/bankStatement/parseBcaXlsx.ts` (SheetJS), `parseBcaCsv.ts` (Papa Parse + BOM strip line 14-15); wizard shell `src/pages/BankReconciliationPage.tsx` with state machine `upload → validating → review → importing → complete`; `src/components/bankReconciliation/StatementUploadStep.tsx` handles both extensions; route `/bank-reconciliation` wired in `src/App.tsx:431` + nav entry in `src/components/layout/Header.tsx:118`; no Mandiri parser exists (D-07 honored) |
| 2 | Parser correctly extracts amounts, dates (DD-Mon with year inferred from Periode row), descriptions. Import aborts if reconciliation checksum fails — no partial state persisted (D-06b). | VERIFIED | Parser unit tests pass (12 parseBcaXlsx, 1 parseBcaCsv, 5 reconciliation, 8 yearRollover). `_parseBcaRows.ts` rejects negative amounts (lines 74-79) and unknown direction flags; Indonesian month map in `convex/lib/indonesianDate.ts`; `reconciliation.ts::validateReconciliation` throws `ReconciliationError` on mismatch; server-side mutation in `convex/bankStatements/mutations.ts:113-128` repeats the checksum + `Number.isInteger` guard (lines 118, 126) and throws BEFORE any `db.insert` — no partial state possible |
| 3 | After import, system auto-matches bank lines to expenses/revenue/reimbursements/payroll by amount+date+description with confidence scoring (exact | strong | suggested | none). Line-level results read-only in P72; interactive UI and JE posting deferred to P73. | VERIFIED | `convex/bankStatements/matchEngine.ts` Layer A (keyword rules) + Layer B (record linkage, lines 240-342) with direction gate (lines 253-254, 257, 279, 307) preventing credit-to-expense / debit-to-revenue mis-links; 48 matchEngine tests pass; `confidence` union `"exact"|"strong"|"suggested"|"none"` on schema line 1943+; review table `StatementReviewTable.tsx` has no edit/override controls (D-25/D-26 read-only); D-20 invariant: zero `createJournalEntryWithLines` calls in `convex/bankStatements` or `convex/bankKeywordRules` (grep returns no matches) |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `convex/schema.ts` (bankStatements) | Header table with fileHash, accountNumber, Periode metadata, reportedDebitTotal/CreditTotal | VERIFIED | line 1902; `bank_statement` literal added to `journalEntries.sourceType` at line 1853 |
| `convex/schema.ts` (bankStatementLines) | Line table with direction, amountIdr, matchedType/matchedId polymorphic FK, confidence union | VERIFIED | line 1929 |
| `convex/schema.ts` (bankKeywordRules) | Rules table with priority, direction, matchType, isCatchAll, account FKs | VERIFIED | line 1991 |
| `src/lib/bankStatement/parseBcaXlsx.ts` | SheetJS parser with metadata extraction + reconciliation | VERIFIED | 12 tests pass |
| `src/lib/bankStatement/parseBcaCsv.ts` | Papa Parse fallback, BOM-stripped | VERIFIED | BOM strip at line 14-15; 1 test passes |
| `src/lib/bankStatement/_parseBcaRows.ts` | Shared row-extraction helper | VERIFIED | negative-amount rejection at lines 74-79 |
| `src/lib/bankStatement/fileHash.ts` | SHA-256 file hash for dedup (D-04) | VERIFIED | exists |
| `src/lib/bankStatement/fuzzyMatch.ts` | Levenshtein similarity (re-exports convex canonical) | VERIFIED | line 13 re-exports from `../../../convex/lib/fuzzyMatch` — CR-01 fix |
| `src/lib/bankStatement/reconciliation.ts` | Checksum validation (D-06b) | VERIFIED | 5 tests pass |
| `convex/lib/fuzzyMatch.ts` | Convex-side canonical fuzzyMatch (CR-01 fix) | VERIFIED | `similarityScore` at line 38; `matchEngine.ts:24` imports from `../lib/fuzzyMatch` (not cross-boundary) |
| `convex/lib/indonesianDate.ts` | Indonesian month map + year rollover | VERIFIED | imported by parser; 8 rollover tests pass |
| `convex/bankStatements/matchEngine.ts` | Layer A (keyword) + Layer B (record linkage) with direction gate | VERIFIED | direction gate at 253-254, 257, 279, 307; 48 tests pass |
| `convex/bankStatements/mutations.ts` | createFromParsedStatement with admin gate, dedup, integer guards, D-20 (no JE post) | VERIFIED | admin gate line 72; isInteger guards 118, 126; zero JE-post calls |
| `convex/bankStatements/queries.ts` | listStatements, getStatement, listLines (admin-gated) | VERIFIED | requireRole on every export (19, 34, 53) |
| `convex/bankKeywordRules/mutations.ts` | seedDefaults + create/update/deactivate (admin) + catch-all uniqueness | VERIFIED | protectedMutation at 148/211/243; catch-all uniqueness guard at 185-199 |
| `convex/bankKeywordRules/queries.ts` | list + getById (admin-gated) | VERIFIED | requireRole at 22, 42 |
| `convex/bankKeywordRules/defaultRules.ts` | 26 seed rules from 72-SEED-RULES.json | VERIFIED | 15 seed tests pass |
| `src/pages/BankReconciliationPage.tsx` | Wizard shell + read-only review post-import | VERIFIED | skip-guard at line 99 `user?.token ? {} : "skip"` (WR-05 fix) |
| `src/pages/BankRulesManager.tsx` | Admin CRUD for rules | VERIFIED | skip-guard at line 68 |
| `src/components/bankReconciliation/StatementUploadStep.tsx` | Upload + preview step | VERIFIED | in review set |
| `src/components/bankReconciliation/StatementReviewTable.tsx` | Read-only review table (D-25) | VERIFIED | no edit controls per code review |
| `src/components/bankReconciliation/StatementHistoryList.tsx` | Past statements list (D-26) | VERIFIED | read-only click-through |
| `src/components/bankReconciliation/RuleFormDialog.tsx` | Rule create/edit dialog | VERIFIED | in review set |
| `src/hooks/convex/useBankReconciliation.ts` | Hook bundle for page | VERIFIED | in review set |
| `tests/fixtures/bca-sample-synthetic.ts` | Reconciliation-valid synthetic fixture | VERIFIED | consumed by parser tests |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `BankReconciliationPage` | `api.bankStatements.mutations.createFromParsedStatement` | Convex mutation | WIRED | hook `useBankReconciliation` used in page |
| `BankReconciliationPage` | `api.bankStatements.queries.listStatements` | query with token | WIRED | admin-gated |
| `matchEngine.findLinkedRecord` | `expenses` / `externalRevenue` / `reimbursementBatches` / `payrollEntries` | direction-gated index scans | WIRED | uses `by_amount_date_submitter`, `by_amount_transactionDate`, `by_amount_createdAt`, `by_amount_period` indexes (all range bounds inside `.withIndex`, not `.filter`) |
| `matchEngine.similarityScore` | `convex/lib/fuzzyMatch.ts` | static import | WIRED | CR-01 fixed; no cross-directory import |
| `src/App.tsx` routes | `/bank-reconciliation`, `/bank-rules` | ProtectedRoute (admin) | WIRED | lines 429-446 |
| `Header.tsx` nav | Bank Reconciliation + Bank Rules entries | role-gated nav | WIRED | lines 118-119 (admin-only) |
| `schema.journalEntries.sourceType` | `"bank_statement"` literal | schema union | WIRED | line 1853 (D-21 pre-wiring for P73) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `BankReconciliationPage` | statements list, lines, accounts | Convex queries (listStatements, listLines, accounts.list) with token skip-guard | DB queries return real data; no static fallbacks | FLOWING |
| `StatementReviewTable` | parsed line rows (amount, direction, category, matched record) | `bankStatementLines` doc via `useBankReconciliation` | DB-backed | FLOWING |
| `BankRulesManager` | rules list | `bankKeywordRules.queries.list` with admin gate | DB-backed | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase 72 tests pass | `npm test -- --run src/lib/bankStatement convex/bankStatements convex/bankKeywordRules convex/accounts` | 9 files / 117 tests passed | PASS |
| D-20 invariant (no JE posting in P72) | `grep -rn createJournalEntryWithLines convex/bankStatements convex/bankKeywordRules` | 0 matches | PASS |
| D-25/D-26 boundary (no P73 UI leakage) | `grep -rn splitView\|manualMatch\|manualUnmatch\|createExpenseFromLine src/` | 0 matches | PASS |
| CR-01 fix (no cross-boundary imports) | `grep -rn "from.*src/lib/bankStatement\|from.*\.\./\.\./src" convex/` | 0 matches | PASS |
| Admin gate coverage | `grep -n requireRole\|protectedMutation\|protectedQuery convex/bankStatements/*.ts convex/bankKeywordRules/*.ts` | Every exported mutation/query gated | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| BANK-01 | 72-01, 72-02, 72-04, 72-05, 72-06 | User can upload BCA (and Mandiri deferred) bank statement CSV/XLSX with format auto-detection | SATISFIED | Extension-based detection in upload step (xlsx → SheetJS; csv → Papa Parse); parser validates `Kode Mata Uang = Rp`, metadata rows, header row; 117 tests pass; Mandiri intentionally deferred per D-07 (roadmap acknowledges) |
| BANK-02 | 72-01, 72-02, 72-03, 72-04, 72-05, 72-06 | System auto-matches bank lines to expenses/revenue/reimbursements/payroll by amount + date + description | SATISFIED | Two-layer engine (matchEngine.ts) with direction-gated Layer B over all four target tables; confidence tiering (exact/strong/suggested/none); 48 matchEngine tests pass; fuzzyMatch threshold 0.8 |

**Orphaned requirements:** none. REQUIREMENTS.md lines 98-99 show both BANK-01 and BANK-02 mapped to Phase 72, and all plans claim both.

**Note on BANK-01 wording:** REQUIREMENTS.md says "BCA or Mandiri" but ROADMAP Success Criteria #1 explicitly scopes Mandiri-deferred per D-07 locked decision. The scope narrowing is captured in 72-CONTEXT.md D-07 and carried through plans. Treating as satisfied for this phase; Mandiri remains a future-phase placeholder.

### Anti-Patterns Found

Scanned 34 files reviewed in 72-REVIEW.md. Post-review findings:

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | No blockers remaining | — | — |

Code review (72-REVIEW.md) flagged 1 critical (CR-01 cross-boundary import) and 5 warnings. Staff review added its own merge-blocker. Post-merge commits 80dd6b9b and fb0a5e3f resolved:

- CR-01 (critical): moved `similarityScore`/`normalize` to `convex/lib/fuzzyMatch.ts`, frontend re-exports
- WR-01 (warning): direction gate added to `findLinkedRecord` (matchEngine.ts:253-307)
- WR-03 (warning): catch-all uniqueness guard in `bankKeywordRules/mutations.ts:185-199`
- WR-04 (warning): `Number.isInteger` guard in `bankStatements/mutations.ts:118, 126`
- WR-05 (warning): skip-guard on `useQuery(api.accounts.queries.list)` in BankReconciliationPage and BankRulesManager
- CSV BOM strip in `parseBcaCsv.ts:14-15`
- Negative-amount rejection in `_parseBcaRows.ts:74-79`

Remaining warnings (WR-02 schema-union breadth, IN-01 re-export cleanup, IN-02 off-by-one comment, IN-03 formatDate duplication, IN-04 unknown-ID fallback label) are code quality nits that do not block the goal and are documented in the review report for follow-up.

### Human Verification Required

1. **Upload real BCA XLSX e-statement through /bank-reconciliation wizard end-to-end**
   - Expected: Parsed preview displays correct metadata, 5 transaction rows with correct direction/amount/date, reconciliation checksum passes, import persists, post-import review table renders
   - Why human: Requires the live BCA XLSX file (kept outside repo for privacy) and a running dev stack

2. **Re-upload the same file**
   - Expected: Mutation rejects with "Already imported" error (D-04 file-hash dedup)
   - Why human: User-visible surface of the Convex mutation invariant

3. **Upload statement with corrupted footer**
   - Expected: Parser aborts with diff diagnostic, no partial state (D-06b)
   - Why human: Audit integrity end-to-end visual check

4. **Admin CRUD on /bank-rules (create, edit, deactivate, catch-all duplicate attempt)**
   - Expected: CRUD succeeds; catch-all uniqueness guard rejects second catch-all referencing conflicting ruleCode
   - Why human: Form validation + toast error rendering

5. **Log in as non-admin role (kitchen/order_staff) and navigate to /bank-reconciliation and /bank-rules**
   - Expected: ProtectedRoute redirects; sidebar entries hidden
   - Why human: Auth role gating visual check

6. **Upload statement spanning Dec-Jan (year rollover)**
   - Expected: December lines get start-year; January lines get end-year; preview shows correct dates
   - Why human: Visual check on year resolution in review table

### Gaps Summary

No gaps. All 3 observable truths verified. All 25 required artifacts exist and are wired. All key links WIRED with direction-gated Layer B, admin gates on every mutation/query, and zero cross-boundary imports. D-20 (no JE posting), D-25/D-26 (no P73 UI leakage), CR-01 (canonical fuzzyMatch location), and all post-review fixes (WR-01/03/04/05, BOM strip, negative amount rejection) confirmed via grep.

117/117 Phase 72 tests pass. Requirements BANK-01 and BANK-02 both SATISFIED. Remaining warnings (WR-02, IN-01..04) are code quality items, non-blocking.

Status is **human_needed** (not passed) because the phase ships a user-facing workflow (file upload + reconciliation wizard + admin CRUD) whose end-to-end behavior on a real BCA file and on role-gated routes cannot be verified programmatically. Six spot-checks are listed for human execution.

---

_Verified: 2026-04-13_
_Verifier: Claude (gsd-verifier)_
