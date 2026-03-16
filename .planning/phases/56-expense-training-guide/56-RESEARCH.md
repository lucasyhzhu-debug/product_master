# Phase 56: Expense Training Guide - Research

**Researched:** 2026-03-16
**Domain:** Frontend content page (React JSX) using existing help component infrastructure
**Confidence:** HIGH

## Summary

Phase 56 is a purely frontend, content-authoring phase. All infrastructure was delivered in Phase 55: seven reusable help components (`WorkflowDiagram`, `StepCard`, `CalloutBox`, `FaqAccordion`, `RoleTag`, `GuideSection`, `GuideLayout`), the guide registry (`helpGuides.ts`), the `GuideRouter`, and routing/navigation integration. This phase creates a single file (`ExpenseGuide.tsx`) and makes a minimal registry update (status `"coming-soon"` to `"live"`, add `component` import).

The content source is fully specified in two design documents: the Help Center Design Spec (sections 4-7 of `docs/superpowers/specs/2026-03-16-help-center-design.md`) and the Expense Accounting System Design Spec (`docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md`). All text, diagrams, tables, step cards, callout boxes, and FAQ answers are defined in these specs. Implementation is mechanical: translate spec content into React JSX using the existing component APIs.

**Primary recommendation:** Build `ExpenseGuide.tsx` as a single file with 8 `GuideSection` blocks wrapped in `GuideLayout`. Extract section content into inline constants (node/edge arrays for diagrams, FAQ groups) at the top of the file for readability. Do NOT create sub-component files -- the locked decision says "Use existing help components, do NOT create new shared components." Internal function extraction within the file is fine for managing size.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Guide has 8 sections: Overview, Submitting, Approving, Reimbursement, Payroll, Analytics, P&L, FAQ
- All text content comes from Help Center Design Spec (2026-03-16) sections 4-7 and Expense Accounting System Design Spec (2026-03-12)
- Content is hardcoded React JSX, not fetched from database
- Use existing help components from `src/components/help/` -- do NOT create new shared components
- WorkflowDiagram gets `nodes` and `edges` arrays (vertical layout, color-coded)
- StepCard gets `step`, `title`, `description`, optional `tip`/`warning`
- CalloutBox wraps children with `type` prop: "tip" | "warning" | "important"
- FaqAccordion gets `groups` array of `{ title, items: [{ question, answer }] }`
- GuideSection wraps each section with `id` and `title` for anchor linking + TOC tracking
- GuideLayout wraps entire guide with sidebar TOC
- Change expenses entry `status` from "coming-soon" to "live"
- Add `component: ExpenseGuide` (eagerly imported, not lazy)
- Do NOT modify the `sections` array (already correct from Phase 55)
- Flowchart node colors: Draft=gray, Submitted=blue, Approved=green, Awaiting Payment=amber, Reimbursed=green, Rejected=red, Voided=red
- Menu paths: "Open the **Financials** dropdown..."
- Button names: "New Expense", "Submit for Approval", "Create Batch", etc.

### Claude's Discretion
- Internal component structure of ExpenseGuide.tsx (section extraction vs monolithic)
- Whether to split very large sections into sub-components for readability
- Exact Framer Motion animation timings within sections
- Table styling within the guide (using existing Tailwind classes)
- Mobile-specific adjustments for workflow diagrams
- Whether the guide needs a brief introductory paragraph before the TOC

### Deferred Ideas (OUT OF SCOPE)
- Print/PDF export of guides (browser print if needed)
- Contextual `?` buttons per page deep-linking to guide sections (HELP-F06)
- Guide versioning / CMS (hardcoded in React, versioned by git)
- Interactive walkthrough / tooltip tour overlays
- Video tutorials embedded in guide sections

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EGUIDE-01 | Full expense/reimbursement/payroll guide at `/help/expenses` with 8 sections | Create `ExpenseGuide.tsx` with 8 `GuideSection` blocks in `GuideLayout`; update registry status to "live" + wire component |
| EGUIDE-02 | Overview section with lifecycle flowchart and role summary table | `WorkflowDiagram` with 7 nodes + 7 edges (see lifecycle node/edge data below); HTML table with 6 actions x 4 roles |
| EGUIDE-03 | Submitting section with 4 step cards, 3 callout boxes, mini FAQ | 4x `StepCard`, 3x `CalloutBox`, `FaqAccordion` with 1 group / 3 items |
| EGUIDE-04 | Approving section with DoA workflow diagram, 3 step cards, 3 callout boxes | `WorkflowDiagram` for DoA flow, 3x `StepCard`, 3x `CalloutBox` |
| EGUIDE-05 | Reimbursement section with batch workflow diagram, 6 step cards, 2 callout boxes | `WorkflowDiagram` for batch flow (7 nodes vertical), 6x `StepCard`, 2x `CalloutBox` |
| EGUIDE-06 | Payroll section with 4 step cards, 3 callout boxes, 4 FAQ items | 4x `StepCard`, 3x `CalloutBox`, `FaqAccordion` with 1 group / 4 items |
| EGUIDE-07 | Expense Analytics section with dashboard card descriptions + fraud flags | HTML description table for 6 dashboard cards, 3 fraud flags with explanations, 1x `CalloutBox` |
| EGUIDE-08 | P&L connection with journal entry diagram showing DR/CR flow | `WorkflowDiagram` for JE flow (5 nodes), plain text explanation, 3x `StepCard` |
| EGUIDE-09 | Full FAQ accordion: General(4), Submission(3), Approval(3), Reimbursement(3), Payroll(3) | `FaqAccordion` with 5 groups / 16 total items; answers from design spec Section 8 |

</phase_requirements>

## Standard Stack

### Core (Already Installed -- No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.2.0 | UI framework | Project stack |
| TypeScript | ~5.9 | Type safety | Project stack |
| Framer Motion | (installed) | Animations | Used by WorkflowDiagram, GuideLayout |
| Lucide React | (installed) | Icons | StepCard icons |
| shadcn/ui Accordion | (installed) | FaqAccordion base | Via Radix UI |

### Supporting (Already Installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-router-dom | ^7.13 | Deep linking via anchors | Already wired in GuideRouter |
| Tailwind CSS | ^4.1 | Table styling, spacing | Guide content styling |

### Alternatives Considered

None -- this phase uses exclusively existing infrastructure. No new libraries needed.

**Installation:**
```bash
# No installation required -- all dependencies already in project
```

## Architecture Patterns

### File Structure
```
src/
  pages/
    guides/
      ExpenseGuide.tsx      # NEW -- the full guide content (~600-800 lines)
      GuideRouter.tsx        # EXISTING -- already wired
  lib/
    helpGuides.ts            # MODIFY -- status + component import
  components/
    help/
      WorkflowDiagram.tsx    # EXISTING -- used for flowcharts
      StepCard.tsx           # EXISTING -- used for step sequences
      CalloutBox.tsx         # EXISTING -- used for tips/warnings
      FaqAccordion.tsx       # EXISTING -- used for FAQ sections
      RoleTag.tsx            # EXISTING -- used by GuideSection
      GuideSection.tsx       # EXISTING -- section wrapper
      GuideLayout.tsx        # EXISTING -- page layout
      index.ts               # EXISTING -- barrel export
  lib/
    __tests__/
      helpGuides.test.ts     # MODIFY -- update test expectations
```

### Pattern: Guide Page Structure

Every guide page follows this template (established by the Phase 55 infrastructure):

```typescript
import {
  GuideLayout,
  GuideSection,
  WorkflowDiagram,
  StepCard,
  CalloutBox,
  FaqAccordion,
  type FlowNode,
  type FlowEdge,
  type FaqGroup,
} from "@/components/help";
import { HELP_GUIDES } from "@/lib/helpGuides";

// Extract the guide config for metadata
const GUIDE = HELP_GUIDES.find((g) => g.id === "expenses")!;

// Data constants (nodes, edges, FAQ groups) defined here

export function ExpenseGuide() {
  return (
    <GuideLayout
      title={GUIDE.title}
      description={GUIDE.description}
      sections={GUIDE.sections}
      readTimeMinutes={GUIDE.readTimeMinutes}
    >
      <GuideSection id="overview" title="Overview">
        {/* Section content */}
      </GuideSection>
      <GuideSection id="submitting" title="Submitting Expenses" role="all">
        {/* Section content */}
      </GuideSection>
      {/* ... remaining 6 sections */}
    </GuideLayout>
  );
}
```

### Pattern: Registry Wiring

```typescript
// In helpGuides.ts -- change 2 lines on the expenses entry:
import { ExpenseGuide } from "@/pages/guides/ExpenseGuide";

// In the expenses entry:
status: "live",          // was: "coming-soon"
component: ExpenseGuide, // was: absent
```

### Pattern: WorkflowDiagram Data (Vertical Linear)

The `WorkflowDiagram` component positions ALL nodes in a single vertical column (centered at `SVG_WIDTH / 2`). Nodes are spaced 70px apart vertically. Edges draw straight lines between node centers with arrowheads.

**Critical constraint:** The component does NOT support branching/side-by-side layout. All nodes stack vertically. For branching flows (lifecycle with Rejected/Voided, DoA decision tree), flatten the flow into a vertical sequence and use edge labels + dashed styles to indicate branches.

Example lifecycle diagram data:
```typescript
const LIFECYCLE_NODES: FlowNode[] = [
  { id: "draft", label: "Draft", color: "gray" },
  { id: "submitted", label: "Submitted", color: "blue" },
  { id: "approved", label: "Approved", color: "green" },
  { id: "awaiting", label: "Awaiting Payment", color: "amber" },
  { id: "reimbursed", label: "Reimbursed", color: "green" },
  { id: "rejected", label: "Rejected", color: "red" },
  { id: "voided", label: "Voided", color: "red" },
];

const LIFECYCLE_EDGES: FlowEdge[] = [
  { from: "draft", to: "submitted" },
  { from: "submitted", to: "approved" },
  { from: "approved", to: "awaiting" },
  { from: "awaiting", to: "reimbursed" },
  { from: "submitted", to: "rejected", label: "Reject", style: "dashed" },
  { from: "rejected", to: "submitted", label: "Revise", style: "dashed" },
  // Note: "Any -> Voided" is described in text, not as edges (would clutter SVG)
];
```

**Important edge rendering note:** Edges connecting non-adjacent nodes (e.g., `submitted -> rejected` which spans 4 positions) will render as diagonal lines crossing over intermediate nodes. This is acceptable for the vertical-only layout -- the design spec anticipated this by noting "Vertical layout only -- simpler to implement and works on all screen sizes." For the lifecycle diagram, consider placing Rejected right after Submitted (position index 2) and Voided at the end to minimize diagonal crossings. Alternatively, describe branching paths in text alongside the primary happy-path diagram.

### Pattern: Tables in Guide Content

Tables in the guide (role summary, analytics cards) use standard HTML `<table>` with Tailwind classes. No shadcn Table component needed since these are static display tables.

```typescript
<div className="overflow-x-auto">
  <table className="w-full text-sm border-collapse">
    <thead>
      <tr className="border-b">
        <th className="text-left py-2 px-3 font-medium">Action</th>
        {/* ... */}
      </tr>
    </thead>
    <tbody>
      <tr className="border-b">
        <td className="py-2 px-3">Submit expenses</td>
        {/* ... */}
      </tr>
    </tbody>
  </table>
</div>
```

### Anti-Patterns to Avoid

- **Creating new shared components:** The locked decision explicitly says "do NOT create new shared components." All rendering must use existing `src/components/help/` exports.
- **Lazy loading the guide:** The decision says eager import. Guide is static JSX with no Convex queries, so lazy loading adds complexity for no benefit.
- **Modifying the sections array:** The sections array in `helpGuides.ts` is already correct from Phase 55. Do NOT change it.
- **Using Convex queries in the guide:** This is a static content page. No `useQuery` or `useMutation` calls.
- **Splitting into multiple files:** The CONTEXT.md says "do NOT create new shared components" for `src/components/help/`. Internal helper functions within `ExpenseGuide.tsx` are fine, but avoid creating separate files in `src/components/help/` or `src/pages/guides/` for sub-sections.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Flowchart diagrams | Custom SVG per section | `WorkflowDiagram` component | Already handles animations, coloring, responsive viewBox |
| Step sequences | Custom numbered lists | `StepCard` component | Connected dotted lines, icon support, tip/warning integration |
| Callout boxes | Styled divs | `CalloutBox` component | Consistent theming, dark mode, icon selection |
| FAQ accordion | Custom collapsible | `FaqAccordion` component | Radix-based accessibility, grouped sections |
| Section anchoring | Manual ID assignment | `GuideSection` component | scroll-margin-top, role tags, consistent heading |
| Page layout + TOC | Manual sidebar | `GuideLayout` component | Sticky sidebar, mobile tabs, Intersection Observer tracking |
| Active section tracking | Manual scroll listener | `useActiveSection` hook | Already handles rootMargin, cleanup |

**Key insight:** Every visual element in this phase has a dedicated component. The implementation is purely content assembly -- no UI engineering.

## Common Pitfalls

### Pitfall 1: Existing Test Will Break
**What goes wrong:** The test at `src/lib/__tests__/helpGuides.test.ts` line 84-87 asserts ALL guides are `"coming-soon"`. Changing expenses to `"live"` breaks this test.
**Why it happens:** Phase 55 wrote tests reflecting initial state where all guides were coming-soon.
**How to avoid:** Update the test: change "all entries are coming-soon" to check that expenses is "live" and others remain "coming-soon". Also update count assertions if needed.
**Warning signs:** `npm run test` fails after registry change.

### Pitfall 2: GuideSection IDs Must Match Registry
**What goes wrong:** If `GuideSection id` props don't exactly match the `sections[].id` values in `helpGuides.ts`, TOC active tracking and deep linking break silently.
**Why it happens:** `useActiveSection` observes elements by ID, and `GuideLayout` renders TOC links from the sections array. Mismatches mean Intersection Observer finds nothing.
**How to avoid:** Use the exact IDs from the existing registry: `overview`, `submitting`, `approving`, `reimbursement`, `payroll`, `analytics`, `pnl`, `faq`.
**Warning signs:** TOC items don't highlight on scroll; anchor links (e.g., `/help/expenses#submitting`) scroll to wrong position or nowhere.

### Pitfall 3: WorkflowDiagram Branching Limitations
**What goes wrong:** Trying to create side-by-side branching layouts with WorkflowDiagram produces overlapping nodes since all nodes are centered vertically.
**Why it happens:** `getNodePosition` always returns `x = SVG_WIDTH / 2`. There is no horizontal offset support.
**How to avoid:** Accept the vertical-only constraint. Order nodes to minimize diagonal edge crossings. Use edge labels to clarify branching. Supplement with text descriptions for complex branching logic. Consider using multiple smaller diagrams (e.g., separate "happy path" and "rejection path" diagrams) rather than one complex branching diagram.
**Warning signs:** Edges crossing through node rectangles, unreadable diagram.

### Pitfall 4: StepCard isLast Prop
**What goes wrong:** The last `StepCard` in a sequence renders a trailing dotted connector line extending below it.
**Why it happens:** The `isLast` prop suppresses the connector line. Forgetting to set `isLast={true}` on the final card in each sequence creates a visual artifact.
**How to avoid:** Always set `isLast` on the last `StepCard` in each section.
**Warning signs:** Dangling dotted line below the last step.

### Pitfall 5: FaqAccordion Answer Types
**What goes wrong:** Complex FAQ answers with bold text or links are passed as plain strings, losing formatting.
**Why it happens:** `FaqItem.answer` accepts `string | ReactNode`. Plain strings get wrapped in `<p className="text-muted-foreground">`. ReactNode answers are rendered directly.
**How to avoid:** Use ReactNode (JSX) for answers that need bold text, account codes, or links. Use strings only for simple single-paragraph answers.
**Warning signs:** Missing formatting in FAQ answers.

### Pitfall 6: File Size Management
**What goes wrong:** `ExpenseGuide.tsx` becomes a 1000+ line wall of JSX that is hard to review or modify.
**Why it happens:** 8 sections with diagrams, step cards, callouts, tables, and FAQ data adds up quickly.
**How to avoid:** Extract data constants (node arrays, edge arrays, FAQ groups, table data) to the top of the file. Use internal helper functions for repeated patterns. The Claude's Discretion area allows this.
**Warning signs:** File exceeds 800 lines without clear organization.

## Code Examples

### Example 1: Complete Section with StepCards + CalloutBoxes

```typescript
// Source: Phase 55 component APIs (verified from source)
<GuideSection id="submitting" title="Submitting Expenses" role="all">
  <p className="text-muted-foreground mb-6">
    Any staff member can submit expense claims for approval.
  </p>

  <div className="space-y-0">
    <StepCard
      step={1}
      title="Go to Expenses"
      description='Open the Financials dropdown in the top menu, click Expenses. Then tap the "New Expense" button.'
      icon={Receipt}
    />
    <StepCard
      step={2}
      title="Fill in the details"
      description="Description, amount (IDR), GL category, expense date, vendor name, payment method."
    />
    {/* ... more steps ... */}
    <StepCard
      step={4}
      title="Save as draft or submit"
      description="Save Draft keeps it editable. Submit sends it to the approval queue."
      isLast
    />
  </div>

  <div className="mt-8 space-y-4">
    <CalloutBox type="tip">
      If you're not sure about the GL category, use '6990 Miscellaneous OpEx' -- your approver can ask you to correct it.
    </CalloutBox>
    <CalloutBox type="warning">
      Expenses submitted more than 14 days after the expense date get flagged as 'Late Submission.'
    </CalloutBox>
    <CalloutBox type="important">
      Once submitted, you can't edit. Ask your approver to reject it so you can resubmit.
    </CalloutBox>
  </div>

  <div className="mt-8">
    <h3 className="text-lg font-semibold mb-4">Common Questions</h3>
    <FaqAccordion groups={SUBMITTING_FAQ} />
  </div>
</GuideSection>
```

### Example 2: WorkflowDiagram with Edge Labels

```typescript
// Source: WorkflowDiagram component API (verified from source)
const BATCH_NODES: FlowNode[] = [
  { id: "pool", label: "Approved Expenses Pool", color: "green" },
  { id: "group", label: "Group by Employee", color: "blue" },
  { id: "batch", label: "Create Batch", color: "blue" },
  { id: "transfer", label: "Transfer via BCA", color: "amber" },
  { id: "reference", label: "Enter Reference + Date", color: "blue" },
  { id: "confirm", label: "Confirm Batch", color: "blue" },
  { id: "done", label: "Expenses Reimbursed", color: "green" },
];

const BATCH_EDGES: FlowEdge[] = [
  { from: "pool", to: "group" },
  { from: "group", to: "batch" },
  { from: "batch", to: "transfer", label: "RMB-MMDD-NNN" },
  { from: "transfer", to: "reference" },
  { from: "reference", to: "confirm" },
  { from: "confirm", to: "done" },
];

// Usage:
<WorkflowDiagram
  nodes={BATCH_NODES}
  edges={BATCH_EDGES}
  title="Reimbursement Batch Workflow"
/>
```

### Example 3: FaqAccordion with Grouped Questions

```typescript
// Source: FaqAccordion component API (verified from source)
const FULL_FAQ: FaqGroup[] = [
  {
    title: "General",
    items: [
      {
        question: "Do I need a Frollie Pro account to have a payroll account?",
        answer: (
          <p className="text-muted-foreground">
            There is no "Frollie Pro." All features are available to all users
            based on their role (kitchen, order_staff, manager, admin). Payroll
            is a feature only admins can access.
          </p>
        ),
      },
      // ... more items
    ],
  },
  {
    title: "Submission",
    items: [/* ... */],
  },
  // ... 3 more groups
];
```

### Example 4: Registry Update

```typescript
// Source: helpGuides.ts current state (verified from source)
// At the top of helpGuides.ts, add:
import { ExpenseGuide } from "@/pages/guides/ExpenseGuide";

// In the expenses entry, change:
{
  id: "expenses",
  // ... title, description, icon, sections (unchanged) ...
  status: "live",              // was: "coming-soon"
  isNew: true,
  component: ExpenseGuide,     // was: absent
},
```

### Example 5: Role Summary Table

```typescript
// Source: Design spec Section 4, "Role summary table"
<div className="overflow-x-auto mt-6">
  <table className="w-full text-sm border-collapse">
    <thead>
      <tr className="border-b">
        <th className="text-left py-2 px-3 font-medium">Action</th>
        <th className="text-center py-2 px-3 font-medium">Kitchen</th>
        <th className="text-center py-2 px-3 font-medium">Order Staff</th>
        <th className="text-center py-2 px-3 font-medium">Manager</th>
        <th className="text-center py-2 px-3 font-medium">Admin</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b">
        <td className="py-2 px-3">Submit expenses</td>
        <td className="text-center py-2 px-3">Yes</td>
        <td className="text-center py-2 px-3">Yes</td>
        <td className="text-center py-2 px-3">Yes</td>
        <td className="text-center py-2 px-3">Yes</td>
      </tr>
      {/* ... 5 more rows */}
    </tbody>
  </table>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static docs / wiki | In-app help guides with live components | Phase 55 (2026-03-16) | Users stay in-app, content uses existing design system |
| One giant guide file | Data-driven registry + per-guide components | Phase 55 architecture | Adding future guides = one file + one registry entry |

**Nothing deprecated/outdated for this phase.** All infrastructure is from Phase 55 (same milestone).

## Open Questions

1. **WorkflowDiagram for complex branching flows**
   - What we know: The component only supports vertical linear layout (all nodes centered)
   - What's unclear: How well will the DoA decision tree and lifecycle branching render with diagonal edge crossings?
   - Recommendation: For the lifecycle diagram, place the 5 happy-path nodes first (Draft -> Submitted -> Approved -> Awaiting Payment -> Reimbursed), then Rejected and Voided at the bottom. Use dashed edges with labels for branch paths. For DoA and batch diagrams which are more linear, the vertical layout works naturally. If a diagram looks too cluttered with diagonal edges, consider splitting into two smaller diagrams (happy path + exception paths) or supplement with text descriptions.

2. **File size of ExpenseGuide.tsx**
   - What we know: 8 sections with rich content, 4 diagrams, ~25 step cards, ~14 callout boxes, ~20 FAQ items
   - What's unclear: Final line count (estimated 600-900 lines)
   - Recommendation: Extract all data constants (node/edge arrays, FAQ groups) to the top of the file. Use internal render functions for repeated section patterns. This stays within Claude's Discretion area. Do NOT create separate files -- keep everything in `ExpenseGuide.tsx`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/__tests__/helpGuides.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EGUIDE-01 | Guide renders at `/help/expenses` with 8 sections | smoke (build) | `npm run build` | N/A |
| EGUIDE-01 | Registry shows expenses as "live" with component | unit | `npx vitest run src/lib/__tests__/helpGuides.test.ts` | Exists (needs update) |
| EGUIDE-02 | Overview has flowchart nodes + role table | manual-only | Visual inspection | N/A |
| EGUIDE-03 | Submitting has 4 steps, 3 callouts, mini FAQ | manual-only | Visual inspection | N/A |
| EGUIDE-04 | Approving has DoA diagram, 3 steps, 3 callouts | manual-only | Visual inspection | N/A |
| EGUIDE-05 | Reimbursement has batch diagram, 6 steps, 2 callouts | manual-only | Visual inspection | N/A |
| EGUIDE-06 | Payroll has 4 steps, 3 callouts, 4 FAQ items | manual-only | Visual inspection | N/A |
| EGUIDE-07 | Analytics has dashboard table + fraud flags | manual-only | Visual inspection | N/A |
| EGUIDE-08 | P&L has journal entry diagram + 3 steps | manual-only | Visual inspection | N/A |
| EGUIDE-09 | FAQ accordion with 5 groups, 16 questions | unit | `npx vitest run src/lib/__tests__/helpGuides.test.ts` | Exists (needs update) |
| ALL | Build succeeds | build | `npm run build` | N/A |
| ALL | Type check passes | type-check | `npm run type-check` | N/A |

### Sampling Rate
- **Per task commit:** `npm run type-check && npx vitest run src/lib/__tests__/helpGuides.test.ts`
- **Per wave merge:** `npm run test && npm run build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/helpGuides.test.ts` -- needs update: change "all entries are coming-soon" assertion to check expenses="live" + has component, others="coming-soon"; current test at line 84-87 will fail

*(Content rendering is static JSX -- the primary validation is build success + visual inspection. No additional test files needed.)*

## Sources

### Primary (HIGH confidence)
- `src/components/help/WorkflowDiagram.tsx` -- Full component API, FlowNode/FlowEdge types, layout constants (NODE_WIDTH=180, VERTICAL_SPACING=70, SVG_WIDTH=400)
- `src/components/help/StepCard.tsx` -- Props: step, title, description, icon, tip, warning, isLast
- `src/components/help/CalloutBox.tsx` -- Props: type ("tip"|"warning"|"important"), children (ReactNode)
- `src/components/help/FaqAccordion.tsx` -- Props: groups (FaqGroup[]); FaqItem answer accepts string|ReactNode
- `src/components/help/GuideSection.tsx` -- Props: id, title, role (optional), children
- `src/components/help/GuideLayout.tsx` -- Props: title, description, sections, readTimeMinutes, children
- `src/components/help/RoleTag.tsx` -- Props: role ("all"|"manager"|"admin")
- `src/lib/helpGuides.ts` -- Registry with expenses entry at status "coming-soon", sections pre-defined
- `src/pages/guides/GuideRouter.tsx` -- Renders guide.component when status="live" and component exists
- `src/hooks/useActiveSection.ts` -- IntersectionObserver hook for scroll tracking
- `src/lib/__tests__/helpGuides.test.ts` -- Existing tests that need update
- `docs/superpowers/specs/2026-03-16-help-center-design.md` -- Sections 4-7: all guide content
- `docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md` -- Business rules, lifecycle, DoA, journal entries

### Secondary (MEDIUM confidence)
- None needed -- all sources are project-local files

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all components verified from source
- Architecture: HIGH -- single file creation + minimal registry change, APIs fully documented
- Pitfalls: HIGH -- identified from reading actual component source code and existing test file
- Content accuracy: HIGH -- all content defined in two design specs within the project

**Research date:** 2026-03-16
**Valid until:** Indefinite (all findings are from project-local files, not external libraries)
