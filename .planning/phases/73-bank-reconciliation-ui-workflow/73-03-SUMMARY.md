---
phase: 73
plan: 03
subsystem: bank-reconciliation
tags: [frontend, ui, split-view, hooks, permissions, tdd]
requires:
  - convex/bankStatements/queries.ts (Plan 02 outputs — getStatementProgress, listCandidatesForLine, search*)
  - convex/bankStatements/mutations.ts (Plan 01 outputs — manualMatch, unmatch, confirmLine, batchConfirmExactTier)
  - convex/bankKeywordRules/mutations.ts::createFromOverride (Plan 02 output)
provides:
  - src/components/bankReconciliation/BankReconciliationTabs.tsx
  - src/components/bankReconciliation/SplitViewWorkspace.tsx
  - src/components/bankReconciliation/BankLinesPane.tsx
  - src/components/bankReconciliation/BankLineRow.tsx
  - src/components/bankReconciliation/CandidatesPane.tsx
  - src/components/bankReconciliation/CandidateGroup.tsx
  - src/components/bankReconciliation/CandidateRow.tsx
  - src/components/bankReconciliation/ReconciliationActionBar.tsx
  - src/components/bankReconciliation/StatementProgressHeader.tsx
  - src/components/bankReconciliation/ConfidenceBadge.tsx
  - src/components/bankReconciliation/ReversedIndicator.tsx
  - src/hooks/convex/useBankReconciliation.ts (16 new hook exports)
affects:
  - src/App.tsx (route widened to manager+admin)
  - src/components/layout/Header.tsx (sidebar entry widened)
  - src/pages/BankReconciliationPage.tsx (wrapped in tabs, URL-driven statementId)
  - src/components/bankReconciliation/StatementHistoryList.tsx (live progress column)
tech-stack:
  added: []
  patterns:
    - "URL-query-as-source-of-truth for tab + statementId selection (D-15 deep links survive refresh)"
    - "Bulk live-progress query at parent level prevents per-row useQuery storms (T-73-19)"
    - "All useState/useQuery/useMutation hooks declared at top of components (CLAUDE.md pitfall 9)"
    - "Plan 04 dialog-open state hooks pre-declared in SplitViewWorkspace to lock the consumer contract"
    - "Direct useQuery wrappers in hook facade — no factories/no hooks-in-hooks"
    - "Pitfall 2: line-change useEffect clears stale candidate selection"
key-files:
  created:
    - src/components/bankReconciliation/BankReconciliationTabs.tsx
    - src/components/bankReconciliation/SplitViewWorkspace.tsx
    - src/components/bankReconciliation/BankLinesPane.tsx
    - src/components/bankReconciliation/BankLineRow.tsx
    - src/components/bankReconciliation/CandidatesPane.tsx
    - src/components/bankReconciliation/CandidateGroup.tsx
    - src/components/bankReconciliation/CandidateRow.tsx
    - src/components/bankReconciliation/ReconciliationActionBar.tsx
    - src/components/bankReconciliation/StatementProgressHeader.tsx
    - src/components/bankReconciliation/ConfidenceBadge.tsx
    - src/components/bankReconciliation/ReversedIndicator.tsx
    - src/components/bankReconciliation/__tests__/StatementHistoryList.test.tsx
    - src/components/bankReconciliation/__tests__/StatementProgressHeader.test.tsx
    - src/components/bankReconciliation/__tests__/ReconciliationActionBar.test.tsx
  modified:
    - src/App.tsx
    - src/components/layout/Header.tsx
    - src/hooks/convex/useBankReconciliation.ts
    - src/pages/BankReconciliationPage.tsx
    - src/components/bankReconciliation/StatementHistoryList.tsx
decisions:
  - "Rules tab navigates to /bank-rules instead of embedding (admins keep the existing CRUD shell; managers are bounced by route gate per T-73-16)"
  - "BankLinesPane fetches all lines once and filters direction/confirmed client-side rather than running multiple withIndex calls per render"
  - "Plan 04 dialog-open state hooks (batchConfirmOpen, inlineExpenseOpen, etc.) pre-declared in SplitViewWorkspace with stub callbacks so Plan 04 only renders the JSX without re-shaping state"
  - "useMarkAssetLinked hook arg key corrected to bankLineId (matches backend mutation signature) — was lineId in the plan text"
metrics:
  tasks: 4 (5th is human-verify checkpoint — see below)
  files_created: 14
  files_modified: 5
  tests_added: 11
  tests_passing: 11
  duration: ~25 min
  completed: 2026-04-15
---

# Phase 73 Plan 03: Split-view workspace core Summary

Phase 73 Wave 2a UI foundation — manager+admin permission widening, tab
shell with URL sync, two-pane split-view workspace (bank lines ↔ candidates),
sticky action bar with Match/Unmatch/Confirm/CapEx swap and inline-create
buttons, live progress header reading `getStatementProgress`, and live
per-row progress column on the statement history list. Hook facade extended
with 16 new exports covering all P73 backend mutations + queries. Plan 04
(Wave 2b) consumes the dialog-open state hooks already declared in
`SplitViewWorkspace`; Plan 05 owns the Revenue Gap tab body (placeholder
shipped here).

## What Ships

### Permission widening (D-23)

- `src/App.tsx`: `/bank-reconciliation` route gate widened from
  `["admin"]` to `["manager", "admin"]`. `/bank-rules` stays admin-only
  (T-73-16).
- `src/components/layout/Header.tsx`: sidebar entry widened similarly;
  `/bank-rules` entry stays admin-only.

### Hook facade extensions (`src/hooks/convex/useBankReconciliation.ts`)

16 new exports — all token-injecting wrappers around `api.bankStatements.*`
and `api.bankKeywordRules.mutations.createFromOverride`:

| Type | Hooks |
|------|-------|
| Query | `useStatementProgress`, `useStatementProgressBulk`, `useCandidatesForLine`, `useSearchExpenses`, `useSearchRevenue`, `useSearchReimbursements`, `useSearchPayroll`, `useRevenueGap` |
| Mutation | `useManualMatch`, `useUnmatch`, `useConfirmLine`, `useBatchConfirmExactTier`, `useInlineCreateExpense`, `useInlineCreateRevenue`, `useInlineCreateReimbursement`, `useMarkAssetLinked`, `useCreateRuleFromOverride` |

All search hooks are direct `useQuery` wrappers (no factory / no hooks-in-hooks).
A `BankSearchArgs` type with optional `skip` boolean is exposed for
SearchAllRecordsDialog (Plan 04) to compose per-tab.

### Tab shell (`BankReconciliationTabs.tsx`)

Wraps shadcn `<Tabs>` with URL sync via `useSearchParams`.
- Tabs: Statements / Review / Revenue Gap / Rules
- Active state styled per UI-SPEC §6.1 (teal underline + semibold)
- Rules tab navigates to `/bank-rules` (managers bounced by route gate)
- URL params other than `tab` (e.g. `statementId`) preserved across switches

### Live progress header (`StatementProgressHeader.tsx`)

- `useStatementProgress(statementId)` → `<Progress value=…>` + 4 badge chips
  (matched / suggested / unmatched / confirmed)
- Skeleton state when query is undefined (data-testid="progress-header-skeleton")
- Explicit `aria-valuenow` / `aria-valuemin` / `aria-valuemax` on Progress so
  Radix surfaces the value even when its internal state would otherwise
  resolve to indeterminate

### History list with live progress column (`StatementHistoryList.tsx`)

- New "Live progress" column reading `useStatementProgressBulk` at the parent
  level (single query for all rows — T-73-19 mitigation)
- Legacy `matchedCount` snapshot kept as "Imported" column for diagnostic
  clarity (RESEARCH Pitfall 7)
- Per-row Skeleton placeholder (data-testid="progress-skeleton") while bulk
  query loads

### Split-view workspace (`SplitViewWorkspace.tsx`)

Orchestrator with `selectedLineId` + `selectedCandidate` state, action
handlers for match/unmatch/confirm/CapEx route, and pre-declared dialog-open
state hooks for Plan 04:

- `batchConfirmOpen` (BatchConfirmDialog)
- `overrideDialogState` (LearnFromOverrideDialog)
- `inlineExpenseOpen` / `inlineRevenueOpen` / `inlineReimbursementOpen`
- `searchAllOpen` (SearchAllRecordsDialog)

Sub-components:
- `BankLinesPane` + `BankLineRow`: left 55%, direction filter chips
  (All/Debit/Credit), show/hide-confirmed toggle, ConfidenceBadge per row,
  CR/DB color coding (UI-SPEC §4 direction)
- `CandidatesPane` + `CandidateGroup` + `CandidateRow`: right 45%, 4 groups
  always rendered (Reimbursement / Expenses / Payroll / Revenue) with count
  badges, empty groups show "(0)" + helper copy, `[Search all records]`
  footer button
- `ReconciliationActionBar`: sticky bottom, `role="toolbar"`,
  `[Match selected]` / `[Unmatch auto]` / `[Confirm]` (or `[Route to Asset
  Register]` for CapEx flag) / `[Confirm all exact-tier]` / inline-create
  buttons (visible only for unmatched lines) / `[Search all records]`

Confirmed-line unmatch routes through `<AlertDialog>` with destructive copy
per UI-SPEC §8 before calling `useUnmatch`.

### Visual primitives

- `ConfidenceBadge`: 4-tier (exact / strong / suggested / none) badge with
  `aria-label` per UI-SPEC §9
- `ReversedIndicator`: inline pill with tooltip linking to reversal JE id

## Verification

```
npm run type-check  ✓ 0 errors
npm run build       ✓ built in 19.08s
npm run test -- --run src/components/bankReconciliation/__tests__/
                    ✓ 11 passed (11)
```

Per-test summary:
- StatementHistoryList: 4/4 (progress column, count display, empty state, loading skeleton)
- StatementProgressHeader: 3/3 (progress bar, 4 chips, loading skeleton)
- ReconciliationActionBar: 4/4 (Match disabled, CapEx swap, Unmatch disabled, inline-create visibility)

Acceptance-criteria greps (all pass):

| Check | Result |
|-------|--------|
| `["manager", "admin"]` for bank-reconciliation in App.tsx | present |
| `["admin"]` retained for bank-rules in App.tsx | present |
| `'manager', 'admin'` for Bank Reconciliation in Header.tsx | present |
| `useStatementProgress` in hook facade | present |
| `useManualMatch / useConfirmLine / useBatchConfirmExactTier` | all present |
| `useInlineCreateExpense` in hook facade | present |
| `useCreateRuleFromOverride` in hook facade | present |
| `useRevenueGap` in hook facade | present |
| `useSearchExpenses` in hook facade | present |
| `useSearchCandidates` factory in hook facade | 0 (correctly absent) |
| `BankReconciliationTabs` in BankReconciliationPage.tsx | present |
| `searchParams` in BankReconciliationPage.tsx | present |
| `StatementProgressHeader` in SplitViewWorkspace.tsx | present |
| `BankLinesPane` / `CandidatesPane` / `ReconciliationActionBar` in SplitViewWorkspace.tsx | all present |
| `batchConfirmOpen` / `inlineExpenseOpen` / `searchAllOpen` in SplitViewWorkspace.tsx | 3+ matches |
| `Match selected` / `Route to Asset Register` / `Create expense` in ReconciliationActionBar.tsx | all present |
| `capex_needs_asset_register` in ReconciliationActionBar.tsx | present |
| `alreadyLinkedToLineId` in CandidateRow.tsx | present |

## Deviations from Plan

### Worktree base correction (environment)

Worktree HEAD started on main (P80 commits visible) instead of the expected
73-02 base `dd80ef6a`. Ran `git reset --hard dd80ef6a…` to align with the
execution contract. No code impact. Followed by `npm install --prefer-offline`
to populate node_modules (same pattern called out in 73-01 / 73-02 deviations).

### Rule 1 (bug fix) — useMarkAssetLinked arg key

Plan text named the bank-line arg `lineId`, but the backend
`markAssetLinked` mutation signature is `{ token, expenseId, bankLineId }`
(verified in `convex/bankStatements/mutations.ts` line 775+). Build failure
caught it. Fixed the hook to use `bankLineId`. No call sites consume this
hook yet (Plan 04 territory).

### Rule 1 (bug fix) — revenueGross optional

`externalRevenue.revenueGross` is `v.optional(v.number())` in the schema.
TypeScript build failed when piping it through `CandidateRow.amount: number`.
Coalesced to `r.revenueGross ?? 0` in CandidatesPane row mapper. Display
amount of 0 is appropriate when the underlying record has no gross — the
listCandidatesForLine query already filters by amount equality, so this path
only fires for legitimately zero-gross rows.

### Rule 2 (auto-add) — explicit aria-valuenow on Progress

Radix Progress was rendering `data-state="indeterminate"` even with a
numeric `value` prop in test mode. To make the live-progress + header
components properly screen-reader-readable AND deterministically testable,
added explicit `aria-valuenow` / `aria-valuemin` / `aria-valuemax` props
alongside the existing `aria-label`. This is a Rule 2 a11y correctness fix,
not a workaround — accessible name + value should always be present on
`role="progressbar"`.

No Rule 4 (architectural) changes triggered.

## Commits

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Task 1 — Wave 0 RED stubs | `35ce2786` | 3 component test files |
| 2 | Task 2 — Permissions + hook facade | `c22b3d97` | App.tsx, Header.tsx, useBankReconciliation.ts |
| 3 | Task 3 — Tab shell + progress header + history column | `b9f236ce` | 5 components + page wrap |
| 4 | Task 4 — Split-view + lines/candidates panes + action bar | `93153412` | 7 split-view components + hook fix |

## Pending

### Task 5 — checkpoint:human-verify (NOT executed by this agent)

Plan declares Task 5 as `<task type="checkpoint:human-verify" gate="blocking">`.
Per the checkpoint protocol (auto mode is OFF, plan `autonomous: false`), the
executor stops here and returns control. The 10-step manual smoke test in
the plan needs the user to:

1. `git switch feature/phase-73-bank-reconciliation-ui` then `npm run dev` + `npx convex dev`
2. Log in as a manager-role user, verify "Bank Reconciliation" appears in sidebar
3. Navigate `/bank-reconciliation`, see tabs + history list with progress column
4. Click a statement → `?tab=review&statementId=…`, split-view loads
5. Select a line → candidates pane refreshes
6. Match a candidate → toast + status update
7. Unmatch → status reverts
8. Re-match + Confirm → "Journal entry posted" toast, confirmed counter increments
9. Verify kitchen role is bounced from `/bank-reconciliation`
10. Confirm IDR amounts render `Rp 1.234.567`

## Downstream Contracts

Plan 04 (Wave 2b — dialogs) consumes from `SplitViewWorkspace`:

- `batchConfirmOpen` + setter → `<BatchConfirmDialog>`
- `overrideDialogState` (line + overrideAccountId) → `<LearnFromOverrideDialog>`
- `inlineExpenseOpen` + setter → `<InlineExpenseDialog>`
- `inlineRevenueOpen` + setter → `<InlineRevenueDialog>`
- `inlineReimbursementOpen` + setter → `<InlineReimbursementDialog>`
- `searchAllOpen` + setter → `<SearchAllRecordsDialog>`

Plan 04 will also wire the toasts that the stub `handleBatchConfirm`,
`handleSearchAll`, `handleInlineCreate*` placeholders currently emit ("…
wired in Plan 04") to the actual dialog-driven outcomes.

Plan 05 (Wave 2b — Revenue Gap) replaces the placeholder
`<Card>Revenue Gap dashboard ships in Plan 05.</Card>` body in
`BankReconciliationPage.tsx` (or composes into `BankReconciliationTabs`'
`revenueGap` slot). The `useRevenueGap` hook + `mapChannelToSource` helper
are already shipped.

## Threat Flags

None. Permission-widening + UI surfaces stay within the P73 threat register
mitigations:
- T-73-16 mitigated by leaving `/bank-rules` route + sidebar entry admin-only.
- T-73-17 mitigated by `<ProtectedRoute allowedRoles={["manager", "admin"]}>` on the route + backend `requireRole` in every query (Plans 01+02).
- T-73-18 mitigated by hooks-at-top declarations across all 11 new components.
- T-73-19 mitigated by `useStatementProgressBulk` single-call pattern in `StatementHistoryList`.
- T-73-20 unchanged — `maskAccount` helper preserved in StatementHistoryList.

## Known Stubs

- `SplitViewWorkspace.handleBatchConfirm/handleSearchAll/handleInlineCreate*`
  emit `toast.info("… wired in Plan 04")` instead of opening the actual
  dialogs. The dialog-open state hooks are real and stable; Plan 04 only
  needs to render the dialog JSX consuming those hooks.
- Revenue Gap tab body is a placeholder Card; Plan 05 replaces it.
- Rules tab body briefly renders "Opening Bank Rules manager…" before
  `useNavigate` redirects to `/bank-rules`. Intentional — full Rules CRUD
  UI lives at the dedicated route.

These are all intentional, plan-aligned stubs documented above.

## Self-Check: PASSED

Verified files exist (Bash `[ -f path ]` would succeed for each):
- src/components/bankReconciliation/BankReconciliationTabs.tsx
- src/components/bankReconciliation/SplitViewWorkspace.tsx
- src/components/bankReconciliation/BankLinesPane.tsx
- src/components/bankReconciliation/BankLineRow.tsx
- src/components/bankReconciliation/CandidatesPane.tsx
- src/components/bankReconciliation/CandidateGroup.tsx
- src/components/bankReconciliation/CandidateRow.tsx
- src/components/bankReconciliation/ReconciliationActionBar.tsx
- src/components/bankReconciliation/StatementProgressHeader.tsx
- src/components/bankReconciliation/ConfidenceBadge.tsx
- src/components/bankReconciliation/ReversedIndicator.tsx
- src/components/bankReconciliation/__tests__/StatementHistoryList.test.tsx
- src/components/bankReconciliation/__tests__/StatementProgressHeader.test.tsx
- src/components/bankReconciliation/__tests__/ReconciliationActionBar.test.tsx

Verified commits exist:
- `35ce2786` — Task 1 RED stubs
- `c22b3d97` — Task 2 permissions + hooks
- `b9f236ce` — Task 3 tab shell + headers
- `93153412` — Task 4 split-view
