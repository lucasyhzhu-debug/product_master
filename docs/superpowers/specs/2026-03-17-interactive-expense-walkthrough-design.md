# Interactive Expense Walkthrough — Design Spec

**Date:** 2026-03-17
**Status:** Approved
**Phase:** 63
**Author:** Claude + Irfan
**Extends:** `2026-03-16-help-center-design.md` (Phase 55/56 help center infrastructure)

---

## 1. Overview

Replace the text-heavy expense tutorial sections (Submit, Approve, Reimburse) with interactive visual walkthroughs. Users click through steps and see mock UI panels that look like the real app, with highlighted fields and annotation callouts explaining each step.

**Design principles:**
- **Visual-first** — mock UI panels are the centerpiece, not text descriptions
- **Click-through** — users navigate steps freely via a clickable step list
- **Decoupled mocks** — styled divs mimicking the real UI, not importing actual components
- **Reusable engine** — `WalkthroughPlayer` is generic; future guides (Orders, Kitchen) reuse it with different mock content
- **Hybrid migration** — walkthroughs replace 3 sections; Overview, Payroll, Analytics, P&L, FAQ stay as text

**Scope:** 3 workflows (Submit: 4 steps, Approve: 3 steps, Reimburse: 6 steps). Total: 13 interactive steps with 13 mock UI panels.

---

## 2. Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/components/help/WalkthroughPlayer.tsx` | Generic reusable walkthrough engine — tab bar, step list, mock panel viewport, annotation callout, keyboard nav |
| `src/components/help/walkthrough/MockElements.tsx` | Shared styled building blocks: `MockFrame`, `MockLabel`, `MockInput`, `MockSelect`, `MockButton`, `MockField`, `MockRow`, `MockTable`, `MockBadge`, `MockUploadZone`, `MockNavDropdown` |
| `src/components/help/walkthrough/SubmitMocks.tsx` | 4-step mock UI panels for the Submit Expense workflow |
| `src/components/help/walkthrough/ApproveMocks.tsx` | 3-step mock UI panels for the Approve Expense workflow |
| `src/components/help/walkthrough/ReimburseMocks.tsx` | 6-step mock UI panels for the Reimburse workflow |
| `src/components/help/walkthrough/index.ts` | Barrel export for walkthrough components |

### Modified Files

| File | Change |
|------|--------|
| `src/pages/guides/ExpenseGuide.tsx` | Replace sections 2–4 (Submit, Approve, Reimburse) with single `GuideSection id="walkthrough"` containing `WalkthroughPlayer`. Sections 1, 5–8 stay as text. Remove old step/callout/FAQ data for sections 2–4. |
| `src/components/help/index.ts` | Add export for `WalkthroughPlayer` |
| `src/lib/helpGuides.ts` | Update expenses entry sections array from 8 to 6 (overview, walkthrough, payroll, analytics, pnl, faq). Update `POPULAR_QUESTIONS`: change `anchor: "submitting"` to `anchor: "walkthrough"` and `anchor: "approving"` to `anchor: "walkthrough"`. Update `readTimeMinutes` from 15 to 10 (walkthroughs are faster than reading text). |
| `src/lib/__tests__/helpGuides.test.ts` | Update section count from 8 to 6. Update search test: "Submitting" no longer matches a section (replaced by "Interactive Walkthroughs"). Update `results.length` assertions that depend on section title matches for "submitting"/"approving". Update popular question anchor assertions if tested. |

### Documentation Updates

| File | Change |
|------|--------|
| `docs/superpowers/specs/2026-03-16-help-center-design.md` | New section: "Interactive Walkthroughs" describing WalkthroughPlayer API and mock element system |
| `docs/UI_BRAND_REFERENCE.md` | New section: "Tutorial Walkthrough Patterns" — highlight styling, annotation callouts, step list states |
| `docs/CODE_STYLE.md` | Entry for mock element convention (styled divs, not real components) |
| `CLAUDE.md` Quick File Finder | Row for tutorial walkthroughs pointing to `src/components/help/walkthrough/` |
| `docs/CHANGELOG.md` | Phase 63 entry |

### No Backend Changes

This phase is entirely frontend. No new Convex tables, queries, or mutations.

---

## 3. Data Model

### WalkthroughStep

```typescript
interface WalkthroughStep {
  id: string;           // Unique within workflow, e.g., "fill-details"
  title: string;        // Step list display text, e.g., "Fill in the details"
  description: string;  // Annotation body text
  tip?: string;         // Optional green tip callout
  warning?: string;     // Optional amber warning callout
}
```

### WalkthroughWorkflow

```typescript
interface WalkthroughWorkflow {
  id: string;           // "submit" | "approve" | "reimburse"
  label: string;        // Tab display text, e.g., "Submit an Expense"
  steps: WalkthroughStep[];
  mockComponent: ComponentType<MockPanelProps>;
}
```

### MockPanelProps

```typescript
interface MockPanelProps {
  currentStep: number;  // 0-indexed active step
  breadcrumb: string;   // Displayed in mock titlebar, e.g., "Financials > Expenses > New"
}
```

**Key decision:** Each workflow has ONE mock component that receives `currentStep` and conditionally highlights/shows/hides elements. This avoids file proliferation (one component per workflow, not per step).

---

## 4. WalkthroughPlayer Component

### Props

```typescript
interface WalkthroughPlayerProps {
  workflows: WalkthroughWorkflow[];
  defaultWorkflow?: string;  // ID of initial tab (defaults to first)
}
```

### Internal State

- `activeWorkflow: string` — which tab is selected
- `activeStep: number` — which step in the current workflow (0-indexed)

### Layout (Desktop ≥ 768px)

```
┌─────────────────────────────────────────────────────────┐
│  [Submit an Expense]  [Approve]  [Reimburse]     ← tabs │
├───────────┬─────────────────────────────────────────────┤
│ Step List │  Mock UI Panel                              │
│           │  ┌─────────────────────────────────────┐    │
│ ✓ Step 1  │  │ ● ● ●  Financials > Expenses > New │    │
│ ► Step 2  │  │                                     │    │
│   Step 3  │  │  [New Expense form mock]            │    │
│   Step 4  │  │  Fields highlighted with bright     │    │
│           │  │  indigo border + glow               │    │
│           │  └─────────────────────────────────────┘    │
│           │                                             │
│           │  ┌─ Annotation ───────────────────────┐    │
│           │  │ Step 2: Fill in the details         │    │
│           │  │ Enter description, amount, GL...    │    │
│           │  │ 💡 Use 6990 Misc OpEx if unsure    │    │
│           │  └────────────────────────────────────┘    │
│           │                                             │
│           │  ← → arrow keys or click steps to navigate  │
└───────────┴─────────────────────────────────────────────┘
```

### Behavior

- **Tab click:** switches workflow, resets step to 0
- **Step click:** jumps to that step (free navigation, not linear-only)
- **Keyboard:** `ArrowLeft`/`ArrowRight` navigate steps within current workflow
- **Step states:** completed (green checkmark, steps below active index), active (indigo highlight), future (muted)
- **Annotation:** updates with current step's `description`, `tip`, `warning`

### Transitions

Mock panel crossfades between steps using `AnimatePresence` + `motion.div` with `opacity` transition (duration 150ms). No layout animations — just a subtle fade so the content swap feels smooth without being distracting.

### Accessibility

- Workflow tabs: `role="tablist"` / `role="tab"` with `aria-selected`
- Step list: `role="list"` with `role="listitem"` per step. Active step gets `aria-current="step"`. Steps are focusable buttons.
- Mock panel: `role="region"` + `aria-live="polite"` for screen reader announcements on step change
- Arrow key navigation scoped to focused walkthrough area

---

## 5. Mock Element Primitives

Shared building blocks in `MockElements.tsx`. All use CSS variables from the app theme so they render correctly in both light and dark mode.

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `MockFrame` | Browser-like chrome (dots + breadcrumb + body) | `breadcrumb: string`, `children` |
| `MockLabel` | Form field label text | `children: ReactNode` |
| `MockInput` | Fake text input with optional value | `label: string`, `value?: string`, `highlighted?: boolean` |
| `MockSelect` | Fake dropdown with value + chevron | `label: string`, `value: string`, `highlighted?: boolean` |
| `MockButton` | Fake button (primary/ghost/destructive variants) | `variant`, `children`, `highlighted?: boolean` |
| `MockField` | Label + input wrapper | `children` |
| `MockRow` | 2-column grid for side-by-side fields | `children` |
| `MockTable` | Simple table with header + rows | `headers: string[]`, `rows: string[][]`, `highlightRow?: number` |
| `MockBadge` | Small colored badge (e.g., "Late", "Duplicate") | `variant: "warning" | "error" | "info"`, `children` |
| `MockUploadZone` | Dashed upload area with optional thumbnail | `hasFile?: boolean`, `highlighted?: boolean` |
| `MockNavDropdown` | Fake nav bar with highlighted menu item | `activeItem: string`, `highlighted?: boolean` |

### Highlight Styling

Active-step fields use bright indigo highlights that work in both modes:

```css
/* Dark mode */
border: 2px solid #818cf8;
box-shadow: 0 0 0 4px rgba(99,102,241,0.25), 0 0 12px rgba(99,102,241,0.15);

/* Light mode */
border: 2px solid #6366f1;
box-shadow: 0 0 0 4px rgba(99,102,241,0.15), 0 0 12px rgba(99,102,241,0.08);
```

In the actual implementation, this maps to Tailwind classes with dark mode variants, using the app's existing `border` and `ring` token patterns.

---

## 6. Mock UI Content — Per Workflow

### 6.1 Submit Expense (4 steps)

| Step | Title | Mock Shows | Highlighted Elements |
|------|-------|-----------|---------------------|
| 0 | Go to Expenses | Top nav with Financials dropdown open, "Expenses" item highlighted. Page shows expense list with "New Expense" button. | Nav dropdown item, New Expense button |
| 1 | Fill in the details | New Expense form with sample data: "Office supplies for March", Rp 150,000, 6500 General OpEx, 2026-03-15, Toko Sukses, Personal Cash. | Description, Amount, GL Category, Date, Vendor fields |
| 2 | Attach a receipt | Same form, receipt upload area visible. Dashed upload zone with sample receipt thumbnail. | Upload zone |
| 3 | Save or submit | Same form, bottom action area. Save Draft (ghost) and Submit (green) buttons. | Both buttons |

**Annotation content per step:**
- Step 0: "Open the Financials dropdown in the top menu, then click Expenses. Tap the New Expense button to start."
- Step 1: "Enter a description, amount in IDR, GL category, expense date, and vendor name. The payment method determines whether this goes through reimbursement (personal) or is recorded directly (company card)." Tip: "Use 6990 Miscellaneous OpEx if unsure about the GL category."
- Step 2: "Take a photo or upload an image of the receipt. Required for amounts over Rp 50,000." Warning: "Expenses over Rp 50,000 without a receipt may be rejected."
- Step 3: "Save Draft keeps the expense editable. Submit sends it to the approval queue — you cannot edit after submitting." Tip: "Need to fix something after submitting? Ask your approver to reject it so you can revise and resubmit."

### 6.2 Approve Expense (3 steps)

| Step | Title | Mock Shows | Highlighted Elements |
|------|-------|-----------|---------------------|
| 0 | Open approval queue | Expense list with "Approval" tab active. Table: 3 pending expenses. Badges: "Late" (amber), "Duplicate Warning" (red). | Approval tab, pending expense rows |
| 1 | Review the expense | Expanded expense detail card: Rp 150,000, "Office supplies", Toko Sukses, receipt thumbnail, GL 6500, "Late Submission" badge. | Detail card, fraud badges |
| 2 | Approve or reject | Bottom action bar: Approve (green), Reject (red) buttons. Reject shows textarea for reason. | Action buttons, reason textarea |

**Annotation content per step:**
- Step 0: "Open the Financials dropdown, click Expenses. The Approval tab shows expenses waiting for your review. Managers and admins only — you won't see expenses you submitted yourself."
- Step 1: "Check the amount, receipt, GL category, and vendor. Look for fraud badges: Duplicate Warning, Late Submission, or high rejection count." Warning: "A comment is required when approving expenses of Rp 500,000 or more."
- Step 2: "Approve moves the expense forward. Reject requires a reason the submitter will see. They can revise and resubmit." Tip: "See a Duplicate Warning badge? Check the linked expense before approving — it might be a genuine separate purchase."

### 6.3 Reimburse (6 steps)

| Step | Title | Mock Shows | Highlighted Elements |
|------|-------|-----------|---------------------|
| 0 | Open Reimbursement | Nav: Financials > Reimburse. Page: "Reimbursement Manager" title. | Nav item |
| 1 | Review pending | Grouped list: "Sari — 3 expenses — Rp 450,000", "Budi — 1 expense — Rp 150,000". | Employee group cards |
| 2 | Create batch | Sari's group expanded with checkboxes selected. "Create Batch" button. Batch code preview: RMB-0315-001. | Checkboxes, Create Batch button |
| 3 | Transfer via bank | Batch detail: total Rp 450,000, RMB code. Visual instruction: "Open BCA Mobile, transfer with reference RMB-0315-001". | Transfer instruction card |
| 4 | Confirm batch | Confirmation form: BCA reference input, source account selector, transfer date picker. | Form fields |
| 5 | Done | Success state: green checkmark icon, "3 expenses marked Reimbursed", batch summary card. | Success card |

**Annotation content per step:**
- Step 0: "Open the Financials dropdown, click Reimburse. This page is admin only."
- Step 1: "Approved personal expenses are grouped by employee with running totals. Review the amounts before creating a batch."
- Step 2: "Select expenses for one employee and click Create Batch. The system generates a batch code (RMB-MMDD-NNN) for bank transfer tracking."
- Step 3: "Open BCA mobile and transfer the batch total to the employee. Use the RMB code in the transfer notes so you can match it later."
- Step 4: "Back in the app, enter the BCA reference number, select the source bank account, and set the transfer date."
- Step 5: "All linked expenses in the batch are marked Reimbursed. The employee can see the status update immediately." Tip: "If the bank transfer fails, you can void the entire batch — this returns all expenses to Approved so they can be re-batched."

---

## 7. Integration with ExpenseGuide

### Before (Phase 56) — 8 TOC sections

```
GuideLayout
├── GuideSection id="overview"        (text: lifecycle flowchart + role table)
├── GuideSection id="submitting"      (text: 4 step cards + callouts + FAQ)
├── GuideSection id="approving"       (text: 3 step cards + callouts)
├── GuideSection id="reimbursement"   (text: 6 step cards + callouts)
├── GuideSection id="payroll"         (text: 4 step cards + callouts + FAQ)
├── GuideSection id="analytics"       (text: table + step cards + fraud flags)
├── GuideSection id="pnl"            (text: workflow diagram + step cards)
└── GuideSection id="faq"            (text: 5-group accordion, 16 questions)
```

### After (Phase 63) — 6 TOC sections

```
GuideLayout
├── GuideSection id="overview"        ← KEPT (unchanged)
├── GuideSection id="walkthrough"     ← NEW (replaces submitting + approving + reimbursement)
│   └── WalkthroughPlayer
│       ├── Tab: Submit an Expense (4 steps)
│       ├── Tab: Approve an Expense (3 steps)
│       └── Tab: Reimburse (6 steps)
├── GuideSection id="payroll"         ← KEPT (unchanged)
├── GuideSection id="analytics"       ← KEPT (unchanged)
├── GuideSection id="pnl"            ← KEPT (unchanged)
└── GuideSection id="faq"            ← KEPT (unchanged)
```

### Registry Change

`helpGuides.ts` expenses entry sections array updates:

```typescript
// Before (Phase 56)
sections: [
  { id: "overview", title: "Overview" },
  { id: "submitting", title: "Submitting Expenses" },
  { id: "approving", title: "Approving Expenses" },
  { id: "reimbursement", title: "Reimbursement Workflow" },
  { id: "payroll", title: "Payroll Integration" },
  { id: "analytics", title: "Expense Analytics" },
  { id: "pnl", title: "P&L Impact" },
  { id: "faq", title: "FAQ" },
]

// After (Phase 63)
sections: [
  { id: "overview", title: "Overview" },
  { id: "walkthrough", title: "Interactive Walkthroughs" },  // no role — visible to all
  { id: "payroll", title: "Payroll Integration", role: "admin" },
  { id: "analytics", title: "Expense Analytics", role: "manager" },
  { id: "pnl", title: "P&L Impact", role: "admin" },
  { id: "faq", title: "FAQ" },
]
```

**Role on walkthrough section:** Omitted (no `role` field). The walkthrough covers workflows for all, manager, and admin — the tab labels and step annotations make the audience clear per workflow.

### Deleted Code

The following data constants in `ExpenseGuide.tsx` are removed (replaced by walkthrough step data):
- `SUBMITTING_FAQ` (3 questions — GL category and receipt questions migrated to `FULL_FAQ` Submission group to maintain searchability; duplicate handling covered in walkthrough annotations)
- `DOA_NODES`, `DOA_EDGES` (replaced by approval mock UI)
- `BATCH_NODES`, `BATCH_EDGES` (replaced by reimburse mock UI)
- StepCard/CalloutBox JSX for sections 2–4

The `LIFECYCLE_NODES`/`LIFECYCLE_EDGES` (Overview), `PAYROLL_FAQ`, `PNL_NODES`/`PNL_EDGES`, and `FULL_FAQ` data stay unchanged.

---

## 8. Mobile Behavior

| Breakpoint | Step List | Mock Panel | Tabs |
|-----------|-----------|------------|------|
| ≥ 768px (desktop) | Vertical sidebar, 220px wide | Flex-grow, right side | Horizontal bar |
| < 768px (mobile) | Horizontal scrollable pill bar (like mobile TOC) | Full width below pills | Horizontal bar, smaller text |

The annotation always renders below the mock panel at all breakpoints.

---

## 9. Accessibility

| Element | ARIA Pattern | Keyboard |
|---------|-------------|----------|
| Workflow tabs | `role="tablist"` / `role="tab"` + `aria-selected` | Standard tab key navigation |
| Step list | `role="list"` with `role="listitem"` buttons. Active step: `aria-current="step"` | `ArrowLeft`/`ArrowRight` navigate steps |
| Mock panel | `role="region"` + `aria-live="polite"` | Announced on step change |
| Annotation | `aria-live="polite"` | Auto-announced with step changes |

---

## 10. Breaking Changes

| What | Before | After | Impact |
|------|--------|-------|--------|
| Deep links `#submitting`, `#approving`, `#reimbursement` | Scroll to section | No matching anchor | Low — internal links only, no external sharing. `POPULAR_QUESTIONS` anchors updated to `#walkthrough`. |
| Search for "Submitting" | Returns section match | Returns only FAQ/guide matches | Low — "expense" and "submit" still match the guide title and FAQ items |
| Section count | 8 | 6 | Tests updated |
| `readTimeMinutes` | 15 | 10 | Cosmetic |

---

## 11. Success Criteria

- [ ] `WalkthroughPlayer` renders correctly with 3 workflow tabs
- [ ] Clicking any step updates the mock panel and annotation
- [ ] Arrow key navigation works within the walkthrough
- [ ] Mock UI uses app theme variables (renders correctly in light and dark mode)
- [ ] Highlighted fields have 2px indigo border + glow shadow
- [ ] ExpenseGuide TOC shows 6 sections (down from 8)
- [ ] Deep link `/help/expenses#walkthrough` scrolls to walkthrough section
- [ ] Mobile: step list collapses to horizontal pill bar
- [ ] Overview, Payroll, Analytics, P&L, FAQ sections unchanged
- [ ] `POPULAR_QUESTIONS` anchors updated (no broken links from Help Center landing)
- [ ] `SUBMITTING_FAQ` questions migrated to `FULL_FAQ`
- [ ] Mock panel crossfade animation on step change
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] All existing `helpGuides.test.ts` tests updated and passing
- [ ] Documentation updated (help center spec, UI brand ref, CODE_STYLE, CLAUDE.md, CHANGELOG)
