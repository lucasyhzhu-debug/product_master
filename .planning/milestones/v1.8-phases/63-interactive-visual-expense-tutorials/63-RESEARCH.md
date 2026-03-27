# Phase 63: Interactive Visual Expense Tutorials - Research

**Researched:** 2026-03-17
**Domain:** Frontend UI (React components, Framer Motion animations, Tailwind CSS 4 styling)
**Confidence:** HIGH

## Summary

Phase 63 is an entirely frontend phase that replaces three text-heavy expense guide sections (Submit, Approve, Reimburse) with interactive click-through visual walkthroughs. The scope is well-defined: 7 new files, 4 modified files, and documentation updates. No backend changes are needed.

The implementation builds on the existing Phase 55/56 help center infrastructure (`GuideLayout`, `GuideSection`, `CalloutBox`, `FaqAccordion`, `WorkflowDiagram`) and introduces a new generic `WalkthroughPlayer` component with mock UI primitives. The mock elements are styled divs using Tailwind CSS 4 classes with the project's existing dark mode approach (`@custom-variant dark`), NOT real shadcn/ui components. All required libraries (React 19, Framer Motion, Tailwind CSS 4, Lucide React) are already installed in the project.

**Critical Phase 59 alignment note:** The expense system was overhauled in Phase 59. The schema now has 3 payment method literals (`employee_paid`, `company_paid`, `payment_request`) and additional statuses (`recorded`, `paid`). The walkthrough mock content in the PRD spec correctly shows the most common flow (employee_paid/personal) and the annotation text accurately explains the payment method behavior. The PRD plan code is Phase-59-aligned -- no content corrections are needed.

**Primary recommendation:** Follow the PRD plan structure (4 chunks, 12 tasks) closely. The spec and code are detailed and aligned with current codebase patterns. The main risk is incorrect test assertions after section count changes. Use a single PLAN.md file since all tasks are sequential (foundation before mocks before integration before docs).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Generic `WalkthroughPlayer` component receives `WalkthroughWorkflow[]` -- reusable for future guides
- One mock component per workflow receiving `currentStep` -- NOT one per step
- Mock elements are styled divs, NOT real shadcn/ui components -- decoupled from actual UI
- AnimatePresence crossfade (150ms opacity) between steps
- Step navigation is free (click any step), not linear-only
- Keyboard: ArrowLeft/ArrowRight navigate steps within current workflow
- Data model: `WalkthroughStep`, `WalkthroughWorkflow`, `MockPanelProps` (exact shapes specified)
- File structure: 7 new files in `src/components/help/walkthrough/` and `src/components/help/`
- Modified files: `src/components/help/index.ts`, `src/pages/guides/ExpenseGuide.tsx`, `src/lib/helpGuides.ts`, `src/lib/__tests__/helpGuides.test.ts`
- Section changes: 8 sections to 6 (overview, walkthrough, payroll, analytics, pnl, faq)
- Deep links `#submitting`, `#approving`, `#reimbursement` become `#walkthrough`
- 11 mock element primitives (exact list specified)
- Indigo highlights (NOT brand teal) for tutorial annotations
- Highlight classes: `border-2 border-indigo-400` + shadow with rgba(99,102,241,...)
- Workflow content: 13 total steps across 3 workflows (4 + 3 + 6)
- Mobile: horizontal scrollable pill bar for steps, full-width mock below
- Desktop: vertical step list sidebar + mock panel right
- Accessibility: `role="tablist"/"tab"`, `role="list"/"listitem"`, `aria-current="step"`, `aria-live="polite"`
- 2 FAQ items from SUBMITTING_FAQ migrate to FULL_FAQ "Submission" group
- Documentation: help center spec, UI brand reference, CODE_STYLE.md, CLAUDE.md, CHANGELOG.md

### Claude's Discretion
- Implementation chunk ordering (foundation -> mocks -> integration -> docs is suggested but flexible)
- Exact Tailwind class choices for non-specified styling (padding, gaps, etc.) as long as consistent
- Whether to split the plan into 1 or multiple GSD PLAN.md files
- Commit granularity within the wave structure

### Deferred Ideas (OUT OF SCOPE)
- Future walkthrough guides for Orders, Kitchen (mentioned as reusable engine benefit)
- No other items deferred -- PRD and spec fully cover phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.0 | UI framework | Project standard |
| TypeScript | ~5.9 | Type safety | Project standard |
| Tailwind CSS | 4.1.18 | Utility-first styling | Project standard, v4 with `@custom-variant dark` |
| Framer Motion | 11.18.2 | AnimatePresence crossfade on step transitions | Already used extensively in project (ProductionLogPanel, OutletCardGrid, OrderStatusAccordion, FlipNumber, HelpCenter) |
| Lucide React | (project ver) | Check icon for completed steps | Project standard icon library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cn()` utility | local (`src/lib/utils.ts`) | Conditional class merging via `clsx` + `twMerge` | Every component with conditional styles |
| `CalloutBox` | local (`src/components/help/CalloutBox.tsx`) | Tip/warning rendering in annotations | WalkthroughPlayer annotation area |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Styled divs for mocks | Real shadcn/ui components | Locked decision: styled divs are decoupled from actual UI, intentionally |
| Framer Motion crossfade | CSS transitions | AnimatePresence handles mount/unmount better; already in project |

**Installation:** No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/components/help/
  walkthrough/
    types.ts              # WalkthroughStep, WalkthroughWorkflow, MockPanelProps
    MockElements.tsx      # 11 mock UI primitives + HIGHLIGHT_CLASSES constant
    SubmitMocks.tsx        # 4-step Submit Expense mock component
    ApproveMocks.tsx       # 3-step Approve Expense mock component
    ReimburseMocks.tsx     # 6-step Reimburse mock component
    index.ts              # Barrel export
  WalkthroughPlayer.tsx   # Generic reusable walkthrough engine (at help/ level, NOT walkthrough/)
  index.ts                # Updated barrel with WalkthroughPlayer + type re-exports
```

### Pattern 1: Generic Player + Workflow-Specific Mocks
**What:** A single `WalkthroughPlayer` component that receives `WalkthroughWorkflow[]` and handles all navigation, tab switching, step state, keyboard events, and animations. Each workflow has one mock component receiving `currentStep: number` that conditionally renders/highlights elements.
**When to use:** This is the only pattern for this phase.
**Key implementation details:**
- Player state: `activeWorkflowId: string`, `activeStep: number`
- Tab switch resets step to 0 via `switchWorkflow` callback
- Each mock component uses `currentStep` to conditionally highlight fields or show/hide elements
- Breadcrumb is computed by a helper function inside the player, keyed by workflowId + step index
- `AnimatePresence mode="wait"` with `motion.div` opacity 0->1->0 at 150ms duration
- Keyboard handler attached to container ref via `useEffect`, scoped with `tabIndex={-1}` on container
- Composite key `${activeWorkflowId}-${activeStep}` ensures AnimatePresence detects step changes

**Breadcrumb mapping (from spec):**
| Workflow | Step 0 Breadcrumb | Later Steps Breadcrumb |
|----------|-------------------|----------------------|
| submit | "Financials > Expenses" | "Financials > Expenses > New Expense" |
| approve | "Financials > Expenses > Approval" | "Financials > Expenses > Approval > Detail" |
| reimburse | "Financials > Reimburse" | "Financials > Reimburse > Batch RMB-0315-001" |

### Pattern 2: Mock Element Primitives with Shared Highlight Style
**What:** 11 mock UI building blocks that mimic app UI elements (inputs, selects, buttons, tables, etc.) using only styled divs, Tailwind classes, and CSS variables. All share a single `HIGHLIGHT_CLASSES` constant for consistent indigo glow styling.
**When to use:** Within mock workflow components.
**Key implementation details:**
- `HIGHLIGHT_CLASSES` is a string of Tailwind classes exported from MockElements.tsx
- Includes both light and dark shadow variants via Tailwind `dark:` prefix
- Each element accepts optional `highlighted?: boolean` prop that applies these classes via `cn()`
- Elements use semantic Tailwind classes: `bg-card`, `bg-background`, `border-input`, `text-muted-foreground`
- CSS variable-based colors (bg-card, text-foreground, etc.) auto-switch in dark mode -- no `dark:` needed
- Direct color values (border-indigo-400, shadow rgba values) DO need `dark:` variants

**The 11 primitives:**
1. `MockFrame` -- browser chrome (colored dots + breadcrumb + children)
2. `MockLabel` -- form field label text
3. `MockInput` -- fake text input with optional value + highlight
4. `MockSelect` -- fake dropdown with value + chevron + highlight
5. `MockButton` -- fake button (primary/ghost/destructive) + highlight
6. `MockField` -- label + input wrapper div
7. `MockRow` -- 2-column grid for side-by-side fields
8. `MockTable` -- table with headers, rows, optional `highlightRow`
9. `MockBadge` -- small colored badge (warning/error/info variants)
10. `MockUploadZone` -- dashed upload area with optional file thumbnail + highlight
11. `MockNavDropdown` -- fake nav with "Financials" header and menu items + highlight

### Pattern 3: Section Consolidation in ExpenseGuide
**What:** Three existing GuideSection instances (submitting, approving, reimbursement) are replaced by a single GuideSection containing a WalkthroughPlayer. The player's tabs serve as the sub-navigation within the walkthrough section.
**When to use:** During ExpenseGuide integration.
**Key implementation details:**
- New section: `id="walkthrough"`, `title="Interactive Walkthroughs"`, no `role` prop (visible to all)
- Workflow data arrays (steps with titles, descriptions, tips, warnings) defined inline in ExpenseGuide.tsx
- Deleted constants: `SUBMITTING_FAQ`, `DOA_NODES`, `DOA_EDGES`, `BATCH_NODES`, `BATCH_EDGES`
- Kept constants: `LIFECYCLE_NODES/EDGES`, `PAYROLL_FAQ`, `PNL_NODES/EDGES`, `FULL_FAQ`
- 2 FAQ items (GL category + receipt questions) migrate from removed `SUBMITTING_FAQ` to `FULL_FAQ` "Submission" group
- The third `SUBMITTING_FAQ` item (duplicate handling) is covered by walkthrough annotations and does NOT migrate

### Anti-Patterns to Avoid
- **Importing real UI components in mocks:** Mock elements are intentionally decoupled. Never import shadcn/ui Button, Input, Select, etc. in the walkthrough components.
- **One file per step:** Do NOT create 13 separate mock files. One component per workflow (3 total), switching on `currentStep`.
- **Hardcoded breadcrumbs in mock components:** Breadcrumbs are computed in the player via `getBreadcrumb()` helper and passed as props to mock components.
- **Using `mode="popLayout"` for AnimatePresence:** This phase uses `mode="wait"` for simple crossfade. `popLayout` is for layout animations (used elsewhere in the project for FlipNumber).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Step crossfade animation | Custom CSS transition manager | Framer Motion `AnimatePresence mode="wait"` | Handles mount/unmount, already used in 6+ project components |
| Tab navigation a11y | Custom ARIA management | Standard `role="tablist"/"tab"` + `aria-selected` pattern | Well-established, no library needed |
| Keyboard navigation | Global event listener | `useEffect` on container ref with `keydown` handler | Scoped to walkthrough container, avoids conflicts |
| Dark mode theming | Custom dark mode context | Tailwind `dark:` variant + CSS variable tokens | Project already has `@custom-variant dark` in index.css |
| Callout rendering in annotations | New callout component | Existing `CalloutBox` component from Phase 55 | Already supports tip/warning/important types with CSS variable styling |
| Conditional class merging | Manual string concatenation | `cn()` from `src/lib/utils.ts` | Project-wide pattern, handles Tailwind class conflicts |

**Key insight:** The entire walkthrough system is a pure UI composition exercise. All infrastructure (animation, theming, help layout, callout styling) already exists in the codebase. The only new concept is the `WalkthroughPlayer` state management (workflow tabs + step index), which is straightforward React state.

## Common Pitfalls

### Pitfall 1: Stale Mock Content After Phase 59
**What goes wrong:** Mock panels show 2 payment methods when there are now 3 (`employee_paid`, `company_paid`, `payment_request`). Or mock panels reference outdated statuses.
**Why it happens:** Phase 56 was built before Phase 59's expense overhaul. The PRD was written after Phase 59.
**How to avoid:** The PRD plan content is already Phase-59-aware. The Submit mock shows "Personal Cash" (maps to `employee_paid`, the most common flow) and the annotation explains "the payment method determines whether this goes through reimbursement (personal) or is recorded directly (company card)." Follow the PRD plan content exactly.
**Warning signs:** If any mock shows "Personal Cash/Transfer" as a payment option (old 2-option split from pre-Phase 59), that is stale.

### Pitfall 2: Test Assertion Failures After Section Changes
**What goes wrong:** Tests that assert specific section counts, search result counts, or anchor values break after sections change from 8 to 6.
**Why it happens:** The test file `src/lib/__tests__/helpGuides.test.ts` has assertions tied to section structure.
**How to avoid:** Update these specific tests:
1. **Section count test** (line ~80): expenses entry currently has 8 sections, needs to assert 6
2. **`searchGuides("Submitting")` test** (line ~25-33): "Submitting Expenses" section no longer exists. The test expects `anchor: "submitting"` but this section is gone. Either update to look for "Interactive Walkthroughs" section with `anchor: "walkthrough"`, or remove this assertion
3. **`searchGuides("expense")` results count** (line ~65-76): `sectionMatches.length` changes because previously 3 section titles contained "expense" (Submitting Expenses, Approving Expenses, Expense Analytics). After Phase 63, only 1 section title contains "expense" (Expense Analytics) since "Submitting" and "Approving" are replaced by "Interactive Walkthroughs". The assertion `expect(sectionMatches.length).toBeGreaterThan(0)` still passes, but the `expect(results.length).toBeGreaterThan(3)` may need adjustment
4. **POPULAR_QUESTIONS anchor test**: `anchor: "submitting"` and `anchor: "approving"` change to `anchor: "walkthrough"` in the data, but the test only checks that guideIds are valid -- no anchor assertions exist in current tests, so this is not a test breakage
**Warning signs:** `npm run test` failures in `helpGuides.test.ts`.

### Pitfall 3: Dark Mode Highlight Styling Inconsistency
**What goes wrong:** Indigo highlights look correct in light mode but invisible or wrong in dark mode.
**Why it happens:** Existing help components use CSS variable tokens (bg-card, text-foreground) that auto-switch in dark mode. But the indigo highlight uses direct Tailwind colors (border-indigo-400, shadow rgba values) that need explicit `dark:` variants.
**How to avoid:** The `HIGHLIGHT_CLASSES` constant includes both light and dark shadow variants. Always use this constant, never manually write highlight styles. The constant pattern is:
```
"border-2 border-indigo-400 dark:border-indigo-400 shadow-[...light...] dark:shadow-[...dark...]"
```
**Warning signs:** Visual inspection in dark mode shows no glow/border on highlighted mock elements.

### Pitfall 4: AnimatePresence Key Collisions
**What goes wrong:** Crossfade animation doesn't trigger when switching steps within the same workflow.
**Why it happens:** `AnimatePresence` uses `key` to detect mount/unmount. If the key doesn't change, no animation.
**How to avoid:** Use composite key: `key={`${activeWorkflowId}-${activeStep}`}`. The PRD plan code already does this correctly.
**Warning signs:** Steps change instantly without fade animation.

### Pitfall 5: Mobile Layout Overflow
**What goes wrong:** Mock panels overflow the viewport on mobile, or horizontal pill bar doesn't scroll.
**Why it happens:** MockFrame has fixed padding, pill bar needs `overflow-x-auto` and `whitespace-nowrap`.
**How to avoid:** Follow the PRD plan's MobileStepPills component which includes `overflow-x-auto whitespace-nowrap flex gap-2`. Hide desktop step sidebar with `hidden md:block`. Show mobile pills with `md:hidden`.
**Warning signs:** Mobile viewport shows horizontal scrollbar on the page, or step list is cut off.

### Pitfall 6: Circular Import Risk with Walkthrough Types
**What goes wrong:** Importing from `./walkthrough/types` in WalkthroughPlayer and re-exporting from `help/index.ts` can create circular imports if ExpenseGuide also imports from `help/index.ts`.
**Why it happens:** ExpenseGuide already imports from `@/components/help` barrel.
**How to avoid:** WalkthroughPlayer imports types directly from `./walkthrough/types`, not from barrel. ExpenseGuide imports the `WalkthroughPlayer` from `@/components/help` and imports mock components directly from `@/components/help/walkthrough/`. The barrel re-exports are for external consumers.
**Warning signs:** Runtime "module not found" or TypeScript "cannot find module" errors.

### Pitfall 7: Missing `getBreadcrumb` Helper
**What goes wrong:** Breadcrumbs hardcoded in each mock component, creating duplication and inconsistency.
**Why it happens:** The breadcrumb changes per step within a workflow (e.g., step 0 shows "Financials > Expenses", step 1+ shows "Financials > Expenses > New Expense").
**How to avoid:** Implement `getBreadcrumb(workflowId, stepIndex)` as a function inside `WalkthroughPlayer.tsx`. The mapping is specified in the design spec section 6. Pass `breadcrumb` as a prop to the mock component via `MockPanelProps`.
**Warning signs:** All steps in a workflow show the same breadcrumb, or breadcrumbs don't change on step transitions.

## Code Examples

Verified patterns from the existing codebase:

### AnimatePresence with mode="wait" (crossfade)
```typescript
// Source: src/components/k3martCockpit/OutletCardGrid.tsx (existing project pattern)
// Also used in: src/components/orders/OrderStatusAccordion.tsx
<AnimatePresence mode="wait">
  <motion.div
    key={uniqueKey}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
  >
    {content}
  </motion.div>
</AnimatePresence>
```

### Conditional class merging with cn()
```typescript
// Source: project-wide pattern (src/lib/utils.ts exports cn)
import { cn } from "@/lib/utils";

<div className={cn(
  "base-classes",
  isActive && "active-classes",
  !isActive && "inactive-classes"
)}>
```

### Mobile pill bar pattern (horizontal scroll)
```typescript
// Source: src/components/help/GuideLayout.tsx MobileTabs component
<div className="lg:hidden overflow-x-auto whitespace-nowrap flex gap-2 pb-2 mb-6 -mx-4 px-4">
  {items.map((item) => (
    <button className={cn(
      "px-3 py-1.5 rounded-full text-sm shrink-0",
      isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
    )}>
      {item.label}
    </button>
  ))}
</div>
```

### CalloutBox usage (tip/warning in annotations)
```typescript
// Source: src/components/help/CalloutBox.tsx
// Types: "tip" (green via --color-status-success), "warning" (amber via --color-status-warning), "important" (red via --color-status-error)
<CalloutBox type="tip">Use 6990 Misc OpEx if unsure about the GL category.</CalloutBox>
<CalloutBox type="warning">Expenses over Rp 50,000 without a receipt may be rejected.</CalloutBox>
```

### GuideSection without role prop (visible to all)
```typescript
// Source: src/components/help/GuideSection.tsx
// Omitting `role` means no RoleTag badge is shown
<GuideSection id="walkthrough" title="Interactive Walkthroughs">
  <WalkthroughPlayer workflows={workflows} />
</GuideSection>
```

### Help barrel export pattern
```typescript
// Source: src/components/help/index.ts (current state)
export { RoleTag } from "./RoleTag";
export { CalloutBox } from "./CalloutBox";
export { StepCard } from "./StepCard";
export { GuideSection } from "./GuideSection";
export { FaqAccordion } from "./FaqAccordion";
export type { FaqItem, FaqGroup } from "./FaqAccordion";
export { WorkflowDiagram } from "./WorkflowDiagram";
export { GuideLayout } from "./GuideLayout";
export type { FlowNode, FlowEdge } from "./WorkflowDiagram";
// Phase 63 adds:
// export { WalkthroughPlayer } from "./WalkthroughPlayer";
// export type { WalkthroughStep, WalkthroughWorkflow, MockPanelProps } from "./walkthrough/types";
```

## State of the Art

| Old Approach (Phase 56) | Current Approach (Phase 63) | Impact |
|--------------------------|----------------------------|--------|
| StepCard components for each step | Mock UI panels with highlighted fields | More visual, less text |
| WorkflowDiagram SVG for DoA/Batch flows | Interactive click-through walkthrough | Users see mock app instead of flowchart |
| 8 separate guide sections | 6 sections (3 merged into 1 walkthrough) | Faster read time (15 -> 10 min) |
| Role-gated sections (submitting=all, approving=manager, reimburse=admin) | Single walkthrough section visible to all, tabs show all workflows | Simpler access, tab labels clarify audience |

**Phase 59 expense system changes (verified in schema):**
- Payment methods: 3 literals (`employee_paid`, `company_paid`, `payment_request`) at schema.ts:1668-1670
- Statuses include `recorded` (company_paid auto-status) and `paid` (payment_request after transfer)
- Fields: `transactionReference`, `flaggedForReview`, `flaggedBy`, `flaggedAt`, `flagReason`
- Approval queue: Shows Company Paid badge + Acknowledge/Flag buttons for recorded expenses
- Receipt requirement: All company_paid and payment_request expenses require receipt regardless of amount

**Mock content alignment with Phase 59:** The PRD plan correctly:
- Shows "Personal Cash" payment method (maps to `employee_paid`, most common flow)
- Explains company card behavior in annotation text
- Shows standard approve/reject flow (the most common path)
- Does NOT attempt to show all 3 payment method flows (would overcomplicate tutorial)

## Open Questions

1. **FAQ migration specificity**
   - What we know: 2 items from `SUBMITTING_FAQ` migrate to `FULL_FAQ` "Submission" group. `SUBMITTING_FAQ` has 3 items: GL category (1), receipts (2), duplicates (3).
   - What's unclear: Which 2 of 3? The spec says "GL category and receipt questions migrated to FULL_FAQ Submission group; duplicate handling covered in walkthrough annotations."
   - Recommendation: Migrate GL category and receipt questions to FULL_FAQ Submission group (which already has 3 items, growing to 5). The duplicate handling question content is addressed by the Submit step 1 annotation and does NOT need migration.

2. **`isNew` flag on expenses guide**
   - What we know: Currently `isNew: true` on the expenses guide config in helpGuides.ts.
   - What's unclear: Should this remain after Phase 63?
   - Recommendation: Keep `isNew: true` -- the phase adds significant new interactive content.

## Validation Architecture

> Note: `workflow.nyquist_validation` is not set in `.planning/config.json`, treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npm run test -- --run src/lib/__tests__/helpGuides.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| N/A | Section count changes 8->6 | unit | `npm run test -- --run src/lib/__tests__/helpGuides.test.ts` | Yes (needs update) |
| N/A | Search results after section rename | unit | `npm run test -- --run src/lib/__tests__/helpGuides.test.ts` | Yes (needs update) |
| N/A | POPULAR_QUESTIONS data unchanged (4 entries) | unit | `npm run test -- --run src/lib/__tests__/helpGuides.test.ts` | Yes (passes as-is) |
| N/A | Type check passes | type | `npm run type-check` | N/A (built-in) |
| N/A | Build succeeds | build | `npm run build` | N/A (built-in) |
| N/A | Visual rendering (dark/light, mobile/desktop) | manual-only | N/A | manual-only |

### Sampling Rate
- **Per task commit:** `npm run type-check`
- **Per wave merge:** `npm run test && npm run build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. The `helpGuides.test.ts` file already exists and needs test updates, not new test files.

## Sources

### Primary (HIGH confidence)
- Project codebase: `convex/schema.ts` lines 1667-1670 -- current expense payment method literals: `employee_paid`, `company_paid`, `payment_request` (verified)
- Project codebase: `src/pages/guides/ExpenseGuide.tsx` -- current 8-section structure, 812 lines, all data constants verified
- Project codebase: `src/lib/helpGuides.ts` -- current 6-guide registry, 8 sections for expenses, readTimeMinutes: 15
- Project codebase: `src/lib/__tests__/helpGuides.test.ts` -- 116 lines, 10 test cases to update
- Project codebase: `src/components/help/index.ts` -- current 10-line barrel export
- Project codebase: `src/components/help/CalloutBox.tsx` -- tip/warning/important types with CSS variable styling
- Project codebase: `src/components/help/GuideLayout.tsx` -- MobileTabs horizontal scroll pill pattern
- Project codebase: `src/components/help/GuideSection.tsx` -- section wrapper with optional role prop
- Project codebase: `src/index.css` -- Tailwind v4 dark mode: `@custom-variant dark (&:where(.dark, .dark *))`
- PRD plan: `docs/superpowers/plans/2026-03-17-interactive-expense-walkthrough.md` -- full implementation plan with code for all 12 tasks
- Design spec: `docs/superpowers/specs/2026-03-17-interactive-expense-walkthrough-design.md` -- detailed component specs, layout diagrams, content per step

### Secondary (MEDIUM confidence)
- Framer Motion `AnimatePresence mode="wait"` -- verified working in project via `OutletCardGrid.tsx` (line 116), `OrderStatusAccordion.tsx`, `ProductionLogPanel.tsx` (line 190)
- Tailwind CSS 4 `dark:` variant compatibility -- verified working in project (e.g., `DueDateGroupHeader.tsx`, `K3MartSyntheticCard.tsx`)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, no new dependencies needed
- Architecture: HIGH - PRD plan provides complete implementation code, verified against codebase patterns
- Pitfalls: HIGH - Derived from actual codebase analysis, test file inspection, and Phase 59 schema verification
- Phase 59 alignment: HIGH - Verified against schema literals at convex/schema.ts:1667-1670

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable -- no external dependencies, purely internal codebase)
