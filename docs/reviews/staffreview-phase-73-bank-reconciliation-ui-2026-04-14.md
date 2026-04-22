# Staff Review: Phase 73 — Bank Reconciliation UI & Workflow (Plans 1-5)

**Date:** 2026-04-14
**Plans:** `.planning/phases/73-bank-reconciliation-ui-workflow/73-PLAN-{1-5}.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Structure Validation

✅ All 5 plans have:
- Frontmatter: phase, plan, type, wave, depends_on, files_modified, autonomous, requirements
- `must_haves` with truths + artifacts
- `<tasks>` with `<read_first>` and `<acceptance_criteria>` on every task
- `<verification>` and `<success_criteria>` blocks
- Git workflow enforced via GSD executor (branch-per-phase)
- CHANGELOG/SCHEMA/API_REFERENCE updates in Plan 5

✅ Plan structure validated — all mandatory sections present.

---

## 1. Summary

**Overall Assessment: Revise**

The plans are architecturally coherent, well-scoped per wave, and the backend contract in Plan 1 is thorough. Three issues require fixing before execution: (1) Plan 4 contains an unresolved architectural OR on the `linkInline` mutation path that will force the executor to make a design decision mid-execution; (2) Plan 5 contains a hedge ("Playwright OR convex-test fallback") that is unnecessary — Playwright is already configured in this codebase; (3) Plan 2 does not describe HOW the existing 521-line stateful wizard in `BankReconciliationPage.tsx` becomes the Statements tab — the page has complex multi-step state (`BankWizardState`) that cannot simply be wrapped in a `<TabsContent>` without explicit restructuring guidance.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| 1 | `linkInline` mutation path left as OR — executor will guess wrong | Architecture | Plan 4, key_links + artifacts |
| 2 | Playwright is already configured — E2E hedge introduces false ambiguity | Testing | Plan 5 Task 1, `<behavior>` |
| 3 | Plan 2 does not describe wizard-to-tab extraction strategy | Architecture | Plan 2 Task 2, `<behavior>` |

---

### Issue 1: `linkInline` Mutation Path is Unresolved

**Plan 4 artifacts field:**
> `linkInlineExpense / linkInlineRevenue / linkInlineReimbursement mutations OR updated manualMatch path to set createdExpenseId/createdRevenueId/createdReimbursementId`

These are architecturally different choices:
- **Option A (linkInline mutations):** Dedicated `linkInlineExpense`, `linkInlineRevenue`, `linkInlineReimbursement` mutations. The `CreateXFromLineDialog` calls `submitExpense` (standard path) AND then calls `linkInlineExpense(lineId, expenseId)` as a second mutation. Clean, separates concerns.
- **Option B (updated manualMatch):** Extend `manualMatch` to accept an optional `createdRecordId` and set `createdExpenseId` on the line in the same call. The dialog flow is more complex.

The executor will have to decide which to implement, potentially picking the wrong one. The correct choice is **Option A** (dedicated link mutations): the `CreateXFromLineDialog` components call the existing submission path first, then call a side-effect-only `linkInlineX` mutation. This preserves the clean separation D-17 requires (standard submission path is untouched).

**Recommendation:** Lock Plan 4 to Option A. Add `convex/bankStatements/mutations.ts` tasks to create three new mutations — `linkInlineExpense({ token, lineId, expenseId })`, `linkInlineRevenue({ token, lineId, revenueId })`, `linkInlineReimbursement({ token, lineId, reimbursementId })` — each calling `requireRole(["manager", "admin"])` and patching the corresponding `createdXId` field + triggering `recomputeStatus`. The OR must be removed.

---

### Issue 2: Playwright Is Configured — Remove "OR Convex-Test Fallback" Hedge

**Plan 5 Task 1 `<read_first>`:**
> `tests/e2e (existing Playwright or test infrastructure — identify whether Playwright is configured...)`

**Verified:** `playwright.config.ts` exists, `tests/e2e/` has 18+ spec files (`expense-lifecycle.spec.ts`, `order-lifecycle.spec.ts`, etc.), and the project already has a `global-setup.ts`. The "OR convex-test fallback" hedge is unnecessary and will cause the executor to waste time on the discovery step or write weaker integration tests.

**Recommendation:** Remove the OR hedge from Plan 5 Task 1. Replace with: "Use Playwright (configured — `playwright.config.ts` exists, `tests/e2e/global-setup.ts` configured). Mirror the setup from `expense-lifecycle.spec.ts` which covers a similar multi-step flow. Add `tests/e2e/bankReconciliation.spec.ts`." This is one line of guidance that prevents the executor from going down a wrong path.

---

### Issue 3: Plan 2 Does Not Describe Wizard-to-Tab Extraction

**Current `BankReconciliationPage.tsx` (521 lines)** manages a multi-step wizard with `BankWizardState` type (`upload | validating | review | importing | complete | error`). It renders the upload step, validation step, review table, and import progress as one stateful component with `useState`.

Plan 2 Task 2 says the page becomes "Tabs shell wrapping existing Statements content." But the `<behavior>` block does not describe HOW the existing wizard content is moved to the Statements tab. The executor will face these questions mid-execution:
- Does the wizard state stay at the page level or move into a `StatementWizard` sub-component?
- Does the `PageHeader` stay at page level or move into the Statements tab?
- How does `useSearchParams` for `?tab=review&statementId=...` coexist with the existing wizard step state?

Without a clear extraction strategy, the executor is likely to make messy choices (e.g., embedding the 521-line page's render logic inside one `<TabsContent>` with shared state that will cause rerenders on tab switch).

**Recommendation:** Add a `<behavior>` paragraph to Plan 2 Task 2 clarifying:
1. Extract the wizard state machine and its render tree into a new `StatementWizard.tsx` sub-component (or keep inline as `<TabsContent value="statements">` with the full existing render). Be explicit.
2. The tab shell at the `BankReconciliationPage` level manages only `?tab=` param — all wizard step state stays below it.
3. `PageHeader` stays at the page level, above the `<Tabs>` component.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | `getStatementProgressBatch` needs an input size cap | Medium | Low |
| 2 | Plan 3: Lock Rules tab non-admin behavior to "hidden" vs "read-only" | Medium | Low |
| 3 | Plan 4: ExpenseForm extraction acceptance criteria are insufficient for regression | Medium | Low |
| 4 | Plan 4: AssetRegister abandoned-flow state — bank line stays stuck indefinitely | Low | Medium |

---

### Improvement 1: `getStatementProgressBatch` Unbounded Array Input

Plan 1 Task 3 adds `getStatementProgressBatch({ token, statementIds: v.array(v.id("bankStatements")) })` with no size cap. If `StatementHistoryList` renders 50+ statements and sends all IDs in one subscription, this creates a wide query fan-out (`Promise.all` of N index scans) on every Convex reactive update.

**Recommendation:** Cap `statementIds` at `v.array(v.id("bankStatements"), { maxLength: 50 })` in the validator, and add `if (args.statementIds.length > 50) throw new ConvexError(...)` in the handler. The `StatementHistoryList` should paginate or display only recent statements.

---

### Improvement 2: Plan 3 — Rules Tab Non-Admin State Unresolved

Plan 3 must_haves: "Rules tab inlines BankRulesManager (admin-only) — non-admins see a **read-only or hidden** state"

This is an unresolved UI design decision with different implementation paths. "Hidden" = tab doesn't appear for non-admins. "Read-only" = tab appears but BankRulesManager renders without edit controls. Leaving it as "or" causes the executor to make a product decision mid-execution.

**Recommendation:** Lock to "hidden" (tab not rendered for non-admins) since: (1) rule CRUD is admin-only per D-23; (2) showing a disabled tab implies users should have access; (3) simpler implementation. Update Plan 3 Task 1/2 behavior to: `{role === "admin" && <TabsTrigger value="rules">Rules</TabsTrigger>}`.

---

### Improvement 3: Plan 4 — `ExpenseForm` Extraction Regression Coverage

Plan 4 Task 1 extracts `ExpenseForm` from `ExpenseSubmit.tsx`. The acceptance criteria only check:
- `grep -n "ExpenseForm" src/pages/ExpenseSubmit.tsx` returns 1 match
- `grep -n "ExpenseForm" src/components/bankReconciliation/inline-create/CreateExpenseFromLineDialog.tsx` returns 1 match

These verify the component is imported but NOT that the `/expenses/new` page still works after extraction. `ExpenseSubmit.tsx` has tightly coupled state (`useState` for `draftId`, `buildArgs`, form validation, `useSubmitExpense`, `useCreateDraft`, `useUpdateDraft`, `navigate` after submit). Any extraction that moves the form logic without understanding these dependencies will silently break `/expenses/new`.

**Recommendation:** Add to Plan 4 Task 1 acceptance criteria:
- `npm run test -- --run src/pages/ExpenseSubmit` exits 0 (if tests exist)
- Manual regression note: "verify `/expenses/new` flow end-to-end: create draft → upload receipt → set submittedBy → submit → confirm status=submitted not approved"
- `grep -n "useSubmitExpense\|createDraft\|updateDraft" src/pages/ExpenseSubmit.tsx` returns matches (state management remains in the page, not migrated into the form component).

---

### Improvement 4: Plan 4 — CapEx Handoff Abandoned Flow

When a user clicks "Route to Asset Register" and navigates to `/asset-register/new?fromBankLineId=...`, then abandons (navigates back without saving), the bank line remains with `flags: ["capex_needs_asset_register"]` indefinitely. There is no mechanism to clear this or retry.

**Recommendation:** Add a `Dismiss CapEx flag` action to Plan 4 (or Plan 2's BankLinesPane) that allows a manager/admin to remove `capex_needs_asset_register` from the flags array, returning the line to a confirmable state. Even a small mutation `clearCapExFlag({ token, lineId })` prevents lines from being permanently stuck.

---

## 4. Refinements (Minor Suggestions)

- **Plan 1, `by_channel_date` index:** `linkedChannel` is an optional field on `bankStatementLines`. Convex indexes on optional fields create sparse indexes — lines without `linkedChannel` won't appear in index scans. This is intentional for the Revenue Gap query (only care about lines WITH a channel), but worth noting in a comment so future devs understand why unallocated lines need a separate `null`-bucket query.

- **Plan 2, `CandidateSearchDialog` escape hatch:** The dialog searches "all records of matchedType" — but `matchedType` must be selected before opening the search. The behavior block should clarify that the dialog pre-selects the matchedType from the current line's `originalCategory` or defaults to showing all types if classification is absent.

- **Plan 3, `LearnFromOverrideDialog` pre-fill:** The dialog pre-fills patterns from "detected pattern" but the bank line's `overrideCategoryAccountId` is the user's manual choice, not a pattern. The `counterpartyPatterns`/`descriptionPatterns` pre-fill should derive from `parsedCounterparty` / `rawDescription.slice(0, 50)` — make this explicit in the behavior block to avoid executor guessing.

- **Plan 1, WIB date formatter:** Plan 1 Task 2 says "if none exists backend-side, implement a small inline `formatWibDate`." `convex/lib/periodRange.ts` already exports `getWibComponents` per the CONTEXT.md canonical refs. The inline implementation hedge is unnecessary — just use `getWibComponents` directly. Update the action to remove the "if none exists" conditional.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `StatementHistoryList.tsx` | `src/components/bankReconciliation/` | Already exists from P72. Plan 3 extends it — good reuse. |
| `RuleFormDialog.tsx` | `src/components/bankReconciliation/` | Plan 3's `LearnFromOverrideDialog` should share field structure — read this before building the new dialog. |
| `expense-lifecycle.spec.ts` | `tests/e2e/` | Mirror setup for Plan 5 E2E test. Same auth pattern, same test structure. |
| `getWibComponents` | `convex/lib/periodRange.ts` | WIB date formatting in Plan 1 Task 2 — don't reimplement inline. |
| `ConvexError` pattern | All existing mutations | Plan 1 mutations use this — already imported in `convex/bankStatements/mutations.ts`. |
| `ProtectedRoute allowedRoles` | `src/App.tsx` lines 432-438 | Plan 2 Task 1 — already uses this pattern. Simple array change. |

### Potential Duplication Risks

- `LearnFromOverrideDialog` fields vs `RuleFormDialog` fields — verify the dialog doesn't re-implement the same rule form. If RuleFormDialog can accept a `prefilledValues` prop, use it instead of a new dialog.
- `validateBatchConfirmLines` in `reconcileHelpers.ts` must NOT duplicate the validation logic already in `confirmLine` — extract the shared validation to `reconcileHelpers.ts` and import in both.

---

## 6. Phase/Wave Accuracy

| Wave | Plan | Assessment | Notes |
|------|------|------------|-------|
| 1 | 73-PLAN-1 | Good | Backend-only, no frontend deps. Correct first. |
| 2 | 73-PLAN-2 | Good | UI shell depends on backend mutations existing. Correct. |
| 3 | 73-PLAN-3 | Good | Revenue Gap table + rules tab — depends on progress queries (Plan 1) and tab shell (Plan 2). Correct. |
| 4 | 73-PLAN-4 | Good | Inline create + CapEx handoff. Depends on all prior. Correct. |
| 5 | 73-PLAN-5 | Good | E2E + docs. Correct last. |

**Ordering Issues:** None — linear dependency chain is appropriate given tight data contract coupling.

**Missing Phase:** None. All 26 locked decisions D-01–D-26 are mapped.

---

## 7. Specialist Agent Recommendations

| Plan | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 73-PLAN-1 | `convex-backend` | Pure backend: schema, mutations, queries, tests. |
| 73-PLAN-2 | `react-ui-builder` | Frontend shell + split-view UI. Needs careful reading of existing `BankReconciliationPage.tsx`. |
| 73-PLAN-3 | `react-ui-builder` | Frontend Revenue Gap table + tab completion. |
| 73-PLAN-4 | `cto-orchestrator` | Mixed backend (linkInline mutations) + frontend (3 dialogs + AssetRegister extension + ExpenseForm extraction). Cross-cutting scope justifies orchestration. |
| 73-PLAN-5 | `react-ui-builder` + manual UAT | E2E test mirrors existing patterns; docs are straightforward. |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Yes — `gsd/phase-79-shopee-item-level-revenue` is current (wrong branch); executor will create `feature/73-bank-reconciliation-ui` before starting |
| Branch naming convention | ✅ Correct — GSD enforces `feature/{slug}` |
| Merge strategy documented | ✅ Yes — CLAUDE.md: merge to main after review, then CHANGELOG |

### Recommended Commit Checkpoints

1. After Plan 1 schema additions → `feat(73): extend bankStatementLines schema with D-25 audit fields`
2. After Plan 1 mutations → `feat(73): add manualMatch/unmatch/confirmLine/batchConfirm mutations`
3. After Plan 1 queries → `feat(73): add progress + revenue gap queries; widen P72 guards to manager`
4. After Plan 2 UI shell → `feat(73): add 4-tab shell + split-view workspace`
5. After Plan 3 Revenue Gap + progress → `feat(73): revenue gap table + statement history progress column`
6. After Plan 4 inline create → `feat(73): inline expense/revenue/reimbursement + capex handoff`
7. After Plan 5 tests + docs → `feat(73): e2e smoke + docs update`

### Pre-Push Verification
- [x] Plans include `npm run type-check` in every task verify
- [x] Plans include `npm run build` in overall verification
- [x] Local test runs before push

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ⚠️ Not documented — schema audit fields are additive (safe), but `journalEntries.sourceType` union extension requires Convex deploy; rollback would leave stale `bank_statement_reversal` rows |
| Deployment order | ✅ Correct — Convex deploy (schema + backend) before Vercel rebuild |
| Data backup needed | No — audit fields are additive only |
| Migration safety | ✅ Safe — all schema changes are additive optional fields |

### Git Workflow Issues Found
- Branch name in current repo (`gsd/phase-79-shopee-item-level-revenue`) is a different phase — executor must branch from main before starting Phase 73.

---

## 9. Documentation Checkpoints

| Plan | Documentation Update Required |
|------|-------------------------------|
| Plan 1 | docs/SCHEMA.md (D-25 audit fields, D-26 sourceType literal, by_channel_date index) |
| Plan 1 | docs/API_REFERENCE.md (5 new mutations, 3 new queries) |
| Plan 5 | docs/CHANGELOG.md (Phase 73 entry) |
| Plan 5 | docs/SCHEMA.md + docs/API_REFERENCE.md (final) |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-04-14 — Phase 73: Bank Reconciliation UI & Workflow

**Manual match/unmatch split-view, per-statement progress tracking, and inline record creation from bank lines.**

- Added bank reconciliation review workspace: split-screen bank lines (left) + candidate records (right)
- Manual match, unmatch (with JE reversal), confirm, and batch confirm flows
- Per-statement progress bar and counts (matched/unmatched/confirmed) live-updating
- Revenue Gap tab: per-channel Bank CR vs ExternalRevenue diff with period picker and drill-down
- Learn-from-override: create keyword rules directly from category overrides
- Inline expense creation (standard submission flow), revenue, and reimbursement from unmatched lines
- CapEx handoff: CapEx-flagged lines route to Asset Register with URL param pre-fill
- Widened /bank-reconciliation access to manager role (was admin-only)

**Files Modified:** convex/schema.ts, convex/bankStatements/mutations.ts, convex/bankStatements/queries.ts, convex/bankStatements/reconcileHelpers.ts, convex/bankKeywordRules/mutations.ts, convex/lib/journalEngine.ts, src/App.tsx, src/pages/BankReconciliationPage.tsx, src/pages/AssetRegister.tsx, src/components/bankReconciliation/* (8 new components), src/components/expenses/ExpenseForm.tsx
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: Adequate**

Each plan has TDD-first tasks with real assertions. Backend mutations and queries have `convex-test` coverage; frontend components have `@testing-library/react` tests. Plan 5 adds E2E with Playwright.

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | manualMatch / unmatch / confirmLine / batchConfirm | convex-test | Planned |
| Backend | getStatementProgress / getRevenueGap / createFromOverride | convex-test | Planned |
| Frontend | ReviewWorkspace / split view interactions | Vitest + RTL | Planned |
| Frontend | BatchConfirmPreviewDialog DR/CR gate | Vitest + RTL | Planned |
| Frontend | RevenueGapTable / StatementHistoryList / LearnFromOverrideDialog | Vitest + RTL | Planned |
| Frontend | CreateExpenseFromLineDialog (D-17 no-approve assertion) | Vitest + RTL | Planned |
| Integration | Match → confirm → unmatch → reversal happy path | Playwright E2E | Planned |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `/expenses/new` regression after ExpenseForm extraction | ExpenseSubmit has complex state; extraction can silently break the flow | RTL test rendering `<ExpenseSubmit>` after extraction, verify form fields present and submission works |
| 2 | Playwright: batch confirm DR≠CR gate | UI-level guard — Playwright should assert Post button stays disabled until balance resolves | Add to E2E spec: fill batch with imbalanced lines, assert Post button has `disabled` attribute |
| 3 | Playwright: manager vs admin access | Role-based access is a key change in this phase | Add a manager-role login to E2E that verifies `/bank-reconciliation` loads without redirect |

### Regression Risk
- `convex/bankKeywordRules/__tests__/mutations.test.ts` — the regression test "existing `create` mutation still rejects manager" is critical. If this test is missing or skipped, a privilege escalation goes undetected.
- `src/pages/ExpenseSubmit.tsx` — any test of this page verifies no regression from ExpenseForm extraction.
- `convex/lib/journalEngine.ts` — adding `bank_statement_reversal` to `NON_REVERSIBLE_TYPES` must not break existing reversal paths. Check existing journalEngine tests still pass after this change.

---

## 11. Edge Cases to Address

- [ ] **`batchConfirm` with 0 eligible lines:** `batchConfirm` scans `exact + (auto_matched|suggested)` — if the statement has 0 such lines, should return `{ postedCount: 0, journalEntryIds: [] }` not throw. Plan 1 doesn't address this.
- [ ] **`unmatch` on a line that was never confirmed but has `confirmedJournalEntryId` from a DB anomaly:** Guard should check `status === "confirmed"` before attempting reversal, not just presence of `confirmedJournalEntryId`.
- [ ] **`manualMatch` against a soft-deleted record:** `ctx.db.get(args.matchedId)` returns the doc even if it's "deactivated" or logically deleted. The IDOR guard (T-73-03) only checks non-null, not whether the record is active. Add an `isActive` / `deletedAt` check for the matched record type.
- [ ] **Revenue Gap with `periodStart > periodEnd`:** `getRevenueGap` should validate `args.periodStart <= args.periodEnd` and throw `ConvexError("Invalid period")` before scanning.
- [ ] **`StatementProgressHeader` on statement with 0 lines:** `percent = round(matched/total*100)` divides by zero when `total = 0`. Plan 1 mentions "0 when total=0" but this must be explicit in the implementation (`total === 0 ? 0 : ...`).
- [ ] **Concurrent `confirmLine` calls on same line:** Convex mutations are serialized per-document, so this is safe. But worth noting in the plan so executors don't add optimistic locking that isn't needed.

---

## 12. Approval Conditions

**For Approval, address:**
1. **Plan 4:** Remove `linkInline OR manualMatch` ambiguity — lock to dedicated `linkInlineExpense/Revenue/Reimbursement` mutations.
2. **Plan 5:** Remove Playwright-OR-convex-test hedge — Playwright is configured, use it.
3. **Plan 2:** Add explicit wizard-to-tab extraction strategy (wizard state stays below tab shell; `PageHeader` stays at page level; extract to `StatementWizard` sub-component OR keep inline in `<TabsContent value="statements">`).

**Recommended before implementation:**
1. **Plan 1:** Add `batchConfirm` zero-eligible-lines edge case to Task 2 tests.
2. **Plan 3:** Lock Rules tab non-admin behavior to "hidden" (not "read-only or hidden").
3. **Plan 4:** Strengthen `ExpenseForm` extraction acceptance criteria to include regression verification.
4. **Plan 1:** Cap `getStatementProgressBatch` array input at 50.

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
*Plans reviewed: 73-PLAN-1.md through 73-PLAN-5.md*
