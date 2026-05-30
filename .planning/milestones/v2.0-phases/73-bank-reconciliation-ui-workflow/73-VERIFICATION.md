---
phase: 73-bank-reconciliation-ui-workflow
verified: 2026-04-15T12:00:00Z
status: human_needed
score: 3/3 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: initial
  previous_score: N/A
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Log in as manager, open /bank-reconciliation, verify split-screen renders bank lines on left and candidate system records on right"
    expected: "Two-pane split-view loads; selecting a bank line refreshes candidates on the right; action bar is sticky at bottom"
    why_human: "Visual rendering, layout responsiveness, and Convex reactive data flow cannot be verified programmatically"
  - test: "Click [Match selected] on a candidate, then [Unmatch] the suggested line; then confirm, then unmatch again"
    expected: "Match toast appears; line status moves unmatched → suggested → confirmed → reversal; StatementProgressHeader live-updates the four counter chips; a reversal JE is posted on confirmed-line unmatch (sourceType=bank_statement_reversal)"
    why_human: "Real-time Convex reactivity and toast UX must be observed in a running app"
  - test: "Open Statements tab, observe live progress column on StatementHistoryList; verify matched/unmatched/suggested counts + reconciliation percent render for each uploaded statement"
    expected: "Mini progress bar and counts column populated for every row via getStatementProgressBulk; skeletons during load"
    why_human: "BANK-04 progress indicator requires visual confirmation that the percentage actually reflects live state per-statement"
  - test: "Navigate to Revenue Gap tab, select a period, click a row to drill down into Review tab with filter applied"
    expected: "Drill-down navigates to /bank-reconciliation?tab=review&channelFilter=...&period=YYYY-MM and BankLinesPane applies the filter chip"
    why_human: "Cross-tab URL-driven state requires a running SPA"
  - test: "Kitchen and order_staff users attempt to access /bank-reconciliation"
    expected: "ProtectedRoute blocks both roles; sidebar entry not visible"
    why_human: "Role-gated routing requires auth session to exercise"
---

# Phase 73: Bank Reconciliation UI & Workflow — Verification Report

**Phase Goal:** Users can review, manually match, and track reconciliation progress for uploaded bank statements
**Verified:** 2026-04-15T12:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can view a split-screen interface showing unmatched bank lines on one side and candidate system records on the other | VERIFIED | `SplitViewWorkspace.tsx` imports and renders `<BankLinesPane>` (left), `<CandidatesPane>` (right), `<ReconciliationActionBar>` (sticky bottom), `<StatementProgressHeader>` (top). Page (`BankReconciliationPage.tsx:38-40,330`) mounts `<SplitViewWorkspace>` inside `<BankReconciliationTabs>` under the Review tab. Route `/bank-reconciliation` gated to `["manager","admin"]` in `App.tsx:431`. |
| 2 | User can manually match a bank line to a system record, or unmatch an auto-matched pair | VERIFIED | Backend: `mutations.ts:278 manualMatch`, `358 unmatch`, `469 confirmLine`, `521 batchConfirmExactTier`, all gated manager+admin. `createJournalEntryWithLines` called at lines 437 (reversal with `sourceType:"bank_statement_reversal"`), 485 (confirm with `sourceType:"bank_statement"`), 551 (batch). Frontend: `SplitViewWorkspace.tsx:101-103` binds `useManualMatch/useUnmatch/useConfirmLine` to action bar. 24 Wave 0 backend tests GREEN + 12 split-view E2E specs. |
| 3 | Each uploaded statement shows matched/unmatched/suggested counts with a reconciliation progress indicator | VERIFIED | Backend: `queries.ts:162 getStatementProgress` + `:173 getStatementProgressBulk` (≤50 id cap), return `{total, unmatched, autoMatched, suggested, confirmed, matched, reconciledPct}` via `by_statement_status` indexed prefix scans. Frontend: `StatementProgressHeader.tsx` (header live progress) + `StatementHistoryList.tsx` (per-row mini progress column) wired via `useStatementProgress` / `useStatementProgressBulk` hooks. 8 progress tests GREEN. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/bankStatements/mutations.ts` | manualMatch, unmatch, confirmLine, batchConfirmExactTier, inlineCreate*, markAssetLinked | VERIFIED | 8 exports confirmed (lines 278, 358, 469, 521, 595, 668, 720, 806); `createJournalEntryWithLines` called at 3 sites; 0 `createReversalEntry` calls (Pitfall 1 respected) |
| `convex/bankStatements/queries.ts` | getStatementProgress, getStatementProgressBulk, listCandidatesForLine, search*, revenueGapByPeriod, getLine | VERIFIED | 9 exports confirmed (lines 50, 162, 173, 230, 312, 336, 362, 387, 438); 0 `requireRole(..., ["admin"])` (all 4 P72 queries widened per D-23) |
| `convex/bankKeywordRules/mutations.ts` | createFromOverride (manager+admin) | VERIFIED | Line 269 export present; plain CRUD stays admin-only |
| `convex/schema.ts` | 9 D-25 audit fields + `bank_statement_reversal` literal | VERIFIED | All fields + literal present (confirmed via grep); `bank_statement_reversal` also in `convex/lib/journalEngine.ts` |
| `src/pages/BankReconciliationPage.tsx` | Tab shell + route | VERIFIED | Imports `BankReconciliationTabs`, `SplitViewWorkspace`, `RevenueGapTab` (lines 38-40); renders split view at line 330 |
| `src/components/bankReconciliation/SplitViewWorkspace.tsx` | Split-view orchestrator | VERIFIED | 14,203 bytes; imports all 4 panes + 6 dialogs; wires useManualMatch/useUnmatch/useConfirmLine |
| `src/components/bankReconciliation/` dialogs | 6 dialogs (BatchConfirm, LearnFromOverride, InlineExpense, InlineRevenue, InlineReimbursement, SearchAllRecords) | VERIFIED | All 6 files present with substantive content (5-13 KB each) |
| `src/components/bankReconciliation/RevenueGapTab.tsx` | Revenue Gap dashboard | VERIFIED | 20,548 bytes, period picker + mapped/unmapped rows + drill-down nav |
| `src/hooks/convex/useBankReconciliation.ts` | Facade exports for 16 P73 hooks | VERIFIED | All hooks present: useBankLine (43), useStatementProgress (175), useStatementProgressBulk (187), useCandidatesForLine (198), useSearch* (217-244), useRevenueGap (254), useManualMatch (274), useUnmatch (291), useConfirmLine (304), useBatchConfirmExactTier (317), useInlineCreate* (333-359), useMarkAssetLinked (372), useCreateRuleFromOverride (388) |
| `src/App.tsx` | Route gated to manager+admin | VERIFIED | `bank-reconciliation` route at line 431, comment cites D-23 manager+admin gate |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| confirmLine | createJournalEntryWithLines | direct call with sourceType="bank_statement" | WIRED | mutations.ts:485 |
| unmatch | createJournalEntryWithLines | direct call with sourceType="bank_statement_reversal" (NOT createReversalEntry) | WIRED | mutations.ts:437 — NON_REVERSIBLE_TYPES still contains "bank_statement" |
| batchConfirmExactTier | createJournalEntryWithLines | loop over exact-tier lines, sourceType="bank_statement" | WIRED | mutations.ts:551 |
| SplitViewWorkspace | useManualMatch/useUnmatch/useConfirmLine hooks | Direct hook invocation | WIRED | SplitViewWorkspace.tsx:101-103 |
| SplitViewWorkspace | BankLinesPane + CandidatesPane + ActionBar + ProgressHeader | JSX composition | WIRED | Lines 299-320 of SplitViewWorkspace.tsx |
| BankReconciliationPage | SplitViewWorkspace + RevenueGapTab | Tab content | WIRED | Lines 38-40, 330, 345 |
| useStatementProgress | api.bankStatements.queries.getStatementProgress | useQuery wrapper | WIRED | Hook facade line 175; backend query line 162 |
| fixedAssets.create | companion expense + markAssetLinked on bank line | optional sourceBankLineId arg | WIRED | Per Plan 04 SUMMARY; D-21 round-trip complete |
| RevenueGapTab | revenueGapByPeriod → drill-down URL | `?tab=review&channelFilter=...&period=YYYY-MM` | WIRED | Plan 05 SUMMARY grep confirms `channelFilter=` + `useRevenueGap` present |

### Behavioral Spot-Checks

Per regression gate documented in context: 154/154 phase-73 backend tests + 150/150 adjacent module tests + TypeScript type-check clean. 48/48 bank E2E specs pass (Plan 06 SUMMARY). No additional behavioral spot-checks required beyond the regression baseline.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All P73 backend tests GREEN | `npm run test -- --run convex/bankStatements convex/bankKeywordRules` | 165/165 passed | PASS |
| All P73 component tests GREEN | `npm run test -- --run src/components/bankReconciliation/__tests__/` | 11/11 passed | PASS |
| All P73 E2E specs GREEN | `npx playwright test tests/e2e/bank*.spec.ts` | 48/48 passed | PASS |
| TypeScript type-check | `npm run type-check` | 0 errors | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| BANK-03 | 73-01, 73-03, 73-04, 73-06 | User can manually match/unmatch bank lines to system records via split-view UI | SATISFIED | manualMatch/unmatch mutations + SplitViewWorkspace two-pane UI + 6 dialogs + 48 E2E tests |
| BANK-04 | 73-02, 73-05, 73-06 | Reconciliation status tracked per statement (matched/unmatched/suggested counts) | SATISFIED | getStatementProgress/getStatementProgressBulk queries + StatementProgressHeader + StatementHistoryList live progress column + Revenue Gap tab |

Both requirement IDs are cross-referenced in REQUIREMENTS.md (lines 35-36, 100-101) and fully accounted for across the 6 plans.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (none) | `createReversalEntry` in bankStatements | N/A | 0 matches — RESEARCH Pitfall 1 respected |
| (none) | `matchedCount` mutation in new P73 mutations | N/A | 0 matches — D-24 anti-pattern respected |
| (none) | TODO/FIXME in P73 paths | N/A | 0 matches per Plan 06 audit sweep |

**Pre-existing known issues (deferred, out of P73 scope):**
- `npm run build` fails in worktree due to untracked Phase 80 analytics files; documented in `deferred-items.md`. Not introduced by P73; resolves on merge to main (Phase 80 already shipped).
- 17 pre-existing test failures in unrelated modules (gobizAdapter, k3martCockpit, bigsellerOrders, csvImportValidation).

### Human Verification Required

BANK-03 and BANK-04 are functionally implemented and test-backed, but the success criteria are UI-behavioral ("User can view a split-screen…", "User can manually match…", "indicator" is shown). These require running the app with an authenticated manager session to confirm the rendered interactions match the plan intent. Automated tests cover the contracts (role gates, JE posting, query results, static component rendering), but screen-reader verification, Convex reactive update cadence, toast UX, and cross-tab drill-down cannot be asserted without a live browser session.

See `human_verification:` in frontmatter for the 5 manual smoke tests.

### Gaps Summary

No gaps. All must-haves are implemented and wired. Deferred items (efficiency backlog, InlineReimbursementDialog picker redesign, fixedAssets.create cross-module coupling, pre-existing unrelated test failures, error boundaries) are documented in `deferred-items.md` and do not block the phase goal — they are explicitly out-of-scope follow-ups.

Status is `human_needed` (not `passed`) solely because the three success criteria describe user-observable UI behavior that must be verified in a live browser session before the phase can be marked fully complete.

---

_Verified: 2026-04-15T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
