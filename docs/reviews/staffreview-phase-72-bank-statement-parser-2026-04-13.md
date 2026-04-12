# Staff Review: Phase 72 — Bank Statement Parser & Auto-Match

**Date:** 2026-04-13
**Plans:** `.planning/phases/72-bank-statement-parser-auto-match/72-0{1..6}-PLAN.md` (6 plans, ~2700 LOC)
**Reviewers:** Staff Developer (implementation) + Principal Developer (architecture)
**Prior gates passed:** gsd-planner → gsd-plan-checker (5 blockers resolved in 1 revision round)

---

## 1. Summary

**Overall Assessment:** **Revise** — two real schema bugs will fail `npm run type-check`; one real performance bug will cause mutation timeout at scale. All are fixable in a narrow second revision round. Architecturally sound; no major rework needed.

**Key findings:**
- **2 critical schema mismatches** (Principal) — `payrollEntries.userId` doesn't exist; expense date-only index doesn't exist (but `by_amount_date_submitter` does and is better).
- **1 critical performance issue** (Principal) — Layer B record linkage needs amount indexes on `payrollEntries` / `reimbursementBatches` or a hoist-collect-once strategy.
- **Staff Approve**; nits only: pattern consistency (use `protectedMutation` wrapper for CRUD), shared parser helper (`_parseBcaRows.ts`) pre-commit decision.

---

## 2. Critical Issues (must fix before execution)

### Issue 1 — `payrollEntries.userId` does not exist (Plan 03 + D-15 schema error)
**Category:** Logic / Schema
**Location:** `72-03-PLAN.md` Task 2 (Layer B payroll matching); CONTEXT.md D-15

`convex/schema.ts:1949-1978` shows `payrollEntries` has `recipientName: v.string()` and NO `userId` field. Plan 03 says "look up `users.bankAccountHolderName` via `payrollEntry.userId`" — this path does not exist and will fail `npm run type-check`.

**Recommendation:** Rewrite Layer B payroll linkage to match `recipientName` substring in `rawDescription` + amount exact + date in window. Drop the `users.bankAccountHolderName` detour entirely for P72. Revise D-15 in CONTEXT.md to reflect the actual scheme. (Alternative: add `payrollEntries.userId: v.optional(v.id("users"))` in Plan 01 — rejected, scope creep.)

### Issue 2 — Layer B relies on indexes that don't exist (Plan 03 + Plan 01 schema gap)
**Category:** Performance / Schema
**Location:** `72-03-PLAN.md` Task 2 (Layer B scan); `72-01-PLAN.md` Task 2 (schema)

Plan 03 uses `ctx.db.query("expenses").withIndex("by_date", ...)` — no such index exists. Actual indexes: `by_status_expenseDate`, **`by_amount_date_submitter`** (best for Layer B), `by_status`, `by_submitter_status`, `by_receipt_hash`, `by_expense_number`, `by_account`. Same problem on `externalRevenue` (no amount index), `reimbursementBatches` (no amount index), `payrollEntries` (no amount index).

Without fix, Layer B either fails at query time (non-existent index) OR silently `.collect()`-scans entire finance tables per bank line → mutation timeout at scale.

**Recommendation:**
- **Expenses:** Use existing `by_amount_date_submitter` with `q.eq("amount", amountIdr).gte("expenseDate", min).lte("expenseDate", max)` — this is valid Convex index range (prefix-ordered). No schema change needed.
- **externalRevenue / reimbursementBatches / payrollEntries:** Add amount-first indexes in Plan 01 Task 2:
  - `externalRevenue.by_amount_date` on `[revenueGross, transactionDate]`
  - `reimbursementBatches.by_amount_date` on `[totalAmount, createdAt]`
  - `payrollEntries.by_amount_date` on `[amount, periodStart]`
- **Alternative (simpler):** hoist-collect-once — at top of `createFromParsedStatement`, collect the relevant slice of each table ONCE (e.g., last 90 days); Layer B does in-memory filter per line. Avoids schema additions. Plan 04 Task 2 should explicitly choose one strategy and document.

### Issue 3 — Shared parser helper left to executor judgment (Plan 02)
**Category:** Code duplication
**Location:** `72-02-PLAN.md` Task 3

Plan 02 says "extract `_parseBcaRows.ts` if both files would duplicate >20 LOC — otherwise inline". The shared steps (date parse, amount parse, direction flag, saldo parse, counterparty heuristic) are ≥40 LOC — extraction is a foregone conclusion.

**Recommendation:** Pre-commit to extracting `src/lib/bankStatement/_parseBcaRows.ts`. Remove the conditional clause.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Use `protectedMutation` wrapper for `bankKeywordRules` CRUD (consistency with `convex/accounts/mutations.ts:166-200`); keep plain `mutation` for `seedDefaults` | Medium | Low |
| 2 | Extract `resolveSeederUserId(ctx, token?)` helper in `convex/lib/auth.ts` for the dashboard-fallback admin lookup pattern (will be reused by future seeds) | Medium | Low |
| 3 | Remove reconciliation epsilon (`±1 IDR`) from Plan 02 parser — BCA integers are exact; server re-validates with `!==` → asymmetry | Medium | Low |
| 4 | Use WIB timezone helper (`convex/lib/periodRange.ts`) for `month` derivation in Plan 04 Task 2 — not `new Date().toISOString().slice(0,7)` (UTC bug at WIB day boundary) | Medium | Low |
| 5 | Add server-side ruleCode regex validation + uniqueness check in `bankKeywordRules.create` (Plan 04 Task 1) | Medium | Low |
| 6 | Update Plan 01 Task 2 comment: `externalRevenueItems.matchConfidence` is `exact\|price_only\|name_only\|none` — semantically different from new `exact\|strong\|suggested\|none` union. Change "MIRROR" → "pattern-similar but domain-specific" | Low | Low |
| 7 | Test at exact 0.8 fuzzy similarity boundary (is it `>=` or `>`?) — add 0.79 + 0.80 boundary tests | Low | Low |
| 8 | Regression guard: assert `DEFAULT_RULES.filter(r => r.isCatchAll).length === 1 && r.ruleCode === "R01"` in seed test (prevents future accidental multi-catch-all) | Low | Low |
| 9 | Validate degenerate rule case: reject rule creation if `descriptionPatternsMode === "hint"` AND no counterparty patterns AND no gating predicate (would match every line) | Low | Low |
| 10 | Explicit 0-row statement test in Plan 02 (empty BCA file reconciles with `Mutasi Debet=0`, `Mutasi Kredit=0`) | Low | Low |

---

## 4. Refinements (Minor Suggestions)

- Plan 01 Task 3 has math comment "18 revenue/cogs/opex" but the actual breakdown is 1 asset + 8 rev + 3 cogs + 6 opex + 1 fixed-asset + 1 equity = 20. Comment math is wrong; count is right.
- Plan 03 Task 2 Layer B tiebreak when both an expense AND a reimbursement match same amount+date — document "first match encountered" or set explicit precedence.
- Plan 02 Task 3 counterparty regex `/([A-Z][A-Z0-9]+(?:\s+[A-Z][A-Z0-9]+){1,})\s*$/` — add hard cap `{1,10}` for ReDoS safety.
- Plan 05 Task 3 prose still mentions "admin OR manager OR new permission" — plan actually hard-codes `roles={["admin"]}`; remove speculation.
- Plan 06 Task 3 should add runbook: (1) merge Plan 01 → Convex deploy, (2) run `accounts:seedDefaults` in prod dashboard, (3) merge Plan 04 → Convex deploy, (4) run `bankKeywordRules:seedDefaults`.
- Add Plan 06 audit: `grep -E '"suggested"|"confirmed"' convex/bankStatements/mutations.ts` returns 0 (prevents accidental P73 status literals leaking in).
- Add polymorphic FK validator helper `assertMatchedRefExists(ctx, matchedType, matchedId)` now for P73 reuse (currently only produced internally by `findLinkedRecord`, but P73's manual-match UI will need it).

---

## 5. Duplication Analysis

### Existing Code to Leverage (all verified)
| Existing Code | Location | Verified |
|---------------|----------|----------|
| SHA-256 helper | `src/components/expenses/ReceiptUpload.tsx:14-20` | ✅ Plan 02 Task 2 copies correctly |
| Wizard state pattern | `src/pages/HistoricalImportPage.tsx:83-89` | ✅ Plan 05 adapts correctly |
| `seedDefaults` upsert | `convex/accounts/mutations.ts:114-156` | ✅ Plan 04 Task 1 follows |
| Parent-child batch insert | `convex/expenses/bulkMutations.ts:38-170` | ✅ Plan 04 Task 2 adapts |
| Papa Parse pipeline | `src/lib/csvImportValidation.ts` | ✅ Plan 02 Task 3 reuses |
| `requireRole` | `convex/lib/auth.ts` | ✅ Used consistently |
| `protectedMutation` | `convex/lib/functions.ts` | ⚠️ Exists but unused by Plan 04 CRUD (see Improvement #1) |

### Potential Duplication Risks
- Plan 02 XLSX vs CSV parser will duplicate row-extraction logic if Task 3 extraction is skipped (see Critical #3).
- Plan 04 seed fallback admin lookup will be re-invented by future seed functions unless extracted (see Improvement #2).

---

## 6. Phase/Wave Accuracy

| Wave | Plan | Status | Notes |
|------|------|--------|-------|
| 1 | 01 (foundation) | Good | |
| 2 | 02 (parser libs) | Good | |
| 3 | 03 (match engine) | **Revise** | Issues 1 + 2 |
| 4 | 04 (Convex API) | Good | |
| 5 | 05 (frontend) ∥ 06 (verification) | Good | Parallel wave 5; Plan 05 blocks on human checkpoint |

Wave chain is monotonic 1→2→3→4→5. No cycles.

**Ordering concerns:** None.
**Missing phases:** None — scope is tightly bounded; P73 items explicitly deferred.

---

## 7. Specialist Agent Recommendations

| Plan | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 01 | `convex-backend` + `schema-architect` | Schema additions + CoA extension |
| 02 | `react-ui-builder` (pure TS libs) + `tdd-test-architect` | Browser parser + TDD |
| 03 | `convex-backend` + `tdd-test-architect` | Match engine + test matrix |
| 04 | `convex-backend` + `tdd-test-architect` | Mutations + queries + tests |
| 05 | `react-ui-builder` + `ui-component-builder` | Pages + wizard + CRUD table |
| 06 | `code-auditor` + docs (cto-orchestrator) | Audits + boundary grep + docs |

---

## 8. Git Workflow Assessment

| Item | Status |
|------|--------|
| Feature branch `gsd/phase-72-bank-statement-parser-auto-match` already active | ✅ |
| Commit checkpoints at TDD RED→GREEN transitions in Plans 02/03 | ✅ |
| Build + type-check + test verification in Plan 06 | ✅ |
| Merge-to-main via PR after human verify | ✅ |
| `CHANGELOG.md` update in Plan 06 | ✅ |

**Minor gap:** Plans 01/04/05/06 have no explicit task-level commit checkpoints. Recommend Plan 04 Task 1 commit before Task 2 (natural boundary between seed and statement mutation).

---

## 9. Documentation Checkpoints

| Plan | Documentation Update |
|------|----------------------|
| 06 | `docs/CHANGELOG.md` (required), `docs/SCHEMA.md` (3 new tables + sourceType union + indexes), `docs/API_REFERENCE.md` (new queries/mutations), `CLAUDE.md` (pitfall #15: SheetJS CDN install) |

Draft CHANGELOG entry:
```markdown
## 2026-04-XX — Phase 72: Bank Statement Parser & Auto-Match

Users can upload BCA XLSX/CSV statements; parser reconciles against footer totals, classifier tags each line via 26 seeded rules, matcher links to existing expenses/revenue/reimbursements/payroll.

- Added `bankStatements`, `bankStatementLines`, `bankKeywordRules` tables
- Added `"bank_statement"` literal to `journalEntries.sourceType` union (P73 will consume)
- Extended `DEFAULT_ACCOUNTS` with 20 new CoA entries
- SheetJS installed via CDN tarball (CVE-2023-30533/CVE-2024-22363 remediation)
- P72 ships read-only review + admin rules CRUD; interactive reconciliation + JE posting deferred to P73
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** **Adequate** (after fixing Critical Issues 1 + 2 which propagate into test files).

- 21 test cases mapped across 9 test files (VALIDATION.md)
- 26-rule positive fixture matrix (Plan 03 Task 1)
- Catch-all ordering, direction sensitivity, hint elevation, payroll skip all covered
- Dedup primary + secondary, T-72-19 server-side re-reconciliation, atomicity all covered

**Missing coverage (adds from this review):**
- Error-type assertion (`ConvexError` vs plain `Error`) in dedup/reconciliation tests
- 10 MB file-cap client-side enforcement test (or mark manual-only)
- Fuzzy boundary tests at 0.79 and 0.80 exact
- 0-row statement test (Issue 2 edge case)
- Regression guard: only 1 catch-all rule

---

## 11. Edge Cases to Address

- [x] Year rollover Dec-Jan (D-29) — Plan 02 covered
- [x] Multi-day transactions with blank saldo — Plan 02 covered
- [ ] **Zero-row statement** (closed account, no activity) — add test to Plan 02
- [ ] **Zero-amount row** (bank fee reversal) — behavior TBD, flag in Plan 02
- [ ] **Non-BCA XLSX uploaded** (personal expense sheet) — parser should fail cleanly, test
- [ ] **CSV with UTF-8 BOM / Windows-1252 encoding** — document Papa Parse default handling
- [ ] **Payroll match by recipientName** (after Critical Issue 1 fix) — rewrite test

---

## 12. Approval Conditions

**For Approval, address:**
1. **Critical Issue 1:** Payroll linkage uses non-existent `userId` — rewrite to match `recipientName`.
2. **Critical Issue 2:** Add amount-first indexes on `externalRevenue`, `reimbursementBatches`, `payrollEntries` OR commit to hoist-collect-once strategy in Plan 04 Task 2.
3. **Critical Issue 3:** Pre-commit to extracting `_parseBcaRows.ts` shared helper.

**Recommended before implementation:**
1. Use `protectedMutation` wrapper for `bankKeywordRules` CRUD (Improvement #1).
2. Use WIB timezone helper for month derivation (Improvement #4).
3. Remove reconciliation epsilon asymmetry (Improvement #3).
4. Add regression guard: `DEFAULT_RULES.filter(r => r.isCatchAll).length === 1` (Improvement #8).

---

## Top 3 Findings

1. **`payrollEntries.userId` does not exist.** D-15 and Plan 03 built on a schema assumption that's wrong. Fix: match on `recipientName` substring in `rawDescription`. One-line code change; D-15 needs a CONTEXT.md annotation.
2. **Layer B indexes missing.** `expenses.by_amount_date_submitter` exists and works great; but `externalRevenue`, `reimbursementBatches`, `payrollEntries` have no amount index. Add them in Plan 01 or switch to hoist-collect-once in Plan 04.
3. **`_parseBcaRows.ts` shared helper must be pre-committed.** Conditional "if duplicate >20 LOC" leaves judgment to executor; the reality is ≥40 LOC duplication → extract mandatory.

---

*Generated by `/staffreview` skill — Staff Developer (Implementation) + Principal Developer (Architecture)*
*Parallel agent invocation (Opus), consolidated by orchestrator*
