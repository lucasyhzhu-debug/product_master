# Staff Review: Phase 55 — Help Center Infrastructure

**Branch:** `gsd/phase-55-help-center-infrastructure`
**Date:** 2026-03-16
**Reviewer:** Triple Review (requirements + code-quality + staffreview)
**Base:** `origin/main` (709aab3)
**Head:** 607f8ea

---

## Summary

Phase 55 delivers the Help Center infrastructure: a guide registry, 7 reusable help components, landing page with search, guide router, and navigation integration (Header + HubPage + routes). This is entirely frontend -- no Convex backend changes.

**Verdict: PASS with minor issues.** The implementation is solid, well-structured, and follows project conventions closely. Type-check, build, and full test suite (998 tests) all pass. The architecture is clean and extensible. Issues found are primarily cosmetic and DRY-related.

---

## Critical Issues (0)

None.

---

## Important Issues (2)

### I1. Duplicated card body JSX in HelpCenter.tsx (lines 177-286)

**File:** `src/pages/HelpCenter.tsx`
**Lines:** 177-286

The card body rendering (accent bar, icon, title, description, badges, section count) is duplicated almost entirely between the "coming soon" branch (lines 177-233) and the "live" branch (lines 239-286). The only differences are:
1. Coming-soon shows the "COMING SOON" badge
2. Live wraps in a `<Link>`

This is ~55 lines of duplicated JSX. Extract a `GuideCard` sub-component that accepts `isComingSoon` as a prop and conditionally wraps itself in a `<Link>`.

**Flagged by:** code-quality, staffreview

### I2. "NEW" badge not dark-mode safe

**File:** `src/pages/HelpCenter.tsx`
**Lines:** 206, 264

The "NEW" badge uses raw Tailwind colors `bg-green-100 text-green-700` without dark mode variants. In dark mode, `bg-green-100` renders as a near-white green background that will appear very bright against a dark card background.

Options:
- Use CSS variable tokens: `style={{ backgroundColor: 'var(--color-status-success-bg)', color: 'var(--color-status-success)' }}`
- Add dark variants: `bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300`

The plan says "dark-mode safe is fine for small badges" but the current implementation has NO dark mode handling at all.

**Flagged by:** code-quality, staffreview

---

## Minor Issues (5)

### M1. Guide title deviates from design spec

**File:** `src/lib/helpGuides.ts`, line 47
**Implementation:** `"Expenses & Reimbursement"`
**Design spec:** `"Expenses, Reimbursements & Payroll"`

The title is shorter and drops "Payroll" which is a significant feature in the guide. Since Phase 56 will wire the actual Expense Guide content matching the spec, this title should match.

**Flagged by:** requirements

### M2. Section titles and roles deviate from design spec

**File:** `src/lib/helpGuides.ts`, lines 52-60

Several section titles and roles differ from the design spec:

| Section ID | Design Spec Title | Implementation Title |
|------------|-------------------|---------------------|
| overview | "Overview" (role: "all") | "Overview" (no role) |
| submitting | "Submitting an Expense" | "Submitting Expenses" |
| reimbursement | "Reimbursement Batching" | "Reimbursement Workflow" |
| payroll | "Payroll" | "Payroll Integration" |
| pnl | "How It Connects to the P&L" (role: "manager") | "P&L Impact" (role: "admin") |

The `pnl` section role mismatch (admin vs manager) could affect GuideSection role badge display in Phase 56.

**Flagged by:** requirements

### M3. WorkflowDiagram arrowhead marker ID collision risk

**File:** `src/components/help/WorkflowDiagram.tsx`, line 116

The arrowhead marker uses a static `id="arrowhead"`. If multiple WorkflowDiagram instances are rendered on the same page (the Expense Guide design has 4 workflow diagrams), the duplicate SVG marker IDs could cause rendering issues in some browsers.

Fix: use `useId()` or a prop-based unique prefix: `id={`arrowhead-${title?.replace(/\s+/g, '-')}`}`.

**Flagged by:** code-quality

### M4. WorkflowDiagram edge animation uses `animate` instead of `variants`

**File:** `src/components/help/WorkflowDiagram.tsx`, lines 152-175

The edge `<motion.path>` uses `initial`/`animate` directly instead of the `variants` pattern used by nodes. This means edges animate on mount rather than being orchestrated by the parent `containerVariants`. While it works because of the manual `delay: edgeDelay`, it's inconsistent with the node animation pattern and less maintainable.

This is intentional (edges need to wait for all nodes), but worth noting as a deviation from the plan's "consistent containerVariants/itemVariants pattern."

**Flagged by:** code-quality

### M5. `useActiveSection` may leave stale `activeId` when all sections scroll out of view

**File:** `src/hooks/useActiveSection.ts`, lines 14-19

The observer callback only updates `activeId` when there are visible entries. If the user scrolls past all sections (or above all sections), the last visible section remains as `activeId` indefinitely. This is generally acceptable UX (the TOC keeps the last section highlighted), but worth documenting as intentional behavior.

**Flagged by:** code-quality

---

## Nitpick (4)

### N1. `FaqAccordion` uses `type="multiple"` but plan 01 RESEARCH.md example shows `type="single" collapsible`

The plan's RESEARCH.md example code uses `type="single" collapsible` but the implementation uses `type="multiple"`. Both are valid -- `type="multiple"` allows multiple panels open simultaneously which is arguably better UX for FAQ. Not a bug, just a deviation from the research example.

### N2. `GuideLayout` description uses Unicode em-dash `\u2014` directly

**File:** `src/components/help/GuideLayout.tsx`, line 45

The read time display uses `\u2014` which is fine for correctness. Consider using the HTML entity `&mdash;` for consistency with `HelpCenter.tsx` which uses `&middot;`.

### N3. `ACCENT_BG` / `ACCENT_TEXT` maps use Tailwind `bg-{color}-500` for accent bars

**File:** `src/pages/HelpCenter.tsx`, lines 17-33

These use numeric Tailwind colors (`bg-orange-500`, `text-orange-500`) which is fine for accent colors. The rest of the help components correctly use CSS variable tokens. This mixed approach is acceptable since accent colors are decorative (not semantic status colors).

### N4. Search dropdown doesn't debounce input

**File:** `src/pages/HelpCenter.tsx`, lines 86-95

The search runs `searchGuides()` on every keystroke. Since the corpus is small (6 guides, 8 sections, 4 FAQ) and it's a pure synchronous function, debouncing is unnecessary. But if the guide registry grows significantly, consider adding a debounce.

---

## Consensus Issues (2+ reviewers)

1. **I1 (Duplicated card JSX)** -- flagged by code-quality and staffreview. The card body is ~55 lines duplicated. Extract a shared sub-component.

2. **I2 (NEW badge dark mode)** -- flagged by code-quality and staffreview. Raw `bg-green-100 text-green-700` without dark mode handling.

---

## Plan Compliance Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| HELP-01: Auth-only route access | PASS | ProtectedRoute with no permission props |
| HELP-02: Landing page with guide cards grid | PASS | Responsive 1/2/3 cols |
| HELP-03: Search filters case-insensitively | PASS | 8 unit tests passing |
| HELP-04: Registry-driven guide discovery | PASS | HELP_GUIDES array + GuideRouter lookup |
| HELP-05: Coming-soon cards dimmed/non-clickable | PASS | opacity-50, no Link wrapping |
| HELP-06: GuideRouter renders or "not found" | PASS | Checks status + component |
| HELP-07: Nav integration (Header + HubPage) | PASS | mainNavItems + HUB_AREAS |
| HELP-08: Staggered fade-up animation | PASS | Framer Motion containerVariants/cardVariants |
| HCMP-01: WorkflowDiagram SVG | PASS | CSS variable fills, responsive viewBox |
| HCMP-02: StepCard with tip/warning | PASS | Uses CalloutBox internally |
| HCMP-03: CalloutBox with CSS tokens | PASS | No dark: classes, uses var() |
| HCMP-04: FaqAccordion with shadcn | PASS | Radix Accordion, type="multiple" |
| HCMP-05: RoleTag with CSS tokens | PASS | No dark: classes, uses var() |
| HCMP-06: GuideSection with scroll-margin | PASS | scrollMarginTop: 80px |
| HCMP-07: GuideLayout with TOC + IO | PASS | Sticky sidebar, mobile tabs, useActiveSection |

**15/15 requirements pass.**

---

## Architecture Assessment

**Strengths:**
- Clean data-driven architecture: adding a guide = 1 component + 1 registry entry
- Good separation: useActiveSection hook extracted for reusability
- CSS variable tokens used correctly in all help components (zero dark: classes)
- WorkflowDiagram uses CSS variables for SVG fills -- dark mode compatible
- Header NavItem type change is non-breaking (all existing items still provide permission)
- Tests cover the searchGuides pure function comprehensively

**No architectural risks identified.** The phase is purely frontend, introduces no new Convex tables or queries, and the code is well-isolated in `src/components/help/`, `src/lib/helpGuides.ts`, and two new page files.

---

## Verification Results

| Check | Result |
|-------|--------|
| `npm run type-check` | PASS |
| `npm run build` | PASS |
| `npm run test` | PASS (998 tests, 0 failures) |
| No `dark:` classes in help components | PASS (grep confirms 0 matches) |
| No hardcoded hex in WorkflowDiagram | PASS (grep confirms 0 matches) |
| All barrel exports resolve | PASS (7 components + 4 type exports) |

---

*Review completed: 2026-03-16*
