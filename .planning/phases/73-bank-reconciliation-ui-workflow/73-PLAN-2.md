---
phase: 73
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/App.tsx
  - src/hooks/convex/useBankReconciliation.ts
  - src/pages/BankReconciliationPage.tsx
  - src/components/bankReconciliation/ReviewWorkspace.tsx
  - src/components/bankReconciliation/BankLinesPane.tsx
  - src/components/bankReconciliation/CandidateRecordsPane.tsx
  - src/components/bankReconciliation/CandidateSearchDialog.tsx
  - src/components/bankReconciliation/BatchConfirmPreviewDialog.tsx
  - src/components/bankReconciliation/StatementProgressHeader.tsx
  - src/components/bankReconciliation/__tests__/SplitView.test.tsx
  - src/components/bankReconciliation/__tests__/BatchConfirmModal.test.tsx
autonomous: true
requirements: [BANK-03, BANK-04]
tags: [bank-reconciliation, frontend, split-view, ui]

must_haves:
  truths:
    - "User can open /bank-reconciliation as a manager (not just admin)"
    - "Tab bar shows Statements · Review · Revenue Gap · Rules; active tab URL param ?tab= reflects selection"
    - "Review tab split view shows unmatched/suggested/auto_matched bank lines on the left, candidate records on the right"
    - "Clicking a bank line highlights it and refreshes candidate pane filtered by amount exact + date ±3 days grouped by type with (0) badges for empty groups"
    - "Match selected button is disabled unless both a bank line AND a candidate are selected; clicking posts manualMatch and toast-confirms"
    - "Unmatch button appears on matched/auto_matched/confirmed lines; when line was confirmed, toast confirms reversal JE posted"
    - "Confirm button posts single-line JE; batch Confirm opens preview modal with DR/CR balance gate; Post is disabled when grand DR ≠ grand CR"
    - "Progress header shows matched/suggested/unmatched counts + percent + confirmed sub-count, live-updating via Convex reactivity"
    - "Search all records dialog widens candidate search beyond ±3-day window without mutating default filter"
  artifacts:
    - path: src/App.tsx
      provides: "/bank-reconciliation route widened to manager+admin"
      contains: "allowedRoles={[\"manager\", \"admin\"]}"
    - path: src/hooks/convex/useBankReconciliation.ts
      provides: "useStatementProgress, useManualMatch, useUnmatch, useConfirmLine, useBatchConfirm hooks + existing facade"
      exports: ["useStatementProgress", "useManualMatch", "useUnmatch", "useConfirmLine", "useBatchConfirm"]
    - path: src/pages/BankReconciliationPage.tsx
      provides: "Tabs shell wrapping existing Statements content + new Review workspace + placeholder Revenue Gap / Rules tab slots"
    - path: src/components/bankReconciliation/ReviewWorkspace.tsx
      provides: "Split-view orchestrator: selection state, statement picker, integration with header + panes + batch modal"
    - path: src/components/bankReconciliation/BankLinesPane.tsx
      provides: "Left pane: line list filtered to reviewable statuses with selection + keyboard nav"
    - path: src/components/bankReconciliation/CandidateRecordsPane.tsx
      provides: "Right pane: grouped candidates (Reimbursement/Expense/Payroll/Revenue) with counts + select"
    - path: src/components/bankReconciliation/CandidateSearchDialog.tsx
      provides: "Escape-hatch full search over records of matchedType"
    - path: src/components/bankReconciliation/BatchConfirmPreviewDialog.tsx
      provides: "D-08 preview modal with DR/CR balance gate"
    - path: src/components/bankReconciliation/StatementProgressHeader.tsx
      provides: "D-24 header: progress bar + count chips + confirmed sub-count"
  key_links:
    - from: "src/components/bankReconciliation/ReviewWorkspace.tsx"
      to: "useManualMatch / useUnmatch / useConfirmLine / useBatchConfirm"
      via: "click handlers on Match/Unmatch/Confirm buttons"
      pattern: "useManualMatch\\(\\)"
    - from: "src/components/bankReconciliation/StatementProgressHeader.tsx"
      to: "api.bankStatements.queries.getStatementProgress"
      via: "useStatementProgress hook"
      pattern: "useStatementProgress"
    - from: "src/pages/BankReconciliationPage.tsx"
      to: "URL search params ?tab=review&statementId=..."
      via: "useSearchParams read+write"
      pattern: "useSearchParams"
    - from: "src/App.tsx /bank-reconciliation route"
      to: "ProtectedRoute allowedRoles"
      via: "widen admin → [manager, admin]"
      pattern: "bank-reconciliation.*manager"
---

<objective>
Build the primary reconciliation workspace: widen the `/bank-reconciliation` route to managers, wrap the existing upload wizard in a 4-tab shell (Statements · Review · Revenue Gap · Rules), and ship the click-to-select split-view for manual match/unmatch/confirm/batch-confirm. Plan 3 fills in Revenue Gap and Rules tab content.

Purpose: Implements BANK-03 manual match/unmatch split-view (D-02, D-03, D-04, D-05, D-07, D-08, D-09, D-23, D-24). Downstream plans (3, 4) depend on the tab shell + progress header + hook facade this plan ships.

Output: A reviewer logged in as manager can upload or pick a BCA statement, switch to Review tab, click a bank line, click a candidate record, click Match (toasts success and moves line to `suggested` bucket), click Confirm (posts balanced JE, toasts success and moves line to `confirmed`), and click Unmatch on a confirmed line (posts reversal JE, toasts success, line returns to suggested/unmatched). Batch Confirm opens a preview modal that blocks Post if DR ≠ CR.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-UI-SPEC.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-RESEARCH.md
@.planning/phases/73-bank-reconciliation-ui-workflow/73-01-SUMMARY.md
@src/pages/BankReconciliationPage.tsx
@src/pages/AssetRegister.tsx
@src/components/bankReconciliation/StatementReviewTable.tsx
@src/components/bankReconciliation/StatementHistoryList.tsx
@src/hooks/convex/useBankReconciliation.ts
@src/components/auth/ProtectedRoute.tsx
@src/App.tsx
@src/components/ui/tabs.tsx
@src/components/ui/dialog.tsx
@src/components/ui/button.tsx
@src/components/ui/progress.tsx
@src/components/ui/badge.tsx
@src/contexts/AuthContext.tsx

<interfaces>
From Plan 1 (convex backend):
```typescript
// api.bankStatements.mutations.manualMatch
{ token: string, lineId: Id<"bankStatementLines">, matchedType: "expense"|"revenue"|"reimbursement"|"payroll", matchedId: string } → { ok: true }

// api.bankStatements.mutations.unmatch
{ token: string, lineId: Id<"bankStatementLines"> } → { ok: true, reversalJournalEntryId?: Id<"journalEntries"> }

// api.bankStatements.mutations.confirmLine
{ token: string, lineId: Id<"bankStatementLines"> } → { journalEntryId: Id<"journalEntries"> }

// api.bankStatements.mutations.batchConfirm
{ token: string, statementId: Id<"bankStatements"> } → { postedCount: number, journalEntryIds: Id<"journalEntries">[] }

// api.bankStatements.queries.getStatementProgress
{ token: string, statementId: Id<"bankStatements"> } →
  { unmatched, auto_matched, suggested, confirmed, total, matched, percent }
```

From UI-SPEC:
- Primary CTA labels: "Match selected", "Confirm match", "Post {N} journal entries", "Unmatch"
- Tab labels: "Statements", "Review", "Revenue Gap", "Rules"
- Empty states: "No statement open", "All lines reconciled", "No candidates within ±3 days"
- Selected row: 4px left border in --color-brand + brand-light background
- Keyboard: Enter=Match, Esc=clear both selections, ↑/↓=navigate bank lines
- Responsive: ≥1200px side-by-side gap-4; 900-1199px gap-3; <900px stacks vertically
- Batch modal: Post disabled when grandDR !== grandCR, error copy "Batch cannot be posted: DR {amount} ≠ CR {amount}..."

From src/pages/AssetRegister.tsx (canonical Tabs pattern):
```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
const [tab, setTab] = useState<TabValue>(...);
<Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
  <TabsList><TabsTrigger value="...">...</TabsTrigger></TabsList>
  <TabsContent value="...">...</TabsContent>
</Tabs>
```

From src/hooks/convex/useBankReconciliation.ts (existing — extend, do not rewrite):
```typescript
export function useBankStatementLines(statementId, statusFilter?) — existing
export function useBankStatements() — existing
export function useCreateFromParsedStatement() — existing
// Hooks to add in Task 1:
export function useStatementProgress(statementId: Id<"bankStatements"> | null)
export function useManualMatch()
export function useUnmatch()
export function useConfirmLine()
export function useBatchConfirm()
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Route widen + hook facade + tab shell on BankReconciliationPage</name>
  <files>
    src/App.tsx,
    src/hooks/convex/useBankReconciliation.ts,
    src/pages/BankReconciliationPage.tsx
  </files>
  <read_first>
    src/App.tsx (route definition for /bank-reconciliation around lines 430-445; ProtectedRoute usage pattern),
    src/components/auth/ProtectedRoute.tsx (allowedRoles prop),
    src/hooks/convex/useBankReconciliation.ts (ENTIRE file — existing hook shape + useAuth wiring),
    src/pages/BankReconciliationPage.tsx (current wizard shell + history list + ReviewSection structure),
    src/pages/AssetRegister.tsx (canonical Tabs pattern, around lines 30-80),
    src/pages/InventoryManager.tsx (secondary Tabs reference — URL ?tab= param pattern if present),
    src/contexts/AuthContext.tsx (user.token shape for hooks),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-UI-SPEC.md (tab labels, copywriting contract lines 93-131),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-01-SUMMARY.md (Plan 1 outputs)
  </read_first>
  <behavior>
    - `src/App.tsx`: ProtectedRoute for `/bank-reconciliation` route changes `allowedRoles={["admin"]}` → `allowedRoles={["manager", "admin"]}`. `/bank-rules` route stays `["admin"]` (D-23).
    - `useBankReconciliation.ts` gains 5 new hooks: `useStatementProgress`, `useManualMatch`, `useUnmatch`, `useConfirmLine`, `useBatchConfirm`. Signature pattern mirrors existing `useCreateFromParsedStatement` (token via useAuth, returns callback, "skip" token-less queries).
    - `BankReconciliationPage.tsx` wraps existing content in a 4-tab shell.
      - Tabs: `statements | review | revenue-gap | rules` (kebab-case tab values; display labels from UI-SPEC: `Statements`, `Review`, `Revenue Gap`, `Rules`).
      - Read/write `?tab=` via `useSearchParams` so deep-links work and Plan 3's drill-down lands on Review. Also accept `?statementId=...` for Review to pre-select.
      - `Statements` tab content = existing wizard + StatementUploadStep + StatementHistoryList (current behavior, preserved).
      - `Review` tab content = `<ReviewWorkspace statementId={...} channelFilter={...} periodFilter={...} />` (Task 2 ships this). For this task, render a simple placeholder `<ReviewWorkspace />` component with a `// TODO Task 2` comment body — real implementation in Task 2.
      - `Revenue Gap` tab content = `<div>Revenue Gap (Plan 3)</div>` placeholder.
      - `Rules` tab content = `<div>Rules (Plan 3)</div>` placeholder.
      - If tab param is absent, default to `statements`.
      - Keep the existing import wizard and error section logic; don't delete.
    - Empty state copy and tab labels must match UI-SPEC verbatim.
  </behavior>
  <action>
    1. Edit `src/App.tsx`: widen `/bank-reconciliation` `allowedRoles` to `["manager", "admin"]`. Verify `/bank-rules` stays admin-only.
    2. Edit `src/hooks/convex/useBankReconciliation.ts`: append 5 new hooks at the end of the file. Use `useQuery` + `"skip"` sentinel for the query hook, `useMutation` + `useCallback` for mutation hooks.
    3. Edit `src/pages/BankReconciliationPage.tsx`:
       - Import `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs`.
       - Import `useSearchParams` from `react-router-dom`.
       - Introduce `type TabValue = "statements" | "review" | "revenue-gap" | "rules"` and wire tab state to URL search params.
       - Wrap existing content under TabsContent value="statements".
       - Create a new placeholder component `ReviewWorkspace` in `src/components/bankReconciliation/ReviewWorkspace.tsx` — THIN stub that renders `<div>Split-view workspace — see Task 2</div>`. Task 2 replaces this.
       - Render placeholders for Revenue Gap and Rules tabs as documented above.
  </action>
  <verify>
    <automated>npm run type-check &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "allowedRoles=\\{\\[\"manager\", \"admin\"\\]\\}" src/App.tsx` returns at least 1 match on the `/bank-reconciliation` route block
    - `grep -B2 "bank-rules" src/App.tsx | grep -n "allowedRoles=\\{\\[\"admin\"\\]\\}"` returns a match (bank-rules stays admin-only)
    - `grep -n "export function useStatementProgress" src/hooks/convex/useBankReconciliation.ts` returns 1 match
    - `grep -n "export function useManualMatch" src/hooks/convex/useBankReconciliation.ts` returns 1 match
    - `grep -n "export function useUnmatch" src/hooks/convex/useBankReconciliation.ts` returns 1 match
    - `grep -n "export function useConfirmLine" src/hooks/convex/useBankReconciliation.ts` returns 1 match
    - `grep -n "export function useBatchConfirm" src/hooks/convex/useBankReconciliation.ts` returns 1 match
    - `grep -n "TabsTrigger value=\"review\"" src/pages/BankReconciliationPage.tsx` returns 1 match
    - `grep -n "TabsTrigger value=\"revenue-gap\"" src/pages/BankReconciliationPage.tsx` returns 1 match
    - `grep -n "TabsTrigger value=\"rules\"" src/pages/BankReconciliationPage.tsx` returns 1 match
    - `grep -n "useSearchParams" src/pages/BankReconciliationPage.tsx` returns 1 match
    - `src/components/bankReconciliation/ReviewWorkspace.tsx` exists
    - `npm run type-check` exits 0
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>Route widened to manager+admin; 5 new hooks appended to facade; BankReconciliationPage rendered as 4-tab shell with URL ?tab= sync; Review tab renders a ReviewWorkspace stub; build passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Split-view workspace (ReviewWorkspace, BankLinesPane, CandidateRecordsPane, CandidateSearchDialog, StatementProgressHeader)</name>
  <files>
    src/components/bankReconciliation/ReviewWorkspace.tsx,
    src/components/bankReconciliation/BankLinesPane.tsx,
    src/components/bankReconciliation/CandidateRecordsPane.tsx,
    src/components/bankReconciliation/CandidateSearchDialog.tsx,
    src/components/bankReconciliation/StatementProgressHeader.tsx,
    src/components/bankReconciliation/__tests__/SplitView.test.tsx
  </files>
  <read_first>
    src/pages/BankReconciliationPage.tsx (Task 1 output — where ReviewWorkspace is rendered, props passed from URL params),
    src/components/bankReconciliation/StatementReviewTable.tsx (existing read-only review table — column vocabulary, amount formatting, status badges),
    src/hooks/convex/useBankReconciliation.ts (Task 1 added hooks),
    src/hooks/convex/useExpenses.ts (candidate query — fetch expenses by amount+date range; if a narrow query does not exist, use existing list + client filter),
    src/hooks/convex/useReimbursements.ts and useExternalRevenue.ts and usePayroll.ts (candidate sources — identify narrowest query; client-filter to amount ± 0 / date ±3 days),
    src/lib/dateUtils.ts (WIB date formatting),
    src/lib/utils.ts (cn, formatCurrency),
    src/components/ui/progress.tsx + badge.tsx + button.tsx + table.tsx (primitive shapes),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-UI-SPEC.md (spacing, typography, color tokens, keyboard contract lines 134-148, copywriting lines 93-131),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md D-02, D-03, D-05, D-06, D-09, D-24
  </read_first>
  <behavior>
    `ReviewWorkspace.tsx`: orchestrator.
    - Props: `statementId: Id<"bankStatements"> | null`, `initialChannelFilter?: string`, `initialPeriodFilter?: { start, end }`.
    - If statementId is null → render empty state: heading `No statement open`, body `Pick a statement from the Statements tab to start reconciling, or import a new BCA export.` (UI-SPEC).
    - Fetches `useBankStatementLines(statementId)` (existing hook) and applies client-side filter to `status IN ('unmatched', 'suggested', 'auto_matched')` (D-02). Also respects initialChannelFilter when present (used by Plan 3 drill-down).
    - Maintains state: `selectedLineId`, `selectedCandidate: { type, id } | null`.
    - Renders: StatementProgressHeader at top, two-pane grid (BankLinesPane + CandidateRecordsPane), action bar at bottom with `[Match selected]` (primary teal CTA, disabled unless both selections present), `[Unmatch]` (destructive style, shown when selected line has matchedType), optional `[Confirm all exact-tier]` (opens BatchConfirmPreviewDialog — Task 3 ships the dialog; this task renders the trigger).
    - Keyboard: Enter = call manualMatch if both selected; Esc = clear both selections; ↑/↓ = move selectedLineId along the filtered lines array (handle focus).
    - Helper strip below header: `Enter · match   Esc · clear   ↑↓ · navigate` (text-xs, text-muted-foreground).
    - Responsive: CSS grid `grid-cols-1 lg:grid-cols-2 gap-3 xl:gap-4` (stacks <900px per UI-SPEC).

    `StatementProgressHeader.tsx`:
    - Props: `statementId: Id<"bankStatements">`, `statementName: string`, `statementPeriod: string`.
    - Uses `useStatementProgress(statementId)`.
    - Renders: heading line `Statement: {statementName}` (text-xl semibold), percent display (text-3xl semibold per UI-SPEC Typography Display role), Progress bar (shadcn `Progress` with `value={percent}`), count chips `{matched} matched · {suggested} suggested · {unmatched} unmatched` using semantic colors from UI-SPEC (success green for confirmed, warning amber for suggested, neutral gray for unmatched), sub-count `{confirmed} confirmed` below.
    - Loading state: renders skeleton bar while `useStatementProgress(...)` returns undefined.

    `BankLinesPane.tsx`:
    - Props: `lines: Doc<"bankStatementLines">[]`, `selectedLineId`, `onSelectLine(id)`, `onUnmatch(id)`.
    - Each row shows: date (WIB format), amount (formatCurrency, direction-colored: CR green / DB red), confidence badge (exact=teal, strong, suggested=amber, none=gray), rawDescription (truncated), status chip.
    - Selected row: 4px left border `--color-brand`, background `bg-brand-light` (UI-SPEC Color section).
    - Row click → `onSelectLine(id)`.
    - Rows where `flags?.includes("capex_needs_asset_register")` show a CapEx badge with the UI-SPEC tooltip copy. Plan 4 wires the `Route to Asset Register` button; this task just surfaces the flag.
    - Empty state: heading `All lines reconciled`, body from UI-SPEC.

    `CandidateRecordsPane.tsx`:
    - Props: `selectedLine: Doc | null`, `selectedCandidate`, `onSelectCandidate({ type, id })`.
    - If `selectedLine` is null → render prompt `Select a bank line to see candidates.` (muted text, padded center).
    - Fetch 4 candidate lists:
      - Expenses: amount exact match, date within ±3 days of `selectedLine.date` (use existing hook or wrap ctx query; if a narrow query does not exist, fetch recent expenses list and client-filter). Direction "debit" bank lines only surface expense/payroll/reimbursement candidates; direction "credit" surfaces revenue candidates.
      - ExternalRevenue: same filter rules, for credit lines.
      - ReimbursementBatches: same filter.
      - PayrollEntries: same filter (for debit lines linked to payroll).
    - Sections rendered even when empty: `Reimbursement Batches (N)`, `Expenses (N)`, `Payroll (N)`, `Revenue (N)` — count badge shows "(0)" when empty (D-05).
    - Each candidate row clickable; selected row gets same teal treatment as bank lines.
    - Footer: `[🔍 Search all records]` button → opens CandidateSearchDialog (D-06).
    - Empty state for the whole pane (all counts zero): `No candidates within ±3 days` heading + `Widen the search with Search all records, or create a new record inline.` body (UI-SPEC).

    `CandidateSearchDialog.tsx`:
    - Props: `open`, `onOpenChange`, `selectedLine`, `onPick({ type, id })`.
    - Search input with debounce; filters by amount (numeric match), counterparty/vendor name, or description substring across the 4 record types.
    - Does NOT mutate the pane's default filter (D-06) — picking here calls `onPick` and closes the dialog.

    Tests (`SplitView.test.tsx`):
    - Render ReviewWorkspace with mocked hooks. Assert:
      - Selecting a bank line highlights it AND updates the candidate pane title/data (mock candidates refetch).
      - Clicking a candidate enables the `Match selected` button (disabled otherwise).
      - Pressing Esc clears both selections.
      - Empty-state copy matches UI-SPEC verbatim for both "no statement open" and "all reconciled" paths.
      - CapEx-flagged line renders a CapEx badge.
      - Direction=credit bank line shows Revenue section + hides Payroll or shows it empty.
  </behavior>
  <action>
    1. Replace the stub `ReviewWorkspace.tsx` from Task 1 with the full orchestrator described above. Wire it to existing hooks.
    2. Create `BankLinesPane.tsx`, `CandidateRecordsPane.tsx`, `CandidateSearchDialog.tsx`, `StatementProgressHeader.tsx`.
    3. If a narrow `useExpensesByAmountDate` / `useExternalRevenueByAmountDate` / etc. hook does not exist, implement the filter in-memory using existing list hooks (the dataset is small per-period). Comment this as an optimization candidate but do not add new backend queries in this task.
    4. Update `BankReconciliationPage.tsx` Review tab: pass `statementId` from `?statementId=...` URL param to `ReviewWorkspace`.
    5. Create `__tests__/SplitView.test.tsx` using Vitest + @testing-library/react. Mock `useBankStatementLines`, `useStatementProgress`, `useManualMatch`, `useUnmatch` hooks inline.
    6. Run `npm run test -- --run src/components/bankReconciliation/__tests__/SplitView.test.tsx` until green.
    7. Run `npm run build` to ensure no broken imports.
  </action>
  <verify>
    <automated>npm run test -- --run src/components/bankReconciliation/__tests__/SplitView.test.tsx &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `src/components/bankReconciliation/ReviewWorkspace.tsx` exists and contains `useManualMatch()` call site
    - `src/components/bankReconciliation/BankLinesPane.tsx` exists
    - `src/components/bankReconciliation/CandidateRecordsPane.tsx` exists
    - `src/components/bankReconciliation/CandidateSearchDialog.tsx` exists
    - `src/components/bankReconciliation/StatementProgressHeader.tsx` exists
    - `grep -n "useStatementProgress" src/components/bankReconciliation/StatementProgressHeader.tsx` returns 1 match
    - `grep -n "Match selected" src/components/bankReconciliation/ReviewWorkspace.tsx` returns at least 1 match
    - `grep -n "No statement open" src/components/bankReconciliation/ReviewWorkspace.tsx` returns 1 match (UI-SPEC empty state verbatim)
    - `grep -n "All lines reconciled" src/components/bankReconciliation/BankLinesPane.tsx` returns 1 match
    - `grep -n "No candidates within" src/components/bankReconciliation/CandidateRecordsPane.tsx` returns 1 match
    - `grep -nE "(Enter.*match|Esc.*clear|↑↓.*navigate)" src/components/bankReconciliation/ReviewWorkspace.tsx` returns at least 1 match (keyboard helper strip)
    - `npm run test -- --run src/components/bankReconciliation/__tests__/SplitView.test.tsx` exits 0
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>Five new components delivered; manager can select a bank line, see candidates filtered by ±3d / amount, select a candidate, click Match (toast success), click Unmatch on matched line (toast shows reversal when applicable); keyboard shortcuts (Enter/Esc/arrows) work; all UI-SPEC copy verbatim; tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Batch Confirm preview dialog + wire per-line Confirm/Unmatch actions</name>
  <files>
    src/components/bankReconciliation/BatchConfirmPreviewDialog.tsx,
    src/components/bankReconciliation/ReviewWorkspace.tsx,
    src/components/bankReconciliation/BankLinesPane.tsx,
    src/components/bankReconciliation/__tests__/BatchConfirmModal.test.tsx
  </files>
  <read_first>
    src/components/bankReconciliation/ReviewWorkspace.tsx (Task 2 output),
    src/components/bankReconciliation/BankLinesPane.tsx (Task 2 output),
    src/hooks/convex/useBankReconciliation.ts (useConfirmLine, useBatchConfirm),
    src/hooks/convex/useAccounts.ts (account name lookup for DR/CR display in preview),
    src/components/ui/dialog.tsx (shadcn Dialog primitive),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-UI-SPEC.md (batch modal copy, error copy lines 114, 124),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md D-07, D-08
  </read_first>
  <behavior>
    `BatchConfirmPreviewDialog.tsx`:
    - Props: `open`, `onOpenChange`, `statementId`.
    - On open, fetches all lines for statementId where `confidence==="exact"` AND `status IN ("auto_matched","suggested")` (use `useBankStatementLines` + client filter). Resolves account names via `useAccounts()` (or equivalent).
    - Renders:
      - Header: `Post {N} journal entries for all exact-tier matches below? Each line's debit / credit accounts are previewed — review before posting.` (UI-SPEC destructive confirmation copy).
      - Summary table: rows grouped by (jeDebitAccountId, jeCreditAccountId) with total DR + total CR amounts per group. Below: Grand total DR, Grand total CR.
      - Balance gate: if `grandDR !== grandCR`, show inline error row `Batch cannot be posted: DR {amount} ≠ CR {amount}. Review the selected lines — one or more have misconfigured accounts.` and disable the Post button.
      - Per-line rows optional (scrollable detail area) — show date, amount, description snippet, DR/CR account names.
    - Primary button: `Post {N} journal entries` (teal) — calls `useBatchConfirm()` then closes dialog and toasts `{N} journal entries posted. Statement progress updated.` on success.
    - Secondary: `Cancel`.
    - Error state on failure: toast per UI-SPEC `{Action} failed. {Reason from server}...`.

    `ReviewWorkspace.tsx` (extend):
    - Add `[Confirm all exact-tier]` button in action bar. Only visible if at least 1 exact-tier eligible line exists. Opens BatchConfirmPreviewDialog.
    - Per-line `[Confirm]` button: shows on lines where `status IN ("auto_matched", "suggested")` AND flags does NOT include `capex_needs_asset_register` AND line has both jeDebitAccountId and jeCreditAccountId. Click → calls `useConfirmLine()` → toast `Journal entry posted. Line confirmed.` on success, or error toast on failure.
    - Per-line `[Unmatch]` button: shows on matched lines (matchedType present OR status === "confirmed"). Click triggers destructive-style confirmation via shadcn AlertDialog OR inline confirm popover with copy `Unmatch this line? A reversal journal entry will be posted and this line will return to {new status}. The original JE stays in the ledger.` (UI-SPEC). On confirm → calls `useUnmatch()` → toast per UI-SPEC (distinguish was-confirmed vs was-auto by reading `reversalJournalEntryId` in the return value).

    `BankLinesPane.tsx` (extend):
    - Render Confirm/Unmatch button slots on each row OR a single row action menu. Emit `onConfirm(lineId)` and `onUnmatch(lineId)` upward; ReviewWorkspace handles.

    Tests (`BatchConfirmModal.test.tsx`):
    - Render with balanced lines → Post button enabled, no error banner.
    - Render with one line missing jeDebitAccountId → grandDR !== grandCR → Post disabled, error banner present, error copy matches UI-SPEC.
    - Clicking Post calls batchConfirm hook with statementId; Cancel closes dialog.
    - Success path fires success toast.
  </behavior>
  <action>
    1. Create `BatchConfirmPreviewDialog.tsx`.
    2. Extend `ReviewWorkspace.tsx` with the `Confirm all exact-tier` trigger button and wire per-line confirm/unmatch actions.
    3. Extend `BankLinesPane.tsx` with per-line action buttons (or row menu).
    4. Create `__tests__/BatchConfirmModal.test.tsx` covering the balance gate + success toast paths.
    5. Run tests and build.
  </action>
  <verify>
    <automated>npm run test -- --run src/components/bankReconciliation/__tests__/BatchConfirmModal.test.tsx src/components/bankReconciliation/__tests__/SplitView.test.tsx &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `src/components/bankReconciliation/BatchConfirmPreviewDialog.tsx` exists
    - `grep -n "useBatchConfirm" src/components/bankReconciliation/BatchConfirmPreviewDialog.tsx` returns 1 match
    - `grep -n "Post.*journal entries" src/components/bankReconciliation/BatchConfirmPreviewDialog.tsx` returns at least 1 match (Primary CTA copy)
    - `grep -n "Batch cannot be posted" src/components/bankReconciliation/BatchConfirmPreviewDialog.tsx` returns 1 match (UI-SPEC error copy)
    - `grep -n "useConfirmLine" src/components/bankReconciliation/ReviewWorkspace.tsx` returns 1 match
    - `grep -n "useUnmatch" src/components/bankReconciliation/ReviewWorkspace.tsx` returns 1 match
    - `grep -n "Confirm all exact-tier" src/components/bankReconciliation/ReviewWorkspace.tsx` returns 1 match
    - `grep -n "A reversal journal entry will be posted" src/components/bankReconciliation/ReviewWorkspace.tsx` returns 1 match (unmatch confirmation copy)
    - `npm run test -- --run src/components/bankReconciliation/__tests__/BatchConfirmModal.test.tsx` exits 0
    - `npm run test -- --run src/components/bankReconciliation/__tests__/SplitView.test.tsx` exits 0 (Task 2 tests still pass after extension)
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>Per-line Confirm/Unmatch wired end-to-end; batch Confirm opens preview modal with DR/CR balance gate (Post disabled on mismatch); success/failure toasts match UI-SPEC; tests green; full split-view workspace is functionally complete (minus Plan 3's Revenue Gap + Rules tab + history list progress column, Plan 4's inline create + CapEx handoff).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → React Router | URL params (`?tab`, `?statementId`, `?channel`, `?period`) carry user-controlled strings; must be treated as untrusted on read |
| React component → Convex mutation hook | Token comes from AuthContext; hooks MUST refuse to fire when token missing (existing `"skip"` pattern) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-73-09 | Elevation | /bank-reconciliation route | mitigate | Task 1 widens ProtectedRoute allowedRoles to `["manager", "admin"]`; kitchen/order_staff blocked at the route guard + server-side requireRole (belt-and-suspenders from Plan 1) |
| T-73-10 | Tampering | ?statementId URL param | mitigate | ReviewWorkspace passes the string to `useQuery` which requires a valid Convex Id at the server boundary — invalid ids throw server-side; hooks use `"skip"` when param missing/malformed |
| T-73-11 | Tampering | Candidate selection — user picks a record the server rejects | accept | Server `manualMatch` re-validates matchedId via `ctx.db.get(...)` (Plan 1 T-73-03); UI failure surfaces server error via toast |
| T-73-12 | Information Disclosure | Batch preview dialog shows account names + amounts | accept | Manager role is already authorized for JE posting and account visibility (existing v1.7 surfaces); no new PII exposure |
</threat_model>

<verification>
Overall Plan 2 verification:
- `npm run test -- --run src/components/bankReconciliation/__tests__/` exits 0
- `npm run type-check` exits 0
- `npm run build` exits 0
- Manual smoke (handled in Plan 5 E2E): log in as manager → /bank-reconciliation → Review tab → pick a statement → select a bank line → pick a candidate → Match → toast green → Confirm → toast green → Unmatch → toast green.
</verification>

<success_criteria>
- All 3 tasks meet their acceptance_criteria
- 4-tab shell replaces single-page BankReconciliationPage
- Manager role can access /bank-reconciliation (no 403)
- Split-view workspace supports click-to-select → Match → Confirm → Unmatch flow
- Batch Confirm preview dialog implements DR/CR balance gate
- Progress header reactive via Convex (no manual invalidation)
- Keyboard shortcuts (Enter/Esc/↑↓) functional
- UI-SPEC copy verbatim on every empty/error/toast/destructive-confirmation state
</success_criteria>

<output>
After completion, create `.planning/phases/73-bank-reconciliation-ui-workflow/73-02-SUMMARY.md` listing:
- Component tree created (paths + responsibilities)
- Hook additions (signatures)
- Route changes (App.tsx diff)
- Outstanding placeholders for Plan 3 (Revenue Gap, Rules tab) and Plan 4 (CapEx handoff, inline create)
- Test coverage summary
</output>
