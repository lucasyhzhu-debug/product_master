# Phase 73: Bank Reconciliation UI & Workflow - Research

**Researched:** 2026-04-14
**Domain:** Convex backend mutations + React split-view UI on top of existing P72 bank reconciliation data pipeline
**Confidence:** HIGH (codebase is fully explored; P72 primitives are in place; every extension point verified in source)

## Summary

Phase 73 is a pure **extension phase** on top of shipped Phase 72 infrastructure. All schema tables (`bankStatements`, `bankStatementLines`, `bankKeywordRules`), the read-only review surface (`/bank-reconciliation`), the hook facade (`useBankReconciliation.ts`), and the `createJournalEntryWithLines` entry point already exist. P73 adds:

1. **Schema additions** (minimal) — 8 audit fields on `bankStatementLines` (D-25), 1 new literal `"bank_statement_reversal"` on `journalEntries.sourceType` (D-26), and one new index `by_statement_channel_date` on `bankStatementLines` for the Revenue Gap query.
2. **Five new mutations** on `convex/bankStatements/mutations.ts` — `manualMatch`, `unmatch`, `confirmLine`, `batchConfirm`, plus one new mutation `createFromOverride` on `convex/bankKeywordRules/mutations.ts`.
3. **Two new queries** — `getStatementProgress(statementId)` and `getRevenueGap(periodStart, periodEnd)`.
4. **Frontend rewrite** of `BankReconciliationPage.tsx` — Tabs shell (Statements / Review / Revenue Gap / Rules) wrapping the existing wizard + new split-view workspace + new Revenue Gap table.
5. **Three dialog components** — learn-from-override rule, batch-confirm preview, inline record creation (thin wrappers around existing forms).

**Primary recommendation:** Wave split = **Schema + Backend mutations → Split-view UI + hooks → Revenue Gap tab → Inline create + CapEx handoff → Polish/E2E**. Reactivity lives in a dedicated `getStatementProgress` query (not derived in the hook) so both the split-view header AND the history list subscribe to the same source. Mirror `AssetRegister.tsx` for the tab pattern (it already uses the shadcn `Tabs` primitive). Post reversal JEs via `createJournalEntryWithLines` directly with `buildReversedLines` — do **NOT** use `createReversalEntry` (it blocks `"bank_statement"` source type explicitly per `convex/lib/journalEngine.ts:75`).

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Ship all of — core split-view + manual match/unmatch, JE posting on Confirm, learn-from-override rule creation, revenue gap dashboard tab, inline record creation, CapEx handoff to Asset Register.
- **D-02:** Click-to-select both sides + Match button. Two panes on `/bank-reconciliation`. Left = bank lines filtered to `status IN ('unmatched', 'suggested', 'auto_matched')`. Right = candidate records filtered by selected line's amount/date.
- **D-03:** Line-level selection model. One bank line at a time; selecting different line replaces selection.
- **D-04:** 1:1 match cardinality only. Reimbursement batches + payroll batches pre-aggregate N items. No schema change to `matchedType`/`matchedId`.
- **D-05:** Default candidate filter = amount exact + date within ±3 days (mirrors P72 D-14). Group by type (Reimbursement Batches, Expenses, Payroll, Revenue). Empty groups show "(0)".
- **D-06:** Escape hatch = `🔍 Search all records` button. Widens to all records of matching type by amount/name/description. Does not mutate default filter.
- **D-07:** Explicit `[Confirm]` per line + batch `[Confirm all exact-tier]`. Batch scans `confidence="exact"` AND `status IN ('auto_matched','suggested')`.
- **D-08:** Batch Confirm preview modal. Shows count, summary grouped by DR/CR account with totals, grand total balance sanity gate (block Post if mismatched). No 10-second undo window.
- **D-09:** Unmatch = full reversal. Clear `matchedType/Id/matchMethod` (linked-to-record matches only — preserve Layer A rule classification). Recompute status. If was `confirmed`, create reversal JE via `createJournalEntryWithLines` with swapped DR/CR and description `"Reversed by unmatch on {wibDate} by {user.name}"`. Both JEs stay in ledger.
- **D-10:** Learn-from-override triggered when user edits `overrideCategoryAccountId`. Dialog offers save-as-rule.
- **D-11:** Editable pattern — pre-fill `counterpartyPatterns`, `descriptionPatterns`, `direction`, `matchType`, `descriptionPatternsMode`, `confidence`, `priority`, `plSection`, `categoryAccountId`, `jeDebitAccountId`, `jeCreditAccountId` from the override. User can edit ALL fields.
- **D-12:** Manager + admin can save rules via override dialog (dedicated `createFromOverride` mutation). `/bank-rules` CRUD stays admin-only per P72 D-19. DIVERGES from P72 D-19.
- **D-13:** New Revenue Gap tab. Tab bar = `[Statements] [Review] [Revenue Gap] [Rules]`. Prefer integrating Rules as tab.
- **D-14:** Revenue Gap rows = distinct `linkedChannel` values + synthetic `(unallocated)` row for `linkedChannel IS NULL`. Columns = `Channel | Bank Credits | External Revenue | Diff | Diff %`. Show `∞`/⚠ when ExtRev=0 and Bank>0.
- **D-15:** Row drill-down → Review tab filtered by channel + period.
- **D-16:** Inline create for expense, revenue, reimbursement record types.
- **D-17 (critical):** Inline expense-create MUST route through **standard** expense submission flow. Pre-fill `date`, `amount`, `description`, `vendorName`. Reviewer MUST fill `submittedBy` (picker over active users), `receiptFile` (upload), `expenseCategory`/`accountId`. Save via standard path with status=`submitted` (NOT `approved`). Bank line auto-matches but stays `suggested` until approval + Confirm.
- **D-18:** Revenue inline-create → `externalRevenue` creation dialog pre-filled with `transactionDate`, `revenueGross`, `source` (if `linkedChannel` detected).
- **D-19:** Reimbursement inline-create → batch creation dialog pre-filled with `totalAmount`, `createdAt`.
- **D-20:** CapEx lines (flag `capex_needs_asset_register`) → `[Route to Asset Register]` replaces `[Confirm]`. Navigates to `/asset-register/new` with pre-fill (URL params vs sessionStorage — planner's call).
- **D-21:** JE deferred until asset saved. Bank line stays `suggested` until asset registered, then auto-matches to the asset's acquisition expense and becomes confirmable.
- **D-22:** Existing asset detection (vendor + cost + purchaseDate within ±3 days) surfaces "Link to existing?" prompt.
- **D-23:** Manager + admin for all reconciliation actions. `kitchen`/`order_staff` blocked at route guard. Rule CRUD at `/bank-rules` stays admin-only.
- **D-24:** Progress indicator two surfaces, single source. Header shows `{N matched / N suggested / N unmatched}`, `{X}% reconciled`, `{N confirmed}` sub-count. History list row shows mini progress bar. Counts from query `SELECT COUNT(*) GROUP BY status FROM bankStatementLines WHERE statementId=?`.
- **D-25:** Add audit fields to `bankStatementLines`: `confirmedAt`, `confirmedBy`, `confirmedJournalEntryId`, `reversedAt`, `reversedBy`, `reversalJournalEntryId`, `createdExpenseId`, `createdRevenueId`, `createdReimbursementId`.
- **D-26:** Add `"bank_statement_reversal"` literal to `journalEntries.sourceType` union (Option 1, cleaner than reusing `"bank_statement"`).

### Claude's Discretion

- Progress bar colors, animation, responsive behavior
- Dialog confirmation/error message copy
- Keyboard shortcuts (suggested: `Enter`=Match, `Esc`=clear selection, `↑/↓`=navigate lines)
- How to display Diff % for ∞ case
- Mobile/tablet stacking below 900px
- Counterparty/keyword extraction heuristic for learn-from-override pre-fill
- Batch Confirm granularity (recommend **all-or-nothing**)
- Tab vs separate route for Rules (recommend **tab integration**)
- Tooltip copy on badges
- Pagination/virtualization thresholds
- CapEx pre-fill mechanism (URL params vs sessionStorage)

### Deferred Ideas (OUT OF SCOPE)

- 1:N / N:1 split matching
- User-configurable match tolerances
- 10-second undo window after batch Confirm
- Mobile-first split-view
- Global reconciliation status dashboard tile (Phase 77)
- Auto-post JE on Match
- Drag-and-drop matching UX
- Full documented hotkey scheme
- Batch historical re-categorisation after rule changes

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BANK-03 | Manual match/unmatch via split-view UI | Split-view component (Wave 2), `manualMatch` + `unmatch` mutations (Wave 1), `listLines` query with `statusFilter` already exists in `convex/bankStatements/queries.ts`. |
| BANK-04 | Per-statement matched/unmatched/suggested counts | New `getStatementProgress(statementId)` query using existing `by_statement_status` compound index, consumed by both split-view header and `StatementHistoryList`. |

## Project Constraints (from CLAUDE.md)

- **Branch-per-phase:** must run on `feature/73-*` branch, never commit direct to `main`. Verify `git branch --show-current` before starting.
- **`npm run build` MUST pass before merge.**
- **No dynamic imports in Convex** (static only — dynamic `import()` returns 204 in prod).
- **Auth pattern:** every protected mutation takes `token: v.string()` arg → `requireRole(ctx, args.token, [...])` → strip token from insert payload via `const { token: _, ...data } = args`.
- **Convex IDs are typed strings** (`Id<"tableName">`, not numbers).
- **Convex queries return `undefined` while loading** — always guard in UI.
- **camelCase field names** in Convex (not snake_case).
- **Deep copy components** when versioning (not relevant here but canonical).
- **React hooks order** — no hooks after early returns.
- **CHANGELOG.md** ALWAYS updated after merge.
- **Windows path limit:** phase directory `73-bank-reconciliation-ui-workflow` is 38 chars — safe under 50-char rule.

## Standard Stack

### Core (Already Installed — Verified via `package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| convex | ^1.31.7 | Backend / reactive DB | Project standard [VERIFIED: package.json] |
| react | ^19.2.0 | UI | Project standard [VERIFIED: package.json] |
| react-router | ^7.13.0 | Routing, URL params for CapEx handoff | Project standard [VERIFIED: package.json] |
| convex-helpers | ^0.1.112 | `useSessionMutation` for session-injected mutations | Already used in `useBankReconciliation.ts` [VERIFIED: source] |
| @radix-ui/react-dialog | via shadcn | Modal dialogs (batch preview, override, inline create) | 45 usages in `src/components/ui/dialog.tsx` [VERIFIED: Grep count] |
| @radix-ui/react-tabs | via shadcn `Tabs` | Tab bar for Statements / Review / Revenue Gap / Rules | Used in `AssetRegister.tsx`, `InventoryManager.tsx` (8 files) [VERIFIED: Grep] |
| sonner | existing | Toast notifications after Confirm/Unmatch | Project standard [VERIFIED: CLAUDE.md] |
| lucide-react | existing | Icons | Project standard [VERIFIED: CLAUDE.md] |

### Nothing new to install

The phase is a pure extension. `xlsx@0.20.3` (SheetJS CDN), `papaparse`, `fastest-levenshtein` are P72 dependencies that P73 does **not** touch. [VERIFIED: `npm view xlsx version` returns 0.18.5 on registry — confirms we stay on the SheetJS CDN build per CLAUDE.md §15.]

**Installation:** None required.

## Architecture Patterns

### Recommended File Structure

```
convex/
├── bankStatements/
│   ├── mutations.ts           # EXTEND: add manualMatch, unmatch, confirmLine, batchConfirm
│   ├── queries.ts             # EXTEND: add getStatementProgress, getRevenueGap
│   └── reconcileHelpers.ts    # NEW: pure helpers for reversal line building, status recomputation
├── bankKeywordRules/
│   └── mutations.ts           # EXTEND: add createFromOverride (manager+admin gated)
└── schema.ts                  # EXTEND: D-25 audit fields, D-26 sourceType literal, add by_statement_channel_date index

src/
├── pages/
│   └── BankReconciliationPage.tsx         # REWRITE: wrap current wizard in Tabs shell
├── components/bankReconciliation/
│   ├── StatementHistoryList.tsx           # EXTEND: add counts + mini progress bar column (D-24)
│   ├── ReviewWorkspace.tsx                # NEW: split-view orchestrator (selection state, fetch, actions)
│   ├── BankLinesPane.tsx                  # NEW: left pane — filter/select bank lines
│   ├── CandidateRecordsPane.tsx           # NEW: right pane — grouped candidate list
│   ├── CandidateSearchDialog.tsx          # NEW: full-search escape hatch (D-06)
│   ├── BatchConfirmPreviewDialog.tsx      # NEW: D-08 modal with DR/CR balance gate
│   ├── LearnFromOverrideDialog.tsx        # NEW: reuses RuleFormDialog fields (D-10/D-11)
│   ├── RevenueGapTable.tsx                # NEW: D-14 per-channel table + drill-down
│   ├── StatementProgressHeader.tsx        # NEW: D-24 header with progress bar
│   └── inline-create/
│       ├── CreateExpenseFromLineDialog.tsx      # NEW: wraps ExpenseSubmit form (D-17)
│       ├── CreateRevenueFromLineDialog.tsx      # NEW: externalRevenue creation (D-18)
│       └── CreateReimbursementFromLineDialog.tsx # NEW: reimbursement batch creation (D-19)
└── hooks/convex/useBankReconciliation.ts  # EXTEND: 8 new hooks (see below)
```

### Pattern 1: Tab Shell Mirroring `AssetRegister.tsx`

**What:** `AssetRegister.tsx:36` already uses the shadcn `Tabs` primitive for its status filter. Mirror that vocabulary.

**When to use:** BankReconciliationPage root.

**Example (verified from source):**
```typescript
// Source: src/pages/AssetRegister.tsx:36
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Pattern (planner):
<Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
  <TabsList>
    <TabsTrigger value="statements">Statements</TabsTrigger>
    <TabsTrigger value="review">Review</TabsTrigger>
    <TabsTrigger value="revenue-gap">Revenue Gap</TabsTrigger>
    <TabsTrigger value="rules">Rules</TabsTrigger>
  </TabsList>
  <TabsContent value="statements">{/* existing wizard + history list */}</TabsContent>
  <TabsContent value="review">{/* new ReviewWorkspace */}</TabsContent>
  ...
</Tabs>
```

**InventoryManager vs AssetRegister:** `InventoryManager.tsx:36` uses `useState<"packaging" | "ingredients" | "finished_goods">` — same shadcn `Tabs` but 3 tabs; `AssetRegister` uses 4 tabs (status filter) with `Tabs` + `TabsList` + `TabsTrigger`. Closer to P73's 4-tab layout; pick AssetRegister as the canonical template.

### Pattern 2: `getStatementProgress` Query — Dedicated, Not Derived

**What:** Single reactive query the split-view header AND `StatementHistoryList` subscribe to.

**When:** D-24 says "single source." The current `useBankStatementLines` returns every line (up to 5000) — using it for counts means the history list has to fetch every line of every statement just to render a progress bar. Expensive.

**Example (planner):**
```typescript
// Source: convex/bankStatements/queries.ts (extend)
export const getStatementProgress = query({
  args: { token: v.string(), statementId: v.id("bankStatements") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    // One pass per status using the existing by_statement_status compound index.
    const statuses = ["unmatched", "auto_matched", "suggested", "confirmed"] as const;
    const counts = Object.fromEntries(
      await Promise.all(
        statuses.map(async (s) => [
          s,
          (await ctx.db
            .query("bankStatementLines")
            .withIndex("by_statement_status", (q) =>
              q.eq("statementId", args.statementId).eq("status", s),
            )
            .collect()).length,
        ]),
      ),
    ) as Record<typeof statuses[number], number>;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const matched = counts.auto_matched + counts.suggested + counts.confirmed;
    return { ...counts, total, matched, percent: total === 0 ? 0 : Math.round((matched / total) * 100) };
  },
});
```
Note: Convex reactivity will re-fire automatically whenever any of the 5000 rows change status — matches D-24 "live-updating" [VERIFIED: `by_statement_status` index exists at `convex/schema.ts:1989`].

**Trade-off:** For `StatementHistoryList`, calling `getStatementProgress` once per row is N queries. Recommend a sibling query `getStatementProgressBatch(statementIds: Id[])` that fans out internally for the history list — OR denormalize progress onto `bankStatements` header and update on mutation. **Planner's call** — recommend the batch query (avoids schema churn).

### Pattern 3: Reversal JE — Direct `createJournalEntryWithLines`, NOT `createReversalEntry`

**Gotcha (VERIFIED in source).** `convex/lib/journalEngine.ts:75` explicitly lists `"bank_statement"` in `NON_REVERSIBLE_TYPES`:

```typescript
// Source: convex/lib/journalEngine.ts:66-75
const NON_REVERSIBLE_TYPES: readonly string[] = [
  "manual",
  "expense_void",
  "reimbursement_void",
  "payroll_void",
  "depreciation_void",
  "asset_acquisition",
  "bank_statement", // Phase 72+: no automated reversal — correction via manual journal entry
];
```

Calling `createReversalEntry(ctx, confirmedJournalEntryId, "bank_statement_reversal", userId)` will throw `"Cannot reverse an bank_statement entry"`. The comment even says "correction via manual journal entry" — P73 supersedes that.

**Recommended approach:** Use the `buildReversedLines` helper (already exported, pure, tested) and call `createJournalEntryWithLines` directly:

```typescript
// Source: convex/lib/journalEngine.ts:212-219 (helper)
export function buildReversedLines(lines: JournalLine[]): JournalLine[] {
  return lines.map((line) => ({
    accountId: line.accountId,
    debitAmount: line.creditAmount,
    creditAmount: line.debitAmount,
    description: line.description,
  }));
}

// P73 usage (planner):
const originalLines = await ctx.db
  .query("journalEntryLines")
  .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", line.confirmedJournalEntryId))
  .collect();

const reversalId = await createJournalEntryWithLines(ctx, {
  date: Date.now(), // OR original.date — planner's call; for reconciliation reversals use WIB-now since the reversal is a current-period accounting event
  description: `Reversed by unmatch on ${wibDate(Date.now())} by ${user.name}`,
  sourceType: "bank_statement_reversal", // NEW literal per D-26
  sourceId: line._id,
  createdBy: user._id,
  lines: buildReversedLines(originalLines.map((l) => ({
    accountId: l.accountId,
    debitAmount: l.debitAmount,
    creditAmount: l.creditAmount,
    description: l.description,
  }))),
});
// Then patch the bank line with reversedAt/reversedBy/reversalJournalEntryId (D-25).
// Original JE stays untouched — NO patch to journalEntries.isReversed (both JEs co-exist in ledger per D-09).
```

**Important:** `NON_REVERSIBLE_TYPES` should be updated to also include `"bank_statement_reversal"` to prevent recursive reversals. [CITED: `convex/lib/journalEngine.ts:66-75`]

### Pattern 4: Inline Expense Create = Open `ExpenseSubmit.tsx` in a Dialog

**Verification (from source):** `src/pages/ExpenseSubmit.tsx` is a full-page form (not dialog-ready). It reads `useSearchParams` for `?edit=ID` and navigates via `useNavigate`. Not currently dialog-compatible.

**Recommendation:** Do **NOT** embed `ExpenseSubmit.tsx` inside a dialog directly (too invasive). Instead:
- Extract the form's field cluster into `ExpenseForm.tsx` (pure form, no routing)
- `ExpenseSubmit.tsx` wraps `ExpenseForm` + page chrome
- `CreateExpenseFromLineDialog.tsx` wraps `ExpenseForm` + dialog chrome + pre-filled initial values + `submittedBy` picker

This preserves D-17's "standard submission flow" — both paths call the same `useCreateExpenseDraft` + `useSubmitExpense` hooks [VERIFIED: `convex/expenses/mutations.ts:64` has `createDraft`, line 235 has `submitExpense`].

**Alternative (simpler):** Use `react-router` nested route with `<Outlet>` + modal overlay — navigate to `/expenses/new?fromBankLine={id}&prefillAmount=...` which renders ExpenseSubmit as the page. Trade-off: loses the "stay in split-view" UX. **Recommend the form-extraction path.**

### Pattern 5: CapEx Handoff — URL Query Params

**Recommendation: URL params** (not sessionStorage).

Rationale:
- **Shareable / debuggable:** a dev can paste `/asset-register/new?fromBankLine=abc&cost=50000000&purchaseDate=1730...&vendor=...` and reproduce.
- **React Router 7 pattern:** `useSearchParams` is canonical; already used by `ExpenseSubmit.tsx:10`.
- **No state leakage:** sessionStorage persists until manual clear; accidental tab-close + reopen on a different asset gets confused.
- **Browser back-nav works:** hitting "back" from AssetRegister returns to split-view with the correct line still selected (if split-view reads its own `?selectedLineId` param).

AssetRegister currently does NOT read search params [VERIFIED: `Grep searchParams src/pages/AssetRegister.tsx` returns 0 matches] — P73 needs to add that.

### Pattern 6: `by_statement_channel_date` Compound Index (NEW)

For the Revenue Gap query (D-14), we need `SUM(amountIdr) GROUP BY linkedChannel` for credit lines in a period. Currently there is **no index on `linkedChannel`** — only `by_statement`, `by_statement_status`, `by_matched`, `by_date` [VERIFIED: `convex/schema.ts:1988-1991`].

**Recommendation:** Add a single compound index on `bankStatementLines`:
```typescript
.index("by_channel_date", ["linkedChannel", "date"])
```
Lets the revenue gap query range-scan by date and group by channel in a single pass. `direction='credit'` filter happens post-scan (small set after date narrowing). `(unallocated)` bucket comes from `linkedChannel IS undefined` rows (index still covers them).

### Anti-Patterns to Avoid

- **Calling `createReversalEntry` for bank-statement reversals** — throws by design. Use `buildReversedLines` + `createJournalEntryWithLines` directly.
- **Deriving progress counts in the page hook** by fetching all lines — doesn't scale and wastes the compound index. Use `getStatementProgress` query.
- **Embedding the ExpenseSubmit page inside a dialog via iframe or `createPortal`** — breaks routing. Extract the form component.
- **Using `Date.now()` directly in Convex for the month string** — must use `getWibComponents` from `convex/lib/periodRange.ts` [VERIFIED: `convex/bankStatements/mutations.ts:34`].
- **Skipping the `createFromOverride` mutation and reusing `create`** — `create` is `requireRole(["admin"])` per P72 D-19; widening it breaks the admin-only CRUD contract. Dedicated mutation keeps the surfaces separate per D-12.
- **Patching `journalEntries.isReversed=true` on unmatch** — D-09 says **both JEs stay in ledger** (audit trail). Unlike `createReversalEntry` which flips the original, P73 leaves the original untouched.
- **Allowing batch Confirm to partially succeed** — recommend all-or-nothing per D-08 sanity gate. Validate every line's DR/CR before any `createJournalEntryWithLines` call; throw before the first insert if any line is imbalanced or missing accounts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reversal line construction | Custom debit/credit swap | `buildReversedLines` from `convex/lib/journalEngine.ts:212` | Already pure, tested, exported |
| JE creation | Direct `ctx.db.insert("journalEntries", ...)` | `createJournalEntryWithLines` from `convex/lib/journalEngine.ts:236` | JE-06 rule — no direct JE inserts outside this file |
| Period date range in WIB | `new Date()` arithmetic | `getWibComponents` from `convex/lib/periodRange.ts` | WIB timezone correctness; used by P72 parser |
| Front-end date formatting | Ad-hoc `toLocaleDateString` | `src/lib/dateUtils.ts` helpers | CLAUDE.md mandate: never format dates ad-hoc |
| Tabs UI | Custom Tabs component | shadcn `Tabs` from `@/components/ui/tabs` | Used in 8 pages already |
| Dialog chrome | Custom modal | shadcn `Dialog` from `@/components/ui/dialog` (45 usages) | Project standard |
| Rule CRUD form | Duplicate form | Reuse `RuleFormDialog.tsx` fields | Per CONTEXT §code_context |
| Expense form fields | New form | Extract from `ExpenseSubmit.tsx` into `ExpenseForm.tsx` | Preserves D-17 standard flow |
| Session-scoped mutation | Manual token passing | `useSessionMutation` from `convex-helpers/react/sessions` | Already used in hook facade |
| Confidence/status literal types | Define anew | Already in `bankStatementLines` schema union | Single source of truth |

**Key insight:** P73 is almost entirely composition of existing primitives. The discipline is **not** inventing new abstractions — it is stitching the schema extensions + 5 mutations into the existing hook facade and wrapping the existing forms in dialog shells.

## Runtime State Inventory

> P73 is a greenfield-extension phase on top of P72. No rename or string refactor. Check categories explicitly per protocol.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — P73 adds fields, does not rename any | None |
| Live service config | None — no external services touched | None |
| OS-registered state | None — no cron or task changes (P72 has no cron) | None |
| Secrets/env vars | None — reuses existing Convex auth session | None |
| Build artifacts | None — pure code addition; TS compile will catch any stale `_generated/api.d.ts` via `npx convex dev` | Convex codegen auto-runs |

**Nothing found in any category** — verified by inspecting schema diff intent (additive only) and confirming no cron/task/external-service integration.

## Common Pitfalls

### Pitfall 1: `bank_statement` is on `NON_REVERSIBLE_TYPES` list

**What goes wrong:** First-pass reversal implementation calls `createReversalEntry` → throws `"Cannot reverse an bank_statement entry"`. [VERIFIED: `convex/lib/journalEngine.ts:66-75`]
**Why:** P72 explicitly blocked automated reversal at the engine level (comment says "correction via manual journal entry"). P73 supersedes with its own reversal flow.
**How to avoid:** Call `createJournalEntryWithLines` directly with `buildReversedLines`. Also add `"bank_statement_reversal"` to `NON_REVERSIBLE_TYPES` to prevent recursive reversals.
**Warning signs:** Runtime error at Unmatch of a confirmed line.

### Pitfall 2: Route Permission Mismatch

**What goes wrong:** `App.tsx:433` currently gates `/bank-reconciliation` to `allowedRoles={["admin"]}`. D-23 says manager+admin. Shipping P73 without widening the route → managers hit a 403 even though mutations allow them.
**How to avoid:** Update `App.tsx:433` to `allowedRoles={["admin", "manager"]}` as part of the schema/route wave. Keep `/bank-rules` (line ~441) admin-only.
**Warning signs:** Manager-role test user sees the permission-denied page.

### Pitfall 3: Stale `admin-only` Guard on P72 Queries

**What goes wrong:** `convex/bankStatements/queries.ts` gates every query with `requireRole(ctx, args.token, ["admin"])` [VERIFIED: lines 19, 34, 52, 76]. D-23 widens all reconciliation actions to manager+admin. Split-view page runs as a manager → `listStatements` / `getStatement` / `listLines` throws.
**How to avoid:** Widen all 4 P72 bank queries to `["manager", "admin"]`. Bank keyword rule queries stay admin-only (D-12: only `createFromOverride` widens).
**Warning signs:** Managers see the empty upload page, history list returns nothing, split-view can't load lines.

### Pitfall 4: `linkedChannel` Has No Index

**What goes wrong:** Revenue Gap query scans every `bankStatementLines` row in a period. Acceptable at 67 lines/statement but becomes O(N) across all statements for the period.
**How to avoid:** Add `by_channel_date` compound index (see Pattern 6). Two-field `[linkedChannel, date]` works because `linkedChannel` is optional — Convex indexes include rows with undefined values and supports `.eq()` on them.
**Warning signs:** Revenue Gap tab spinner on statements with >500 lines per month.

### Pitfall 5: Partial Batch Confirm

**What goes wrong:** User clicks `[Confirm all exact-tier]` on 40 lines. Line 23 has a missing `jeDebitAccountId` (data integrity hole from a deleted rule). Halfway-through commit leaves 22 confirmed + 18 not.
**How to avoid:** Two-pass mutation — first pass validates every line (all have both `jeDebitAccountId` and `jeCreditAccountId`, amount > 0, status is eligible), throws a single error listing all offenders; second pass calls `createJournalEntryWithLines` for each. D-08 sanity gate also requires grand total DR=CR; enforce in the preview query AND the server mutation (belt-and-suspenders).
**Warning signs:** Preview says "posted 22 of 40" after failure.

### Pitfall 6: Inline Expense Auto-Approval Bug

**What goes wrong:** Shortcut-minded impl writes the expense directly with `status="recorded"` / `status="approved"` because "the money already left the bank." D-17 explicitly rejects this.
**How to avoid:** Call `useCreateExpenseDraft` → `useSubmitExpense` just like the standard form — the expense must pass through the approval queue like any other, even though the money left the bank. Bank line `status` stays `suggested` until the expense is approved AND the reviewer clicks Confirm on the line.
**Warning signs:** Inline-created expense shows up as "Recorded" not "Submitted" in MyExpenses.

### Pitfall 7: Reactivity on Progress Counts — Over-Fetching

**What goes wrong:** Splitting `listLines` with a `statusFilter` per pane creates 4 subscriptions for the one split-view workspace — each re-fires on any mutation, even reclassifications that don't affect the user's current view.
**How to avoid:** Use `getStatementProgress` for header counts (small, reactive); use a single `listLines` without filter + client-side filter for the left pane (already all lines the reviewer cares about ≤ 67 typically); candidate pane fetches its records from `expenses`/`externalRevenue`/etc. queries — does NOT refetch bank lines.
**Warning signs:** UI flickers on every unrelated statement mutation.

### Pitfall 8: Windows Path Length on Worktree

**What goes wrong:** Phase directory name `73-bank-reconciliation-ui-workflow` is 38 chars — safe. But git worktree creates `.worktrees/73-bank-reconciliation-ui-workflow` which appends to the base path. Build artifacts in `convex/_generated/` can balloon to >260 chars on deep dir nests.
**How to avoid:** Verify `git worktree add` succeeds before starting execution.
**Warning signs:** "The filename or extension is too long" errors during `npm install` in the worktree.

## Code Examples

### Manual Match Mutation (verified contract)

```typescript
// Source pattern: convex/bankStatements/mutations.ts existing P72 createFromParsedStatement
// convex/bankStatements/mutations.ts (extend)
export const manualMatch = mutation({
  args: {
    token: v.string(),
    lineId: v.id("bankStatementLines"),
    matchedType: v.union(
      v.literal("expense"),
      v.literal("revenue"),
      v.literal("reimbursement"),
      v.literal("payroll"),
    ),
    matchedId: v.string(), // stringified Convex Id (polymorphic, per P72 D-02)
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Bank line not found");
    if (line.status === "confirmed") {
      throw new ConvexError("Line already confirmed; unmatch first");
    }
    // Preserve Layer A classification (originalCategory, jeDebit/Credit, etc.)
    await ctx.db.patch(args.lineId, {
      matchedType: args.matchedType,
      matchedId: args.matchedId,
      matchMethod: "linked_to_record",
      status: "suggested", // manual match → suggested until Confirm
      isAutoMatched: false,
    });
    return { ok: true };
  },
});
```

### Unmatch Mutation (reversal semantics per D-09)

```typescript
// convex/bankStatements/mutations.ts (extend)
import { createJournalEntryWithLines, buildReversedLines } from "../lib/journalEngine";

export const unmatch = mutation({
  args: { token: v.string(), lineId: v.id("bankStatementLines") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Bank line not found");

    let reversalJournalEntryId: Id<"journalEntries"> | undefined;

    // D-09 step 3: if was confirmed, post reversal JE
    if (line.status === "confirmed" && line.confirmedJournalEntryId) {
      const originalLines = await ctx.db
        .query("journalEntryLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", line.confirmedJournalEntryId!))
        .collect();

      reversalJournalEntryId = await createJournalEntryWithLines(ctx, {
        date: Date.now(), // current WIB period — the reversal is a current accounting event
        description: `Reversed by unmatch on ${formatWib(Date.now())} by ${user.name}`,
        sourceType: "bank_statement_reversal", // NEW literal per D-26
        sourceId: line._id,
        createdBy: user._id,
        lines: buildReversedLines(
          originalLines.map((l) => ({
            accountId: l.accountId,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
            description: l.description,
          })),
        ),
      });
    }

    // D-09 step 2: recompute status
    const nextStatus = line.originalCategory ? "suggested" : "unmatched";

    // D-09 step 1: clear linkage (ONLY for linked_to_record; preserve Layer A)
    const shouldClearLinkage = line.matchMethod === "linked_to_record";

    await ctx.db.patch(args.lineId, {
      ...(shouldClearLinkage
        ? { matchedType: undefined, matchedId: undefined, matchMethod: undefined }
        : {}),
      status: nextStatus,
      ...(reversalJournalEntryId
        ? {
            reversedAt: Date.now(),
            reversedBy: user._id,
            reversalJournalEntryId,
          }
        : {}),
    });
    return { ok: true, reversalJournalEntryId };
  },
});
```

### Confirm Line Mutation (posts JE per D-07)

```typescript
export const confirmLine = mutation({
  args: { token: v.string(), lineId: v.id("bankStatementLines") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Bank line not found");
    if (line.status === "confirmed") throw new ConvexError("Already confirmed");
    if (!line.jeDebitAccountId || !line.jeCreditAccountId) {
      throw new ConvexError("Line has no JE account suggestion; classify first");
    }
    if (line.flags?.includes("capex_needs_asset_register")) {
      throw new ConvexError("CapEx lines must route through Asset Register");
    }

    const journalEntryId = await createJournalEntryWithLines(ctx, {
      date: line.date,
      description: `Bank: ${line.rawDescription.slice(0, 200)}`,
      sourceType: "bank_statement",
      sourceId: line._id,
      createdBy: user._id,
      lines: [
        { accountId: line.jeDebitAccountId, debitAmount: line.amountIdr, creditAmount: 0 },
        { accountId: line.jeCreditAccountId, debitAmount: 0, creditAmount: line.amountIdr },
      ],
    });

    await ctx.db.patch(args.lineId, {
      status: "confirmed",
      confirmedAt: Date.now(),
      confirmedBy: user._id,
      confirmedJournalEntryId: journalEntryId,
    });
    return { journalEntryId };
  },
});
```

### Revenue Gap Query (D-14)

```typescript
export const getRevenueGap = query({
  args: {
    token: v.string(),
    periodStart: v.number(), // WIB epoch ms
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    // Bank credits per channel (uses new by_channel_date index)
    const creditLines = await ctx.db
      .query("bankStatementLines")
      .withIndex("by_date", (q) =>
        q.gte("date", args.periodStart).lte("date", args.periodEnd),
      )
      .filter((q) => q.eq(q.field("direction"), "credit"))
      .collect();

    const bankByChannel = new Map<string, number>();
    let unallocated = 0;
    for (const l of creditLines) {
      if (!l.linkedChannel) unallocated += l.amountIdr;
      else bankByChannel.set(l.linkedChannel, (bankByChannel.get(l.linkedChannel) ?? 0) + l.amountIdr);
    }

    // External revenue per source
    const revenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_periodStart", (q) =>
        q.gte("periodStart", args.periodStart).lte("periodStart", args.periodEnd),
      )
      .collect();
    const extByChannel = new Map<string, number>();
    for (const r of revenue) {
      extByChannel.set(r.source, (extByChannel.get(r.source) ?? 0) + r.revenueGross);
    }

    const channels = new Set([...bankByChannel.keys(), ...extByChannel.keys()]);
    const rows = Array.from(channels).map((c) => {
      const bank = bankByChannel.get(c) ?? 0;
      const ext = extByChannel.get(c) ?? 0;
      const diff = bank - ext;
      const pct = ext === 0 ? null : Math.round((diff / ext) * 10000) / 100;
      return { channel: c, bankCredits: bank, externalRevenue: ext, diff, diffPercent: pct };
    });
    rows.push({ channel: "(unallocated)", bankCredits: unallocated, externalRevenue: 0, diff: unallocated, diffPercent: null });
    return rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  },
});
```

Note the `by_date` index already exists on `bankStatementLines` [VERIFIED: `convex/schema.ts:1991`]. Adding `by_channel_date` is an optimization, not a prerequisite.

### Hook Facade Extensions

```typescript
// src/hooks/convex/useBankReconciliation.ts (extend — ADD at end of file)
export function useStatementProgress(statementId: Id<"bankStatements"> | null) {
  const { user } = useAuth();
  return useQuery(
    api.bankStatements.queries.getStatementProgress,
    statementId && user?.token ? { token: user.token, statementId } : "skip",
  );
}

export function useRevenueGap(periodStart: number | null, periodEnd: number | null) {
  const { user } = useAuth();
  return useQuery(
    api.bankStatements.queries.getRevenueGap,
    periodStart && periodEnd && user?.token
      ? { token: user.token, periodStart, periodEnd }
      : "skip",
  );
}

export function useManualMatch() {
  const fn = useMutation(api.bankStatements.mutations.manualMatch);
  const { user } = useAuth();
  return useCallback(
    async (lineId: Id<"bankStatementLines">, matchedType: "expense"|"revenue"|"reimbursement"|"payroll", matchedId: string) => {
      if (!user?.token) throw new Error("Not authenticated");
      return await fn({ token: user.token, lineId, matchedType, matchedId });
    }, [fn, user?.token],
  );
}
// ... useUnmatch, useConfirmLine, useBatchConfirm, useCreateRuleFromOverride (similar shape)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| P72 block reversal of `bank_statement` JEs at engine level | P73 adds dedicated `"bank_statement_reversal"` literal + skips the engine's reversal helper | D-26 | Must update `NON_REVERSIBLE_TYPES` to include the new literal |
| P72 `/bank-reconciliation` admin-only | P73 widens to manager+admin | D-23 | Change `App.tsx:433` + all P72 query guards |
| P72 rule CRUD admin-only | Dedicated `createFromOverride` allows manager+admin | D-12 | Existing `/bank-rules` unchanged |
| P72 `StatementHistoryList` = row of static counts | P73 adds mini progress bar + live counts | D-24 | Extend column set, subscribe to `getStatementProgress` batch query |
| P72 read-only `StatementReviewTable` | P73 replaces with split-view workspace on Review tab | D-02 | `StatementReviewTable.tsx` still usable in Statements tab / completed view |

**Deprecated/outdated from P72:**
- `StatementReviewTable` mode="imported" — still valid for post-import peek before reviewer enters split-view, but no longer the primary review surface.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `by_date` index on `bankStatementLines` is sufficient for the Revenue Gap query without adding `by_channel_date` | Pattern 6 | Slow queries at scale (>500 lines/month). Mitigation = add the optional compound index as a safe optimization. |
| A2 | `createJournalEntryWithLines` is safe to call from `unmatch` for reversal (bypassing `createReversalEntry`) | Pattern 3 | If there's an invariant we don't know (e.g., audit check expecting `reversedByEntryId` link), the reversal may surface but not be "linked" in the ledger. Mitigation: leave `journalEntries.isReversed` false per D-09 intent; add explicit test that `isReversed=false` on both original and reversal. |
| A3 | Extracting `ExpenseForm.tsx` from `ExpenseSubmit.tsx` is lower risk than embedding the full page in a dialog | Pattern 4 | Could be more work than estimated; alternative is a nested route modal with react-router `<Outlet>`. Planner should assess ExpenseSubmit complexity during Wave 0. |
| A4 | The `(unallocated)` row in Revenue Gap can always be derived in the same query | Pattern 4 Code Example | If `linkedChannel` rows ever contain empty string `""` (not undefined), the bucket detection breaks. Mitigation: normalize in match engine — already empty-string-safe. |
| A5 | Batch Confirm all-or-nothing is the right granularity | D-08 interpretation | User may prefer "skip invalid, confirm rest" with a post-hoc report. Planner can reverse the recommendation if UX review disagrees. |

**If this table is empty:** all claims in this research were verified or cited — no user confirmation needed. (Table is non-empty; planner should confirm A1 and A5 before committing to wave boundaries.)

## Open Questions

1. **Rules tab: integrate or link-out?**
   - What we know: `BankRulesManager.tsx` is a full page at `/bank-rules` today.
   - What's unclear: whether D-23 wants the Rules tab to inline the BankRulesManager component OR just render a link/button to navigate to `/bank-rules`.
   - Recommendation: **inline** — pass through as `<BankRulesManager embedded />` with a prop that suppresses the page header. Cheaper than forked component.

2. **Reversal JE date — business date or today?**
   - What we know: D-09 description says `"Reversed by unmatch on {wibDate}"`. The existing `createReversalEntry` uses `original.date` (JE-03 rule — same accounting period).
   - What's unclear: Whether bank-statement reversal should follow JE-03 (use original date = source line's bank date) or break from it (reversal is a current-period event).
   - Recommendation: **use `Date.now()` WIB-normalized**. Rationale: bank reconciliation reversal IS a current-period accounting event; the money moved in the original period, but the reversal of the classification is a manager deciding TODAY that yesterday's classification was wrong. Follow accountant convention — backdating reversals is surprising.
   - **Flag for UAT.**

3. **Counterparty extraction for learn-from-override pre-fill.**
   - What we know: BCA `rawDescription` is a concatenated blob; `parsedCounterparty` is heuristic and may be null.
   - What's unclear: Best UX when `parsedCounterparty` is null — leave `counterpartyPatterns` empty and suggest `descriptionPatterns` from whole-string tokens? Or pre-tokenize `rawDescription` into candidates the user picks from?
   - Recommendation: **candidate-token picker** — split `rawDescription` on whitespace/punctuation, show as multi-select chips, user checks 1-3 to populate `descriptionPatterns[]`. Claude's Discretion item.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Convex | entire backend | ✓ | 1.31.7 | — |
| React 19 | entire UI | ✓ | 19.2.0 | — |
| SheetJS xlsx | P72 parser (UNTOUCHED by P73) | ✓ | 0.20.3 (CDN) | — |
| papaparse | P72 CSV (UNTOUCHED) | ✓ | 5.5.3 | — |
| fastest-levenshtein | P72 match engine (UNTOUCHED) | ✓ | 1.0.16 | — |
| shadcn Tabs, Dialog | P73 UI shell | ✓ | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + convex-test |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm run test -- convex/bankStatements` |
| Full suite command | `npm run test` |

[VERIFIED: `CLAUDE.md` §Tech Stack + `convex/bankStatements/__tests__/` directory exists from P72]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BANK-03 | `manualMatch` sets matchedType/Id, status=suggested, isAutoMatched=false | unit (convex-test) | `npm run test -- convex/bankStatements/__tests__/mutations.test.ts -t "manualMatch"` | ❌ Wave 0 |
| BANK-03 | `manualMatch` rejects confirmed lines | unit | same file | ❌ Wave 0 |
| BANK-03 | `unmatch` clears linkage only when matchMethod=linked_to_record | unit | same file | ❌ Wave 0 |
| BANK-03 | `unmatch` creates reversal JE with swapped DR/CR when line was confirmed | unit | same file | ❌ Wave 0 |
| BANK-03 | `unmatch` recomputes status to "suggested" when originalCategory present, "unmatched" otherwise | unit | same file | ❌ Wave 0 |
| BANK-03 | `confirmLine` posts balanced 2-line JE and patches audit fields | unit | same file | ❌ Wave 0 |
| BANK-03 | `confirmLine` rejects CapEx-flagged lines | unit | same file | ❌ Wave 0 |
| BANK-03 | `batchConfirm` validates every line before first insert (all-or-nothing) | unit | same file | ❌ Wave 0 |
| BANK-03 | `batchConfirm` rejects unbalanced DR/CR across the batch | unit | same file | ❌ Wave 0 |
| BANK-04 | `getStatementProgress` returns counts by status + percent | unit (convex-test) | `npm run test -- convex/bankStatements/__tests__/queries.test.ts -t "getStatementProgress"` | ❌ Wave 0 |
| BANK-04 | `StatementHistoryList` renders progress bar with correct fill from prop | component (Vitest + RTL) | `npm run test -- src/components/bankReconciliation/__tests__/StatementHistoryList.test.tsx` | ❌ Wave 0 |
| D-12 | `createFromOverride` allows manager role | unit (convex-test) | `npm run test -- convex/bankKeywordRules/__tests__/mutations.test.ts -t "createFromOverride"` | ❌ Wave 0 |
| D-12 | `create` (existing) still rejects manager role | unit | same file | ❌ Wave 0 (regression test) |
| D-14 | `getRevenueGap` buckets credits by linkedChannel + `(unallocated)` | unit | `npm run test -- convex/bankStatements/__tests__/queries.test.ts -t "getRevenueGap"` | ❌ Wave 0 |
| D-14 | `getRevenueGap` diff% = ∞ marker when externalRevenue=0 and bank>0 | unit | same file | ❌ Wave 0 |
| D-17 | Inline expense create calls `createExpenseDraft` + `submitExpense` (not direct insert) | component / integration | `npm run test -- src/components/bankReconciliation/__tests__/CreateExpenseFromLineDialog.test.tsx` | ❌ Wave 0 |
| D-20 | CapEx line renders `Route to Asset Register` button, navigates with URL params | component | `npm run test -- src/components/bankReconciliation/__tests__/BankLinesPane.test.tsx` | ❌ Wave 0 |
| BANK-03 | End-to-end Confirm → JE → Unmatch → reversal JE round trip | E2E smoke (Playwright) | `npm run test:e2e -- bank-reconciliation.spec.ts` | ❌ Wave 0 (if Playwright configured) |

### Sampling Rate

- **Per task commit:** `npm run test -- convex/bankStatements convex/bankKeywordRules` (ballpark 30s)
- **Per wave merge:** `npm run test` (full unit suite) + `npm run type-check`
- **Phase gate:** full suite green + `npm run build` succeeds before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `convex/bankStatements/__tests__/mutations.test.ts` — extend with manualMatch/unmatch/confirmLine/batchConfirm cases (file exists from P72, add cases)
- [ ] `convex/bankStatements/__tests__/queries.test.ts` — NEW file, covers `getStatementProgress` + `getRevenueGap`
- [ ] `convex/bankKeywordRules/__tests__/mutations.test.ts` — extend with `createFromOverride` role-gate cases (file exists from P72)
- [ ] `src/components/bankReconciliation/__tests__/` — NEW directory + component tests for `StatementHistoryList` (progress bar), `BankLinesPane` (CapEx button), `CreateExpenseFromLineDialog` (draft+submit path), `BatchConfirmPreviewDialog` (balance gate)
- [ ] Playwright E2E — confirm whether `tests/e2e/` is configured and CI-wired. If not, **defer E2E and document as manual UAT step**. [VERIFIED: `CLAUDE.md` does not mention Playwright; existing testing is Vitest + convex-test.]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireRole(ctx, token, [...])` pattern — existing |
| V3 Session Management | yes | session tokens via `useSessionMutation` from convex-helpers |
| V4 Access Control | yes | route guards (`<ProtectedRoute allowedRoles>`) + per-mutation `requireRole` |
| V5 Input Validation | yes | Convex `v.*` validators on all mutation args |
| V6 Cryptography | no | no new secrets, no new crypto |

### Known Threat Patterns for Convex + React

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation via mutation w/ wrong role guard | Elevation | Every mutation explicitly calls `requireRole` with manager/admin (and `createFromOverride` is the ONLY rule mutation widened to manager — separate surface from existing admin-only `create`) |
| CapEx handoff smuggling via crafted URL params | Tampering | Asset Register intake form MUST revalidate params server-side; `sourceBankLineId` must be a valid Id type; `cost` must be positive integer IDR |
| IDOR on `matchedId` polymorphic string | Tampering | `manualMatch` must `ctx.db.get` the claimed matched record + confirm its type matches `matchedType` before patching |
| Data exposure via error messages | Disclosure | `humanizeError` pattern from `BankReconciliationPage.tsx:87` strips request IDs |
| Race on simultaneous confirm of same line | Tampering | Convex serializes mutations on the same document; the status guard (`if status === "confirmed"`) prevents double-post |
| Over-privileged queries leaking account PII | Disclosure | Widen P72 queries from `["admin"]` to `["manager", "admin"]` deliberately; `maskAccount` helper already exists for UI |

**Notable:** D-17's insistence on standard expense-submission flow IS a security control — it preserves separation of duties (the person reconciling is often not the person who spent). Shortcutting this breaks the financial control.

## Sources

### Primary (HIGH confidence)

- `.planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md` — authoritative for all D-01..D-26 decisions
- `.planning/phases/72-bank-statement-parser-auto-match/72-CONTEXT.md` — schema and match engine contract P73 extends (D-02, D-03, D-06, D-11, D-14, D-17..D-21, D-23, D-25, D-26)
- `convex/schema.ts:1845-1991` — journalEntries.sourceType union, bankStatementLines full schema, existing indexes
- `convex/lib/journalEngine.ts:66-357` — NON_REVERSIBLE_TYPES list, buildReversedLines, createJournalEntryWithLines, createReversalEntry contract
- `convex/bankStatements/mutations.ts:1-80` — existing createFromParsedStatement pattern (admin-only, ConvexError handling)
- `convex/bankStatements/queries.ts:1-88` — existing 4 queries, all admin-only (must widen per D-23)
- `convex/bankKeywordRules/mutations.ts` — existing seed/create/update/deactivate pattern
- `src/pages/BankReconciliationPage.tsx` — existing wizard shell, ReviewSection, ErrorSection
- `src/pages/AssetRegister.tsx:36-80` — canonical shadcn Tabs pattern for 4-tab layout
- `src/pages/InventoryManager.tsx:32-36` — alternate tabs pattern (3 tabs)
- `src/pages/ExpenseSubmit.tsx:1-80` — standard expense-submission page form structure
- `src/hooks/convex/useBankReconciliation.ts` — hook facade to extend
- `src/App.tsx:137-437` — route definitions (bank-reconciliation currently admin-only)
- `package.json` — verified versions of all dependencies
- `.planning/REQUIREMENTS.md:35-36` — BANK-03, BANK-04 acceptance criteria

### Secondary (MEDIUM confidence)

- None — research is fully within codebase; no web research required.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via `package.json`
- Architecture: HIGH — patterns confirmed in existing code (Tabs, Dialog, createJournalEntryWithLines)
- Pitfalls: HIGH — each pitfall cites a verified source line
- Validation: MEDIUM — Playwright E2E status unclear, deferred to Wave 0 check
- Security: HIGH — mapped to existing requireRole pattern

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (30 days — stable codebase area, stable P72 foundation)
