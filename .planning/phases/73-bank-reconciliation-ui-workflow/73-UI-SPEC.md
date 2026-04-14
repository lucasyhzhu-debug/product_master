---
phase: 73
slug: bank-reconciliation-ui-workflow
status: draft
shadcn_initialized: true
preset: manual (pre-existing shadcn/ui in src/components/ui/*, no components.json)
created: 2026-04-14
---

# Phase 73 — UI Design Contract

> Visual and interaction contract for the Bank Reconciliation split-view workspace, Revenue Gap dashboard, learn-from-override dialog, batch Confirm preview, inline record creation dialogs, and CapEx handoff routing.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui (manual integration — no `components.json` registry) |
| Preset | not applicable — tokens defined in `src/index.css` via Tailwind v4 `@theme` |
| Component library | Radix UI primitives wrapped in `src/components/ui/*` (Dialog, Tabs, Button, Badge, Table, Input, Progress, Tooltip, Select, Command, Sheet, Form) |
| Icon library | `lucide-react` |
| Font | Inter, system-ui, -apple-system, 'Segoe UI', Roboto (from `--font-sans`) |

**Registry vetting gate:** Not applicable — the project uses shadcn source vendored directly into the repo, no new registry blocks are pulled for Phase 73. All new components in `src/components/bankReconciliation/` are internal compositions of existing vendored primitives.

---

## Spacing Scale

Declared values (multiples of 4, mapped to existing Tailwind spacing tokens):

| Token | Value | Usage in Phase 73 |
|-------|-------|-------------------|
| xs | 4px (`p-1`, `gap-1`) | Icon-to-label gaps inside badges (confidence chip, status pill); intra-row inline spacing |
| sm | 8px (`p-2`, `gap-2`) | Compact spacing inside table cells, candidate card internal padding, tab trigger horizontal padding |
| md | 16px (`p-4`, `gap-4`) | Default element spacing: dialog body padding, split-pane internal padding, form field vertical gap |
| lg | 24px (`p-6`, `gap-6`) | Section padding: tab content wrapper, progress header block, revenue gap table wrapper |
| xl | 32px (`p-8`, `gap-8`) | Page-level gap between tab bar and workspace; gap between split-view and progress header |
| 2xl | 48px | Reserved — empty-state vertical block in empty tabs |
| 3xl | 64px | Not used in Phase 73 |

**Exceptions:**
- Split-pane column gap: `12px` (`gap-3`) — between left bank lines pane and right candidate records pane on tablet landscape (900–1200px). Uses `gap-4` (16px) on desktop ≥1200px.
- Mini progress bar in `StatementHistoryList` row: fixed 6px bar height (`h-1.5`) — Tailwind component-size utility applied to a UI primitive's track height, not a layout spacing value. Do NOT use `h-1.5` for margin, padding, or gap.

---

## Typography

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Body | 14px (`text-sm`) | 400 (regular) | 1.5 (`leading-normal`) | Table rows (bank lines, candidates, revenue gap), form inputs, dialog body copy, button labels |
| Label | 12px (`text-xs`) | 600 (semibold) | 1.4 (`leading-tight`) | Column headers, field labels, group headings (`Reimbursement Batches (3)`), badge text, tooltip copy |
| Heading | 20px (`text-xl`) | 600 (semibold) | 1.2 (`leading-tight`) | Dialog titles, tab section headings (`Statement: BCA Nov-2025`), progress header statement name |
| Display | 28px (`text-3xl`) | 600 (semibold) | 1.2 (`leading-tight`) | Progress percent (`71%`) in the workspace header ONLY — single-use reinforcement |

Base font family inherited from `--font-sans` (Inter). Monospace (`font-mono`) permitted for currency amounts in tables and JE preview (`font-mono tabular-nums`) — not a new typographic role, a rendering variant for numeric alignment.

---

## Color

60 / 30 / 10 split derived from existing `--color-*` tokens in `src/index.css`:

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--color-background` = `hsl(0 0% 100%)` (white) | Page background, dialog background, table row background |
| Secondary (30%) | `--color-secondary` = `hsl(210 40% 96.1%)` (cool off-white) + `--color-muted` | Card surfaces, split-pane backgrounds, tab bar background, disabled state surfaces, `(unallocated)` synthetic row tinting |
| Accent (10%) | `--color-brand` = `#0D9488` (teal) / `--color-primary` = `hsl(172 90% 30%)` (aliases — same computed value) | Reserved elements only — see list below |
| Destructive | `--color-destructive` = `hsl(0 84.2% 60.2%)` | Unmatch button, reversal indicator, Diff-negative flag for revenue gap (ExtRev > Bank), balance-mismatch error in batch Confirm modal |

**Accent (teal) reserved for:**
1. Primary CTA buttons: `[Match selected]`, `[Confirm match]`, `[Post N journal entries]`, `[Save rule]`, `[Create expense from this line]`, `[Route to Asset Register]`
2. Active tab indicator (underline / background on `TabsTrigger[data-state=active]`)
3. Selected bank-line row highlight (left pane) — 4px left border in `--color-brand` + `--color-brand-light` row background
4. Selected candidate record highlight (right pane) — identical treatment
5. Progress bar fill (`Progress` primitive) — brand teal against `--color-secondary` track
6. Confidence badge `exact` tier — teal-tinted chip (`bg-brand-light text-brand-dark`)
7. Focus ring (`--color-ring`) on interactive elements — already the Tailwind default

**Additional semantic colors (NOT accent, reused from existing kitchen/platform palette):**
- Warning amber (`--color-kitchen-warning` = `#D4772C`) — `∞` Diff-% row in Revenue Gap (ExtRev=0, Bank>0), `capex_needs_asset_register` flag badge, `suggested` status chip
- Success green (`--color-kitchen-success` = `#3D7A4A`) — `confirmed` status chip, Diff within ±1% tolerance row indicator
- Neutral gray (`--color-kitchen-neutral` = `#718096`) — `unmatched` status chip, `(unallocated)` row text

Channel-specific colors in Revenue Gap table rows (gopay / tokopedia / shopee / grabfood / k3mart) MUST be sourced from `src/lib/platformColors.ts` — do NOT introduce new per-channel hex values in this phase.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA (bank line match) | `Match selected` |
| Primary CTA (JE post) | `Confirm match` (per-line) / `Confirm all exact-tier` (batch) |
| Primary CTA (batch modal) | `Post {N} journal entries` — N interpolated live |
| Primary CTA (inline expense) | `Create expense from this line` |
| Primary CTA (inline revenue) | `Create revenue from this line` |
| Primary CTA (inline reimbursement) | `Create reimbursement batch from this line` |
| Primary CTA (CapEx handoff) | `Route to Asset Register` |
| Primary CTA (rule learn) | `Save as rule` |
| Secondary action | `Unmatch` / `Search all records` / `Cancel` |
| Tab labels | `Statements` · `Review` · `Revenue Gap` · `Rules` |
| Empty state heading (Review, no statement selected) | `No statement open` |
| Empty state body (Review, no statement) | `Pick a statement from the Statements tab to start reconciling, or import a new BCA export.` |
| Empty state heading (Review, no unmatched lines) | `All lines reconciled` |
| Empty state body (Review, nothing to review) | `Every line in this statement is matched or confirmed. Switch statements or head to Revenue Gap to spot unrecorded income.` |
| Empty state heading (Revenue Gap, period clean) | `No revenue gaps this period` |
| Empty state body (Revenue Gap, clean) | `Every bank credit ties out to externalRevenue within tolerance. Change the period above to audit another month.` |
| Empty state heading (Candidate pane, no matches) | `No candidates within ±3 days` |
| Empty state body (Candidate pane, no matches) | `Widen the search with Search all records, or create a new record inline.` |
| Error state (JE balance mismatch, batch modal) | `Batch cannot be posted: DR {amount} ≠ CR {amount}. Review the selected lines — one or more have misconfigured accounts.` |
| Error state (mutation failure generic) | `{Action} failed. {Reason from server}. Try again, and if it persists check the browser console.` |
| Error state (CapEx, asset already exists) | `An asset matching this vendor, cost, and date is already registered. Link to existing, or continue to create a new one.` |
| Toast success (match) | `Line matched to {record type}.` |
| Toast success (confirm) | `Journal entry posted. Line confirmed.` |
| Toast success (batch confirm) | `{N} journal entries posted. Statement progress updated.` |
| Toast success (unmatch, was confirmed) | `Match removed and JE reversed. Original and reversal JE retained in the ledger.` |
| Toast success (unmatch, was auto) | `Match removed. Line returned to {new status}.` |
| Toast success (rule save) | `Rule saved. Future lines matching "{pattern summary}" will auto-classify.` |
| Destructive confirmation (Unmatch confirmed line) | `Unmatch this line? A reversal journal entry will be posted and this line will return to {new status}. The original JE stays in the ledger.` |
| Destructive confirmation (batch Confirm) | Shown as modal content per D-08, not a native confirm. Copy: `Post {N} journal entries for all exact-tier matches below? Each line's debit / credit accounts are previewed — review before posting.` |
| Warning (inline expense, pre-save) | `This expense will be submitted (not auto-approved) and the bank line stays "suggested" until a manager approves it.` |
| Warning (Revenue Gap, ∞ row) | `No externalRevenue recorded for this channel in the period. Bank credits suggest missing revenue entries.` |
| Tooltip (Reversed indicator) | `Match reversed on {wibDate} by {user.name}. Click to view reversal JE.` |
| Tooltip (confidence badge `exact`) | `Amount and date matched a rule tier-1 (exact). Batch Confirm eligible.` |
| Tooltip (confidence badge `suggested`) | `Classified by rule but not amount-linked. Confirm manually after reviewing the candidate.` |
| Tooltip (CapEx flag badge) | `This line looks like a capital expenditure. Route to Asset Register to record the asset before posting the JE.` |

---

## Interaction Contract (phase-specific)

Beyond tokens, these interactions are part of the contract the executor MUST implement:

| Interaction | Spec |
|-------------|------|
| Selection model | Click a bank-line row → row becomes selected (teal left border, brand-light bg). Clicking a different row replaces selection. Clicking a candidate row toggles candidate selection. `[Match selected]` is disabled unless BOTH sides have a selection. |
| Keyboard | `Enter` = Match (when both sides selected); `Esc` = clear both selections; `↑ / ↓` = move bank-line selection; `Tab` traps inside dialogs per Radix default. Document in a one-line helper strip under the split-view header: `Enter · match  Esc · clear  ↑↓ · navigate`. |
| Batch Confirm modal balance gate | Post button disabled and error-state styled when `grandDR !== grandCR`. Inline error row in the summary table highlighting the mismatched pair. |
| Split-view responsive breakpoint | ≥1200px: side-by-side panes 1fr/1fr with `gap-4`. 900–1199px: 1fr/1fr with `gap-3` and reduced candidate card density. <900px: stacks vertically, bank pane above candidate pane, sticky footer for `[Match selected]` / `[Unmatch auto]`. |
| Live progress | Convex reactivity — header progress bar and `StatementHistoryList` mini bars re-render automatically. Do NOT manually invalidate after mutations. |
| Drill-down (Revenue Gap → Review) | Row click navigates to `?tab=review&channel={channel}&period={YYYY-MM}`. Review tab reads URL params, pre-applies filter, clears selection. |
| CapEx pre-fill | Use URL params (`/asset-register/new?fromBankLineId={id}&date=...&cost=...&vendor=...&description=...`). URL params over sessionStorage for shareability and back-button safety. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| Internal `src/components/ui/*` (vendored shadcn) | Dialog, Sheet, Tabs, Button, Badge, Table, Input, Select, Command, Progress, Tooltip, Form, Label, Checkbox | not required — vendored in-repo prior to this phase |
| Third-party registries | none | not applicable |

No new registry blocks are introduced in Phase 73. All new components in `src/components/bankReconciliation/` are authored in this phase and compose existing vendored primitives.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved
