# Phase 63: Interactive Visual Expense Tutorials - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/plans/2026-03-17-interactive-expense-walkthrough.md + docs/superpowers/specs/2026-03-17-interactive-expense-walkthrough-design.md)

<domain>
## Phase Boundary

Replace 3 text-heavy expense guide sections (Submit, Approve, Reimburse) with click-through visual walkthroughs using mock UI panels. A generic `WalkthroughPlayer` component renders workflow tabs, a clickable step list, and mock UI panels with annotation callouts. Three workflow-specific mock components provide visual content. The player is wired into `ExpenseGuide.tsx` replacing sections 2–4, while sections 1, 5–8 stay as text.

**Entirely frontend** — no backend changes. No new Convex tables, queries, or mutations.

</domain>

<decisions>
## Implementation Decisions

### Architecture
- Generic `WalkthroughPlayer` component receives `WalkthroughWorkflow[]` — reusable for future guides
- One mock component per workflow receiving `currentStep` — NOT one per step (avoids file proliferation)
- Mock elements are **styled divs**, NOT real shadcn/ui components — decoupled from actual UI
- AnimatePresence crossfade (150ms opacity) between steps
- Step navigation is **free** (click any step), not linear-only
- Keyboard: ArrowLeft/ArrowRight navigate steps within current workflow

### Data Model (locked)
- `WalkthroughStep`: `{ id, title, description, tip?, warning? }`
- `WalkthroughWorkflow`: `{ id, label, steps, mockComponent }`
- `MockPanelProps`: `{ currentStep: number, breadcrumb: string }`

### New Files (locked)
- `src/components/help/walkthrough/types.ts` — shared types
- `src/components/help/walkthrough/MockElements.tsx` — 11 mock UI primitives
- `src/components/help/walkthrough/SubmitMocks.tsx` — 4-step Submit workflow mock
- `src/components/help/walkthrough/ApproveMocks.tsx` — 3-step Approve workflow mock
- `src/components/help/walkthrough/ReimburseMocks.tsx` — 6-step Reimburse workflow mock
- `src/components/help/walkthrough/index.ts` — barrel export
- `src/components/help/WalkthroughPlayer.tsx` — generic walkthrough engine

### Modified Files (locked)
- `src/components/help/index.ts` — add WalkthroughPlayer + type exports
- `src/pages/guides/ExpenseGuide.tsx` — replace sections 2–4 with WalkthroughPlayer, remove old data constants, migrate 2 FAQ items
- `src/lib/helpGuides.ts` — sections 8→6, POPULAR_QUESTIONS anchors, readTimeMinutes 15→10
- `src/lib/__tests__/helpGuides.test.ts` — update 4 tests for new section structure

### Section Changes (locked)
- Before: 8 sections (overview, submitting, approving, reimbursement, payroll, analytics, pnl, faq)
- After: 6 sections (overview, walkthrough, payroll, analytics, pnl, faq)
- Walkthrough section has NO `role` field (visible to all)
- Deep links `#submitting`, `#approving`, `#reimbursement` become `#walkthrough`
- 2 FAQ items from SUBMITTING_FAQ migrate to FULL_FAQ "Submission" group

### Mock Element Primitives (locked — 11 components)
- `MockFrame` — browser chrome with dots + breadcrumb
- `MockLabel`, `MockInput`, `MockSelect`, `MockButton`, `MockField`, `MockRow`
- `MockTable` — with `highlightRow` prop
- `MockBadge` — warning/error/info variants
- `MockUploadZone` — dashed upload area
- `MockNavDropdown` — fake nav with highlighted item

### Highlight Styling (locked)
- Indigo highlights (NOT brand teal) for tutorial annotations
- Dark: `border-2 border-indigo-400`, shadow with `rgba(99,102,241,0.25)`
- Light: `border-2 border-indigo-500`, shadow with `rgba(99,102,241,0.15)`
- Shared `HIGHLIGHT_CLASSES` constant exported from MockElements

### Workflow Content (locked — 13 total steps)
- Submit Expense: 4 steps (navigate, fill details, attach receipt, save/submit)
- Approve Expense: 3 steps (open queue, review, approve/reject)
- Reimburse: 6 steps (open, review pending, create batch, transfer, confirm, done)
- Each step has title, description, optional tip/warning — all content specified in spec

### Mobile Behavior (locked)
- Desktop (≥768px): vertical step list sidebar + mock panel right
- Mobile (<768px): horizontal scrollable pill bar + full-width mock below
- Annotation always below mock panel at all breakpoints

### Accessibility (locked)
- Workflow tabs: `role="tablist"` / `role="tab"` + `aria-selected`
- Step list: `role="list"` with button `role="listitem"`, `aria-current="step"` on active
- Mock panel: `role="region"` + `aria-live="polite"`
- Annotation: `aria-live="polite"`

### Documentation Updates (locked)
- Help center spec: new section on WalkthroughPlayer API
- UI brand reference: Tutorial Walkthrough Patterns (highlight styling, annotation, step states)
- CODE_STYLE.md: mock element convention entry
- CLAUDE.md: Quick File Finder row for tutorial walkthroughs
- CHANGELOG.md: Phase 63 entry

### Claude's Discretion
- Implementation chunk ordering (foundation → mocks → integration → docs is suggested but flexible)
- Exact Tailwind class choices for non-specified styling (padding, gaps, etc.) as long as consistent
- Whether to split the plan into 1 or multiple GSD PLAN.md files
- Commit granularity within the wave structure

</decisions>

<specifics>
## Specific Ideas

### Mock Content Details
- Submit step 1 sample data: "Office supplies for March", Rp 150,000, 6500 General OpEx, 2026-03-15, Toko Sukses, Personal Cash
- Approve step 0: 3 pending expenses in table with "Late" and "Duplicate" badges
- Reimburse step 2: Sari — 3 expenses, Rp 450,000, batch code RMB-0315-001
- Reimburse step 5: green checkmark success state

### Breadcrumb Mapping
- Submit: "Financials > Expenses" → "Financials > Expenses > New Expense"
- Approve: "Financials > Expenses > Approval" → "Financials > Expenses > Approval > Detail"
- Reimburse: "Financials > Reimburse" → "Financials > Reimburse > Batch RMB-0315-001"

### CalloutBox Integration
- WalkthroughPlayer uses existing `CalloutBox` component for tip/warning rendering in annotations

### Deleted Constants
- `SUBMITTING_FAQ`, `DOA_NODES`, `DOA_EDGES`, `BATCH_NODES`, `BATCH_EDGES` — all replaced by walkthrough
- `LIFECYCLE_NODES`/`LIFECYCLE_EDGES`, `PAYROLL_FAQ`, `PNL_NODES`/`PNL_EDGES`, `FULL_FAQ` — kept unchanged

</specifics>

<deferred>
## Deferred Ideas

- Future walkthrough guides for Orders, Kitchen (mentioned as reusable engine benefit)
- No other items deferred — PRD and spec fully cover phase scope

</deferred>

---

*Phase: 63-interactive-visual-expense-tutorials*
*Context gathered: 2026-03-17 via PRD Express Path*
