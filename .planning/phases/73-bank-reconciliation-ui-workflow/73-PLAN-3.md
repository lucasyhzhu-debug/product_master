---
phase: 73
plan: 03
type: execute
wave: 3
depends_on: [01, 02]
files_modified:
  - src/pages/BankReconciliationPage.tsx
  - src/pages/BankRulesManager.tsx
  - src/hooks/convex/useBankReconciliation.ts
  - src/components/bankReconciliation/RevenueGapTable.tsx
  - src/components/bankReconciliation/StatementHistoryList.tsx
  - src/components/bankReconciliation/LearnFromOverrideDialog.tsx
  - src/components/bankReconciliation/ReviewWorkspace.tsx
  - src/components/bankReconciliation/BankLinesPane.tsx
  - src/components/bankReconciliation/__tests__/RevenueGapTable.test.tsx
  - src/components/bankReconciliation/__tests__/StatementHistoryList.test.tsx
  - src/components/bankReconciliation/__tests__/LearnFromOverrideDialog.test.tsx
autonomous: true
requirements: [BANK-03, BANK-04]
tags: [bank-reconciliation, frontend, revenue-gap, rules, progress]

must_haves:
  truths:
    - "Revenue Gap tab shows per-channel rows with Bank CR, External Revenue, Diff, Diff% columns for a selected period"
    - "Revenue Gap includes (unallocated) synthetic row for credits with null linkedChannel"
    - "Rows where externalRevenue=0 and bank>0 render as ∞ with warning icon"
    - "Clicking a Revenue Gap row navigates to Review tab with channel + period filter applied"
    - "StatementHistoryList renders counts column + mini progress bar per row live-updating via Convex"
    - "Rules tab inlines BankRulesManager (admin-only) — non-admins see a read-only or hidden state"
    - "Overriding a line's category opens LearnFromOverrideDialog pre-filled with detected pattern; user can edit all fields and save via createFromOverride"
    - "Saved rule shows success toast with pattern summary; rejected for kitchen/order_staff at server level"
  artifacts:
    - path: src/components/bankReconciliation/RevenueGapTable.tsx
      provides: "D-14 per-channel table + period picker + row drill-down"
    - path: src/components/bankReconciliation/StatementHistoryList.tsx
      provides: "D-24 counts + mini progress bar column (extended from P72)"
    - path: src/components/bankReconciliation/LearnFromOverrideDialog.tsx
      provides: "D-10 / D-11 learn-from-override rule creation dialog"
    - path: src/pages/BankRulesManager.tsx
      provides: "Supports `embedded` prop so Rules tab can inline without page header"
  key_links:
    - from: "src/components/bankReconciliation/RevenueGapTable.tsx row click"
      to: "BankReconciliationPage Review tab (URL ?tab=review&channel=...&period=...)"
      via: "react-router useNavigate with search params"
      pattern: "tab=review.*channel"
    - from: "src/components/bankReconciliation/LearnFromOverrideDialog.tsx save"
      to: "api.bankKeywordRules.mutations.createFromOverride"
      via: "useCreateRuleFromOverride hook"
      pattern: "useCreateRuleFromOverride"
    - from: "src/components/bankReconciliation/StatementHistoryList.tsx"
      to: "api.bankStatements.queries.getStatementProgressBatch"
      via: "useStatementProgressBatch hook (Plan 3 adds)"
      pattern: "useStatementProgressBatch"
---

<objective>
Ship the two remaining tabs (Revenue Gap + Rules), the StatementHistoryList progress column, and the learn-from-override dialog that fires when a reviewer changes a line's category. After this plan, the split-view workspace's reactive surfaces and rule-learning flow are complete; only inline record creation and CapEx handoff remain (Plan 4).

Purpose: Covers BANK-04 per-statement counts on the history list (D-24), the Revenue Gap per-channel dashboard (D-13, D-14, D-15), the rule creation path triggered by category overrides (D-10, D-11, D-12), and integrates /bank-rules as a tab (D-13).

Output: Reviewer can (a) open Revenue Gap tab, pick a month, see per-channel variance with (unallocated) bucket, click a row to drill into Review filtered by channel; (b) open Rules tab and see BankRulesManager inline (admin only); (c) override a bank line's category and be prompted to save the mapping as a rule; (d) see live per-statement progress bars in the Statements tab history list.
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
@.planning/phases/73-bank-reconciliation-ui-workflow/73-02-SUMMARY.md
@src/pages/BankReconciliationPage.tsx
@src/pages/BankRulesManager.tsx
@src/components/bankReconciliation/RuleFormDialog.tsx
@src/components/bankReconciliation/StatementHistoryList.tsx
@src/components/bankReconciliation/ReviewWorkspace.tsx
@src/components/bankReconciliation/BankLinesPane.tsx
@src/hooks/convex/useBankReconciliation.ts
@src/lib/platformColors.ts
@src/lib/dateUtils.ts
@src/contexts/AuthContext.tsx

<interfaces>
From Plan 1 (backend):
```typescript
// api.bankStatements.queries.getRevenueGap
{ token: string, periodStart: number, periodEnd: number } →
  Array<{ channel: string, bankCredits: number, externalRevenue: number, diff: number, diffPercent: number | null }>

// api.bankStatements.queries.getStatementProgressBatch
{ token: string, statementIds: Id<"bankStatements">[] } →
  Record<Id<"bankStatements">, { unmatched, auto_matched, suggested, confirmed, total, matched, percent }>

// api.bankKeywordRules.mutations.createFromOverride
{ token: string, counterpartyPatterns: string[], descriptionPatterns: string[], descriptionPatternsMode: "any"|"all", direction: "debit"|"credit", matchType: "...", confidence: "exact"|"strong"|"suggested", priority: number, plSection: "...", categoryAccountId: Id<"accounts">, jeDebitAccountId: Id<"accounts">, jeCreditAccountId: Id<"accounts">, name: string, isActive: boolean } →
  Id<"bankKeywordRules">
```

From Plan 2 (frontend):
- ReviewWorkspace accepts `initialChannelFilter` and `initialPeriodFilter` props
- BankReconciliationPage reads `?tab`, `?statementId`, `?channel`, `?period` URL params

From UI-SPEC:
- Tab labels: `Statements · Review · Revenue Gap · Rules`
- Revenue Gap empty state: heading `No revenue gaps this period`, body `Every bank credit ties out to externalRevenue within tolerance. Change the period above to audit another month.`
- ∞ row warning copy: `No externalRevenue recorded for this channel in the period. Bank credits suggest missing revenue entries.`
- Rule save success toast: `Rule saved. Future lines matching "{pattern summary}" will auto-classify.`
- Channel colors from `src/lib/platformColors.ts`
- ∞ Diff % displayed as `—` with warning icon (Claude's Discretion D-14 resolution)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Revenue Gap tab + StatementHistoryList progress column</name>
  <files>
    src/components/bankReconciliation/RevenueGapTable.tsx,
    src/components/bankReconciliation/StatementHistoryList.tsx,
    src/hooks/convex/useBankReconciliation.ts,
    src/pages/BankReconciliationPage.tsx,
    src/components/bankReconciliation/__tests__/RevenueGapTable.test.tsx,
    src/components/bankReconciliation/__tests__/StatementHistoryList.test.tsx
  </files>
  <read_first>
    src/components/bankReconciliation/StatementHistoryList.tsx (current row shape — columns, format),
    src/pages/BankReconciliationPage.tsx (Plan 2 tab shell),
    src/hooks/convex/useBankReconciliation.ts (Plan 2 additions),
    src/lib/platformColors.ts (channel → color mapping),
    src/lib/dateUtils.ts (WIB month range, formatMonth helper),
    src/components/ui/table.tsx + progress.tsx + badge.tsx,
    .planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md D-14, D-15, D-24,
    .planning/phases/73-bank-reconciliation-ui-workflow/73-UI-SPEC.md Copy lines 108-109, 126, Revenue Gap table mock
  </read_first>
  <behavior>
    `useBankReconciliation.ts`: add `useRevenueGap(periodStart, periodEnd)` and `useStatementProgressBatch(statementIds)` hooks mirroring the server signatures. Both return undefined while loading (standard `"skip"` pattern when token missing).

    `RevenueGapTable.tsx`:
    - Period picker: default to current WIB month (start = first day of month 00:00 WIB, end = last day 23:59 WIB). Use existing `dateUtils.ts` helpers. Month/range picker via shadcn Select or DatePicker — prefer a simple month picker (prev/next arrows + month label) keeping dependencies light.
    - Fetch via `useRevenueGap(periodStart, periodEnd)`.
    - Render a shadcn Table with columns: Channel, Bank Credits (IDR), External Revenue (IDR), Diff, Diff %.
    - Channel column: use `getPlatformColor(channel)` badge chip from `src/lib/platformColors.ts`. `(unallocated)` row uses neutral gray treatment.
    - Currency: `formatCurrency(amountIdr)` (existing util), right-aligned, `font-mono tabular-nums`.
    - Diff %: `null` (ExtRev=0) → render `—` inside a warning-amber pill + warning icon + hover tooltip with UI-SPEC copy `No externalRevenue recorded for this channel in the period. Bank credits suggest missing revenue entries.`
    - Diff coloring: positive diff (bank > extRev) uses warning amber; negative diff uses destructive red (extRev > bank — booked revenue not yet in bank).
    - Sort: by abs(diff) desc (server already sorts).
    - Row click → navigate to `?tab=review&channel={channel}&period={YYYY-MM}` (`(unallocated)` row → channel=unallocated). `useNavigate` from react-router.
    - Empty state: heading `No revenue gaps this period` + body from UI-SPEC.

    `StatementHistoryList.tsx` (extend, do not rewrite):
    - Add `Progress` column (between existing columns; place before actions/date — planner's call — recommend just before any Actions/Delete column).
    - On mount, collect all visible statementIds and call `useStatementProgressBatch(statementIds)`.
    - Each row: render a progress chip `{percent}%` + 6px-tall mini progress bar (`Progress` primitive with `className="h-1.5 w-24"`) + count summary tooltip `{matched}/{total} matched · {suggested} suggested · {unmatched} unmatched`.
    - Loading state: show skeleton bar when the batch query returns undefined for that statementId.
    - Existing columns preserved; do not break the existing row click → open statement behavior.

    `BankReconciliationPage.tsx`: replace the Revenue Gap placeholder from Plan 2 with `<RevenueGapTable />`.

    Tests:
    - `RevenueGapTable.test.tsx`: mocks `useRevenueGap` to return [{ channel: "gopay", bankCredits: 1_000_000, externalRevenue: 1_000_000, diff: 0, diffPercent: 0 }, { channel: "grabfood", bankCredits: 35_000_000, externalRevenue: 0, diff: 35_000_000, diffPercent: null }, { channel: "(unallocated)", bankCredits: 5_000_000, externalRevenue: 0, diff: 5_000_000, diffPercent: null }]. Assert: grabfood row shows warning icon + tooltip copy; clicking gopay row navigates with `?tab=review&channel=gopay&period=YYYY-MM`; empty-list path shows empty-state copy.
    - `StatementHistoryList.test.tsx`: mocks useStatementProgressBatch to return known counts for 2 statements; assert mini progress bar renders with correct aria-value; tooltip contains count summary.
  </behavior>
  <action>
    1. Append `useRevenueGap` + `useStatementProgressBatch` hooks to useBankReconciliation.ts.
    2. Create `RevenueGapTable.tsx` with period picker, table rendering, row drill-down.
    3. Extend `StatementHistoryList.tsx` with the progress column.
    4. Wire `<RevenueGapTable />` into BankReconciliationPage Revenue Gap tab.
    5. Create component tests covering drill-down + ∞ case + history progress bar.
    6. Run tests + build.
  </action>
  <verify>
    <automated>npm run test -- --run src/components/bankReconciliation/__tests__/RevenueGapTable.test.tsx src/components/bankReconciliation/__tests__/StatementHistoryList.test.tsx &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `src/components/bankReconciliation/RevenueGapTable.tsx` exists
    - `grep -n "useRevenueGap" src/components/bankReconciliation/RevenueGapTable.tsx` returns 1 match
    - `grep -n "unallocated" src/components/bankReconciliation/RevenueGapTable.tsx` returns at least 1 match
    - `grep -n "No revenue gaps this period" src/components/bankReconciliation/RevenueGapTable.tsx` returns 1 match (empty-state verbatim)
    - `grep -n "tab=review" src/components/bankReconciliation/RevenueGapTable.tsx` returns at least 1 match (drill-down URL)
    - `grep -n "useStatementProgressBatch" src/components/bankReconciliation/StatementHistoryList.tsx` returns 1 match
    - `grep -n "export function useRevenueGap" src/hooks/convex/useBankReconciliation.ts` returns 1 match
    - `grep -n "export function useStatementProgressBatch" src/hooks/convex/useBankReconciliation.ts` returns 1 match
    - `grep -n "RevenueGapTable" src/pages/BankReconciliationPage.tsx` returns at least 1 match
    - `npm run test -- --run src/components/bankReconciliation/__tests__/RevenueGapTable.test.tsx` exits 0
    - `npm run test -- --run src/components/bankReconciliation/__tests__/StatementHistoryList.test.tsx` exits 0
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>Revenue Gap tab renders per-channel + (unallocated) rows with diff/diff% columns; ∞ case styled per UI-SPEC; row click drills into Review tab filtered by channel+period; StatementHistoryList now shows live per-row progress; tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Rules tab inline + LearnFromOverrideDialog + wire category override trigger</name>
  <files>
    src/pages/BankRulesManager.tsx,
    src/pages/BankReconciliationPage.tsx,
    src/hooks/convex/useBankReconciliation.ts,
    src/components/bankReconciliation/LearnFromOverrideDialog.tsx,
    src/components/bankReconciliation/ReviewWorkspace.tsx,
    src/components/bankReconciliation/BankLinesPane.tsx,
    src/components/bankReconciliation/__tests__/LearnFromOverrideDialog.test.tsx
  </files>
  <read_first>
    src/pages/BankRulesManager.tsx (page header structure — identify what to suppress in embedded mode),
    src/components/bankReconciliation/RuleFormDialog.tsx (existing rule form fields — reuse in LearnFromOverrideDialog),
    src/components/bankReconciliation/ReviewWorkspace.tsx + BankLinesPane.tsx (Plan 2 output — where category override happens; currently none — need to add inline override dropdown on each line's classification cell),
    src/hooks/convex/useBankReconciliation.ts (Plan 2 hooks + Task 1 additions),
    src/hooks/convex/useBankKeywordRules.ts (existing rules CRUD hook facade),
    src/hooks/convex/useAccounts.ts (for account picker in override),
    src/contexts/AuthContext.tsx (user.role for embedded admin-only gate),
    .planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md D-10, D-11, D-12, D-13,
    .planning/phases/73-bank-reconciliation-ui-workflow/73-UI-SPEC.md Copy lines 103, 122 (Save as rule copy)
  </read_first>
  <behavior>
    `BankRulesManager.tsx`:
    - Accept new optional prop `embedded?: boolean`. When true, do NOT render the page title / breadcrumb / top-level header chrome — only the rules table + create/edit dialogs.
    - All existing admin-only logic preserved.

    `BankReconciliationPage.tsx` Rules tab:
    - If user.role === "admin" → render `<BankRulesManager embedded />`.
    - Else → render a locked-state panel: heading "Rules are admin-only", body "Ask an administrator to add or edit bank keyword rules. You can still save rules from a category override in the Review tab." (manager-friendly copy). This preserves the admin-only CRUD contract (D-23) while explaining why.

    `useBankReconciliation.ts`: add `useCreateRuleFromOverride()` hook returning a callback that calls `api.bankKeywordRules.mutations.createFromOverride` with the user's token.

    `LearnFromOverrideDialog.tsx`:
    - Props: `open`, `onOpenChange`, `bankLine: Doc<"bankStatementLines">`, `chosenAccountId: Id<"accounts">`, `onSaved?: (ruleId) => void`.
    - Pre-fill logic:
      - `counterpartyPatterns`: if `bankLine.parsedCounterparty` present, pre-fill as single-element array. Otherwise empty.
      - `descriptionPatterns`: tokenize `bankLine.rawDescription` on whitespace + punctuation, render as multi-select chip list; user checks 1-3 tokens to include (RESEARCH Open Question 3 recommendation).
      - `descriptionPatternsMode`: default "any".
      - `direction`: from bankLine.direction.
      - `matchType`: default "description_contains" (or equivalent — first literal in the schema union; verify against schema).
      - `confidence`: default "strong".
      - `priority`: default 500 (mid-range per P72 seed convention).
      - `plSection`: default based on chosenAccountId's account type (heuristic — look up account, read its type, map to section). If lookup fails, leave user to pick.
      - `categoryAccountId`: chosenAccountId.
      - `jeDebitAccountId` / `jeCreditAccountId`: pre-fill from the bank line's existing `jeDebitAccountId` / `jeCreditAccountId` if present; else leave blank for user to pick.
      - `name`: auto-generated from counterparty + first descriptionPattern, e.g., `"BCA | BI-FAST | Category: {accountName}"`.
      - `isActive`: default true.
    - User can edit every field (D-11).
    - Primary button `Save as rule` (teal CTA per UI-SPEC) calls `useCreateRuleFromOverride` → toast `Rule saved. Future lines matching "{pattern summary}" will auto-classify.` (UI-SPEC) → closes dialog → calls `onSaved`.
    - Cancel: closes dialog without side effects. The category override itself (written to bank line) is a separate action — the dialog is purely opt-in rule-creation.

    `ReviewWorkspace.tsx` + `BankLinesPane.tsx` (extend):
    - Each bank line row gets a category override affordance: a small "Override category" button or inline account picker (Select/Combobox over accounts). When user picks an account:
      1. Write `overrideCategoryAccountId` via existing (or new if none) `useUpdateLineOverride` mutation hook. **If a mutation to write `overrideCategoryAccountId` doesn't exist from P72, create a minimal one on `convex/bankStatements/mutations.ts` named `updateLineOverride({ token, lineId, overrideCategoryAccountId })` with `requireRole(["manager","admin"])`.**
      2. After successful write, open `LearnFromOverrideDialog` with the chosen account (D-10 trigger).
    - Only show override affordance on lines where status != "confirmed" (can't override a posted line without unmatching first).

    Tests (`LearnFromOverrideDialog.test.tsx`):
    - Pre-fill assertions: counterpartyPatterns populated when parsedCounterparty present; empty when null; description tokens rendered as chips.
    - Editing a field and clicking Save calls useCreateRuleFromOverride with the edited payload.
    - Success toast copy matches UI-SPEC.
    - Cancel does not call the mutation.
  </behavior>
  <action>
    1. Extend `BankRulesManager.tsx` with optional `embedded` prop suppressing page-level chrome.
    2. Update `BankReconciliationPage.tsx` Rules tab: admin-inlined, non-admin locked-state panel.
    3. Append `useCreateRuleFromOverride` hook to useBankReconciliation.ts.
    4. If missing, add `updateLineOverride` mutation to `convex/bankStatements/mutations.ts` AND corresponding `useUpdateLineOverride` hook. (If it already exists from P72, reuse it and skip this step — check first.)
    5. Create `LearnFromOverrideDialog.tsx` reusing `RuleFormDialog.tsx`'s field patterns; avoid wholesale duplication — extract shared form-fields subcomponent if practical, else copy judiciously.
    6. Wire the override affordance into `BankLinesPane.tsx` rows.
    7. Create component test for the dialog.
    8. Run tests + build.
  </action>
  <verify>
    <automated>npm run test -- --run src/components/bankReconciliation/__tests__/LearnFromOverrideDialog.test.tsx &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "embedded" src/pages/BankRulesManager.tsx` returns at least 1 match (prop handling)
    - `grep -n "BankRulesManager" src/pages/BankReconciliationPage.tsx` returns at least 1 match (Rules tab inline)
    - `grep -n "Rules are admin-only" src/pages/BankReconciliationPage.tsx` returns 1 match (locked-state copy for non-admin)
    - `src/components/bankReconciliation/LearnFromOverrideDialog.tsx` exists
    - `grep -n "useCreateRuleFromOverride" src/components/bankReconciliation/LearnFromOverrideDialog.tsx` returns 1 match
    - `grep -n "Save as rule" src/components/bankReconciliation/LearnFromOverrideDialog.tsx` returns 1 match (Primary CTA per UI-SPEC)
    - `grep -n "Rule saved" src/components/bankReconciliation/LearnFromOverrideDialog.tsx` returns 1 match (toast copy)
    - `grep -n "export function useCreateRuleFromOverride" src/hooks/convex/useBankReconciliation.ts` returns 1 match
    - `grep -nE "(LearnFromOverrideDialog|Override category)" src/components/bankReconciliation/BankLinesPane.tsx` returns at least 1 match (trigger wired)
    - `npm run test -- --run src/components/bankReconciliation/__tests__/LearnFromOverrideDialog.test.tsx` exits 0
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>Rules tab renders BankRulesManager inline for admins and locked-state for managers; overriding a bank line's category triggers LearnFromOverrideDialog with pre-filled pattern; manager can save via createFromOverride; tests green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Rules tab render → BankRulesManager | UI check for admin role is cosmetic; server MUST also reject (existing P72 rule CRUD still `requireRole(["admin"])`) |
| LearnFromOverrideDialog → createFromOverride | Manager-widened mutation; server revalidates role; dialog is only UI affordance |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-73-13 | Elevation | Rules tab UI could hypothetically render BankRulesManager to non-admin | mitigate | Task 2 gates render on `user.role === "admin"`; non-admin branch renders locked-state panel; even if UI leaks, P72 rule mutations still `requireRole(["admin"])` (server belt-and-suspenders) |
| T-73-14 | Tampering | LearnFromOverrideDialog user could inject XSS into pattern fields | mitigate | React escapes by default; patterns stored as strings in Convex — no HTML rendering path; acceptance_criteria preserves grep checks |
| T-73-15 | Tampering | URL drill-down params (?channel, ?period) could be malformed | mitigate | ReviewWorkspace validates `channel` against known platform list (`platformColors.ts`) or accepts any string (server query will ignore unknown channels); `period` parsed via WIB helper with try/catch fallback to current month |
</threat_model>

<verification>
Overall Plan 3 verification:
- `npm run test -- --run src/components/bankReconciliation/__tests__/` exits 0 (all component tests green)
- `npm run type-check` exits 0
- `npm run build` exits 0
- Manual smoke (Plan 5 E2E): pick a month in Revenue Gap tab, see channel rows, click grabfood row → lands on Review with channel=grabfood filter; override a line's category → dialog appears → save rule → toast green → open Rules tab → new rule visible.
</verification>

<success_criteria>
- Both tasks meet their acceptance_criteria
- Revenue Gap tab fully functional with drill-down
- Rules tab integrated (admin inline, manager locked-state)
- StatementHistoryList shows live progress column
- LearnFromOverrideDialog ships pre-fill + Save path end-to-end
- Every UI-SPEC copy string verbatim in rendered components
</success_criteria>

<output>
After completion, create `.planning/phases/73-bank-reconciliation-ui-workflow/73-03-SUMMARY.md` listing:
- New components (RevenueGapTable, LearnFromOverrideDialog)
- Extended components (StatementHistoryList, BankRulesManager, ReviewWorkspace, BankLinesPane)
- Hook additions (useRevenueGap, useStatementProgressBatch, useCreateRuleFromOverride, useUpdateLineOverride if added)
- Outstanding for Plan 4: inline expense/revenue/reimbursement create + CapEx handoff
</output>
