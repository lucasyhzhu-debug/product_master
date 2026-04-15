# Phase 73: Bank Reconciliation UI & Workflow - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Reviewers work through a parsed BCA bank statement (imported via Phase 72) via a split-view UI: manually match unmatched bank lines to existing system records (`expenses` / `externalRevenue` / `reimbursementBatches` / `payrollEntries`), unmatch incorrect auto-matches, post journal entries for confirmed matches, and see per-statement reconciliation progress at a glance.

**Requirements:** BANK-03 (manual match/unmatch via split-view), BANK-04 (per-statement matched/unmatched/suggested counts)

**Scope expansion from Phase 72 CONTEXT (explicitly adopted):**
- JE posting on Confirm (P72 D-20, D-22 deferred to P73)
- Learn-from-override rule creation (P72 D-18 deferred to P73)
- Revenue gap dashboard (P72 D-23 deferred to P73)
- CapEx → Asset Register handoff (P72 D-17c deferred to P73)
- Inline record creation for unmatched lines (P72 CONTEXT "bank lines as source of truth for expense capture" use case)

**Out of scope (deferred):**
- Mandiri or other bank formats (stays BCA-only — P72 D-07)
- AI/LLM classification (P72 D-27)
- Data Health centralised dashboard — Phase 77 (`DH-01` .. `DH-05`). Revenue gap table in P73 is a per-statement view, not the cross-pipeline health page.
- Batch historical re-categorisation tool (P72 deferred list)

</domain>

<decisions>
## Implementation Decisions

### Scope

- **D-01:** Phase 73 ships ALL of: core split-view + manual match/unmatch, JE posting on Confirm, learn-from-override rule creation, revenue gap dashboard tab, inline record creation, CapEx handoff to Asset Register. User accepted maximal scope after seeing P72 deferrals.

### Split-View Layout & Selection Model

- **D-02:** **Click-to-select both sides, then Match button.** Two panes on the existing `/bank-reconciliation` page. Left pane: bank lines filtered to `status IN ('unmatched', 'suggested', 'auto_matched')` with selected line highlighted. Right pane: candidate system records filtered by the selected line's amount/date. `[Match selected]` and `[Unmatch auto]` buttons in the footer act on the currently selected bank line (+ selected candidate for Match).
- **D-03:** **Line-level selection model.** One bank line selected at a time; selecting a different line replaces selection and refreshes the candidate pane. No multi-select for Match (1:1 cardinality — see D-04). Bulk operations only via the "Confirm all exact-tier" batch action (D-07).
- **D-04:** **1:1 match cardinality only.** Each bank line matches at most one system record. Reimbursement batches already aggregate N expenses under one `reimbursementBatches` row, so a single bank transfer maps to a single batch record. Payroll batches same. No schema change: `matchedType` + `matchedId` stay as single values. 1:N or N:1 split matching is deferred (see Deferred Ideas).

### Candidate Filtering (Right Pane)

- **D-05:** **Default filter: amount exact + date within ±3 days of the bank line date.** Mirrors the Phase 72 Layer-B match window (P72 D-14). Candidates grouped by type in sub-sections: `Reimbursement Batches`, `Expenses`, `Payroll`, `Revenue` — each with a count badge. Empty groups show "(0)" rather than being hidden, so reviewer sees the full picture.
- **D-06:** **Escape hatch: `🔍 Search all records` button** widens to all records of the matching type by search term (amount, vendor/recipient name, description). Opens a search dialog over the full table when the default window finds nothing and the reviewer knows the record is late-posted or out-of-window. Does not mutate the default filter.

### JE Posting Flow

- **D-07:** **Explicit Confirm per line, plus batch "Confirm all exact-tier".**
  - **Per-line:** A `[Confirm]` button on the matched line posts a 2-line JE via `createJournalEntryWithLines` using `jeDebitAccountId` / `jeCreditAccountId` from the line, amount = `amountIdr`, `sourceType="bank_statement"`, `sourceId = bankStatementLine._id`. Line `status` transitions to `"confirmed"` and `confirmedAt` / `confirmedBy` fields populated (see D-24 for schema).
  - **Batch:** `[Confirm all exact-tier]` button scans all lines with `confidence="exact"` and `status IN ('auto_matched', 'suggested')`, opens a preview modal (see D-08), and on explicit confirmation posts each line's JE transactionally.
- **D-08:** **Batch Confirm preview modal.** Before posting, modal shows:
  - Count of lines to confirm
  - Summary table grouped by `jeDebitAccountId` / `jeCreditAccountId` with total DR / CR amounts
  - Grand total DR, grand total CR (must balance — sanity gate, block Post if mismatched)
  - Explicit `[Post N journal entries]` action button vs `[Cancel]`
  Reversible per line via the Unmatch flow (D-09). No 10-second undo window — modal is the safety net.

### Unmatch Semantics

- **D-09:** **Unmatch = full reversal.** When user clicks `[Unmatch]` on a matched or confirmed line:
  1. Clear `matchedType`, `matchedId`, `matchMethod` (for linked-to-record matches only — preserve Layer A rule classification)
  2. Recompute `status`: if a keyword rule still classifies the line (`originalCategory` present), status → `"suggested"`; else status → `"unmatched"`
  3. If JE was posted (`status was "confirmed"`): create a **reversal JE** via `createJournalEntryWithLines` with swapped DR/CR and `description="Reversed by unmatch on {wibDate} by {user.name}"`. Both original and reversal JE remain in the ledger (audit trail) — do NOT delete the original JE.
  4. Line shows a `Reversed` indicator in the UI with tooltip linking to reversal JE.

### Learn-from-Override Rule Creation

- **D-10:** **Trigger = user overrides a line's category to a different account.** When a reviewer edits a line's `overrideCategoryAccountId` (the existing P72 field), a dialog appears: "Future lines matching [detected pattern] will be classified as [chosen category]. Save as rule?"
- **D-11:** **Editable detection pattern.** The dialog pre-fills proposed pattern fields from the bank line:
  - `counterpartyPatterns`: extracted counterparty string (may be empty)
  - `descriptionPatterns`: list of candidate keyword substrings extracted from `rawDescription` (trimmed, case-normalized)
  - `direction`: from the bank line
  - `matchType`, `descriptionPatternsMode`, `confidence`, `priority`, `plSection`: sensible defaults
  - `categoryAccountId` / `jeDebitAccountId` / `jeCreditAccountId`: from the override
  User can edit ALL fields in the dialog before saving. Save writes a new `bankKeywordRules` row with `createdBy = currentUserId`.
- **D-12:** **Permissions: manager + admin can save rules from override** (not admin-only). This **diverges from Phase 72 D-19** (which gated `bankKeywordRules` CRUD to admin). Rationale: reconciliation is a manager-frequency task; forcing admin for every new rule creates a bottleneck. The dedicated `/bank-rules` CRUD page (Phase 72) stays admin-only — only the inline learn-from-override path opens to manager+admin. Planner to update `bankKeywordRules` create mutation to accept manager role for this entry path specifically (e.g., via a dedicated `createFromOverride` mutation, or by widening the existing create guard).

### Revenue Gap Dashboard

- **D-13:** **New `Revenue Gap` tab on `/bank-reconciliation` page.** Tab bar: `[Statements] [Review] [Revenue Gap] [Rules]`. (Statements = existing history list; Review = the split-view workspace; Rules = existing `/bank-rules` integrated as tab OR kept as separate route — planner's call, preferred integration if low-effort.)
- **D-14:** **Revenue Gap table content** — per-period (default = current month; date-range picker to change):
  - Rows = distinct `linkedChannel` values found on `bankStatementLines.direction='credit'` lines in the period, PLUS one synthetic `(unallocated)` row for credits where `linkedChannel IS NULL`.
  - Columns: `Channel | Bank Credits (IDR) | External Revenue (IDR) | Diff | Diff %`
  - `Bank Credits` = `SUM(bankStatementLines.amountIdr)` where `direction='credit'`, `linkedChannel=row`, date in period
  - `External Revenue` = `SUM(externalRevenue.revenueGross)` where `source=row` (channel → source mapping per existing conventions; see canonical refs), date in period
  - `Diff` = Bank − ExtRev. Positive = revenue not captured in externalRevenue (bank shows money we didn't record). Negative = ExtRev shows revenue we haven't seen hit the bank yet.
  - `Diff %` = diff / externalRevenue × 100; display `∞` when externalRevenue = 0 and bank > 0 (flag row with ⚠ warning icon)
  - `(unallocated)` row: `Bank Credits` total, `External Revenue` = "—", `Diff` = Bank value, highlights review backlog
  - The revenue gap query uses `mapChannelToSource(linkedChannel)` (from `convex/bankStatements/channelMapping.ts`) to join bank lines with externalRevenue. Channels that do not map to one of the 8 externalSource literals (e.g. "ovo", "dana", "tokopedia") appear in a separate "(unmapped channels)" group with no diff calculation — rendered as "channel not tracked in externalRevenue" rather than showing Diff=∞. Mapped channels (e.g. "gopay" → "gobiz", "gofood" → "gobiz", "grabfood" → "grabfood") join correctly against `externalRevenue.source`. See `convex/bankStatements/channelMapping.ts` for the full mapping table (C1 from staff review).
- **D-15:** **Row drill-down.** Clicking a row navigates to the Review tab with a pre-applied filter showing only bank lines for that `linkedChannel` + period. Enables quick "why is there a gap?" investigation — reviewer can see which individual credits are/aren't matched to `externalRevenue` records.

### Inline Record Creation (Unmatched Lines)

- **D-16:** **Support inline creation for expense, revenue, and reimbursement record types** from unmatched bank lines.
- **D-17:** **Expense inline-create = standard expense submission flow, NOT a shortcut.** This is the critical user-flagged constraint. Rationale: the person matching the bank statement is often NOT the person who incurred the expense — we still need receipt evidence and owner accountability even though the money has already left the bank.
  - Clicking `[Create expense from this line]` on an unmatched debit opens a dialog pre-filled with `date = bank line date`, `amount = amountIdr`, `description = rawDescription`, `vendorName = parsedCounterparty` (if present).
  - **Required fields the reviewer MUST fill before save:** `submittedBy` (owner: a `users._id` representing who executed the expense — picker over active users), `receiptFile` (upload of purchase receipt), `expenseCategory` / `accountId` (if not inferable from the bank line's suggested category).
  - The record is saved through the **standard expense submission path** (`convex/expenses/mutations.ts` submit flow — NOT pre-approved) with status = `submitted`, not `approved`. Downstream approval uses the existing ExpenseApproval page.
  - On save, the bank line auto-matches to the new expense (`matchedType="expense"`, `matchedId=newExpenseId`) but status stays `suggested` (not `confirmed`) until the expense itself is approved AND the reviewer clicks Confirm on the line.
- **D-18:** **Revenue inline-create.** Clicking `[Create revenue from this line]` on an unmatched credit opens an `externalRevenue` row creation dialog pre-filled with `transactionDate`, `revenueGross = amountIdr`, `source` (if `linkedChannel` already detected — else user picks). Routes through existing `externalRevenue` creation mutation. On save, auto-matches line (`matchedType="revenue"`).
- **D-19:** **Reimbursement inline-create.** Clicking `[Create reimbursement batch from this line]` opens the reimbursement batch creation dialog pre-filled with `totalAmount`, `createdAt`. User adds individual items per existing reimbursement flow. On save, auto-matches line (`matchedType="reimbursement"`).

### CapEx Handoff (B01-flagged lines)

- **D-20:** **CapEx routing via Asset Register intake.** For bank lines where `flags` includes `"capex_needs_asset_register"` (from the B01 rule):
  - `[Confirm]` button is replaced with `[Route to Asset Register]` button.
  - Clicking navigates to `/asset-register/new` (AssetRegister.tsx intake form) with URL params or session storage pre-populating: `purchaseDate = bank line date`, `cost = amountIdr`, `vendor = parsedCounterparty`, `description = rawDescription`, `sourceBankLineId = bankStatementLine._id`.
- **D-21:** **JE deferred until asset saved.** Bank line status stays `suggested` (NOT `confirmed`) until the asset is registered. On asset save, the asset register's own flow creates an initial expense record linked to the asset (existing Phase 45+ pattern); the bank line then auto-matches to that expense (`matchedType="expense"`, `matchedId=newExpenseId`) and becomes confirmable. The standard Confirm then posts the actual acquisition JE with the asset's configured accounts (typically `DR Fixed Assets / CR Cash`).
- **D-22:** **Existing asset detection.** If an asset already exists in the register matching `vendor + cost + purchaseDate` (within ±3 days), the intake form surfaces a "Link to existing asset?" prompt before creating a duplicate. Prevents duplicate asset rows for the same purchase.

### Permissions

- **D-23:** **Manager + admin for all reconciliation actions:** match, unmatch, Confirm (post JE), batch Confirm, inline create expense/revenue/reimbursement, save rule from override, route to Asset Register. `kitchen` and `order_staff` roles blocked at the route guard. Rule CRUD at `/bank-rules` stays admin-only per P72 D-19; only the inline learn-from-override path widens to manager+admin (D-12). Managers are trusted with BCA account numbers (PII exposed in full statement view via the widened `getStatement`/`listStatements`/`findByFileHash`/`listLines` queries — `bankStatements.accountNumber` and `accountHolder` fields are visible to manager role). Post-Phase 73 follow-up ticket tracks optional PII redaction for non-admin roles.

### Progress Indicator

- **D-24:** **Two surfaces with a single source:**
  - **Split-view workspace header:** Progress bar + counts `{N matched / N suggested / N unmatched} — {X}% reconciled`. Also shows `{N confirmed}` sub-count of matched. Live-updating via Convex reactivity. Shows statement name and period.
  - **Statement history list** (`StatementHistoryList.tsx`): each row displays counts and a mini progress bar. Matches the mock: `Nov-2025  67 lines  71% ▓▓▓▓▓▓░`.
  - Counts derived from query (`SELECT COUNT(*) GROUP BY status FROM bankStatementLines WHERE statementId=?`). Header counts on `bankStatements` stay as snapshot from import (P72 D-03) — the live counts query is the source of truth for reconciliation UI.

### Schema Extensions (minimal)

- **D-25:** **Add audit fields to `bankStatementLines`:**
  - `confirmedAt: v.optional(v.number())` — epoch ms when Confirm was posted
  - `confirmedBy: v.optional(v.id("users"))` — who posted the JE
  - `confirmedJournalEntryId: v.optional(v.id("journalEntries"))` — link to the posted JE
  - `reversedAt: v.optional(v.number())` — when Unmatch reversed a previously-confirmed line
  - `reversedBy: v.optional(v.id("users"))`
  - `reversalJournalEntryId: v.optional(v.id("journalEntries"))` — link to the reversal JE
  - `createdExpenseId: v.optional(v.id("expenses"))` / `createdRevenueId: v.optional(v.id("externalRevenue"))` / `createdReimbursementId: v.optional(v.id("reimbursementBatches"))` — to distinguish inline-created records from pre-existing ones (enables "delete inline record + unlink" workflows later)
- **D-26:** **Add `"bank_statement_reversal"` to `journalEntries.sourceType` union** OR reuse `"bank_statement"` with a `description` prefix — planner's call. Option 1 is cleaner for ledger reporting filters.

### Claude's Discretion

- Exact progress bar colors, animation, responsive behavior
- Dialog confirmation copy and error message wording
- Keyboard shortcuts (consider `Enter` = Match, `Esc` = clear selection, `↑/↓` = navigate lines)
- How to display `Diff %` for the `∞` case (e.g., show "—" + warning icon rather than literal ∞)
- Mobile/tablet layout fallback (split-view may stack vertically < 900px)
- Exact Counter-party / keyword extraction heuristic for the learn-from-override pre-fill
- Batch Confirm transaction granularity (all-or-nothing vs partial-on-error) — recommend all-or-nothing for safety
- Tab integration vs separate route for the Rules admin page — prefer integration
- Tooltip copy on confidence badges, reversed indicators, CapEx flags
- Pagination/virtualization thresholds in the bank lines and candidates panes

### Folded Todos

None — no pending todos surfaced for Phase 73.

</decisions>

<specifics>
## Specific Ideas

### Split-view mock (user-validated)

```
┌─ Bank lines (unmatched) ─┬─ Candidate records ──────┐
│ ● 19-Nov  1,000,000 CR   │ filter: ±3d, exact amt   │
│   BI-FAST TRANSFER       │ ○ Exp 2025-11-18 1M      │
│ ○ 30-Nov 76,876,615 DB   │ ● Reimb batch 1M Nov-19  │
│   reimburse KEVIN YOSUA  │ ○ Rev tokopedia 1M       │
│                          │ [Search all records...]  │
└───────────── [Match selected] [Unmatch auto] ───────┘
```

### Progress indicator (user-validated)

```
┌ Statement: BCA Nov-2025 ──────────────────────────┐
│ ████████████░░░░  71% (47/67 matched)            │
│ 47 matched · 12 suggested · 8 unmatched          │
└───────────────────────────────────────────────────┘
```

### Revenue Gap table (user-validated)

```
[Statements] [Review] [Revenue Gap*] [Rules]

┌ Period: Nov 2025      [▼]                              ┐
│ Channel      Bank CR      ExtRev       Diff    Diff%   │
│ ──────────────────────────────────────────────────────│
│ gopay        24.5M        24.5M        —       0%      │
│ tokopedia    18.2M        17.9M        +0.3M   +1.7%   │
│ shopee       12.0M        11.4M        +0.6M   +5.3%   │
│ grabfood     35.0M        0            +35M    ∞       │ ⚠
│ (unalloc)    5.1M         —            5.1M            │
└───────────────────────────────────────────────────────┘
```

### Inline expense creation — critical constraint

> "the person managing the matching may not be the person that ordered the bank debit, so the expense record will need to be linked to someone. We need to make sure that this expense record created still follows the standard of having evidence of the receipt plus owner of who executed the expense — and it should be an expense submission not an approval (despite the money already leaving the bank)."

This means the inline-create dialog opens the **standard** expense submission UI (ExpenseSubmit.tsx flow), not a lightweight shortcut. Receipt upload and owner assignment stay mandatory. Downstream approval remains a separate manager/admin action on ExpenseApproval.tsx.

### UI tone

- Audit tool, not a flashy dashboard (carried from P72 decision)
- Data-dense tables, clear confidence badges, explicit confirmations
- Matches `BankRulesManager.tsx` / `ExpenseApproval.tsx` visual vocabulary

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` Phase 73 section — goal + success criteria
- `.planning/REQUIREMENTS.md` BANK-03, BANK-04 (lines 35–36) — acceptance criteria

### Prior-phase decisions that feed this phase
- `.planning/phases/72-bank-statement-parser-auto-match/72-CONTEXT.md` — **authoritative** for schema, match-engine behavior, rule semantics. Especially:
  - D-02 (polymorphic `matchedType`/`matchedId`)
  - D-03 (line-level `status` union)
  - D-06 (line schema)
  - D-11 / D-14 (Layer-B match window → P73 candidate filter default)
  - D-17 / D-17c (26 seed rules; CapEx handling contract)
  - D-19 (rule CRUD admin-only → P73 D-12 opens learn-from-override path to manager+admin)
  - D-20 / D-21 / D-22 (JE posting contract P73 implements)
  - D-23 (revenue gap model lands P72, dashboard ships P73)
  - D-25 / D-26 (read-only P72 UI that P73 extends)
- `.planning/phases/72-bank-statement-parser-auto-match/72-SEED-RULES.json` — authoritative rule set. Reviewer learn-from-override rules extend this seed; planner should keep rule shape consistent with seed.
- `.planning/phases/70-data-accuracy-foundation/70-CONTEXT.md` — `users.bankAccountHolderName` for payroll match context
- `.planning/phases/71-bulk-expense-upload-asset-reclassification/71-CONTEXT.md` — expense submission pattern, bulk-import wizard shell vocabulary

### Existing schema (extend only via D-25)
- `convex/schema.ts` — `bankStatements`, `bankStatementLines`, `bankKeywordRules` (P72), `journalEntries`, `journalEntryLines`, `expenses`, `externalRevenue`, `reimbursementBatches`, `payrollEntries`, `fixedAssets`
- `convex/schema.ts` — `journalEntries.sourceType` union (already includes `"bank_statement"` from P72 D-21; P73 adds `"bank_statement_reversal"` per D-26)

### Existing backend (reuse)
- `convex/bankStatements/queries.ts`, `mutations.ts`, `matchEngine.ts` — existing P72 backend; P73 adds mutations for manual match/unmatch/confirm/reverse
- `convex/bankKeywordRules/queries.ts`, `mutations.ts`, `defaultRules.ts` — P73 adds `createFromOverride` mutation (manager+admin gated)
- `convex/lib/journalEngine.ts` — `createJournalEntryWithLines` (use for Confirm, batch Confirm, Unmatch-reversal)
- `convex/lib/auth.ts` — `requireRole(ctx, token, ["manager", "admin"])` for all P73 mutations; rule CRUD stays `["admin"]`
- `convex/expenses/mutations.ts` — existing expense submission mutation (use for inline expense creation path)
- `convex/externalRevenue` (queries/mutations) — inline revenue creation
- `convex/fixedAssets/mutations.ts` — asset creation for CapEx handoff
- `convex/lib/periodRange.ts` — WIB timezone for period filters in revenue gap dashboard

### Existing frontend (extend)
- `src/pages/BankReconciliationPage.tsx` — add tab bar, split-view workspace, revenue gap tab
- `src/pages/BankRulesManager.tsx` — unchanged (stays admin-only route OR integrated as a tab — planner's call)
- `src/hooks/convex/useBankReconciliation.ts` — add hooks for manualMatch, unmatch, confirm, batchConfirm, reverseConfirmation, createFromOverride, revenueGapByPeriod
- `src/components/bankReconciliation/StatementReviewTable.tsx` — gets replaced/augmented by the split-view components
- `src/components/bankReconciliation/StatementHistoryList.tsx` — add counts + progress bar column (D-24)
- `src/components/bankReconciliation/RuleFormDialog.tsx` — reuse for the learn-from-override dialog (or extract shared form)
- `src/pages/AssetRegister.tsx` — accept pre-fill params from bank line CapEx handoff (D-20)
- `src/pages/ExpenseSubmit.tsx` — standard expense submission UI; opened in a dialog mode for inline create (D-17)

### Permission / routing
- `src/components/auth/ProtectedRoute.tsx` — gate `/bank-reconciliation` to manager+admin
- `src/lib/types.ts` — permission flag definitions (`canAccessAssets` used as existing reference in P72; P73 decides whether to add `canAccessBankReconciliation` or reuse — planner's call)

### Indonesia / WIB helpers
- `src/lib/dateUtils.ts` — WIB formatting for dates in UI
- `convex/lib/periodRange.ts` — backend period bounds for revenue gap aggregation

### Rules (from P72)
- `.planning/phases/72-bank-statement-parser-auto-match/72-SEED-RULES.json` — seed rules; B01 flags `capex_needs_asset_register` (trigger for D-20 routing)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`BankReconciliationPage.tsx`** (from P72) — existing upload wizard + read-only review list. P73 extends with tabs: Review (split-view replaces the read-only table), Revenue Gap (new), Rules (integrated tab or kept as separate route).
- **`StatementHistoryList.tsx`** — existing history table; extend with counts + mini progress bar (D-24).
- **`RuleFormDialog.tsx`** (from P72) — existing rule CRUD form. Reuse as the inline learn-from-override dialog body by extracting shared form fields.
- **`useBankReconciliation.ts`** — existing hook facade. Add new mutation hooks on the same module: `useManualMatch`, `useUnmatch`, `useConfirmLine`, `useBatchConfirm`, `useCreateRuleFromOverride`, `useRevenueGap`.
- **`createJournalEntryWithLines`** in `convex/lib/journalEngine.ts` — single entry point for all JE posting (Confirm + Unmatch reversal + batch Confirm).
- **`ExpenseSubmit.tsx`** — existing expense submission page; opening it in dialog mode for inline-create preserves the owner + receipt discipline (D-17) without duplicating the form.
- **`AssetRegister.tsx`** intake — existing asset creation; accepts pre-fill params for CapEx handoff (D-20).
- **WIB date helpers** — use `src/lib/dateUtils.ts` (frontend) and `convex/lib/periodRange.ts` (backend) consistently; never format/parse dates with `new Date()` ad-hoc.

### Established Patterns

- **`requireRole(ctx, token, [...])`** for every mutation — P73 uses `["manager", "admin"]` for reconciliation actions. `bankKeywordRules` CRUD stays `["admin"]`; the new `createFromOverride` mutation uses `["manager", "admin"]`.
- **Confidence tier literal union** (`"exact" | "strong" | "suggested" | "none"`) — already on `bankStatementLines.confidence`. P73 uses these to drive batch-Confirm filter (`exact` only) and UI badges.
- **Polymorphic `matchedType` + `matchedId`** — P73 writes these on manual match; clears on unmatch.
- **Standard expense submission = submitted, not approved** (Phase 71 lesson) — inline expense creation must follow this; never auto-approve.
- **Convex reactivity for live counts** — queries like `getStatementProgress(statementId)` auto-refresh in the header bar; no manual invalidation.
- **Tab pattern** on page-level routes — mirror `InventoryManager.tsx` or similar existing tabs (planner to verify the canonical example).
- **Audit trail via separate JE, not mutation** — reversal = new JE entry, original preserved (matches `journalEntries` ledger integrity across the app).

### Integration Points

- **Routing:** `/bank-reconciliation` stays the single route; tabs switch views client-side. `/bank-rules` either stays separate or becomes a tab (planner decides — prefer tab for consolidation).
- **Navigation:** sidebar entry "Bank Reconciliation" stays under Financial section (P72 baseline).
- **Asset Register handoff:** URL-param-based navigation from bank line CapEx Confirm → `/asset-register/new?fromBankLine={id}`.
- **Expense dialog:** inline expense creation opens ExpenseSubmit.tsx in a modal/sheet with pre-filled values; on save, returns to split-view with the newly created expense auto-matched.
- **Revenue tab drill-down:** Revenue Gap row click → Review tab with query-param filter `?channel=grabfood&period=2025-11`.
- **Schema migration:** lightweight — adds audit fields to `bankStatementLines` (D-25) and one new literal to `journalEntries.sourceType` union (D-26). Phase 72 already added `"bank_statement"` to this union.

</code_context>

<deferred>
## Deferred Ideas

- **1:N and N:1 split matching** — e.g., one bank credit allocated across multiple revenue sources, or one expense paid in installments. Schema change + UI complexity out of scope for P73. Revisit if real-world reconciliation exposes a persistent need.
- **User-configurable match tolerances** (amount ± %, date ± N days per statement or per line) — P73 uses the fixed ±3-day window from P72 D-14. Add if real-world hit rate demands tuning.
- **10-second undo window after batch Confirm** — rejected in favor of the explicit preview modal. Revisit only if modal friction proves unacceptable.
- **Mobile-first split-view** — P73 targets desktop/tablet landscape (the primary reconciliation workstation). Mobile fallback stacks panes vertically but not optimized.
- **Dashboard tile for global reconciliation status** — considered as a progress-indicator location; deferred to Phase 77 Data Health Dashboard (`DH-01` .. `DH-05`) where cross-pipeline integrity checks live.
- **Auto-post JE on Match** — rejected; explicit Confirm preserves audit discipline and reversibility.
- **Drag-and-drop matching UX** — rejected as mobile/tablet-hostile and accessibility-weaker than click-to-select.
- **Keyboard-only reconciliation workflow (full hotkey set)** — P73 may include basic shortcuts at Claude's discretion; a full documented hotkey scheme is deferred.
- **Batch historical re-categorisation after rule changes** — P72 deferred; not in P73. Add when rule evolution creates backlog.

</deferred>

---

*Phase: 73-bank-reconciliation-ui-workflow*
*Context gathered: 2026-04-14*
