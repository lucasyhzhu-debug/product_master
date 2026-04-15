# Phase 73: Bank Reconciliation UI & Workflow - Research

**Researched:** 2026-04-15
**Domain:** Finance/accounting UI on top of already-shipped parser + match engine (Phase 72)
**Confidence:** HIGH (most findings verified directly against code in this session)

## Summary

Phase 72 shipped the full parser, classifier, record-linkage engine, schema, read-only review table,
rule CRUD admin, and `/bank-reconciliation` wizard route. Phase 73 is **additive UI + new mutations on
top of that foundation** — no new schema tables are required; only field additions on
`bankStatementLines` (audit fields) and the `journalEntries.sourceType` literal union
(add `"bank_statement_reversal"`).

The only HIGH-RISK foundational detail is that `createReversalEntry` in `convex/lib/journalEngine.ts`
currently lists `"bank_statement"` in `NON_REVERSIBLE_TYPES` (`journalEngine.ts:67-75`). P73's
unmatch-reversal flow is blocked by this until either (a) `"bank_statement"` is removed from that
array, or (b) a new `"bank_statement_reversal"` pair is added to `VALID_VOID_PAIRS` and the ban is
lifted. Per CONTEXT D-26, the preferred approach is to add the new literal to the schema
`sourceType` union AND to `JournalSourceType` in `journalEngine.ts`, then wire the reversal through
`createJournalEntryWithLines` directly (not via `createReversalEntry`) so the polymorphic source
linkage stays clean (`sourceType="bank_statement_reversal"`, `sourceId=bankStatementLine._id`).

**Primary recommendation:** Build the split-view, progress header, batch-confirm modal, and revenue-gap
tab as 5 new frontend components under `src/components/bankReconciliation/`, plus 6 new backend
mutations in `convex/bankStatements/mutations.ts` and a `createFromOverride` companion in
`convex/bankKeywordRules/mutations.ts`. Reuse the existing Phase 72 queries (`listStatements`,
`listLines`) augmented with two new queries: `getStatementProgress` (counts grouped by status) and
`revenueGapByPeriod`. Treat D-17's "standard expense submission flow" as gospel — do NOT build a
lightweight shortcut.

## User Constraints (from CONTEXT.md)

### Locked Decisions
(Full verbatim copy from 73-CONTEXT.md — D-01 through D-26. All downstream planning must honor these.)

- **D-01 Scope:** Phase 73 ships ALL of: split-view + manual match/unmatch, JE posting on Confirm,
  learn-from-override rule creation, revenue gap dashboard tab, inline record creation, CapEx
  handoff to Asset Register.
- **D-02 Layout/selection:** Click-to-select both sides then Match button. Two panes on
  `/bank-reconciliation`. Left = lines where `status IN ('unmatched','suggested','auto_matched')`.
  Right = candidate system records filtered by selected line's amount/date.
  `[Match selected]` and `[Unmatch auto]` in footer.
- **D-03 Selection:** Line-level. One bank line at a time; selecting a different line replaces and
  refreshes candidate pane. No multi-select for Match.
- **D-04 Cardinality:** 1:1 only. Each bank line matches at most one system record. Reimbursement /
  payroll batches already aggregate N expenses under one row. No schema change for 1:N/N:1.
- **D-05 Default filter:** Amount exact + date within ±3 days. Candidates grouped by type
  (Reimbursement Batches / Expenses / Payroll / Revenue) each with count badge, empty groups show
  "(0)".
- **D-06 Escape hatch:** `Search all records` button widens to all records of the matching type.
  Does not mutate default filter.
- **D-07 Confirm:** Explicit `[Confirm]` per line + batch `[Confirm all exact-tier]`. Per-line
  posts 2-line JE via `createJournalEntryWithLines` using `jeDebitAccountId`/`jeCreditAccountId`,
  amount = `amountIdr`, `sourceType="bank_statement"`, `sourceId = bankStatementLine._id`. Line
  status → `"confirmed"` + populates `confirmedAt`/`confirmedBy`.
- **D-08 Batch modal:** Preview modal with count, summary grouped by DR/CR pair, grand totals,
  balance sanity gate (block Post if mismatched). All-or-nothing transactionally.
- **D-09 Unmatch:** Full reversal. Clear `matchedType`/`matchedId`/`matchMethod`; recompute
  `status` (→ `"suggested"` if rule classifies, else `"unmatched"`); if JE was posted, create
  reversal JE via `createJournalEntryWithLines` with swapped DR/CR, both JEs remain in ledger.
- **D-10/D-11 Learn-from-override dialog:** Triggered when reviewer edits
  `overrideCategoryAccountId`. Pre-filled editable pattern fields. Saves via
  `bankKeywordRules.createFromOverride`.
- **D-12 Rule-save perms:** manager + admin can save rules from override (diverges from P72 D-19
  which gated rule CRUD to admin only). The `/bank-rules` CRUD page stays admin-only.
- **D-13 Tabs:** `[Statements] [Review] [Revenue Gap] [Rules]`. Rules integration preferred if
  low-effort.
- **D-14 Revenue Gap rows:** Per-period, grouped by `linkedChannel` with synthetic `(unallocated)`
  row. Columns: Channel / Bank Credits / External Revenue / Diff / Diff %. `∞` case rendered as
  `—` + warning icon.
- **D-15 Drill-down:** Row click → Review tab with pre-applied channel+period filter.
- **D-16 Inline create:** Expense, revenue, reimbursement from unmatched bank lines.
- **D-17 Expense inline create (CRITICAL):** Standard expense submission flow (NOT shortcut).
  Requires `submittedBy` (owner user), `receiptFile`, `expenseCategory`/`accountId`. Status = `submitted`,
  NOT `approved`. Bank line auto-matches to new expense but stays `"suggested"` until expense is
  approved AND reviewer clicks Confirm.
- **D-18 Revenue inline create:** `externalRevenue` row with pre-filled `transactionDate`,
  `revenueGross`, `source`. Auto-matches line `matchedType="revenue"`.
- **D-19 Reimbursement inline create:** Reimbursement batch with pre-filled `totalAmount`,
  `createdAt`. Auto-matches line `matchedType="reimbursement"`.
- **D-20/D-21/D-22 CapEx handoff:** For lines flagged `capex_needs_asset_register`, replace
  `[Confirm]` with `[Route to Asset Register]`. Navigate `/asset-register/new?fromBankLine={id}`
  with prefills. JE deferred until asset is registered; detect duplicate assets within ±3 days.
- **D-23 Perms:** manager + admin for all reconciliation actions. `kitchen` / `order_staff`
  blocked. Rule CRUD stays admin-only; only `createFromOverride` opens to manager+admin.
- **D-24 Progress:** Workspace header + statement history row, both from live count query
  `GROUP BY status` on `bankStatementLines`. Header `matchedCount` stays snapshot from import.
- **D-25 Schema additions to `bankStatementLines`:**
  `confirmedAt`, `confirmedBy`, `confirmedJournalEntryId`, `reversedAt`, `reversedBy`,
  `reversalJournalEntryId`, `createdExpenseId`, `createdRevenueId`, `createdReimbursementId`
  (all optional).
- **D-26 JE sourceType:** Add `"bank_statement_reversal"` to `journalEntries.sourceType` union
  (planner's call; option 1 preferred per CONTEXT).

### Claude's Discretion
Progress bar visual details; dialog copy and error wording; keyboard shortcuts (Enter/Esc/↑↓);
mobile/tablet layout fallback; counter-party keyword extraction heuristic for the override
pre-fill; batch-confirm granularity (recommend all-or-nothing); tab vs route for Rules page
(prefer tab); tooltip copy; pagination/virtualization thresholds.

### Deferred Ideas (OUT OF SCOPE)
1:N and N:1 split matching; user-configurable match tolerances; 10-second undo window;
mobile-first split-view optimization; dashboard-level reconciliation tile (→ Phase 77);
auto-post JE on Match; drag-and-drop matching UX; full documented hotkey scheme; batch historical
re-categorisation tool.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BANK-03 | Manual match/unmatch via split-view UI | Existing `bankStatementLines.matchedType`/`matchedId` polymorphic FK (`schema.ts:1959-1966`); new mutations `manualMatch` + `unmatch` on `convex/bankStatements/mutations.ts`; existing `listLines` query extended with filtering. Split-view components new in `src/components/bankReconciliation/`. |
| BANK-04 | Per-statement matched/unmatched/suggested counts | New `getStatementProgress` query aggregates by `bankStatementLines.status` via `by_statement_status` index (`schema.ts:1988`). Surfaces on progress header + extended StatementHistoryList row. |

## Project Constraints (from CLAUDE.md)

The planner MUST honor these. They override default behaviors:

- **Branch-per-phase:** `feature/73-bank-reconciliation-ui-workflow` (or similar ≤50-char slug per
  pitfall 14). Verify branch is NOT `main` before starting. Merge previous phase to `main` first.
- **Plan template — 4 required sections:** `## Git Workflow` / `## Implementation Waves` /
  `## Documentation Updates` / `## Success Criteria`. Validation gate: confirm all 4 exist
  before implementing.
- **Never hand-roll JEs:** all journal entry creation MUST go through
  `createJournalEntryWithLines` in `convex/lib/journalEngine.ts` (JE-06 rule).
- **Auth:** every protected mutation uses `requireRole(ctx, token, […])` or `protectedMutation({ roles })`.
  `token: v.string()` must appear on mutation args for the former pattern.
- **Convex pitfalls:** no dynamic imports; camelCase fields; await mutations; hooks before
  conditional returns; check `useQuery() === undefined` for loading.
- **CHANGELOG.md after every merge** — non-negotiable.
- **NEVER use productionType/productionUnits fields** (irrelevant here but a global rule).
- **`npm run build` must pass before merge.**
- **Keep phase dir name ≤50 chars** (current `73-bank-reconciliation-ui-workflow` = 36 chars — OK).

## Standard Stack

### Core (already installed, no new deps)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| convex | ^1.31.7 | Backend DB + mutations + real-time queries | Project baseline [VERIFIED: package.json] |
| react | ^19.2.0 | UI | Project baseline [VERIFIED: package.json] |
| @radix-ui (via shadcn/ui) | current | Tabs, Dialog, Progress, Popover, Alert, ScrollArea | Project baseline — all primitives already in `src/components/ui/` [VERIFIED: ls output] |
| sonner | current | Toasts | Project baseline [VERIFIED: ls src/components/ui] |
| react-router-dom | ^7.13.0 | URL query for tab + statement selection | Project baseline [VERIFIED: package.json] |
| vitest + convex-test | ^4.0.18 / — | Unit + Convex-backend mutation tests | Project baseline [VERIFIED: vitest.config.ts] |
| @playwright/test | existing | E2E tests for split-view flows | Project baseline [VERIFIED: playwright.config.ts exists] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | current | Icons (AlertTriangle, Inbox, SearchX, CheckCircle2, Loader2, ArrowLeft) | Already imported in BankReconciliationPage.tsx |
| `convex/lib/periodRange.ts` | in-repo | WIB timezone period bounds for revenue-gap aggregation | Any date-range query on server |
| `src/lib/dateUtils.ts` | in-repo | WIB formatting in UI | Any UI date rendering |
| `convex/lib/fuzzyMatch.ts` | in-repo | `similarityScore` for candidate-search scoring | If the `Search all records` dialog ranks by relevance |
| `convex/lib/journalEngine.ts` | in-repo | `createJournalEntryWithLines`, `buildDebitLine`, `buildCreditLine`, `buildReversedLines` | Every JE post — confirm + batch confirm + unmatch reversal |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `createReversalEntry` | Direct `createJournalEntryWithLines` call with `sourceType="bank_statement_reversal"` | `createReversalEntry` currently guards `"bank_statement"` as NON_REVERSIBLE (`journalEngine.ts:67-75`). Going direct is less invasive and matches the polymorphic-source pattern. RECOMMEND: direct call; leave `createReversalEntry` untouched. |
| Virtualized list (react-window) | Plain mapped rows + `max-h` + `overflow-auto` | BCA statements are ~50–300 lines; virtualization is unnecessary. Planner may reach for react-window only if observed perf >200 rows + >20 candidates. |
| Separate `/bank-reconciliation/review/:id` route | Client-side tab + URL query `?tab=review&statementId=…` | CONTEXT D-02 locks single `/bank-reconciliation` page; UI-SPEC §6.1 confirms URL query approach. |

**Installation:** no new npm dependencies required.

## Architecture Patterns

### Recommended Project Structure
```
convex/
├── bankStatements/
│   ├── mutations.ts         # EXTEND: add manualMatch, unmatch, confirmLine, batchConfirmExactTier,
│   │                        #         inlineCreateExpense, inlineCreateRevenue, inlineCreateReimbursement,
│   │                        #         markAssetLinked (for CapEx re-attach)
│   ├── queries.ts           # EXTEND: add getStatementProgress, listCandidatesForLine,
│   │                        #         searchAllCandidates, revenueGapByPeriod
│   ├── matchEngine.ts       # UNCHANGED
│   └── __tests__/
│       ├── manualMatch.test.ts          # NEW
│       ├── unmatch.test.ts              # NEW
│       ├── confirmLine.test.ts          # NEW
│       ├── batchConfirm.test.ts         # NEW
│       ├── progress.test.ts             # NEW
│       └── revenueGap.test.ts           # NEW
├── bankKeywordRules/
│   ├── mutations.ts         # EXTEND: add createFromOverride (manager+admin gated)
│   └── __tests__/
│       └── createFromOverride.test.ts   # NEW
└── schema.ts                # EXTEND: D-25 audit fields + D-26 sourceType literal

src/
├── pages/
│   └── BankReconciliationPage.tsx       # EXTEND: add <Tabs> shell, hoist wizard into Statements tab
├── components/bankReconciliation/
│   ├── BankReconciliationTabs.tsx       # NEW
│   ├── SplitViewWorkspace.tsx           # NEW (orchestrates left+right panes + action bar)
│   ├── BankLinesPane.tsx                # NEW
│   ├── BankLineRow.tsx                  # NEW
│   ├── CandidatesPane.tsx               # NEW
│   ├── CandidateGroup.tsx               # NEW
│   ├── CandidateRow.tsx                 # NEW
│   ├── ReconciliationActionBar.tsx      # NEW
│   ├── StatementProgressHeader.tsx      # NEW
│   ├── BatchConfirmDialog.tsx           # NEW
│   ├── LearnFromOverrideDialog.tsx      # NEW (wraps RuleFormDialog body)
│   ├── RevenueGapTab.tsx                # NEW
│   ├── InlineExpenseDialog.tsx          # NEW (hosts ExpenseSubmit form)
│   ├── InlineRevenueDialog.tsx          # NEW
│   ├── InlineReimbursementDialog.tsx    # NEW
│   ├── SearchAllRecordsDialog.tsx       # NEW
│   ├── ConfidenceBadge.tsx              # NEW
│   ├── ReversedIndicator.tsx            # NEW
│   ├── StatementHistoryList.tsx         # EXTEND (add progress column)
│   └── RuleFormDialog.tsx               # REUSE (extract shared body)
└── hooks/convex/
    └── useBankReconciliation.ts         # EXTEND with manualMatch/unmatch/confirm/batchConfirm/
                                          # createFromOverride/getStatementProgress/revenueGap/
                                          # listCandidatesForLine/searchAllCandidates
```

### Pattern 1: Polymorphic FK via `matchedType` + `matchedId`
**What:** P72 already established this. `bankStatementLines.matchedType` is a union literal
(`"expense" | "revenue" | "reimbursement" | "payroll"`) and `matchedId` is `v.optional(v.string())`
(NOT a typed `Id`) precisely because Convex disallows conditional Id unions.
**When to use:** All match/unmatch mutations MUST write/clear both fields atomically, never one.
**Example (from `convex/bankStatements/matchEngine.ts:40-44`):**
```ts
// Source: convex/bankStatements/matchEngine.ts
export type LinkageResult = {
  matchedType: "expense" | "revenue" | "reimbursement" | "payroll";
  matchedId: string;
  fuzzyScore: number;
};
```
[VERIFIED: grep convex/bankStatements/matchEngine.ts]

### Pattern 2: Single JE entry point
**What:** `createJournalEntryWithLines(ctx, params)` in `convex/lib/journalEngine.ts` is the ONLY
approved way to insert journal entries or journal lines (JE-06).
**When to use:** Every Confirm, Batch Confirm, and Unmatch-reversal.
**Example:**
```ts
// Source: convex/lib/journalEngine.ts:236
await createJournalEntryWithLines(ctx, {
  date: line.date,
  description: `Bank ${line.direction} — ${line.rawDescription.slice(0, 80)}`,
  sourceType: "bank_statement",
  sourceId: line._id,
  createdBy: ctx.user._id,
  lines: [
    buildDebitLine(line.jeDebitAccountId!, line.amountIdr),
    buildCreditLine(line.jeCreditAccountId!, line.amountIdr),
  ],
});
```
The helper validates balance (debits === credits), requires `≥ 2` lines, and rejects non-integer
amounts — all already covered.

### Pattern 3: Reversal via direct call, NOT `createReversalEntry`
**What:** `createReversalEntry` is hard-gated against `"bank_statement"` via `NON_REVERSIBLE_TYPES`
(`journalEngine.ts:67-75`). Per CONTEXT D-26 option 1, add a NEW literal
`"bank_statement_reversal"` to the schema + `JournalSourceType` union, and call
`createJournalEntryWithLines` directly with swapped lines built via `buildReversedLines`.
**Example:**
```ts
// Planner-suggested pattern for unmatch-with-JE-reversal
const original = await ctx.db.get(line.confirmedJournalEntryId!);
const originalLines = await ctx.db
  .query("journalEntryLines")
  .withIndex("by_journal_entry", q => q.eq("journalEntryId", original._id))
  .collect();

const reversalId = await createJournalEntryWithLines(ctx, {
  date: original.date,                   // business date of original, not now
  description: `Reversed by unmatch on ${wibDateString(now)} by ${user.name}`,
  sourceType: "bank_statement_reversal", // NEW literal per D-26
  sourceId: line._id,
  createdBy: user._id,
  lines: buildReversedLines(originalLines.map(l => ({
    accountId: l.accountId,
    debitAmount: l.debitAmount,
    creditAmount: l.creditAmount,
    description: l.description,
  }))),
});

await ctx.db.patch(line._id, {
  matchedType: undefined,
  matchedId: undefined,
  matchMethod: undefined,
  status: /* recomputed */,
  reversedAt: now,
  reversedBy: user._id,
  reversalJournalEntryId: reversalId,
});

// Also mark original as reversed (mirrors createReversalEntry contract)
await ctx.db.patch(original._id, { isReversed: true, reversedByEntryId: reversalId });
```

### Pattern 4: Tabs primitive
**What:** `src/components/ui/tabs.tsx` exists (shadcn Radix Tabs). Used already in
`MyExpenses.tsx`, `AssetRegister.tsx`, `SalesAnalytics.tsx`, etc.
**When to use:** P73 tab bar on `/bank-reconciliation`.
**Reference pages:** `AssetRegister.tsx` is the canonical tab+sub-route example in this codebase —
planner should mimic its URL-query pattern for tab state.

### Pattern 5: Progress aggregation query
**What:** `bankStatementLines` has `by_statement_status` compound index
(`schema.ts:1988`). The progress query is a 4-prefix scan, NOT a collect+filter:
```ts
// convex/bankStatements/queries.ts — NEW
export const getStatementProgress = query({
  args: { token: v.string(), statementId: v.id("bankStatements") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const statuses = ["unmatched", "auto_matched", "suggested", "confirmed"] as const;
    const counts = await Promise.all(
      statuses.map(s =>
        ctx.db
          .query("bankStatementLines")
          .withIndex("by_statement_status", q =>
            q.eq("statementId", args.statementId).eq("status", s))
          .collect()
          .then(rs => rs.length)
      ),
    );
    const [unmatched, autoMatched, suggested, confirmed] = counts;
    const total = unmatched + autoMatched + suggested + confirmed;
    return {
      total,
      unmatched,
      autoMatched,
      suggested,
      confirmed,
      matched: autoMatched + confirmed + suggested, // "matched" = any row with a link
      reconciledPct: total === 0 ? 0 : Math.round((confirmed / total) * 100),
    };
  },
});
```
**Note:** Convex supports `.collect().then(…)` but a cheaper shape would be
`for (const status of statuses) { … }` without `Promise.all` — planner's call. For statements
≤ 5000 lines the difference is negligible.

### Pattern 6: Permission matrix
**What:** P73 diverges from P72 by opening the reconciliation route to `manager + admin`. The
existing route in `App.tsx:432-440` is gated `allowedRoles={["admin"]}` — must change to
`allowedRoles={["manager", "admin"]}`. `/bank-rules` (line 443) STAYS admin-only.
Sidebar entry in `src/components/layout/Header.tsx:119` is `rolesAllowed: ['admin']` — must also
widen to `['manager','admin']` for the reconciliation entry (keep `/bank-rules` admin).
No new permission flag is needed; route-level `allowedRoles` is sufficient (CONTEXT D-23).
All existing backend queries (`listStatements`, `listLines`, `getStatement`) currently do
`requireRole(ctx, token, ["admin"])` — these must be widened to `["manager","admin"]` OR a
parallel manager-callable path added. RECOMMEND: widen the existing guards (simpler).

### Anti-Patterns to Avoid
- **Building an inline-lite expense form.** CONTEXT D-17 is emphatic: inline expense creation MUST
  use the standard submission path with receipt+submittedBy required, status=`submitted`.
- **Mutating `bankStatements.matchedCount` on manual match/unmatch.** This field is a
  post-import snapshot (CONTEXT D-24); the live progress header reads from `getStatementProgress`,
  not from the denormalized counter. Changing it would desync the history list's imported-state
  badge.
- **Calling `createReversalEntry` for the unmatch flow.** It throws for `"bank_statement"`
  (`journalEngine.ts:74`). Use `createJournalEntryWithLines` directly with
  `sourceType="bank_statement_reversal"` and manually patch `original.isReversed`.
- **Writing to `matchedId` as a typed `Id`.** Schema stores it as `v.string()` because
  polymorphism (`schema.ts:1966`). Stringify before write, never cast on read.
- **Blocking on the inline expense's approval before the bank line is confirmable.** CONTEXT D-17
  says the bank line stays `"suggested"` until BOTH the expense is approved AND the reviewer
  clicks Confirm. Do not auto-confirm on expense approval.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Journal entry creation | `ctx.db.insert("journalEntries", …)` | `createJournalEntryWithLines` | JE-06 invariant; validates balance, IDR integer, entry number, denormalized entryDate. |
| Reversal lines | Manually swap amounts in a loop | `buildReversedLines(original)` | Already tested, preserves accountId + description. |
| Debit/credit line | Raw object literal | `buildDebitLine(acct, amt, desc)` / `buildCreditLine` | Consistency + readability. |
| WIB month/date bounds | `new Date(…)` arithmetic | `getWibComponents` + `getWibMonthStart/End` from `convex/lib/periodRange.ts` | WIB ≠ UTC; boundary transactions misbucket otherwise (see `mutations.ts:28-29`). |
| Fuzzy candidate search | Custom edit-distance | `similarityScore` from `convex/lib/fuzzyMatch.ts` | Already tuned to 0.8 threshold across match engine. |
| Confidence semantics | String literal comparisons | Literal union `"exact"|"strong"|"suggested"|"none"` already on schema (`schema.ts:1971-1976`) | Type-checked, consistent with P72 match engine output. |
| Tab bar state | Custom `useState` + render switch | `src/components/ui/tabs.tsx` + URL query | shadcn/Radix tabs handle a11y (roving tabindex, aria-selected). |
| Progress bar | Custom div with % width | `src/components/ui/progress.tsx` (shadcn Progress, Radix progressbar) | Renders `role="progressbar"` with proper `aria-valuenow`. |
| Currency formatting | String interpolation | `formatCurrency` from `src/lib/utils.ts` | Used consistently across the whole app. |
| Expense submission | Custom 3-field dialog | Reuse ExpenseSubmit.tsx form body in a `<Dialog>` | D-17 "standard submission path" constraint. |
| Asset intake | Custom CapEx form | Navigate to `/asset-register/new` with URL params | AssetRegister.tsx already exists (Phase 60). |
| Reimbursement batch creation | Custom shortcut | Existing reimbursement batch creation flow | Same business rules (N aggregated expenses). |

**Key insight:** Every major piece of "backend glue" P73 needs (JE creation, fuzzy scoring, WIB
dates, confidence literals, polymorphic FK) already exists as a helper. P73 is almost entirely
wiring + new UI, not new primitives.

## Runtime State Inventory

> N/A — this is a feature-addition phase, not a rename/refactor/migration. No runtime state
> (databases, caches, task schedules, environment variables, build artifacts) is being renamed
> or moved.

## Common Pitfalls

### Pitfall 1: `"bank_statement"` is currently NON_REVERSIBLE
**What goes wrong:** Planner assumes `createReversalEntry` works for unmatch. It throws
`"Cannot reverse an bank_statement entry"` (`journalEngine.ts:167`).
**Why it happens:** P72 explicitly listed it as non-reversible because no mutation was posting JEs yet.
**How to avoid:** Use `createJournalEntryWithLines` directly with the new
`"bank_statement_reversal"` sourceType. Do NOT remove `"bank_statement"` from `NON_REVERSIBLE_TYPES`
— leave that guard in place so manual reversals via the generic void path still can't touch bank
JEs (the reversal path goes through the dedicated flow).

### Pitfall 2: Routing query re-loads lose candidate selection
**What goes wrong:** User selects a line, then the right pane re-fetches and the selected
candidate Id is still in state but the candidate list is empty (e.g., candidate was matched by a
parallel tab).
**Why it happens:** Convex reactivity; another user's action (or own action in another tab) can
mutate `bankStatementLines` mid-session.
**How to avoid:** On candidate list update, validate that the selected candidate is still in the
list; otherwise clear selection and surface a toast "Selected candidate is no longer available".

### Pitfall 3: Progress header counts divergent from line list
**What goes wrong:** Header shows "47 matched, 8 unmatched" but line list filter `unmatched` shows 9.
**Why it happens:** Two independent queries on the same table; Convex guarantees per-query
consistency but not cross-query snapshot isolation at the UI layer during rapid mutations.
**How to avoid:** Share the same status filter shape across both queries, and for the progress
header use the dedicated aggregation query (Pattern 5). Convex reactivity will re-fire both within
~50ms of any mutation — visible divergence is ephemeral but planner should avoid premature
skeleton-flash by memoizing last-known-good counts while a mutation is in flight.

### Pitfall 4: Inline expense's receipt upload blocked in a nested Dialog
**What goes wrong:** File input inside a shadcn `<Dialog>` sometimes has focus-trap conflicts that
block the OS file picker on certain browsers.
**Why it happens:** Radix focus trap intercepts the click if the trigger is inside a
`pointer-events: none` region.
**How to avoid:** Follow the exact same pattern as the existing ExpenseSubmit.tsx receipt upload.
E2E smoke-test the upload path early in Wave 2, not Wave 3.

### Pitfall 5: Reimbursement / payroll candidates have weak description proxies
**What goes wrong:** Right pane shows a reimbursement batch with amount match but the reviewer
can't tell which expenses are inside. They match it incorrectly.
**Why it happens:** `reimbursementBatches` has no `description`; `batchNumber` is all the match
engine has (`matchEngine.ts:317`).
**How to avoid:** Candidate row for reimbursement batches should expand (inline or on hover) to
show the contained expense rows (`reimbursementExpenses` joined by `batchId`). Same for payroll:
show `recipientName` prominently.

### Pitfall 6: CapEx "Route to Asset Register" returns to wrong tab
**What goes wrong:** Reviewer clicks Route, fills asset form, hits Save, and lands on the Asset
Register — not back on the line.
**Why it happens:** Navigation is one-way unless the asset save handler knows to redirect.
**How to avoid:** AssetRegister intake reads `fromBankLine` from URL query; on save, redirect to
`/bank-reconciliation?tab=review&statementId={inferred}&lineId={inferred}` with a toast. Requires
AssetRegister to carry the param through its submit handler (CONTEXT D-21/D-22).

### Pitfall 7: `matchedCount` desync on the StatementHistoryList
**What goes wrong:** History list row shows "Matched 47/67 (70%)" but progress header says 71%.
**Why it happens:** `bankStatements.matchedCount` is a denormalized snapshot from import time;
post-import manual matches don't bump it (CONTEXT D-24). The history row must either read the live
query OR show the snapshot with an obvious label.
**How to avoid:** Update StatementHistoryList row column to use live `getStatementProgress`
per-row (N+1 query — consider a bulk `getStatementProgressBulk(statementIds[])` query if the list
grows past ~50 rows). For ≤50 rows, per-row is fine because Convex caches and reuses subscription
channels.

### Pitfall 8: `bankStatement_reversal` literal missing from `createJournalEntryWithLines`
**What goes wrong:** Type error (`sourceType` union mismatch) OR runtime Convex validator rejects
insert.
**Why it happens:** Both the schema union AND the `JournalSourceType` literal in
`journalEngine.ts:33-44` must be extended in lockstep.
**How to avoid:** Two-file change in the same commit/task: `schema.ts:1855` and
`journalEngine.ts:44` add `v.literal("bank_statement_reversal")` / `"bank_statement_reversal"`.

### Pitfall 9: React hooks order in dialogs with conditional content
**What goes wrong:** `InlineExpenseDialog` computes hooks after an early return for
`isOpen=false`.
**Why it happens:** Standard React hooks rule (CLAUDE.md pitfall 9).
**How to avoid:** Call all hooks at top, render `null` only at the end after all hooks resolved.

### Pitfall 10: Statement listing is admin-only — history list never appears for managers
**What goes wrong:** Manager logs in, opens `/bank-reconciliation`, gets an empty history list
and can't load any statement because every backend query throws on role check.
**Why it happens:** P72 queries all gate on `["admin"]` (`bankStatements/queries.ts:19,34,52,76`).
**How to avoid:** Widen those four guards to `["manager","admin"]` as part of Wave 1 before any
UI work lands. Keep `bankKeywordRules` queries admin-only.

## Code Examples

### Example: Manual match mutation
```ts
// convex/bankStatements/mutations.ts — NEW
export const manualMatch = mutation({
  args: {
    token: v.string(),
    lineId: v.id("bankStatementLines"),
    matchedType: v.union(
      v.literal("expense"), v.literal("revenue"),
      v.literal("reimbursement"), v.literal("payroll"),
    ),
    matchedId: v.string(),  // polymorphic, stringified Id
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Line not found");
    if (line.status === "confirmed") {
      throw new ConvexError("Line already confirmed — unmatch first");
    }
    // Verify target record exists (polymorphic fetch)
    const target = await ctx.db.get(args.matchedId as Id<"expenses" | "externalRevenue" | "reimbursementBatches" | "payrollEntries">);
    if (!target) throw new ConvexError(`Target ${args.matchedType} record not found`);

    await ctx.db.patch(args.lineId, {
      matchedType: args.matchedType,
      matchedId: args.matchedId,
      matchMethod: "linked_to_record",
      status: "suggested",       // manual match is suggestion until Confirm
      isAutoMatched: false,
    });
    return null;
  },
});
```

### Example: Confirm-line mutation (posts JE)
```ts
// convex/bankStatements/mutations.ts — NEW
export const confirmLine = mutation({
  args: { token: v.string(), lineId: v.id("bankStatementLines") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Line not found");
    if (line.status === "confirmed") throw new ConvexError("Already confirmed");
    if (!line.jeDebitAccountId || !line.jeCreditAccountId) {
      throw new ConvexError("Line has no JE accounts — classify first (set overrideCategoryAccountId or match a rule)");
    }

    const jeId = await createJournalEntryWithLines(ctx, {
      date: line.date,
      description: `Bank ${line.direction} — ${line.rawDescription.slice(0, 80)}`,
      sourceType: "bank_statement",
      sourceId: line._id,
      createdBy: user._id,
      lines: [
        buildDebitLine(line.jeDebitAccountId, line.amountIdr),
        buildCreditLine(line.jeCreditAccountId, line.amountIdr),
      ],
    });

    await ctx.db.patch(args.lineId, {
      status: "confirmed",
      confirmedAt: Date.now(),
      confirmedBy: user._id,
      confirmedJournalEntryId: jeId,
    });
    return jeId;
  },
});
```

### Example: Learn-from-override rule creation
```ts
// convex/bankKeywordRules/mutations.ts — NEW (manager+admin gated)
export const createFromOverride = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    ruleCode: v.string(),            // generated or user-edited; must match /^[A-Z]\d{2}$/
    // ... all other bankKeywordRules fields ...
  },
  handler: async (ctx, args) => {
    if (!/^[A-Z]\d{2}$/.test(args.ruleCode)) throw new ConvexError("Invalid ruleCode");
    const existing = await ctx.db
      .query("bankKeywordRules")
      .withIndex("by_ruleCode", q => q.eq("ruleCode", args.ruleCode))
      .first();
    if (existing) throw new ConvexError(`Rule ${args.ruleCode} already exists`);
    // ... (same catch-all uniqueness check as plain create) ...
    return await ctx.db.insert("bankKeywordRules", {
      ...args,
      createdBy: ctx.user._id,
      createdAt: Date.now(),
    });
  },
});
```

### Example: Revenue gap query
```ts
// convex/bankStatements/queries.ts — NEW
export const revenueGapByPeriod = query({
  args: {
    token: v.string(),
    periodStart: v.number(), // WIB bound epoch ms
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    // 1) All credit bank lines in period, grouped by linkedChannel
    const allCreditLines = await ctx.db
      .query("bankStatementLines")
      .withIndex("by_date", q => q.gte("date", args.periodStart).lte("date", args.periodEnd))
      .collect();
    const bankByChannel = new Map<string, number>(); // null → "(unallocated)"
    for (const l of allCreditLines) {
      if (l.direction !== "credit") continue;
      const key = l.linkedChannel ?? "(unallocated)";
      bankByChannel.set(key, (bankByChannel.get(key) ?? 0) + l.amountIdr);
    }

    // 2) externalRevenue grouped by source in same period
    const revRows = await ctx.db
      .query("externalRevenue")
      .withIndex("by_period", q => q.gte("periodStart", args.periodStart).lte("periodStart", args.periodEnd))
      .collect();
    const revBySource = new Map<string, number>();
    for (const r of revRows) revBySource.set(r.source, (revBySource.get(r.source) ?? 0) + (r.revenueGross ?? 0));

    // 3) Zip into rows (union of keys)
    const channels = new Set([...bankByChannel.keys(), ...revBySource.keys()]);
    return Array.from(channels).map(channel => {
      const bankCr = bankByChannel.get(channel) ?? 0;
      const extRev = channel === "(unallocated)" ? null : (revBySource.get(channel) ?? 0);
      const diff = bankCr - (extRev ?? 0);
      const diffPct = extRev === null || extRev === 0 ? null : (diff / extRev) * 100;
      return { channel, bankCr, extRev, diff, diffPct };
    });
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| P72: admin-only reconciliation route | P73: manager+admin per D-23 | This phase | Widen route guard + backend query role checks in lockstep |
| P72: read-only StatementReviewTable | P73: interactive split-view via new components | This phase | StatementReviewTable stays for "imported review" mode or is phased out |
| P72: no JE posting (D-20 deferred) | P73: Confirm posts via `createJournalEntryWithLines` | This phase | Adds `"bank_statement_reversal"` sourceType literal |
| P72: rule CRUD admin-only | P73: `createFromOverride` opens to manager+admin; CRUD page stays admin | This phase | Two entry paths with different gates |

**Deprecated/outdated:** Nothing deprecated in P73; P72 artifacts are augmented, not removed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `reimbursementBatches` join table is `reimbursementExpenses` with `batchId` FK | Pitfall 5 | Minor — planner will grep for the exact join table and adjust candidate-expansion UI. |
| A2 | `ExpenseSubmit.tsx` form body is extractable into a reusable component suitable for `<Dialog>` embedding | D-17 implementation path | Medium — if the form is hard-coupled to the route, plan must include a refactor-task to extract a `<ExpenseSubmitForm>` inner component. Inspected: form exists but we did not validate extract-ability in this research. |
| A3 | `AssetRegister.tsx` intake form can accept URL-param prefills | D-20 CapEx handoff | Medium — if it doesn't, P73 plan must include a small extension task on AssetRegister. |
| A4 | No pending P72 bugs on the match engine that would distort candidate results | General | Low — P72 completed with full test coverage (matchEngine.test.ts passing). |

## Open Questions

1. **How should batch-Confirm handle partial failures?**
   - What we know: CONTEXT D-08 says "all-or-nothing" recommended; UI-SPEC §6.4 says block Post if DR≠CR.
   - What's unclear: Convex mutations are atomic within one handler; multi-line batch = one handler
     = guaranteed atomic. Good. But if ONE line has missing `jeDebitAccountId` (e.g., classifier
     didn't match), the whole batch fails. Is that acceptable?
   - Recommendation: Planner should have batch-Confirm PRE-FILTER to lines where both JE accounts
     are set, and surface the excluded count in the preview modal ("3 lines skipped — no JE
     accounts assigned"). Keeps the batch all-or-nothing on the valid subset.

2. **Should `searchAllCandidates` query be typed per record type or polymorphic?**
   - What we know: Candidates come in 4 types with different shapes.
   - What's unclear: A single polymorphic response is harder to render; four typed queries means
     `SearchAllRecordsDialog` calls one per active tab.
   - Recommendation: Four typed queries (`searchExpenses`, `searchRevenue`, `searchReimbursements`,
     `searchPayroll`), each with same `{ amountIdr, dateStart?, dateEnd?, searchTerm }` args.
     Simpler typing, one-at-a-time UI flow matches D-06.

3. **How to detect & surface the candidate's current match state?**
   - If a reviewer sees a candidate in the right pane that's already matched to a DIFFERENT bank
     line, matching to the current line would silently overwrite the other side (bank → candidate
     is 1:1 from bank's side, but bank→candidate also needs to be 1:1 from candidate's side, per
     D-04).
   - Recommendation: `listCandidatesForLine` must annotate each candidate with
     `alreadyLinkedToLineId?: Id<"bankStatementLines">` via reverse lookup on
     `by_matched` index. UI disables (or warns on) matching to already-linked candidates.

4. **What happens on delete of a matched record?**
   - E.g., reviewer matches a line to an expense, then admin deletes the expense.
   - What we know: No cascade exists; `matchedId` would point to a deleted doc.
   - Recommendation: Either (a) soft-delete only pattern for already-matched records, or
     (b) `listCandidatesForLine`/UI treats `ctx.db.get(matchedId) === null` as an orphaned match
     and surfaces a "record deleted" tooltip with Unmatch CTA. Option (b) is lighter and doesn't
     require backend changes elsewhere.

5. **Concurrency on Confirm:** two managers clicking Confirm simultaneously.
   - Convex serializes transactions, but the second call will see `status === "confirmed"` and
     throw. UI should toast "Another user confirmed this line 2 seconds ago" on the duplicate error.

## Environment Availability

> N/A — Phase 73 has no new external dependencies. All libraries, build tools, and database
> infrastructure are already in place from prior phases. `npx convex dev`, `npm run build`,
> `npm run test`, and `npx playwright test` all work today.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 (unit + Convex-backend via convex-test) + Playwright (E2E) |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npm run test -- convex/bankStatements convex/bankKeywordRules src/components/bankReconciliation` |
| Full suite command | `npm run test && npm run type-check && npm run build` |
| E2E command | `npx playwright test tests/e2e/bank-reconciliation*.spec.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| BANK-03 | Manual match writes polymorphic FK and sets status=suggested | unit (convex-test) | `npm run test -- convex/bankStatements/__tests__/manualMatch.test.ts` | ❌ Wave 0 |
| BANK-03 | Unmatch clears FK + recomputes status + reverses JE if confirmed | unit (convex-test) | `npm run test -- convex/bankStatements/__tests__/unmatch.test.ts` | ❌ Wave 0 |
| BANK-03 | Confirm posts balanced JE via `createJournalEntryWithLines` | unit (convex-test) | `npm run test -- convex/bankStatements/__tests__/confirmLine.test.ts` | ❌ Wave 0 |
| BANK-03 | Batch Confirm exact-tier posts N JEs all-or-nothing | unit (convex-test) | `npm run test -- convex/bankStatements/__tests__/batchConfirm.test.ts` | ❌ Wave 0 |
| BANK-03 | Unmatch reversal JE has `sourceType="bank_statement_reversal"` + swapped DR/CR | unit (convex-test) | included in `unmatch.test.ts` | ❌ Wave 0 |
| BANK-03 | Manual match to already-linked candidate rejects with error | unit (convex-test) | included in `manualMatch.test.ts` | ❌ Wave 0 |
| BANK-03 | Manager role can call match/unmatch/confirm; kitchen & order_staff cannot | unit (convex-test) | included in `manualMatch.test.ts` (role matrix) | ❌ Wave 0 |
| BANK-03 | Split-view renders left pane, right pane, and action bar; selection flow works | E2E (Playwright) | `npx playwright test tests/e2e/bank-reconciliation-split-view.spec.ts` | ❌ Wave 0 |
| BANK-03 | CapEx flagged line shows Route to Asset Register and passes params | E2E (Playwright) | `npx playwright test tests/e2e/bank-reconciliation-capex.spec.ts` | ❌ Wave 0 |
| BANK-03 | Learn-from-override dialog saves a rule and future lines classify against it | E2E (Playwright) | `npx playwright test tests/e2e/bank-rules-learn-from-override.spec.ts` | ❌ Wave 0 |
| BANK-04 | `getStatementProgress` returns correct counts for each status | unit (convex-test) | `npm run test -- convex/bankStatements/__tests__/progress.test.ts` | ❌ Wave 0 |
| BANK-04 | Progress reflects live count after a match/unmatch/confirm mutation | unit (convex-test) | included in `progress.test.ts` | ❌ Wave 0 |
| BANK-04 | StatementHistoryList renders progress bar + counts per row | component test (vitest-jsdom) | `npm run test -- src/components/bankReconciliation/StatementHistoryList.test.tsx` | ❌ Wave 0 |
| BANK-04 (derived) | `revenueGapByPeriod` computes correct Bank/ExtRev/Diff per channel | unit (convex-test) | `npm run test -- convex/bankStatements/__tests__/revenueGap.test.ts` | ❌ Wave 0 |
| CLAUDE.md global | `npm run build` passes | type-check + vite build | `npm run build` | ✅ (existing) |
| Role-based route gating | `/bank-reconciliation` accessible to manager; `/bank-rules` not | E2E (Playwright) | `npx playwright test tests/e2e/bank-rules-perms.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- <changed-module>` (Vitest), plus `npm run type-check`.
- **Per wave merge:** `npm run test && npm run type-check` (full unit+backend suite).
- **Phase gate:** `npm run build && npm run test && npx playwright test tests/e2e/bank*.spec.ts`
  all green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `convex/bankStatements/__tests__/manualMatch.test.ts` — covers BANK-03 manual match + role matrix
- [ ] `convex/bankStatements/__tests__/unmatch.test.ts` — covers BANK-03 unmatch + reversal
- [ ] `convex/bankStatements/__tests__/confirmLine.test.ts` — covers BANK-03 single-line Confirm + JE
- [ ] `convex/bankStatements/__tests__/batchConfirm.test.ts` — covers BANK-03 batch exact-tier Confirm
- [ ] `convex/bankStatements/__tests__/progress.test.ts` — covers BANK-04 `getStatementProgress`
- [ ] `convex/bankStatements/__tests__/revenueGap.test.ts` — covers D-14 `revenueGapByPeriod`
- [ ] `convex/bankKeywordRules/__tests__/createFromOverride.test.ts` — covers D-10/D-12 rule creation
- [ ] `tests/e2e/bank-reconciliation-split-view.spec.ts` — covers BANK-03 click-to-match flow
- [ ] `tests/e2e/bank-reconciliation-capex.spec.ts` — covers D-20/D-21 CapEx handoff
- [ ] `tests/e2e/bank-rules-learn-from-override.spec.ts` — covers D-10/D-11 dialog
- [ ] `tests/e2e/bank-rules-perms.spec.ts` — covers D-23 role split
- [ ] `src/components/bankReconciliation/StatementHistoryList.test.tsx` — covers BANK-04 UI progress
- [ ] Fixture builders for bankStatement + bankStatementLines in `tests/helpers/` (if not present) — shared test setup

*(Convex-test is already in use for P72 — see `convex/bankStatements/__tests__/matchEngine.test.ts`
and `mutations.test.ts`. New test files follow the same pattern.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Session token via `useAuth()` + `requireRole(ctx, token, roles)` — no change from P72. |
| V3 Session Management | yes | `useSessionMutation` (convex-helpers) for protected mutations; session cookie handling unchanged. |
| V4 Access Control | yes | `requireRole(ctx, args.token, ["manager","admin"])` on every new mutation; `["admin"]` preserved on rule CRUD (not `createFromOverride`). Route guard `allowedRoles` on `<ProtectedRoute>`. |
| V5 Input Validation | yes | Convex validators on every mutation arg (v.id, v.string, v.union literals). `ruleCode` regex `/^[A-Z]\d{2}$/` matches existing. Amount = server-side `Number.isInteger` check before any JE post (already enforced by `createJournalEntryWithLines`). |
| V6 Cryptography | no | No new crypto. File-hash dedup (SHA-256) was P72 scope and unchanged. |
| V7 Error Handling | yes | `humanizeError` already extracts ConvexError message without leaking request-id/handler-path (`BankReconciliationPage.tsx:87-92`). Reuse on all new error paths. |
| V8 Data Protection (PII) | yes | `accountNumber` and `accountHolder` are PII. `maskAccount` is the canonical helper; never log raw account numbers in toasts, errors, or URLs. |
| V14 Config | yes | No new config/env var introduced. |

### Known Threat Patterns for Convex + React

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Elevation by arg-skipping `token` | Spoofing/Elevation | `requireRole` throws on missing token; validator also enforces `v.string()`. |
| Tampering with `matchedId` to match someone else's record | Tampering | Target-fetch via `ctx.db.get(matchedId)` validates record exists; still, Convex Id strings are opaque so non-guessable. |
| Bypassing Confirm to post JE directly via dashboard | Elevation | `createJournalEntryWithLines` callers must go through the mutation wrapper; JE-06 rule. Dashboard admin can invoke the mutation but requires admin session — acceptable. |
| PII leak via toast on duplicate bank statement upload | Information disclosure | Duplicate error message already masks account number (`mutations.ts:104`). Reconcile with same mask in any new error surfaces. |
| SQL-style injection in search dialog | Tampering | Not applicable — Convex queries are typed, not raw SQL. Substring matching uses JS `toLowerCase().includes()` (safe). |
| Cross-user Unmatch race | Tampering / Elevation | Convex serializes the mutation; first writer wins. Second writer sees `status !== "confirmed"` and throws a clear error. |
| Reversing a reversal (double-unmatch) | Tampering | Mutation guards on `line.reversalJournalEntryId` already set OR `line.status !== "confirmed"`. |
| Direct `ctx.db.insert` on journalEntries bypassing validator | Tampering | JE-06 rule (already established). Planner must NOT import `ctx.db.insert` for journalEntries outside `journalEngine.ts`. |

## Sources

### Primary (HIGH confidence — verified in this session)
- `.planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md` — locked decisions
- `.planning/phases/73-bank-reconciliation-ui-workflow/73-UI-SPEC.md` — UI design contract
- `.planning/REQUIREMENTS.md` — BANK-03, BANK-04 acceptance criteria
- `.planning/ROADMAP.md` — phase ordering and scope boundary
- `CLAUDE.md` — project conventions (branch-per-phase, plan template, pitfalls)
- `convex/schema.ts:1840–2043` — journalEntries / bankStatements / bankStatementLines / bankKeywordRules schemas
- `convex/lib/journalEngine.ts` — `createJournalEntryWithLines`, `NON_REVERSIBLE_TYPES`, `JournalSourceType`
- `convex/bankStatements/mutations.ts` — existing `createFromParsedStatement`
- `convex/bankStatements/queries.ts` — existing `listStatements`, `getStatement`, `findByFileHash`, `listLines`
- `convex/bankStatements/matchEngine.ts` — `classifyLine`, `findLinkedRecord`, `LinkageResult` type
- `convex/bankKeywordRules/mutations.ts` — existing seedDefaults, create/update/deactivate + ruleCode regex + catch-all uniqueness guard
- `src/pages/BankReconciliationPage.tsx` — existing wizard + ErrorSection + humanizeError
- `src/hooks/convex/useBankReconciliation.ts` — existing hook facade
- `src/components/bankReconciliation/StatementHistoryList.tsx`, `StatementReviewTable.tsx` — existing UI
- `src/App.tsx:432-450` — existing route gates (admin-only)
- `src/components/layout/Header.tsx:119` — existing sidebar entry
- `src/lib/types.ts:710-822` — permission flag matrix
- `.planning/config.json` — workflow config (nyquist_validation assumed enabled; triple_review enabled)

### Secondary (MEDIUM confidence)
- `convex/manualJournal/mutations.ts` — pattern for `protectedMutation` with JE posting
- `convex/expenses/mutations.ts` — `createDraft`/`submitExpense`/`approveExpense` shape for inline-create reuse reference

### Tertiary (LOW confidence — flagged in Assumptions Log)
- None of the research claims rely on tertiary sources. The A1–A4 assumptions are listed for
  planner verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in `package.json`; no new deps.
- Architecture: HIGH — patterns verified against existing P72 code + journalEngine.
- Pitfalls: HIGH — NON_REVERSIBLE_TYPES guard verified directly; other pitfalls derive from
  Convex platform semantics + CONTEXT decisions.
- Validation: HIGH — vitest/playwright infra in use for P72 bank tests already.
- Security: MEDIUM — ASVS coverage is best-effort, no penetration testing performed.

**Research date:** 2026-04-15
**Valid until:** 2026-04-30 (the Convex + React ecosystems move fast; re-verify if this phase hasn't
started in 2 weeks)
