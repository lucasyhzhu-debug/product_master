---
phase: 73
plan: 05
type: execute
wave: 5
depends_on: [01, 02, 03, 04]
files_modified:
  - tests/e2e/bankReconciliation.spec.ts
  - docs/CHANGELOG.md
  - docs/SCHEMA.md
  - docs/API_REFERENCE.md
autonomous: false
requirements: [BANK-03, BANK-04]
tags: [bank-reconciliation, e2e, docs, verification]

must_haves:
  truths:
    - "E2E smoke test covers the happy-path flow: upload statement → Review tab → select line + candidate → Match → Confirm → verify JE exists"
    - "E2E covers the reversal flow: Unmatch a confirmed line → verify reversal JE exists with sourceType=bank_statement_reversal and both JEs remain in ledger"
    - "docs/CHANGELOG.md entry for Phase 73 lists every user-visible change"
    - "docs/SCHEMA.md reflects D-25 audit fields + D-26 sourceType literal"
    - "docs/API_REFERENCE.md lists the 5 new mutations and 3 new queries with signatures"
    - "Manual verification checkpoint confirms UI-SPEC compliance (progress bar live-update, CapEx handoff UX, learn-from-override pre-fill quality, drill-down filter propagation)"
  artifacts:
    - path: tests/e2e/bankReconciliation.spec.ts
      provides: "Playwright or Vitest-only E2E smoke covering match → confirm → unmatch → reversal happy path"
    - path: docs/CHANGELOG.md
      provides: "Phase 73 entry"
    - path: docs/SCHEMA.md
      provides: "bankStatementLines audit fields + journalEntries.sourceType updates"
    - path: docs/API_REFERENCE.md
      provides: "New mutation + query signatures"
  key_links:
    - from: "tests/e2e/bankReconciliation.spec.ts"
      to: "the full Plan 1-4 surface"
      via: "exercises every critical path"
      pattern: "manualMatch.*confirmLine.*unmatch"
---

<objective>
Final plan: ship an E2E smoke test covering the end-to-end match → confirm → unmatch → reversal flow, update project docs (CHANGELOG, SCHEMA, API_REFERENCE), and checkpoint the phase for manual UAT verification against UI-SPEC and VALIDATION.md's manual-only checks.

Purpose: Closes BANK-03 and BANK-04 with an automated smoke gate + human verification of the UX-heavy behaviors that automated tests can't fully guarantee (live progress reactivity, keyboard shortcuts, responsive split-view, learn-from-override pre-fill quality).

Output: A passing E2E test, updated docs ready for main merge, and a manual checkpoint confirming the reviewer workflow matches UI-SPEC end-to-end.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-UI-SPEC.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-VALIDATION.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-01-SUMMARY.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-02-SUMMARY.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-03-SUMMARY.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-04-SUMMARY.md
@docs/CHANGELOG.md
@docs/SCHEMA.md
@docs/API_REFERENCE.md
@tests/e2e
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: E2E smoke test for full reconciliation flow</name>
  <files>
    tests/e2e/bankReconciliation.spec.ts
  </files>
  <read_first>
    tests/e2e (existing Playwright or test infrastructure — identify whether Playwright is configured with a runner or whether the project uses convex-test integration tests for E2E-equivalents),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-VALIDATION.md (Wave 0 E2E requirement),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-RESEARCH.md (Wave 0 Gaps section — "confirm whether tests/e2e/ is configured and CI-wired. If not, defer E2E and document as manual UAT step"),
    All prior SUMMARYs (73-01 through 73-04) for the precise mutation/query surface to exercise
  </read_first>
  <behavior>
    **First, determine the E2E framework status:**
    - If Playwright is configured AND CI-wired: write a real Playwright spec.
    - If only Vitest + convex-test exists: write an integration-level "E2E" using convex-test that exercises the full server-side flow (parse statement → manualMatch → confirmLine → unmatch → reversal JE verification) without a browser. Document in summary that UI-E2E is deferred to manual UAT per RESEARCH Wave 0 Gaps note.

    **Either way, the test MUST cover:**
    1. **Setup:** Seed a bank statement with 3 lines — one exact-tier auto-matched credit, one suggested debit with valid jeDebit/jeCredit accounts, one unmatched debit.
    2. **Manual match:** call manualMatch on the unmatched debit → assert status="suggested", matchedType/matchedId set, isAutoMatched=false.
    3. **Confirm:** call confirmLine on a suggested line → assert JE created (query journalEntries by sourceId), bank line status="confirmed", confirmedJournalEntryId populated.
    4. **Reversal:** call unmatch on the confirmed line → assert new JE with sourceType="bank_statement_reversal" created, original JE untouched (isReversed=false), bank line.reversalJournalEntryId populated, status recomputed to "suggested" (since originalCategory was present) or "unmatched".
    5. **Batch confirm balance gate:** manually mangle one line's jeDebitAccountId to undefined → call batchConfirm → assert it throws with a message listing the offending line(s) AND that no JEs were posted (all-or-nothing).
    6. **Permission gate:** call any reconciliation mutation with a kitchen-role token → assert ConvexError "not authorized" (or equivalent existing message).

    Add E2E entry to `.planning/phases/73-bank-reconciliation-ui-workflow/73-VALIDATION.md` Per-Task Verification Map marking status ✅ after green.
  </behavior>
  <action>
    1. Check `tests/e2e/` and `playwright.config.ts` (if present) — determine framework.
    2. Write `tests/e2e/bankReconciliation.spec.ts` (Playwright) OR `convex/bankStatements/__tests__/e2eFlow.test.ts` (convex-test integration) covering the 6 assertions above.
    3. Run the test until green.
    4. If using convex-test fallback, document the decision in the plan summary (not in the test file).
  </action>
  <verify>
    <automated>npm run test -- --run tests/e2e/bankReconciliation.spec.ts || npm run test -- --run convex/bankStatements/__tests__/e2eFlow.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - E2E or E2E-equivalent test file exists at one of: `tests/e2e/bankReconciliation.spec.ts` OR `convex/bankStatements/__tests__/e2eFlow.test.ts`
    - `grep -nE "(manualMatch|confirmLine|unmatch)" <test-file>` returns at least 3 matches
    - `grep -n "bank_statement_reversal" <test-file>` returns at least 1 match
    - `grep -nE "(batchConfirm|all-or-nothing)" <test-file>` returns at least 1 match
    - `grep -nE "(kitchen|not authorized|ConvexError)" <test-file>` returns at least 1 match (permission test)
    - The test command exits 0
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>E2E smoke covers match/confirm/unmatch/reversal/batch-balance-gate/permission flows; test green; framework decision (Playwright vs convex-test) documented.</done>
</task>

<task type="auto">
  <name>Task 2: Update docs (CHANGELOG, SCHEMA, API_REFERENCE)</name>
  <files>
    docs/CHANGELOG.md,
    docs/SCHEMA.md,
    docs/API_REFERENCE.md
  </files>
  <read_first>
    docs/CHANGELOG.md (latest entries — mirror format for v2.0 Phase 73 addition),
    docs/SCHEMA.md (bankStatementLines and journalEntries sections — identify where to add D-25 fields + D-26 literal),
    docs/API_REFERENCE.md (bankStatements module — identify existing query/mutation entries from P72 to extend),
    All 4 prior SUMMARYs for the exhaustive list of new mutations/queries
  </read_first>
  <behavior>
    **CHANGELOG.md entry** under the latest v2.0 in-progress block:
    - Header: `### Phase 73: Bank Reconciliation UI & Workflow (2026-04-XX)`
    - Bullet list of user-visible changes:
      - Manual match/unmatch split-view on /bank-reconciliation
      - Tab navigation: Statements, Review, Revenue Gap, Rules
      - JE posting on Confirm; reversal JE on Unmatch (both retained in ledger)
      - Batch Confirm with DR/CR balance gate preview modal
      - Learn-from-override: save category overrides as reusable rules (manager+admin)
      - Revenue Gap per-channel dashboard with period picker and drill-down
      - Inline create: expense (standard submission flow, receipt + submittedBy required), revenue, reimbursement
      - CapEx handoff to Asset Register with existing-asset detection
      - /bank-reconciliation widened from admin-only to manager+admin
    - Technical notes: 5 new backend mutations, 3 new queries, 9 schema audit fields added to bankStatementLines, 1 new journalEntries.sourceType literal, route permission widening.

    **SCHEMA.md updates:**
    - bankStatementLines table: add the 9 audit field entries (confirmedAt, confirmedBy, confirmedJournalEntryId, reversedAt, reversedBy, reversalJournalEntryId, createdExpenseId, createdRevenueId, createdReimbursementId) with types and purpose.
    - journalEntries.sourceType: add `"bank_statement_reversal"` literal to the union documentation.
    - Indexes: add `by_channel_date` on bankStatementLines.

    **API_REFERENCE.md updates:**
    - bankStatements.mutations: manualMatch, unmatch, confirmLine, batchConfirm, linkInlineExpense, linkInlineRevenue, linkInlineReimbursement, linkBankLineToAsset (if added), updateLineOverride (if added).
    - bankStatements.queries: getStatementProgress, getStatementProgressBatch, getRevenueGap.
    - bankKeywordRules.mutations: createFromOverride.
    - fixedAssets.queries: findSimilarAssets (if added).
    - Each entry: signature (args + return) + 1-2 sentence description + role guard.
  </behavior>
  <action>
    1. Read each doc file, locate the correct insertion points (chronological order for CHANGELOG, alphabetical/module-grouped for SCHEMA + API_REFERENCE).
    2. Append Phase 73 content.
    3. Run `npm run build` to ensure docs changes don't break anything else (docs are not typecheck-relevant but build is the canonical green signal).
  </action>
  <verify>
    <automated>grep -n "Phase 73" docs/CHANGELOG.md &amp;&amp; grep -n "bank_statement_reversal" docs/SCHEMA.md &amp;&amp; grep -n "getStatementProgress\\|manualMatch" docs/API_REFERENCE.md &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "Phase 73" docs/CHANGELOG.md` returns at least 1 match
    - `grep -n "Bank Reconciliation UI" docs/CHANGELOG.md` returns at least 1 match
    - `grep -n "bank_statement_reversal" docs/SCHEMA.md` returns at least 1 match
    - `grep -nE "(confirmedJournalEntryId|reversalJournalEntryId|createdExpenseId)" docs/SCHEMA.md` returns at least 3 matches
    - `grep -n "by_channel_date" docs/SCHEMA.md` returns at least 1 match
    - `grep -n "manualMatch" docs/API_REFERENCE.md` returns at least 1 match
    - `grep -n "getStatementProgress" docs/API_REFERENCE.md` returns at least 1 match
    - `grep -n "getRevenueGap" docs/API_REFERENCE.md` returns at least 1 match
    - `grep -n "createFromOverride" docs/API_REFERENCE.md` returns at least 1 match
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>CHANGELOG, SCHEMA, and API_REFERENCE all reflect Phase 73 additions; build passes.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Manual UAT checkpoint — UI-SPEC compliance + VALIDATION.md manual checks</name>
  <files>
    (no files modified — human verification only)
  </files>
  <action>
    This is a manual checkpoint (no automation runs). The human verifier executes the 16-step verification procedure documented in the `<how-to-verify>` block below, testing each step in the browser against dev Convex and the `feature/73-*` branch build. The verifier reports results via the `<resume-signal>`: type "approved" if all 16 steps pass, otherwise describe the failing step(s) + observed behavior so the planner can create a gap-closure plan.
  </action>
  <what-built>
    All of Phase 73: schema + backend mutations/queries, split-view workspace with tab shell, Revenue Gap tab, Rules tab integration, learn-from-override dialog, inline create dialogs (expense/revenue/reimbursement), CapEx handoff to Asset Register, progress indicators on history list and workspace header, widened route guard.
  </what-built>
  <how-to-verify>
    1. **Pre-flight:** confirm branch is a `feature/73-*` branch (NOT main). Confirm `npm run build` green. Confirm dev Convex is running (`npx convex dev`).
    2. **Log in as manager (not admin).** Navigate to `/bank-reconciliation`. Expect: page loads (no 403). Tabs visible: Statements · Review · Revenue Gap · Rules.
    3. **Upload + open a statement.** On Statements tab, upload a BCA export (use Phase 72 test fixture). Expect: history list row shows mini progress bar + counts.
    4. **Review tab split-view.** Click a row in history → switches to Review tab with statement pre-selected. Expect: progress header shows `{matched}/{total} matched · {suggested} · {unmatched}` + percent + Progress bar. Split-view panes render.
    5. **Click-to-select + Match.** Click a bank line → row highlights teal (4px left border + brand-light background). Candidate pane refreshes, showing sections `Reimbursement Batches (N)`, `Expenses (N)`, `Payroll (N)`, `Revenue (N)` with (0) for empty groups. Click a candidate → highlights teal. `Match selected` button becomes enabled → click → toast `Line matched to {type}.` appears. Line moves to `suggested`.
    6. **Keyboard shortcuts.** Select a line; press ↓ → selection moves to next line. Press Esc → both selections clear. Press Enter with both selected → Match fires.
    7. **Confirm.** On a suggested line with both jeDebit/jeCredit accounts, click `Confirm match` → toast `Journal entry posted. Line confirmed.` Header counts update (live-reactive — no refresh).
    8. **Batch Confirm.** Click `Confirm all exact-tier` → modal opens. If DR=CR balanced → Post button enabled. Click Post → N JEs posted → toast confirms. If you mangle a line's account (via dev tooling) and reopen → modal shows DR ≠ CR error banner and Post is disabled.
    9. **Unmatch confirmed line.** Click Unmatch on a confirmed line → confirmation copy `Unmatch this line? A reversal journal entry will be posted...` → confirm → toast `Match removed and JE reversed.` In Convex dashboard, verify two JEs exist with opposite DR/CR for that bank line (original sourceType=bank_statement, reversal sourceType=bank_statement_reversal).
    10. **Learn-from-override.** Override a line's category → dialog opens pre-filled with counterparty + description tokens + account selections. Edit description patterns → `Save as rule` → toast `Rule saved. Future lines matching "..." will auto-classify.` Open `/bank-rules` directly (still admin-only route for manager — should navigate OR show locked-state in Rules tab when opened via tab).
    11. **Revenue Gap tab.** Pick current month → table shows per-channel rows + (unallocated). Find a row with ExtRev=0 and Bank>0 → should display `—` + warning icon. Click that row → lands on Review tab filtered by that channel + period (verify URL: `?tab=review&channel=...&period=YYYY-MM`).
    12. **Inline create expense.** On an unmatched debit line, click `Create expense from this line` → dialog opens pre-filled with date/amount/description/vendor. Try to submit without receipt → validation blocks. Try without submittedBy → validation blocks. Fill both → submit → toast success → bank line auto-matches as suggested. Navigate to `/expenses/approval` → new expense appears with status "Submitted" (NOT approved) — this verifies D-17 critical constraint.
    13. **CapEx handoff.** Find a CapEx-flagged line (use a seed rule that triggers capex_needs_asset_register flag — Phase 72 seed rule B01) → button shows `Route to Asset Register` NOT `Confirm`. Click → lands on `/asset-register/new` with fields pre-filled. Save asset → redirects back to Review tab → bank line auto-matched to the asset's acquisition expense.
    14. **Existing-asset detection.** Route another CapEx line with same vendor + cost + date → intake shows `An asset matching this vendor, cost, and date is already registered...` banner.
    15. **Multi-session reactivity (VALIDATION.md manual check):** Open the same statement in two browser windows. Confirm a line in one → progress bar counts update in the other within ~2 seconds.
    16. **Responsive layout.** Resize to <900px width → split-view stacks vertically; sticky footer for Match/Unmatch appears.

    If all 16 steps pass → type `approved`. If any fail → describe the failing step + observed behavior; planner creates a gap-closure plan.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues per step number</resume-signal>
  <verify>
    <automated>MISSING — manual-only checkpoint; automation is replaced by the 16-step human verification procedure in &lt;how-to-verify&gt;</automated>
  </verify>
  <acceptance_criteria>
    - User explicitly types "approved" or a gap-closure plan is created for any failures
    - All 4 manual checks from VALIDATION.md covered in steps above
  </acceptance_criteria>
  <done>Manual UAT signed off (or gap-closure plan queued for failures).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| E2E test environment → Convex dev deployment | Tests run against dev data, not production |
| Docs update → git history | Docs changes are trackable; no new auth surface |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-73-21 | Tampering | E2E test seeds could accidentally run against prod | mitigate | Convex-test uses in-memory schema instance per run (isolated); Playwright (if used) requires localhost URL — document in summary to never run against `prod:decisive-wombat-7` |
</threat_model>

<verification>
Overall Plan 5 verification:
- E2E test green
- Docs updated and build passes
- Manual UAT checkpoint signed off by user
</verification>

<success_criteria>
- Task 1 E2E test covers all critical backend paths (match, confirm, unmatch, reversal, batch balance gate, permissions)
- Task 2 docs reflect every Phase 73 schema + API addition
- Task 3 manual checkpoint approved
- `npm run build` and `npm run test` both green before merge
</success_criteria>

<output>
After completion, create `.planning/phases/73-bank-reconciliation-ui-workflow/73-05-SUMMARY.md` listing:
- E2E test path + framework decision (Playwright vs convex-test)
- Docs updated (file paths + sections)
- Manual UAT sign-off timestamp
- Outstanding issues (if any from UAT)
- Next action: merge `feature/73-*` branch to main per CLAUDE.md Git Workflow
</output>
