---
gsd_doc: ui-spec
phase: 73
phase_name: bank-reconciliation-ui-workflow
status: draft
generated: 2026-04-15
design_system:
  tool: shadcn/ui (pre-existing, no components.json — Tailwind v4 @theme)
  preset: project-local (src/index.css @theme block)
  brand_color: teal #0D9488 / hsl(172 90% 30%)
  font: Inter
  dark_mode: supported
source_of_truth: src/index.css (@theme tokens) + src/components/ui/*
---

# Phase 73 UI Spec — Bank Reconciliation Split-View Workspace

## 0. Scope

This spec governs the Phase 73 additions to `/bank-reconciliation`:
- Tab bar (Statements | Review | Revenue Gap | Rules)
- Split-view reconciliation workspace (Review tab)
- Progress indicator (header + history list row)
- Batch Confirm preview modal
- Learn-from-override rule dialog
- Revenue Gap dashboard tab
- Inline record-create dialogs (expense, revenue, reimbursement)
- CapEx handoff affordance

Everything not listed here reuses the existing P72 vocabulary from `BankReconciliationPage.tsx`, `StatementHistoryList.tsx`, `StatementReviewTable.tsx`, `RuleFormDialog.tsx`, and `ExpenseSubmit.tsx`. No new design language is introduced.

---

## 1. Design System Inheritance

| Dimension | Source | Value |
|---|---|---|
| Component library | `src/components/ui/*` (shadcn primitives) | Button, Card, Dialog, Table, Tabs, Badge, Alert, Progress, Tooltip, Select, DropdownMenu, Sheet, Input, Checkbox, ScrollArea, Popover, Separator, Skeleton, Sonner |
| Icons | lucide-react (already in use) | Existing |
| Styling | Tailwind v4 @theme tokens in `src/index.css` | Existing |
| Toast | Sonner (`sonner` wrapper) | Existing |
| Animations | Framer Motion (used sparingly; Phase 73 uses CSS transitions only) | Existing |
| Date format (UI) | `src/lib/dateUtils.ts` WIB helpers | Existing — never use ad-hoc `new Date()` |

**No new npm dependencies.** No new registry blocks. No shadcn init required — the project has already adopted shadcn primitives manually.

---

## 2. Spacing Scale

8-point scale. All paddings, margins, gaps in multiples of 4px.

| Token | px | Use |
|---|---|---|
| `gap-1` / `p-1` | 4 | Icon-text pair, badge internal padding |
| `gap-2` / `p-2` | 8 | Compact row gap, inline button group |
| `gap-3` / `p-3` | 12 | Card internal padding (compact) |
| `gap-4` / `p-4` | 16 | Default card / pane padding |
| `gap-6` / `p-6` | 24 | Section separation, dialog padding |
| `gap-8` / `p-8` | 32 | Major section gap |
| `gap-12` / `p-12` | 48 | Page hero spacing (not used in P73 — dense tool) |

**Exceptions:** None. No icon-only touch targets; this is a desktop/tablet tool (D-09 layout) so the 44px touch-target exception is not invoked.

**Split-view layout heights:**
- Left and right panes: `min-h-[600px]`, `max-h-[calc(100vh-280px)]` with internal `ScrollArea`.
- Row height in panes: 56px standard, 64px for selected row (2px border adds 8px visually — use background shade instead of border width change to avoid layout shift).

---

## 3. Typography

Inter, declared in `src/index.css` `--font-sans`. Phase 73 uses exactly 4 sizes + 2 weights.

| Role | Size (px) | Tailwind | Weight | Line-height |
|---|---|---|---|---|
| Page title | 28 | `text-[28px]` (or existing PageHeader) | 600 semibold | 1.2 |
| Section / dialog title | 20 | `text-xl` | 600 semibold | 1.2 |
| Body / table cell | 14 | `text-sm` | 400 regular | 1.5 |
| Monospace numeric (IDR amounts, dates) | 14 | `text-sm font-mono tabular-nums` | 400 regular | 1.5 |
| Caption / helper / metadata | 12 | `text-xs` | 400 regular | 1.4 |

**Weights used:** 400 (regular) and 600 (semibold) — no medium, no bold. This matches `BankReconciliationPage.tsx`.

**Numeric rule:** ALL currency and signed diffs use `tabular-nums` (via `font-mono` in most cases or `variant-numeric: tabular-nums` utility). Currency values are right-aligned in tables; non-numeric columns are left-aligned.

---

## 4. Color Contract (60/30/10)

Inherits from `src/index.css`. All tokens below already exist.

### 60% dominant surface
`var(--color-background)` (light: pure white; dark: `hsl(224 10% 10%)`). Page canvas, scroll containers.

### 30% secondary surface
`var(--color-card)` + `var(--color-muted)` + `var(--color-secondary)`. Used for:
- Panes in split view (`bg-card` with `border-border`)
- Candidate sub-section headers (`bg-muted/50`)
- Statement history rows
- Tab content wrappers

### 10% accent — reserved for
Brand teal `var(--color-brand)` / `var(--color-primary)` (`hsl(172 90% 30%)`) is reserved EXCLUSIVELY for:
1. Primary CTA buttons: `[Match selected]`, `[Confirm]`, `[Post N journal entries]`, `[Save rule]`
2. Progress bar fill (`<Progress>` — filled portion)
3. Active tab underline / active state
4. Currently-selected row highlight (left pane: `border-l-4 border-primary bg-primary/5`)
5. Focus rings on interactive controls

Never used for: body text, icons, table headers, decorative chrome.

### Semantic status colors (already defined)

| Signal | Foreground | Background | Tailwind class pattern |
|---|---|---|---|
| Success / confirmed | `--color-status-success` #059669 | `--color-status-success-bg` #ECFDF5 | `text-[color:var(--color-status-success)] bg-[color:var(--color-status-success-bg)]` |
| Warning / suggested / ⚠ row | `--color-status-warning` #D97706 | `--color-status-warning-bg` #FFFBEB | — |
| Error / unmatched (critical) | `--color-status-error` #DC2626 | `--color-status-error-bg` #FEF2F2 | — |
| Info / auto-matched | `--color-status-info` #2563EB | `--color-status-info-bg` #EFF6FF | — |

### Destructive action
`var(--color-destructive)` — reserved for: `[Unmatch]` button (outline variant, not filled), reversal JE indicator, and destructive confirmations in dialogs. Follows shadcn `variant="destructive"` / `variant="outline"` with destructive class.

### Confidence badge palette (mapped to existing tokens)

| Confidence | Badge variant | Colors |
|---|---|---|
| `exact` | Success solid | `bg-status-success-bg text-status-success border-status-success/30` |
| `strong` | Info solid | `bg-status-info-bg text-status-info border-status-info/30` |
| `suggested` | Warning outline | `bg-status-warning-bg text-status-warning border-status-warning/30` |
| `none` | Neutral outline | `bg-muted text-muted-foreground border-border` |

### Channel colors
Re-use `var(--color-channel-*)` from `src/index.css`. Revenue Gap table uses existing channel color per row label.

### Direction (debit / credit)
- **Debit (DB, money out):** `text-status-error` with `−` prefix
- **Credit (CR, money in):** `text-status-success` with `+` prefix
Badge pattern: `<Badge variant="outline">DB</Badge>` / `<Badge variant="outline">CR</Badge>` with matching text color, NOT background fill (keeps table legible).

---

## 5. Component Inventory (additions / extensions)

All components live under `src/components/bankReconciliation/` unless noted.

| Component | Status | Purpose |
|---|---|---|
| `BankReconciliationPage.tsx` | EXTEND | Add `<Tabs>` shell: Statements / Review / Revenue Gap / Rules |
| `BankReconciliationTabs.tsx` | NEW | Tab bar + route state sync (URL query `?tab=review&statementId=…`) |
| `SplitViewWorkspace.tsx` | NEW | Two-pane layout container (60/40 or 50/50, min-width 900px; stacks < 900px) |
| `BankLinesPane.tsx` | NEW | Left pane: line list with filter chips, virtualized if > 200 rows |
| `BankLineRow.tsx` | NEW | Single line with amount, date, description, confidence badge, status icon |
| `CandidatesPane.tsx` | NEW | Right pane: grouped candidates (Reimbursement / Expense / Payroll / Revenue) with counts |
| `CandidateGroup.tsx` | NEW | `Collapsible` group header with `Badge` count; all expanded by default |
| `CandidateRow.tsx` | NEW | Single candidate with amount, date, label, secondary meta |
| `ReconciliationActionBar.tsx` | NEW | Footer bar: `[Match selected]` primary · `[Unmatch auto]` destructive-outline · `[Confirm]` primary · `[Route to Asset Register]` (for CapEx) · `[Search all records]` tertiary |
| `StatementProgressHeader.tsx` | NEW | Statement name, period, `<Progress>` bar, counts chips |
| `StatementHistoryList.tsx` | EXTEND | Add counts column + mini `<Progress>` per row |
| `BatchConfirmDialog.tsx` | NEW | Modal: count, DR/CR grouped summary table, grand total balance check, `[Post N journal entries]` / `[Cancel]` |
| `LearnFromOverrideDialog.tsx` | NEW | Wraps/reuses `RuleFormDialog.tsx`; pre-fills from override; header copy "Save as rule?" |
| `RevenueGapTab.tsx` | NEW | Period picker + diff table + drill-down row click |
| `InlineExpenseDialog.tsx` | NEW | `<Dialog>` hosting a trimmed ExpenseSubmit form (full fields, NOT shortcut; D-17) |
| `InlineRevenueDialog.tsx` | NEW | `<Dialog>` with externalRevenue creation form |
| `InlineReimbursementDialog.tsx` | NEW | `<Dialog>` with reimbursement batch creation form |
| `SearchAllRecordsDialog.tsx` | NEW | Full-table search over candidate record type |
| `ConfidenceBadge.tsx` | NEW | Re-usable badge for `exact \| strong \| suggested \| none` |
| `ReversedIndicator.tsx` | NEW | Inline pill with link to reversal JE |
| `RuleFormDialog.tsx` | REUSE | Shared with override dialog (extract shared form body) |

---

## 6. Layout & Interaction

### 6.1 Page shell

```
┌─ PageHeader: Bank Reconciliation  ──────────────────────────────────┐
├─ Tabs: [Statements] [Review] [Revenue Gap] [Rules] ─────────────────┤
│                                                                      │
│   <tab content>                                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- Tabs use existing `src/components/ui/tabs.tsx`. Active tab: teal underline (2px) + `text-foreground font-semibold`. Inactive: `text-muted-foreground`.
- URL query drives selected tab (`?tab=review`). Statement selection within Review uses `?tab=review&statementId=…`.

### 6.2 Review tab (split-view workspace)

```
┌─ StatementProgressHeader ────────────────────────────────────────────┐
│ BCA Nov-2025 · ████████████░░░░ 71% · 47 matched · 12 sug · 8 unm   │
├───────────────── SplitViewWorkspace ─────────────────────────────────┤
│  BankLinesPane (55%)          │  CandidatesPane (45%)                │
│  ─────────────────────────    │  ─────────────────────────────       │
│  [All ▼] [Debit] [Credit]      │  filter: ±3d · exact amount         │
│  ● 19-Nov  +1,000,000 CR ✓sug  │  ▸ Reimbursement Batches (1)        │
│    BI-FAST TRANSFER            │    ● 1,000,000 · Nov-19 · Kevin Y.  │
│  ○ 30-Nov  −76,876,615 DB ⚠    │  ▸ Expenses (0)                     │
│    reimburse KEVIN YOSUA       │  ▸ Payroll (0)                      │
│  ...                           │  ▸ Revenue (0)                      │
│                                │  [🔍 Search all records]            │
├─ ReconciliationActionBar ────────────────────────────────────────────┤
│ [Match selected]  [Unmatch auto]  [Confirm]  [Confirm all exact-tier]│
└──────────────────────────────────────────────────────────────────────┘
```

Selection model (D-02, D-03):
- Single line selected at a time (left). Clicking a different line replaces selection and refreshes right pane.
- Right pane allows single candidate selection. `[Match selected]` is disabled until both are chosen.
- Selected line highlight: `bg-primary/5 border-l-4 border-primary`. Selected candidate: `bg-primary/10`.

Keyboard (Claude's discretion, recommended baseline):
- `↑ / ↓` navigate lines in left pane
- `Tab` moves focus from left pane to right pane
- `Enter` = `[Match selected]` when both sides selected
- `Esc` = clear selection

Empty states:
- No statement selected: centered card with statement picker dropdown + copy "Select a statement to start reconciling."
- All lines matched: success card with confetti-free copy "All lines matched — 67/67. Nothing left to review."
- Empty candidate group: sub-header shows `(0)` count, collapsed body with helper text "No candidates in ±3 day window. Use Search all records to widen."

### 6.3 Progress header

Uses `<Progress>` from `src/components/ui/progress.tsx`. Fill uses `--color-primary` (brand teal). Counts shown as 3 `<Badge variant="outline">` chips with color per status:
- `matched` → success
- `suggested` → warning
- `unmatched` → error muted
- `confirmed` → success solid (sub-count, appears as `✓ N confirmed`)

### 6.4 Batch Confirm preview modal

`<Dialog>` size: `max-w-2xl`. Header: "Confirm {N} matched lines". Body:
1. Summary line: "You are about to post {N} journal entries totaling {total} IDR."
2. `<Table>` grouped by DR/CR account pair: columns `Debit Account | Credit Account | Lines | Total`.
3. `<Separator>` + balance row: `Grand Total DR: X · Grand Total CR: Y`.
4. If DR ≠ CR: `<Alert variant="destructive">` "Ledger imbalance detected — post blocked. Contact an admin." and `[Post]` button is disabled.
Footer: `[Cancel]` outline, `[Post N journal entries]` primary.

### 6.5 Learn-from-override dialog

Triggered when user changes `overrideCategoryAccountId` via inline override. Appears as `<Dialog>` (NOT Sheet — keyboard focus expected). Reuses `RuleFormDialog.tsx` body.

Header: "Save as a matching rule?"
Subhead: "Future bank lines matching this pattern will be classified automatically."

Pre-filled fields (all editable):
- Counterparty pattern (text)
- Description patterns (chip input, multi-value)
- Direction (pill group: Debit / Credit)
- Match type / pattern mode (Select)
- Category + JE accounts (3 account selects)
- Confidence + priority + PL section

Footer: `[Don't save]` ghost · `[Save rule]` primary.

### 6.6 Revenue Gap tab

```
┌─ Period: [Nov 2025 ▼]                                            ┐
├──────────────────────────────────────────────────────────────────┤
│ Channel     Bank Credits   ExtRevenue    Diff      Diff %        │
│ gopay       24,500,000     24,500,000    —         0%            │
│ tokopedia   18,200,000     17,900,000   +300,000   +1.7%         │
│ shopee      12,000,000     11,400,000   +600,000   +5.3%         │
│ grabfood    35,000,000              0   +35,000,000   ⚠ no rev   │
│ (unalloc)    5,100,000              —    5,100,000               │
└──────────────────────────────────────────────────────────────────┘
```

- Period picker: shadcn `<Popover>` + calendar-less dropdown of last 12 WIB months + "Custom…" option.
- Table is `<Table>` with `tabular-nums`, IDR right-aligned.
- `Diff` positive: `text-status-warning`. Negative: `text-status-info`. Zero (`—`): `text-muted-foreground`.
- `Diff %` infinity case (D-14): render as `—` with inline `<AlertTriangle>` icon + tooltip "No external revenue recorded — bank shows money we haven't captured."
- Row click: navigates to Review tab with `?tab=review&statementId={current}&channelFilter={channel}&period={YYYY-MM}` (D-15). Hover: `bg-muted/50 cursor-pointer`.
- `(unalloc)` row: italic label, warning badge "Needs channel mapping".
- **Unmapped channels note:** The mock above shows "gopay" and "tokopedia" as separate channel rows. In the actual implementation, "gopay" maps to the "gobiz" externalSource via `mapChannelToSource` and appears in the main rows group with an ExtRevenue join against `source="gobiz"`. "tokopedia", "ovo", "dana" and similar payment-wallet channels do NOT map to any externalSource literal and appear in a collapsible "(unmapped channels)" group at the bottom of the table, rendered with ExtRevenue="—", Diff=bankCr, and a note "channel not tracked in externalRevenue" (no ⚠ infinity — the gap is expected/known, not alarming). Do NOT compute or display Diff% for unmapped rows.

### 6.7 Inline create dialogs

All three inline-create dialogs (expense, revenue, reimbursement) open as `<Dialog>` with `max-w-3xl` (expense) / `max-w-xl` (revenue, reimbursement).

**Inline Expense dialog (D-17 critical):**
- Title: "Create expense from bank line"
- Banner `<Alert>` at top: "This expense uses the standard submission flow. Receipt and owner are required even though money has already left the bank."
- Form fields: all fields from `ExpenseSubmit` — `submittedBy` (user picker), `receiptFile` (upload), `date`, `amount`, `vendorName`, `description`, `categoryAccountId`.
- Pre-filled (highlighted with `bg-[var(--invoice-field-auto)]` / border `var(--invoice-field-auto-border)` — reusing the existing invoice auto-fill token): date, amount, description, vendor.
- Required-but-not-pre-filled fields (highlighted with `bg-[var(--invoice-field-input)]`): `submittedBy`, `receiptFile`, `categoryAccountId`.
- Footer: `[Cancel]` ghost · `[Submit for approval]` primary. NEVER `[Approve now]`.
- On success: toast "Expense submitted and linked to bank line. Approve in Expense Approval queue to confirm the match."

### 6.8 CapEx handoff

For bank lines where `flags` includes `capex_needs_asset_register`:
- `[Confirm]` button is replaced with `[Route to Asset Register →]` (same position in action bar, primary variant).
- Confidence badge displays extra chip `⚙ CapEx` (`bg-muted text-muted-foreground`).
- Click navigates to `/asset-register/new?fromBankLine={lineId}`.
- Back navigation from Asset Register returns to `/bank-reconciliation?tab=review&statementId={id}&lineId={lineId}` with a toast "Asset registered. Click Confirm to post the acquisition JE."

### 6.9 Responsive behavior

- ≥ 1280px: 55/45 split, both panes side by side. Default target resolution.
- 900–1279px: 50/50 split; table columns densify (hide optional "parsedCounterparty" sub-row in lines, show on row expand).
- < 900px: stack vertically, left pane on top (full width, `max-h-50vh`), right pane below. Primary CTAs stick to bottom via `sticky bottom-0 bg-background border-t`. Framer Motion NOT used; pure CSS `md:` breakpoints.

---

## 7. States Coverage

Every interactive surface declares these states:

| State | Treatment |
|---|---|
| Default | Neutral `bg-card`, `border-border`, `text-foreground` |
| Hover | `bg-muted/50`, cursor pointer |
| Focus | `ring-2 ring-ring ring-offset-2` (uses `--color-ring` brand) |
| Selected | `bg-primary/5 border-l-4 border-primary` (rows) OR `bg-primary/10` (candidate rows) |
| Loading | `<Skeleton>` placeholder for panes; button shows `<Loader2 className="animate-spin" />` + disabled |
| Empty | Centered card with icon (lucide `Inbox` or `SearchX`), headline, helper copy, optional CTA |
| Error | `<Alert variant="destructive">` with `<AlertTriangle>` icon, AlertTitle, AlertDescription, and recovery button |
| Success | Toast via Sonner, `<CheckCircle2>` icon, teal/green accent |
| Disabled | `opacity-50 cursor-not-allowed`, no hover feedback |

Loading state specifics:
- Statement progress header: show `<Skeleton className="h-2 w-full" />` for progress bar until query resolves.
- Bank lines pane: 10 skeleton rows of height 56px.
- Candidates pane: placeholder copy "Select a bank line to see candidates."

---

## 8. Copywriting Contract

Tone: audit-tool precise, never cutesy. Match existing `BankReconciliationPage.tsx` voice.

### Primary CTAs (verb + object, title case)

| Location | Label |
|---|---|
| Action bar | `Match selected` |
| Action bar | `Unmatch auto` |
| Action bar | `Confirm` |
| Action bar | `Confirm all exact-tier` |
| Action bar (CapEx) | `Route to Asset Register` |
| Action bar (widen) | `Search all records` |
| Batch dialog | `Post N journal entries` (N is replaced with count) |
| Batch dialog | `Cancel` |
| Override dialog | `Save rule` |
| Override dialog | `Don't save` |
| Inline expense dialog | `Submit for approval` |
| Inline revenue dialog | `Create revenue record` |
| Inline reimbursement dialog | `Create reimbursement batch` |

### Empty state copy

| Surface | Copy |
|---|---|
| No statement selected | "Select a statement from the Statements tab to start reconciling." |
| All lines reconciled | "All {N} lines matched and confirmed. Nothing left to review." |
| Candidate pane (no selection) | "Select a bank line on the left to see candidate records." |
| Candidate pane (no matches in window) | "No candidates within ±3 days of this line. Use **Search all records** to widen." |
| Revenue Gap (no lines in period) | "No bank activity recorded for this period." |
| Revenue Gap (no gaps) | "All channels reconciled — no revenue gaps this period." |

### Error copy

| Error | Copy |
|---|---|
| Ledger imbalance in batch confirm | "Ledger imbalance detected (DR ≠ CR). Posting blocked. Review the selected lines or contact an admin." |
| JE post failure | "Journal entry could not be posted. The bank line remains in {prior_status} state. Try again or contact an admin." |
| Rule save failure | "Rule could not be saved. Check counterparty pattern is not empty." |
| Inline expense missing receipt | "A receipt file is required before submitting. This expense has already left the bank — we still need proof of purchase." |
| Route to Asset Register — duplicate detected | "An asset matching this vendor, amount, and date already exists. Link to existing asset or create a new one?" |

### Destructive action confirmations

| Action | Dialog title | Body copy | Confirm button |
|---|---|---|---|
| Unmatch confirmed line | "Unmatch and reverse this line?" | "The original journal entry stays in the ledger. A reversal journal entry will be created with swapped DR/CR. The bank line returns to {suggested\|unmatched}." | "Unmatch and reverse" (destructive variant) |
| Unmatch suggested/auto line (no JE) | — (no confirm, direct action) | — | — |
| Discard inline-create draft with unsaved fields | "Discard expense draft?" | "Your entered fields will be lost." | "Discard" (destructive variant) |

Reversal JE indicator copy: inline pill `Reversed on {WIB date} by {user}`. Tooltip: "Originally confirmed {WIB date}; reversed by {user} on {WIB date}. Click to view reversal journal entry."

### Toast copy

| Event | Toast |
|---|---|
| Match saved | `Line matched to {recordType}` (success) |
| Unmatch without JE | `Line unmatched` (info) |
| Unmatch with reversal | `Line unmatched — reversal journal entry posted` (success) |
| Single Confirm | `Journal entry posted` (success) |
| Batch Confirm | `{N} journal entries posted` (success) |
| Rule saved | `Rule saved — future lines will auto-classify` (success) |
| Inline expense submitted | `Expense submitted — approve in Expense Approval to confirm match` (info) |
| Inline revenue created | `Revenue record created and linked to line` (success) |
| CapEx route | `Opening Asset Register…` (info, short-lived) |

---

## 9. Accessibility Contract

- All interactive rows have `role="button"` or are actual `<button>` with `aria-pressed` for selection state.
- Split-view regions use `aria-label="Bank lines"` and `aria-label="Candidate records"`; action bar uses `role="toolbar"`.
- Confidence badges carry `aria-label` describing tier (e.g., `aria-label="Match confidence: exact"`).
- Progress bar uses shadcn `<Progress>` which outputs proper `role="progressbar"` with `aria-valuenow`.
- All icons next to text: `aria-hidden="true"`. Icon-only buttons have `aria-label`.
- Contrast: all status foreground/background pairs from `src/index.css` already meet WCAG AA in both light and dark modes (verified in P64 color token audit).
- Focus ring is visible in both modes (`--color-ring` maps to brand).
- Keyboard: full keyboard operability required for split-view (D-09 tablet/desktop).

---

## 10. Registry & Safety

| Item | Source | Safety Gate |
|---|---|---|
| shadcn/ui primitives | already vendored into `src/components/ui/` in prior phases | existing-project passed |
| Third-party registries | NONE | N/A |
| Third-party blocks | NONE | N/A |
| New npm deps | NONE | N/A |

No `npx shadcn add` calls required — every primitive listed in §1 is already present. If the planner decides a missing primitive is needed (e.g., `command` for global search), it must be added via `npx shadcn add command` (official shadcn registry only, no third-party source).

---

## 11. Source Mapping (for planner & executor)

| UI SPEC item | Source |
|---|---|
| Tabs, split-view, action bar, progress bar | CONTEXT D-02, D-03, D-13, D-24 |
| Candidate filter (±3d) & Search all records | CONTEXT D-05, D-06 |
| Per-line Confirm + batch Confirm modal | CONTEXT D-07, D-08 |
| Unmatch + reversal JE | CONTEXT D-09 |
| Learn-from-override dialog | CONTEXT D-10, D-11, D-12 |
| Revenue Gap tab | CONTEXT D-13, D-14, D-15 |
| Inline create dialogs | CONTEXT D-16, D-17, D-18, D-19 |
| CapEx handoff | CONTEXT D-20, D-21, D-22 |
| Permission gating | CONTEXT D-23 |
| Progress counts query | CONTEXT D-24 |
| Color tokens | `src/index.css` @theme block |
| Component primitives | `src/components/ui/*` |
| Date helpers | `src/lib/dateUtils.ts`, `convex/lib/periodRange.ts` |

---

## 12. Deferred (do NOT implement in P73)

- Full documented keyboard shortcut scheme (basic `↑/↓/Enter/Esc` only)
- Mobile-first layout (stacked fallback is acceptable, not polished)
- Drag-and-drop matching
- 10-second undo toast (explicit confirm modal is the safety net)
- Batch historical re-categorisation UI
- Dashboard-level reconciliation progress tile (belongs to P77 Data Health)

---

*UI-SPEC draft complete. Checker can validate against the 6 design quality dimensions.*
