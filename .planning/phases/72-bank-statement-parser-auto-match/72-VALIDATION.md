---
phase: 72
slug: bank-statement-parser-auto-match
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `72-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest@4.0.18` + `convex-test@0.0.41` (jsdom env) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run <pattern>` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~60 seconds full suite (pre-phase baseline) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run <scoped pattern>` (e.g. `matchEngine`, `parseBcaXlsx`)
- **After every plan wave:** Run `npm run test` (full suite)
- **Before `/gsd-verify-work`:** Full suite green + `npm run build` + `npm run type-check`
- **Max feedback latency:** ~30 seconds for scoped runs

---

## Per-Task Verification Map

> Binds BANK-01 / BANK-02 acceptance criteria to test commands. File existence is marked ❌ W0 for all rows (greenfield tests). Populated by planner with per-task IDs after PLAN.md files exist.

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| BANK-01 | Parser extracts metadata rows (account, holder, period) | unit | `npm run test -- parseBcaXlsx` | ❌ W0 |
| BANK-01 | Parser extracts transactions with DD-Mon → epoch conversion | unit | `npm run test -- parseBcaXlsx` | ❌ W0 |
| BANK-01 | Year rollover (Dec-Jan period) assigns correct year per line | unit | `npm run test -- yearRollover` | ❌ W0 |
| BANK-01 | Reconciliation checksum (debits / credits / balance delta) | unit | `npm run test -- reconciliation` | ❌ W0 |
| BANK-01 | Reconciliation failure aborts import (no partial persistence) | integration | `npm run test -- mutations` | ❌ W0 |
| BANK-01 | File hash dedup → ConvexError on re-upload | integration | `npm run test -- mutations` | ❌ W0 |
| BANK-01 | Secondary dedup (accountNumber, periodStart, periodEnd) → error | integration | `npm run test -- mutations` | ❌ W0 |
| BANK-01 | CSV fallback produces identical ParsedStatement shape | unit | `npm run test -- parseBcaCsv` | ❌ W0 |
| BANK-01 | Multi-sheet XLSX rejected with diagnostic | unit | `npm run test -- parseBcaXlsx` | ❌ W0 |
| BANK-02 | Each of 26 seeded rules matches its canonical positive fixture | unit | `npm run test -- matchEngine` | ❌ W0 |
| BANK-02 | Rules evaluated `priority DESC, ruleCode ASC` | unit | `npm run test -- matchEngine` | ❌ W0 |
| BANK-02 | Catch-all (R01 isCatchAll=true) evaluated LAST regardless of priority | unit | `npm run test -- matchEngine` | ❌ W0 |
| BANK-02 | Direction-sensitive: OVO CREDIT→R03 vs OVO DEBIT→O04 | unit | `npm run test -- matchEngine` | ❌ W0 |
| BANK-02 | `counterparty_and_keyword` requires BOTH (C03 Pierre vs O02 Pierre) | unit | `npm run test -- matchEngine` | ❌ W0 |
| BANK-02 | `descriptionPatternsMode: "hint"` raises confidence but doesn't gate match | unit | `npm run test -- matchEngine` | ❌ W0 |
| BANK-02 | Fuzzy similarity ≥ 0.8 → "strong" tier | unit | `npm run test -- fuzzyMatch` | ❌ W0 |
| BANK-02 | Record linkage: amount+date exact + description fuzzy → matches real expense | integration | `npm run test -- matchEngine` | ❌ W0 |
| BANK-02 | Payroll match via `users.bankAccountHolderName` (skip `related_party` lines) | integration | `npm run test -- matchEngine` | ❌ W0 |
| BANK-02 | `bankKeywordRules:seedDefaults` persists all 26 rules with resolved account IDs | integration | `npm run test -- seed` | ❌ W0 |
| BANK-02 | Seed fails loudly if any account ref unresolved | integration | `npm run test -- seed` | ❌ W0 |
| BANK-02 | Seed idempotent (re-run = "updated" not duplicate) | integration | `npm run test -- seed` | ❌ W0 |

*Status symbols: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · W0 = Wave 0 will create the test file*

---

## Wave 0 Requirements

All files greenfield — Wave 0 creates stubs before any implementation.

**Backend tests (convex/):**
- [ ] `convex/bankStatements/__tests__/matchEngine.test.ts` — BANK-02 rule evaluation + 26 positive fixtures + catch-all ordering + direction sensitivity
- [ ] `convex/bankStatements/__tests__/mutations.test.ts` — BANK-01/02 convex-test integration (dedup, end-to-end ingest)
- [ ] `convex/bankKeywordRules/__tests__/seed.test.ts` — BANK-02 seed idempotency + account-ref resolution

**Frontend tests (src/lib/bankStatement/):**
- [ ] `src/lib/bankStatement/__tests__/parseBcaXlsx.test.ts` — BANK-01 XLSX parser
- [ ] `src/lib/bankStatement/__tests__/parseBcaCsv.test.ts` — BANK-01 CSV fallback
- [ ] `src/lib/bankStatement/__tests__/reconciliation.test.ts` — BANK-01 checksum
- [ ] `src/lib/bankStatement/__tests__/yearRollover.test.ts` — BANK-01 Dec-Jan edge case
- [ ] `src/lib/bankStatement/__tests__/fuzzyMatch.test.ts` — BANK-02 similarity tests

**Fixtures:**
- [ ] `tests/fixtures/bca-sample-synthetic.xlsx` OR programmatic generator — CI input (never real PII)

**Dependency install (Wave 0):**
- [ ] `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
- [ ] `npm install --save fastest-levenshtein`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real BCA XLSX export parses end-to-end with reconciliation passing | BANK-01 | Real bank exports contain PII; cannot commit as fixture | Upload `D:\OneDrive\Documents\Malo Financials\2025\2511\Mutasi - BCA - 2511.xlsx` via `/bank-reconciliation`; verify 5 lines parsed, reconciliation totals match, no partial state |
| Read-only post-import review UI shows all 17 output columns | BANK-02 | Visual rendering; no automated visual test in scope for P72 | Navigate to `/bank-reconciliation`, click imported statement; verify columns: date / description / debit / credit / category / match-to / confidence |
| `/bank-rules` admin CRUD workflow | BANK-02 | Full CRUD through UI (create/edit/delete/toggle rule); Playwright not in P72 scope | Manually add, edit, deactivate a rule; re-run import; verify new rule fires |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (9 test files + 1 fixture + 2 installs)
- [ ] No watch-mode flags (`--run` always used)
- [ ] Feedback latency < 30s for scoped runs, < 60s full suite
- [ ] `nyquist_compliant: true` set in frontmatter (after planner confirms coverage)

**Approval:** pending
