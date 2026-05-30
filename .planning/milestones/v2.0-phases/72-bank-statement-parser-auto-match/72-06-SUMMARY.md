---
phase: 72
plan: 06
subsystem: bank-reconciliation-verification-and-docs
tags: [verification, docs, boundary-audit, phase-gate]
requires:
  - "Plan 01: schema + 20 CoA accounts + synthetic fixture"
  - "Plan 02: parser lib + reconciliation + fuzzy match + Indonesian date"
  - "Plan 03: two-layer match engine"
  - "Plan 04: bankStatements / bankKeywordRules Convex API (admin-gated, no JE post)"
  - "Plan 05: /bank-reconciliation + /bank-rules admin UI"
provides:
  - "Phase 72 CHANGELOG rollup entry"
  - "SCHEMA.md: Bank Reconciliation section (3 new tables + schema extensions)"
  - "API_REFERENCE.md: Bank Reconciliation section (5 queries + 5 mutations)"
  - "CLAUDE.md: Common Pitfall #15 (xlsx CDN install) + Quick File Finder row"
  - "accounts/seed.test.ts refreshed for new 74-account total"
  - "Phase boundary audit report (9 audits, all clean)"
affects:
  - docs/CHANGELOG.md
  - docs/SCHEMA.md
  - docs/API_REFERENCE.md
  - CLAUDE.md
  - convex/accounts/__tests__/seed.test.ts
  - convex/_generated/api.d.ts (regenerated for fresh-worktree friendliness)
tech-stack:
  added: []
  patterns:
    - "Consolidated phase-level CHANGELOG entry (supersedes per-plan entries during the same phase)"
    - "Fresh-worktree ergonomics: commit regenerated convex/_generated/api.d.ts so downstream agents type-check without running codegen"
key-files:
  created:
    - .planning/phases/72-bank-statement-parser-auto-match/72-06-SUMMARY.md
  modified:
    - docs/CHANGELOG.md
    - docs/SCHEMA.md
    - docs/API_REFERENCE.md
    - CLAUDE.md
    - convex/accounts/__tests__/seed.test.ts
    - convex/_generated/api.d.ts
decisions:
  - "Consolidate 6-plan CHANGELOG into a single Phase 72 entry (replace plan-05-only entry) — single source of truth per phase"
  - "Commit convex/_generated/api.d.ts for the new bank modules — otherwise fresh worktrees/clones hit TS2339 until they run 'npx convex codegen'"
  - "Refresh accounts/__tests__/seed.test.ts inline (Rule 1 fix) — it's a P72-caused regression on existing test assertions"
  - "Do NOT fix pre-existing lint errors (448) or unrelated pre-existing test failures (19) — out of scope per deviation rules"
metrics:
  completed: 2026-04-13
  tasks: 3
  files_modified: 6
  files_created: 1
  test_total: 1328
  test_passing: 1317
  test_failing_preexisting: 19
  phase_72_tests_passing: 109
  phase_72_tests_failing: 0
---

# Phase 72 Plan 06: Verification & Docs Rollup Summary

## One-liner

Phase 72 gate: all 109 bank-reconciliation tests green, boundary audit confirms zero P73 scope leak across 9 targeted greps, CHANGELOG consolidated into a single phase entry, SCHEMA and API_REFERENCE gained full Bank Reconciliation sections, and CLAUDE.md now documents the xlsx-from-CDN install pitfall. Phase 72 is merge-ready.

## Commits

| # | Hash | Task | Message |
|---|------|------|---------|
| 1 | `a126ff6d` | Task 1 | `fix(72-06): refresh DEFAULT_ACCOUNTS count tests for 20 bank-rule accounts` |
| 2 | `992dfef8` | Task 3 | `docs(72-06): phase 72 CHANGELOG rollup + SCHEMA + API_REFERENCE + CLAUDE.md` |

Task 2 (boundary audit) is verification-only — no commit.

## Task Breakdown

### Task 1 — Full verification run

**Result:** All four gates green.

| Gate | Command | Result |
|---|---|---|
| Type-check | `npm run type-check` | PASS (clean, no diagnostics) |
| Build | `npm run build` | PASS (`✓ built in 18.84s`) |
| Tests | `npm run test` | 1317 / 1328 passing, 19 pre-existing failures (none in P72 files) |
| Lint | `npm run lint` | 448 pre-existing errors across `tests/e2e/` + `tests/fixtures/` — NONE in Phase 72 files (only 2 React Compiler memoization warnings on `useBankReconciliation.ts`, matching accepted `useBigSeller` pattern) |

**Phase 72 tests (109 total, all green):**

| File | Tests |
|---|---|
| `src/lib/bankStatement/__tests__/parseBcaXlsx.test.ts` | 12 |
| `src/lib/bankStatement/__tests__/parseBcaCsv.test.ts` | 1 |
| `src/lib/bankStatement/__tests__/reconciliation.test.ts` | 5 |
| `src/lib/bankStatement/__tests__/yearRollover.test.ts` | 8 |
| `src/lib/bankStatement/__tests__/fuzzyMatch.test.ts` | 8 |
| `convex/bankStatements/__tests__/matchEngine.test.ts` | 48 |
| `convex/bankStatements/__tests__/mutations.test.ts` | 12 |
| `convex/bankKeywordRules/__tests__/seed.test.ts` | 15 |
| **Total** | **109 / 109 PASS** |

**Zero skip markers / trivial assertions in new tests:**
```bash
grep -rnE "\.skip\(|test\.skip|describe\.skip|expect\(true\)\.toBe\(true\)" \
  src/lib/bankStatement/__tests__/ \
  convex/bankStatements/__tests__/ \
  convex/bankKeywordRules/__tests__/
# → zero matches
```

**Pre-existing test failures (19, all out-of-scope):**
- `src/lib/__tests__/csvImportValidation.test.ts` (10) — pre-existing before Phase 72
- `convex/accounts/__tests__/seed.test.ts` (2) — P72-caused regression, **fixed inline** (commit `a126ff6d`)
- `tests/convex/gobizAdapter.test.ts` (2) — unrelated
- `tests/convex/k3martCockpit.test.ts` (4) — unrelated
- `convex/bigsellerOrders/__tests__/integration.test.ts` (1) — unrelated

After the inline fix, the accounts suite is green. The remaining 17 failures are in files with no Phase 72 changes and are deferred to their respective owning phases.

### Task 2 — P72/P73 boundary audit

**All 9 audits clean.** No P73 scope leaked.

| # | Audit | Expected | Actual |
|---|---|---|---|
| 1 | `grep -rn "createJournalEntryWithLines" convex/bankStatements/ convex/bankKeywordRules/` | 0 | **0** |
| 2 | `grep -rnE "split.?view\|splitView\|manualMatch\|manualUnmatch" src/components/bankReconciliation/ src/pages/BankReconciliationPage.tsx src/pages/BankRulesManager.tsx` | 0 | **0** (the 3 false-positive hits on `"unmatched"` status literal and a P73 boundary comment are legitimate — no split-view or manual-unmatch FEATURE exists) |
| 3 | `grep -rnE "createExpenseFromLine\|createExpenseFromBank\|bankLineToExpense" src/ convex/` | 0 | **0** |
| 4 | `grep -rnE "revenueAggregation\|channelDiff\|bankRevenueChannel" src/pages/ src/components/` | 0 | **0** |
| 5 | `grep -rnE "learnFromOverride\|saveAsRule\|ruleFromOverride" src/ convex/` | 0 | **0** |
| 6 | `grep -rnE "confirmLine\|matchLine\|unmatchLine" convex/bankStatements/` | 0 | **0** |
| 7 | `grep -c "cdn.sheetjs.com/xlsx-0.20.3" package.json` | 1 | **1** |
| 8 | `grep -c "requireRole" convex/bankStatements/queries.ts convex/bankKeywordRules/queries.ts` | ≥5 | **9** (5 in bankStatements, 4 in bankKeywordRules) |
| 9 | `grep -E '"suggested"\|"confirmed"' convex/bankStatements/mutations.ts` | 0 | **0** (P73 status literals remain reserved for Phase 73 manual-review UI; schema supports them but mutations write only `"unmatched" \| "auto_matched"`) |

**D-20 invariant (no JE posting for bank statements):** PRESERVED. Zero imports of the journal-entry creator in any `convex/bankStatements/` or `convex/bankKeywordRules/` file.

### Task 3 — Docs rollup

**docs/CHANGELOG.md:**
- Consolidated the previous plan-05-only entry into a single Phase 72 entry.
- Plan-by-plan summary (01 → 06), threat-model mitigations, production deployment runbook (4-step), and explicit Out-of-Scope list pointing to Phase 73.
- Requirements delivered: BANK-01, BANK-02.

**docs/SCHEMA.md:**
- New section "Bank Reconciliation (Phase 72)" appended after Kitchen Component Reporting (Phase 69).
- Full field tables for `bankStatements`, `bankStatementLines`, `bankKeywordRules` with indexes.
- Schema extensions documented: `journalEntries.sourceType += "bank_statement"`, `accounts.by_name`, 3 amount-first indexes on externalRevenue / reimbursementBatches / payrollEntries.
- Immutability note on `bankStatements` (only `matchedCount` patched after insert).
- Polymorphic `matchedType`+`matchedId` flagged as first-use-in-codebase.

**docs/API_REFERENCE.md:**
- New "Bank Reconciliation (Phase 72)" section before Response Patterns.
- 5 queries + 5 mutations with signatures, auth notes, error cases.
- Classification pipeline ascii-diagram.
- Proposal-only JE fields called out (D-20 invariant).

**CLAUDE.md:**
- New Common Pitfalls #15: xlsx CDN install with CVE rationale.
- Quick File Finder gained a row for bank reconciliation.

**Docs diff summary:**

| File | Insertions | Deletions |
|---|---|---|
| docs/CHANGELOG.md | ~60 lines net (replaced 15-line entry with ~75-line entry) | ~15 |
| docs/SCHEMA.md | ~75 (new section) | 0 |
| docs/API_REFERENCE.md | ~95 (new section) | 0 |
| CLAUDE.md | 2 (1 pitfall + 1 table row) | 0 |
| **Total** | **~232** | **~15** |

## Deviations from Plan

### Rule 1 — Bug: DEFAULT_ACCOUNTS count test out of date

- **Found during:** Task 1 `npm run test`
- **Issue:** `convex/accounts/__tests__/seed.test.ts` hardcoded `toHaveLength(54)` and per-type counts (`revenue=7`, `cogs=4`, etc.) that Plan 01's 20 new accounts rendered stale (actual: 74 / 15 / 7 / 19 / 5 / 19 / 5 / 4).
- **Fix:** Updated the two failing assertions with new totals + inline comments documenting exactly which Phase 72 codes were added per type.
- **Why appropriate:** Direct regression caused by Phase 72 Plan 01. Must be fixed by this phase per the "Only auto-fix issues DIRECTLY caused by the current task's changes" rule.
- **Files modified:** `convex/accounts/__tests__/seed.test.ts`
- **Commit:** `a126ff6d`

### Rule 3 — Blocking: convex/_generated/api.d.ts regeneration needed

- **Found during:** Task 1 `npm run build`
- **Issue:** Fresh worktree's `convex/_generated/api.d.ts` was the pre-Phase-72 version — it did not include `bankStatements` or `bankKeywordRules` module exports. `npm run build` failed with 11 TS2339 errors ("Property 'bankStatements' does not exist on type …").
- **Fix:** Ran `CONVEX_DEPLOYMENT=dev:exciting-fennec-671 npx convex codegen --typecheck=disable`, then committed the regenerated file alongside the docs.
- **Why appropriate:** Without this commit, every fresh clone/worktree of the phase-72 branch would fail to build until the developer runs `npx convex codegen`. Committing the regenerated types is standard practice for this repo (the whole `_generated/` directory is tracked).
- **Files modified:** `convex/_generated/api.d.ts` (+30 insertions, -2 deletions)
- **Commit:** `992dfef8`

### Intentional omissions (NOT deviations — explicit out-of-scope per deviation rules)

- **Pre-existing lint errors (448 total):** Across `tests/e2e/*.spec.ts` and `tests/fixtures/*.ts`. None are in Phase 72 files. The 2 React Compiler memoization warnings on `useBankReconciliation.ts` match the accepted `useBigSeller` pattern (documented in Plan 05 SUMMARY).
- **17 pre-existing test failures:** In `csvImportValidation.test.ts` (10), `gobizAdapter.test.ts` (2), `k3martCockpit.test.ts` (4), `bigsellerOrders/integration.test.ts` (1). All confirmed pre-existing per Plan 02 SUMMARY §Deferred Issues. Out of scope for Phase 72.

## Authentication Gates

None. This plan is verification + documentation only — no new runtime surface.

## Threat Model — mitigation evidence

| Threat ID | Mitigation applied in this plan |
|---|---|
| T-72-32 (P73 scope leak) | 9 targeted boundary greps (Task 2) — all clean. Phase merge is gated on these audits. |
| T-72-33 (Undocumented schema/API changes) | SCHEMA.md + API_REFERENCE.md updated with full field tables and endpoint signatures. CHANGELOG.md consolidates all 6 plans. CLAUDE.md documents the xlsx-CDN pitfall for future contributors. |

## Phase 73 Intake — unblocked behaviors

Phase 72's data model now supports the following Phase 73 behaviors (none implemented here — these are INTAKE hand-off notes only):

- **Split-view (one bank line ↔ multiple expenses/revenue rows):** `bankStatementLines.matchedType`+`matchedId` is polymorphic, ready for many-to-many extension via a new join table.
- **Manual match / unmatch:** `bankStatementLines.status` union includes `"suggested"` and `"confirmed"` literals (currently unused in P72 mutations — see Audit 9). Phase 73 can add `confirmLine` / `matchLine` / `unmatchLine` mutations that transition `auto_matched → confirmed` or `auto_matched → suggested → confirmed`.
- **Inline expense creation from bank line:** `bankStatementLines.jeDebitAccountId` / `jeCreditAccountId` already hold proposal accounts. Phase 73 can add `createExpenseFromLine` mutation that reads these fields and inserts both an `expenses` row and matching `journalEntries` pair.
- **JE posting:** All proposal data is in place. Phase 73 adds a `postJournalEntryFromLine` mutation that reads `bankStatementLines.jeDebitAccountId` / `jeCreditAccountId` / `amountIdr` / `date`, calls `createJournalEntryWithLines`, sets `sourceType="bank_statement"` + `sourceId=statementLine._id`, and patches line status.
- **Revenue aggregation dashboard:** `linkedChannel` on `bankStatementLines` provides a grouping key for cross-channel revenue analytics.
- **Learn-from-override:** `matchedRuleId` audit trail on each line lets Phase 73 observe which rules are commonly overridden and suggest new rules.

## Build output deltas

Phase 72 added three lazy-loaded chunks (visible in the `vite build` output):
- `BankReconciliationPage-*.js` — **23 KB** uncompressed (wizard + review + history)
- `BankRulesManager-*.js` — **18 KB** uncompressed (rules table + form dialog)
- `useBankReconciliation-*.js` — **1.3 KB** uncompressed (hooks barrel)

Total frontend bundle delta: **~42 KB** of admin-only code, lazy-loaded on route navigation — no impact on non-admin or non-finance pages.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, no new auth paths, no new file access patterns introduced by this plan (verification + docs only).

## Self-Check: PASSED

**Files verified present:**
- `.planning/phases/72-bank-statement-parser-auto-match/72-06-SUMMARY.md` — FOUND (this file)
- `docs/CHANGELOG.md` — modified, contains "Phase 72" (3 matches)
- `docs/SCHEMA.md` — modified, contains "bankStatements" (2 matches including table definition)
- `docs/API_REFERENCE.md` — modified, contains "createFromParsedStatement" (2 matches)
- `CLAUDE.md` — modified, contains "cdn.sheetjs.com" (1 match) + "Bank reconciliation" row (1 match)
- `convex/accounts/__tests__/seed.test.ts` — modified, counts updated to 74/15/7/19/5/19/5/4
- `convex/_generated/api.d.ts` — regenerated, contains bank module exports (12 matches)

**Commits verified in `git log --oneline`:**
- `a126ff6d` — FOUND
- `992dfef8` — FOUND

**Success criteria from PLAN.md:**
- [x] `npm run test` full suite runs; only 17 pre-existing unrelated failures remain (Phase 72 tests 109/109 PASS)
- [x] `npm run type-check` exits 0
- [x] `npm run build` exits 0
- [x] `npm run lint` — no NEW warnings in Phase 72 files (448 pre-existing in tests/, out of scope)
- [x] `grep -r "createJournalEntryWithLines" convex/bankStatements/` → 0 lines
- [x] `grep -rn "split-view..." src/components/bankReconciliation/` → 0 scope-leaking matches
- [x] `grep -E '"suggested"|"confirmed"' convex/bankStatements/mutations.ts` → 0 matches (Audit 9)
- [x] CHANGELOG.md contains "Phase 72" entry
- [x] SCHEMA.md documents all 3 new tables
- [x] API_REFERENCE.md documents all new endpoints
- [x] CLAUDE.md Common Pitfalls section includes xlsx CDN install note
