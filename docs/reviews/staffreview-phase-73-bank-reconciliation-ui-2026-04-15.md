# Staff Review: Phase 73 — Bank Reconciliation UI & Workflow

**Date:** 2026-04-15
**Plan:** `.planning/phases/73-bank-reconciliation-ui-workflow/` (6 PLAN.md files + CONTEXT, RESEARCH, UI-SPEC, VALIDATION)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Scope:** Senior-engineer lens after plan-checker VERIFICATION PASSED. Focus on invariants, duplication, race conditions, D-17/unmatch-reversal/CapEx correctness.

---

## 1. Summary

**Overall Assessment:** **Revise** (minor — 3 critical, 4 improvements, 5 refinements)

The plan bundle is structurally sound and well-decomposed: schema/mutations/queries/UI/dialogs/verification map cleanly to 6 plans with dependency-correct waves. D-17 (inline expense = "submitted", never "approved") is rigorously guarded with grep assertions at 4 plan boundaries. The unmatch-reversal flow correctly avoids `createReversalEntry` and `NON_REVERSIBLE_TYPES` per RESEARCH Pitfall #1. Plan-checker-passed items (4-section templates, depends_on graph, Nyquist, threat models) are legitimately in place.

**Genuine blockers** I found:
1. **`externalRevenue.source` is a strict `externalSource` union** — the revenue-gap join and `inlineCreateRevenue` treat it as an arbitrary string (channel name like "gopay"), which will fail Convex validators at runtime.
2. **`inlineCreateRevenue` will reject valid input** — args declare `source: v.string()` but the schema requires one of 8 literal values; tests will pass because convex-test uses the same relaxed arg, but production writes fail.
3. **1:1 cardinality race** — Plan 01's cross-link guard via `by_matched` index is a classic read-then-write TOCTOU; two concurrent manualMatch calls on the same candidate will both pass the check.

Everything else is solvable without schema rework. Execution should **not** proceed until these three are addressed.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|---|---|---|
| C1 | `externalRevenue.source` strict union vs `linkedChannel` free-form string — revenue gap join will miss all rows where channel != one of {k3mart, gobiz, internal, grabfood, bigseller, consignment, shopee, tiktok} | Schema/Logic | Plan 02 Task 2 (`revenueGapByPeriod`), Plan 02 Task 3 (`inlineCreateRevenue`) |
| C2 | `inlineCreateRevenue` arg validator mismatch with `externalRevenue.source` validator | Logic/Validator | Plan 02 Task 3 |
| C3 | Cross-link guard in `manualMatch` has TOCTOU race — two managers matching the same candidate simultaneously both succeed | Concurrency | Plan 01 Task 3 |

### C1: Revenue gap channel mapping is missing

`convex/schema.ts:18-27` defines `externalSource` as a union of exactly 8 literals: `k3mart | gobiz | internal | grabfood | bigseller | consignment | shopee | tiktok`. `externalRevenue.source` (line 1096) uses this strict union.

`bankStatementLines.linkedChannel` (line 1968) is `v.optional(v.string())` — free-form, populated from `bankKeywordRules.linkedChannel` (also free-form). The mock in CONTEXT §specifics shows rows like "gopay", "tokopedia", "ovo" — **none of which are valid `externalSource` literals**. The UI-SPEC §6.6 sample table shows the same.

Plan 02 Task 2's `revenueGapByPeriod` does:
> `extRev` = `SUM(externalRevenue.revenueGross)` where `source=channel`

This join will return 0 for every gopay/tokopedia/ovo row even when `externalRevenue` rows exist for that channel under a different `source` value. The "Diff = ∞" edge case (bank > 0, extRev = 0) will fire for every channel that isn't literally one of the 8 aggregator-level sources — making the entire Revenue Gap tab useless beyond grabfood/shopee/tiktok.

**Root cause:** There's no `channel → source` mapping layer. Phase 70 made `linkedChannel` attribution possible at the bank-line level, but Revenue is tracked at the aggregator source (`gofood`/`grabfood`/`consignment`) not at the payment-channel level.

**Recommendation:**
- Add a `mapChannelToSource(channel: string): externalSource | null` helper in `convex/bankStatements/channelMapping.ts` (or reuse `convex/lib/externalSource.ts` if it has this).
- In `revenueGapByPeriod`, group `externalRevenue` rows by `source` and present rows in two groups: (a) channels that map cleanly 1:1 to an `externalSource`, (b) raw bank channels that don't have revenue-side representation (flag these as "channel not tracked in externalRevenue" rather than "∞ gap").
- OR: widen `externalSource` to include payment channels. Schema change — deferred by CONTEXT, so option 1 is safer.
- Update CONTEXT D-14 + UI-SPEC §6.6 to reflect the mapping before Plan 02 implements the query.

### C2: `inlineCreateRevenue` source validator mismatch

Plan 02 Task 3:
> Args: `{ token, bankLineId, transactionDate, revenueGross, source, periodStart?, periodEnd? }`

Planner says "delegates to existing externalRevenue creation mutation" but doesn't specify the `source` arg validator. Since Convex validators are load-bearing, if the plan uses `source: v.string()` the insert into `externalRevenue` (strict union) will fail at runtime. If it uses `source: externalSource`, then the CONTEXT D-18 premise — "pre-filled from `linkedChannel`" — is broken because `linkedChannel` can be "gopay" etc.

**Recommendation:** In Plan 02 Task 3, explicitly specify:
```ts
args: { ..., source: externalSource }  // import from schema
```
and document that the dialog (Plan 04 `InlineRevenueDialog`) must present a **Select over the 8 valid externalSource literals**, pre-selecting via `mapChannelToSource(line.linkedChannel)` when possible. If mapping returns null, the user picks manually. Add a unit test for the mapping.

### C3: Cross-link guard TOCTOU race

Plan 01 Task 3 `manualMatch` code sample:
```ts
const existing = await ctx.db
  .query("bankStatementLines")
  .withIndex("by_matched", q => q.eq("matchedType", args.matchedType).eq("matchedId", args.matchedId))
  .first();
if (existing && existing._id !== args.lineId) {
  throw new ConvexError(`Target already linked to bank line ${existing._id}`);
}
await ctx.db.patch(args.lineId, { matchedType: args.matchedType, matchedId: args.matchedId, ... });
```

Convex mutations serialize per-document but the guard reads a **different** line than the one being patched. Two simultaneous `manualMatch(A→X)` and `manualMatch(B→X)` will each pass the `by_matched` scan (returns nothing for X) and both patch. Convex's per-document OCC won't catch this because neither call modifies the same document.

**Recommendation:**
- Convex doesn't offer table-level locks, but the standard pattern is to **write a sentinel document** or leverage a uniqueness index. Add a boolean index `by_matched_confirmed` or rely on the fact that both writes will land and add a **post-write consistency check**: after patch, re-query `by_matched`, assert exactly one match, else throw to trigger mutation rollback.
- Cheaper alternative: add Plan 02 Task 2 assertion to `listCandidatesForLine` that exposes `alreadyLinkedToLineId` so the UI *strongly discourages* picking already-linked candidates (Plan 01 already does this via the test). Combine with the post-write check.
- Add Test 7 to `manualMatch.test.ts`: "concurrent matches to same target — only one wins". Even if convex-test can't truly parallelize, assert the second call throws by invoking twice in quick succession with an intermediate `t.run` seed of the first match.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|---|---|---|
| I1 | `markAssetLinked` needs idempotency guard for CapEx round-trip robustness (tab-close/refresh/back-button) | Medium | Low |
| I2 | Permission widening on `getStatement` / `findByFileHash` has no caller audit — confirm no non-UI consumers rely on admin-only | Medium | Low |
| I3 | `getStatementProgress` uses 4 prefix scans but doesn't unify "suggested-by-rule" vs "suggested-by-manual-match" — UI chip may be ambiguous | Medium | Medium |
| I4 | ExpenseSubmit.tsx is 605 LOC — form-body extraction (RESEARCH A2) is a non-trivial refactor gated by "if needed" — should be mandated and scoped | Medium | Medium |

### I1: CapEx round-trip idempotency

Plan 04's CapEx flow: user clicks `[Route to Asset Register]` → AssetRegister.tsx with `?fromBankLine={id}`. On save, AssetRegister calls `markAssetLinked(bankLineId, expenseId)` and navigates back.

Failure modes:
- User closes tab before saving asset → bank line stays in `suggested` status, no JE posted — correct, recoverable.
- User saves asset, browser crashes before navigate-back → `markAssetLinked` already ran, but user doesn't see the confirmation. Re-attempting in a new tab might re-run the flow. **Need idempotency.**
- User clicks browser back mid-flow → URL params persist in history; navigating back to `?fromBankLine=X` could re-trigger the duplicate-detection prompt.

**Recommendation:** `markAssetLinked` (Plan 02 Task 3) should:
1. Check if line already has `createdExpenseId` set. If so, check if it matches `args.expenseId` — return success idempotently. If different, throw "Line already linked to different expense {id}".
2. AssetRegister.tsx save handler (Plan 04) should check if line already has `matchedType === "expense"` before calling `markAssetLinked`, skip if so.
3. D-22 duplicate detection: once a user clicks "Link to existing", the existing asset's `expenseId` is used. Make sure `markAssetLinked` accepts that path (not just "Create new anyway").

Add this to Plan 02 Task 3's `markAssetLinked` spec + add a test case for the idempotency path.

### I2: Permission widening caller audit

Plan 01 widens `listStatements`, `getStatement`, `findByFileHash`, `listLines` from `["admin"]` to `["manager", "admin"]`. Non-obvious risk: `bankStatements.accountNumber` and `accountHolder` are marked in schema comments (line 1909-1910) as "PII — never log at query/mutation boundary". Managers now see these via `getStatement`.

**Recommendation:** Either
- Redact PII fields in the widened query responses (`getStatement` returns full doc — change to return projection without `accountNumber`/`accountHolder` for manager role), OR
- Document in CONTEXT D-23 that managers are trusted with BCA PII (business decision) and add a comment at the query site.

Also grep for other callers of these queries — if any dashboard/report renders `accountNumber` and relies on admin-only filtering upstream, widening the query breaks that trust boundary. Plan 06 code-auditor sweep should include this check.

### I3: Progress query ambiguity

`getStatementProgress` returns `{ unmatched, autoMatched, suggested, confirmed, matched, reconciledPct }`. `suggested` conflates:
- Rule-classified but not linked to a record (P72 auto-classification with low confidence)
- Manually matched via `manualMatch` (Plan 01)
- Inline-created record linked but not yet confirmed (Plan 02 `inlineCreate*`)

UI-SPEC §6.3 shows "12 suggested" as one chip. A reviewer wanting to know "how many remain to action" can't distinguish. Not a critical bug, but materially impacts UX.

**Recommendation:** Add a secondary count `suggestedByUserAction` (lines where `isAutoMatched === false`) OR rename the chip to "Needs confirm" and filter the UI list to `status IN ('auto_matched', 'suggested')`. Sidestep in Plan 03 — no backend change required.

### I4: ExpenseSubmit form-body extraction

ExpenseSubmit.tsx is 605 LOC with admin checks, fraud heuristics, receipt upload, and multi-step state. Plan 04 Task 2 says:
> "ExpenseSubmit form-body extraction (if needed per A2 RESEARCH assumption)"

"If needed" is the wrong posture. D-17 explicitly states "the inline-create dialog opens the **standard** expense submission UI". If the form isn't extracted, Plan 04 will either duplicate the form (breaking DRY and D-17's "never shortcut" rule) or embed the full page in a dialog (route nesting, auth context issues).

**Recommendation:** Mandate the extraction as a separate task (Plan 04 Task 2a) before the inline-expense dialog. Scope:
- Extract `<ExpenseSubmitForm>` component that accepts `initialValues`, `onSubmit`, `mode: "page" | "dialog"`.
- Both `ExpenseSubmit.tsx` and `InlineExpenseDialog.tsx` render it.
- Refactor preserves all existing ExpenseSubmit tests (regression guard).

---

## 4. Refinements (Minor Suggestions)

- **R1:** Plan 02 `getStatementProgressBulk` 50-id cap is arbitrary — StatementHistoryList already caps at 50 rows (P72 `.take(50)`) so this is fine, but document the invariant.
- **R2:** `listCandidatesForLine` uses `Promise.all` for 4 reverse lookups × N candidates — at 50 candidates × 4 groups = 200 parallel queries. Within budget but add a note in code comment; switch to bulk `by_matched` scan if statements grow >300 lines.
- **R3:** Plan 01 `batchConfirmExactTier` calls `createJournalEntryWithLines` in a loop. For 50+ exact-tier lines, this creates 50+ JEs in one mutation — Convex 1MB transaction size limit could be hit. Add explicit cap (e.g., 100 lines/batch) with a "batch too large, split" error.
- **R4:** Plan 03 uses Tabs with URL query sync (`?tab=review`) — good pattern. Document the tab-value enum in a single constant to avoid drift between `App.tsx`, tabs component, and Revenue Gap drill-down.
- **R5:** Batch-confirm balance gate (D-08) validates DR/CR pairs sum globally. Double-check that "globally balanced" ≠ "each line balanced" — two unbalanced lines could cancel out. The existing `createJournalEntryWithLines` validates per-entry balance, so each per-line JE must itself balance. Plan 01's loop posts one JE per line, so this is fine. Plan 04's preview modal should show per-line balance too, not just grand totals.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---|---|---|
| `createJournalEntryWithLines` | `convex/lib/journalEngine.ts:236` | Single JE posting entry point — plans correctly route confirm + unmatch reversal through it |
| `buildReversedLines` | `convex/lib/journalEngine.ts:212` | Reuse for unmatch reversal — plan 01 references correctly |
| `similarityScore` | `convex/lib/fuzzyMatch.ts:38` | Plan 02 search* queries reference it for ranking |
| `getWibMonthStart/End/Components` | `convex/lib/periodRange.ts` | Revenue gap period bounds — plans reference correctly |
| `externalSource` validator | `convex/schema.ts:18` | **NOT referenced by plans** — see C1/C2 |
| `protectedMutation` pattern | `convex/expenses/mutations.ts:372` uses `protectedMutation({ roles: [...] })` | Plan 02 Task 3 offers "protectedMutation OR plain mutation + requireRole" — should standardize on existing pattern per file; inspect before implementation |
| `RuleFormDialog.tsx` | `src/components/bankReconciliation/` | Plan 04 reuses as LearnFromOverride body — correct |
| `platformColors` | `src/lib/platformColors.ts` | Plan 05 Revenue Gap row tinting — correct |

### Potential Duplication Risks

- **ExpenseSubmit form body** (I4) — risk of duplicating into InlineExpenseDialog.
- **`seedReconcileFixture` helper** referenced by 4 test files (Plans 01, 02) + 3 E2E specs (Plan 04) + 3 more (Plan 06). Plan 01 Task 2 says "or shared helper in `__tests__/helpers.ts`". Explicitly mandate the shared helper; don't let each file re-seed.
- **`mapChannelToSource`** (C1) doesn't exist — will need to be written once, shared between `revenueGapByPeriod`, `inlineCreateRevenue`, and the InlineRevenueDialog. Put in `convex/bankStatements/channelMapping.ts` and `src/lib/channelMapping.ts` (mirror) OR expose via a query.

---

## 6. Phase/Wave Accuracy

| Plan | Wave | Assessment | Notes |
|---|---|---|---|
| 73-01 | 1a | Good | Correct ordering of schema + journalEngine union + queries widening + 4 mutations. Clean TDD wave-0 stubs. |
| 73-02 | 1b | Good | Correctly sequenced after 1a (shared file). Queries + inline-create + createFromOverride. **Blocked on C1/C2.** |
| 73-03 | 2a | Good | Split-view shell must land before Plan 04 dialogs wire callbacks. |
| 73-04 | 2b | Needs adjustment | ExpenseSubmit extraction should be mandated not "if needed" (I4). E2E fixture `seedBankStatement` assumed but not verified to exist — add Task 0 to check/create it. |
| 73-05 | 2b | Good (pending C1) | Parallel with 04 is correct. Revenue gap tab small scope. |
| 73-06 | 3 | Good | Verification + docs. Appropriate gate before merge. |

**Ordering:** Correct. Wave 1a→1b→(2a)→(2b parallel)→3 respects all file-overlap constraints.

**Missing:** No pre-flight task validates that the `seedReconcileFixture` / `loginAs` E2E helpers exist in `tests/helpers/`. If they don't, Plan 04 Task 1 will silently duplicate seed logic.

---

## 7. Specialist Agent Recommendations

| Plan | Recommended Agent | Rationale |
|---|---|---|
| 73-01 | `convex-backend` | Schema + mutations + tests — pure backend |
| 73-02 | `convex-backend` | Queries + inline-create + rule mutation |
| 73-03 | `react-ui-builder` | Split-view shell + hooks |
| 73-04 | `react-ui-builder` + `convex-backend` | Dialogs + ExpenseSubmit extraction (I4) may touch both — pair works best |
| 73-05 | `react-ui-builder` | Revenue Gap tab |
| 73-06 | `code-auditor` + docs sweep (react-ui-builder for CLAUDE.md/CHANGELOG) | Verification |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|---|---|
| Feature branch specified | Yes (`feature/phase-73-bank-reconciliation-ui`, 43 chars, under 50 per pitfall 14) |
| Branch naming convention | Correct |
| Merge strategy documented | Yes (per plan, via Plan 06 Wave 3) |

### Commit Strategy
All 6 plans commit at plan boundaries with the summary SUMMARY.md artifact — clean atomic commits. Plan 01 + 02 share a branch but run sequentially (correct per pitfall 12 — both branched from main). Plan 03/04/05 run on the same branch in sequence (2a) then parallel (2b).

### Pre-Push Verification
- `npm run build` check — present in every plan's success criteria
- `npm run type-check` — present
- `npm run test` — present
- Plan 06 Task 2 runs the full suite before docs

### CI/CD Considerations
| Concern | Assessment |
|---|---|
| Rollback strategy | Implicit — schema adds 9 OPTIONAL fields + 1 literal, all backwards-compatible; revert branch is safe |
| Deployment order | Correct — backend first (Plans 01/02), frontend after |
| Data backup needed | No |
| Migration safety | Safe — all schema changes additive/optional |

### Git Workflow Issues Found
- Plan 02 and Plan 01 both write to `convex/bankStatements/mutations.ts` — planner correctly flagged this as "Wave 1a THEN 1b" not parallel. Good.
- No explicit "switch main && pull" in Plan 01 pre-flight, but it says "Pre-flight: git switch main && git pull && git switch -c feature/phase-73-bank-reconciliation-ui" — correct per CLAUDE.md pitfall 12.

---

## 9. Documentation Checkpoints

| Plan | Docs |
|---|---|
| 73-01 | CHANGELOG, SCHEMA (D-25/D-26), API_REFERENCE (4 mutations, 4 widened queries) |
| 73-02 | CHANGELOG, API_REFERENCE (8 queries + 5 mutations) |
| 73-03/04/05 | CHANGELOG each |
| 73-06 | CHANGELOG consolidated, SCHEMA, API_REFERENCE, CLAUDE.md file finder |

Plan 06 Task 3 handles final doc sweep — appropriate.

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-04-XX — Phase 73: Bank reconciliation UI & workflow

**Split-view reconciliation with manual match, confirm-to-JE, unmatch-reversal, inline record creation, revenue gap dashboard, and CapEx handoff.**

- Schema: 9 audit fields on `bankStatementLines`; `bank_statement_reversal` sourceType literal
- Backend: 4 core mutations (manualMatch, unmatch, confirmLine, batchConfirmExactTier) + 5 inline-create/asset-link mutations + `bankKeywordRules.createFromOverride`
- Queries: getStatementProgress + getStatementProgressBulk, listCandidatesForLine, 4 search*, revenueGapByPeriod
- Frontend: Tab shell + split-view + progress header + 6 dialogs + Revenue Gap tab + AssetRegister round-trip
- Permissions: manager+admin can reconcile; rule CRUD stays admin-only except `createFromOverride`
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** **Adequate** (with the D-17 stub-realism concern below).

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|---|---|---|---|
| Backend | 4 mutations (manualMatch/unmatch/confirmLine/batchConfirm) | convex-test | Planned (Plan 01 Task 2) |
| Backend | 8 queries (progress/bulk/candidates/search*4/revenueGap) | convex-test | Planned (Plan 02 Task 1) |
| Backend | createFromOverride + role matrix | convex-test | Planned (Plan 02 Task 1) |
| Frontend | 3 components (StatementHistoryList, ProgressHeader, ActionBar) | RTL | Planned (Plan 03 Task 1) |
| E2E | 6 specs (split-view, inline-expense, batch-confirm, capex-roundtrip, learn-from-override, perms) | Playwright | Planned (Plan 04 + Plan 06) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|---|---|---|
| T1 | `inline-expense.spec.ts` Test 3 asserts "`status === "submitted"`" — verify against **DB via Convex query**, not just UI toast | D-17 is a backend invariant; UI-only assertion lets an executor auto-approve silently and still pass | Add `await convex.query(api.expenses.list, ...)` in the test, assert the new expense row has `status === "submitted"` and `approvedAt === undefined` |
| T2 | Concurrent match race test for `manualMatch` (C3) | TOCTOU race | Sequential convex-test calls with interleaved t.run |
| T3 | Channel mapping unit test for `mapChannelToSource` (C1) | Revenue gap correctness | Simple pure-function tests: gopay→?, tokopedia→?, grabfood→grabfood |
| T4 | `markAssetLinked` idempotency test (I1) | CapEx round-trip robustness | Call twice with same args, second must no-op |
| T5 | Reversal of already-reversed line throws | `unmatch.test.ts` Test 5 asserts this but doesn't check `reversalJournalEntryId` stays unchanged | Add explicit assertion |

### Test Execution Checkpoints
Plan 06 Task 2 runs full suite — correct.

### Regression Risk
- **P72 existing tests**: widening 4 queries from admin to manager — verify P72 tests don't assert kitchen/manager rejection on these specific queries. Plan 01 acceptance includes `grep requireRole(ctx, args.token, ["admin"]) returns 0 matches` which is fine, but doesn't audit existing tests.
- **`createJournalEntryWithLines` callers**: the new `"bank_statement_reversal"` sourceType is added to the union — verify no exhaustive switch statements on `JournalSourceType` elsewhere (`incomeStatement.ts`, report queries) need a case added.

---

## 11. Edge Cases to Address

- [ ] **C1:** Channel → source mapping gap for revenue-gap join
- [ ] **C3:** Two managers match same target concurrently
- [ ] **I1:** CapEx tab-close mid-flow — asset created but line not linked
- [ ] Unmatch a line whose original JE had 3+ lines (split JE) — `buildReversedLines` handles this but test only uses 2-line JEs
- [ ] Batch Confirm with 100+ exact-tier lines — Convex transaction size (R3)
- [ ] `linkedChannel` is null on all credits — Revenue Gap shows only `(unallocated)` row, check render
- [ ] Bank line whose `confirmedJournalEntryId` points to a JE that was manually deleted (should not happen but test for defensive throw)
- [ ] Revenue gap period picker's "Custom range" with end < start — validation
- [ ] ExpenseSubmit form extraction preserves its fraud heuristics + DoA checks (I4)
- [ ] `getStatementProgress` on a statement with 0 lines — reconciledPct = 0, not NaN (Test 3 handles this)

---

## 12. Approval Conditions

**For Approval, address:**
1. **C1** — Add `mapChannelToSource` helper + update `revenueGapByPeriod` to use it; update CONTEXT D-14 / UI-SPEC §6.6 to document the mapping
2. **C2** — Fix `inlineCreateRevenue` args to use `externalSource` validator + document source-picker behavior in Plan 04 `InlineRevenueDialog`
3. **C3** — Add post-write consistency check OR document the race as acceptable (low real-world probability: 2 managers matching the same candidate in the same second)

**Recommended before implementation:**
1. **I1** — `markAssetLinked` idempotency + Plan 04 pre-check
2. **I2** — PII redaction decision on widened `getStatement` / document manager trust
3. **I4** — Make ExpenseSubmit form-body extraction a mandated Plan 04 Task 2a (not conditional)

**Refinements (optional, implementer discretion):**
1. Add `batchConfirmExactTier` size cap (R3)
2. Tab-value enum constant (R4)
3. Per-line balance in Batch Confirm preview (R5)
4. Shared `seedReconcileFixture` helper mandated in Plan 01 Task 2 (duplication risk noted)
5. `getStatementProgress` suggested-sub-count or chip relabel (I3)

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
*Plan-checker VERIFICATION PASSED; this review adds senior-engineer layer.*
