# Phase 56: Expense Training Guide - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/specs/2026-03-16-help-center-design.md + docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md)

<domain>
## Phase Boundary

Create the first live guide — a comprehensive Expense, Reimbursement & Payroll walkthrough at `/help/expenses` with flowcharts, step cards, callout boxes, and FAQ covering all 8 sections. This is purely frontend work using the help component infrastructure built in Phase 55.

**Phase 55 delivered (infrastructure available):**
- `WorkflowDiagram` — SVG flowchart with color-coded nodes, animated edges
- `StepCard` — Numbered steps with icon, title, description, optional tip/warning
- `CalloutBox` — Styled callouts: tip (green), warning (amber), important (orange)
- `FaqAccordion` — Grouped collapsible Q&A using shadcn Accordion
- `RoleTag` — Role badges: "All Staff" (gray), "Manager+" (blue), "Admin Only" (orange)
- `GuideSection` — Section wrapper with anchor ID and scroll-margin
- `GuideLayout` — Sticky sidebar TOC, mobile horizontal tabs, Intersection Observer active tracking
- `GuideRouter` — Renders guide by `guideId` or 404 state
- `helpGuides.ts` — Registry with expenses entry as "coming-soon", sections pre-defined

**What this phase builds:**
- `src/pages/guides/ExpenseGuide.tsx` — The full expense guide content
- Update `helpGuides.ts` — Set expenses to "live", wire component import

</domain>

<decisions>
## Implementation Decisions

### Guide Structure (8 Sections — Locked from Design Spec)
- Section 1: Overview — lifecycle flowchart (Draft→Submitted→Approved→Reimbursed with Rejected/Voided branches), role summary table
- Section 2: Submitting — 4 step cards, 3 callout boxes (tip, warning, important), mini FAQ (3 items)
- Section 3: Approving — DoA workflow diagram (≤500K→Manager/Admin, >500K→Admin only), 3 step cards, 3 callout boxes
- Section 4: Reimbursement — batch workflow diagram (6-step vertical flow), 6 step cards, 2 callout boxes
- Section 5: Payroll — 4 step cards, 3 callout boxes, 4 FAQ items
- Section 6: Analytics — dashboard card description table, 3 fraud flags explained, 1 callout
- Section 7: P&L — journal entry diagram with DR/CR flow, plain-language explanation, 3 step cards
- Section 8: FAQ — accordion with 16 questions across 5 groups (General 4, Submission 3, Approval 3, Reimbursement 3, Payroll 3)

### Content Source (Locked)
- All text content comes from sections 4-7 of the Help Center Design Spec (2026-03-16)
- All business rules come from the Expense Accounting System Design Spec (2026-03-12)
- Content is hardcoded React JSX, not fetched from database

### Component Usage (Locked)
- Use existing help components from `src/components/help/` — do NOT create new shared components
- WorkflowDiagram gets `nodes` and `edges` arrays (vertical layout, color-coded)
- StepCard gets `step`, `title`, `description`, optional `tip`/`warning`
- CalloutBox wraps children with `type` prop: "tip" | "warning" | "important"
- FaqAccordion gets `groups` array of `{ title, items: [{ question, answer }] }`
- GuideSection wraps each section with `id` and `title` for anchor linking + TOC tracking
- GuideLayout wraps entire guide with sidebar TOC

### Registry Update (Locked)
- Change expenses entry `status` from "coming-soon" to "live"
- Add `component: ExpenseGuide` (eagerly imported, not lazy — static JSX, no Convex queries)
- Do NOT modify the `sections` array (already correct from Phase 55)

### Flowchart Node Colors (Locked from Design Spec)
- Draft: gray
- Submitted: blue
- Approved: green
- Awaiting Payment: amber
- Reimbursed: green
- Rejected: red
- Voided: red

### Navigation Copy (Locked from Design Spec)
- Menu paths: "Open the **Financials** dropdown..."
- Button names: "New Expense", "Submit for Approval", "Create Batch", etc.
- Role access: kitchen/order_staff/manager/admin as documented

### Claude's Discretion
- Internal component structure of ExpenseGuide.tsx (section extraction vs monolithic)
- Whether to split very large sections into sub-components for readability
- Exact Framer Motion animation timings within sections
- Table styling within the guide (using existing Tailwind classes)
- Mobile-specific adjustments for workflow diagrams
- Whether the guide needs a brief introductory paragraph before the TOC

</decisions>

<specifics>
## Specific Ideas

### Expense Lifecycle Flowchart (Section 1)
Nodes: Draft, Submitted, Approved, Awaiting Payment, Reimbursed, Rejected, Voided
Edges: Draft→Submitted, Submitted→Approved, Submitted→Rejected, Approved→Awaiting Payment, Awaiting Payment→Reimbursed, Rejected→Submitted (dashed, "Revise"), Any→Voided (dashed)
Company card path: Approved is terminal (no Awaiting Payment)

### DoA Workflow Diagram (Section 3)
Shows the decision tree: ≤500K → Manager or Admin, >500K → Admin only, then Review + Approve/Reject, then Payment Method branch (Personal → Awaiting Payment, Company Card → Approved terminal)

### Batch Reimbursement Diagram (Section 4)
Vertical flow: Approved expenses pool → Group by employee → Create batch (RMB-MMDD-NNN) → Transfer via BCA → Enter reference + date → Confirm batch → Expenses Reimbursed ✓

### P&L Journal Entry Diagram (Section 7)
Flow: Submit expense → Manager approves → System auto-creates Journal Entry (DR 6500, CR 2200) → Shows on Financial Statement → Reduces EBIT and Net Income

### Role Summary Table (Section 1)
6 actions × 4 roles showing Yes/—/conditional access

### FAQ Question Distribution
- General: 4 questions (accounts, visibility, voiding, deletion)
- Submission: 3 questions (payment method, late submission, foreign currency)
- Approval: 3 questions (queue visibility, fraud badges, mistaken rejection)
- Reimbursement: 3 questions (failed transfer, cross-employee batch, notification)
- Payroll: 3 questions (accounts needed, staff vs contractor, pro-rata)

</specifics>

<deferred>
## Deferred Ideas

- Print/PDF export of guides (browser print if needed)
- Contextual `?` buttons per page deep-linking to guide sections (HELP-F06)
- Guide versioning / CMS (hardcoded in React, versioned by git)
- Interactive walkthrough / tooltip tour overlays
- Video tutorials embedded in guide sections

</deferred>

---

*Phase: 56-expense-training-guide*
*Context gathered: 2026-03-16 via PRD Express Path*
