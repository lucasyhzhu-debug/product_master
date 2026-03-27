# Phase 55: Help Center Infrastructure & Landing Page - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/specs/2026-03-16-help-center-design.md)

<domain>
## Phase Boundary

Build the Help Center landing page, guide registry, 7 reusable help components, and navigation integration so all authenticated users can access `/help` and browse guides. This is purely frontend — no Convex backend changes.

Phase 55 delivers the infrastructure and landing page. The first guide content (Expense Guide) is Phase 56.

</domain>

<decisions>
## Implementation Decisions

### Architecture
- Help Center is entirely frontend — no new Convex tables, queries, or mutations
- Guide registry (`src/lib/helpGuides.ts`) drives the landing page and router — data-driven, not hardcoded
- Guide components are eagerly imported (not lazy) since guide pages are purely static JSX with no Convex queries
- Adding a guide = (1) create component file, (2) update registry entry — no changes to HelpCenter.tsx, GuideRouter.tsx, App.tsx, or shared components

### New Files
- `src/pages/HelpCenter.tsx` — Landing page with search bar, guide card grid, popular questions
- `src/pages/guides/GuideRouter.tsx` — Looks up `guideId` param in registry, renders component or "Guide not found" state
- `src/lib/helpGuides.ts` — Guide registry array of `GuideConfig` objects
- `src/components/help/WorkflowDiagram.tsx` — Fixed-layout SVG flowchart with colored status nodes and directional arrows
- `src/components/help/StepCard.tsx` — Numbered step with icon, title, description, optional tip/warning, connected by vertical dotted line
- `src/components/help/CalloutBox.tsx` — Styled callout: tip (green), warning (amber), important (orange)
- `src/components/help/FaqAccordion.tsx` — Grouped collapsible Q&A using shadcn Accordion
- `src/components/help/RoleTag.tsx` — Small badge showing role: "All Staff" (gray), "Manager+" (blue), "Admin Only" (orange)
- `src/components/help/GuideSection.tsx` — Section wrapper with anchor ID, title, role tag, scroll-margin-top: 80px
- `src/components/help/GuideLayout.tsx` — Shared layout: sticky sidebar TOC on desktop, horizontal scroll tabs on mobile, Intersection Observer for active section
- `src/components/help/index.ts` — Barrel export

### Modified Files
- `src/App.tsx` — Add `/help` and `/help/:guideId` routes with `<ProtectedRoute>` (no permission/role restriction — auth-only gate)
- `src/pages/HubPage.tsx` — Add "Help & Training" entry to `HUB_AREAS` array with BookOpen icon
- `src/components/layout/Header.tsx` — Add `/help` to `mainNavItems` with CircleHelp icon, also add to mobile sheet menu

### Navigation Integration
- Header nav: `{ path: '/help', label: 'Help', icon: CircleHelp }` — no permission prop, visible to all authenticated roles
- HubPage card: title "Help & Training", icon BookOpen, color text-sky-500, primaryPath "/help", visible to all
- Routes: `<ProtectedRoute>` with no `requiredPermission` or `allowedRoles` props (auth-only)

### Guide Registry Schema
- `GuideConfig` interface: id, title, description, icon (Lucide component), accentColor (Tailwind class), sections array, readTimeMinutes, status ("live" | "coming-soon"), isNew boolean, component (React component)
- `GuideSection` interface: id, title, role ("all" | "manager" | "admin")
- First entry: expenses guide (status: "live", isNew: true, accentColor: "orange")
- Future entries: kitchen (green), orders (blue), inventory (purple), recipes (rose), analytics (amber) — all "coming-soon"

### Landing Page Design
- Hero: "How can we help you?" + subtitle + search bar with Ctrl+K shortcut
- Guide cards grid: responsive 1/2/3 cols, accent color top-bar with hover animation (scaleX 0→1, left origin)
- "Coming Soon" cards: opacity 0.5, non-interactive (no click, no hover effect)
- Popular Questions section: deep-links to guide sections using anchor IDs
- Staggered fade-up animation on page load (Framer Motion)

### Search Behavior
- Case-insensitive `String.includes` match across guide titles, section headings, and FAQ question text
- Results shown as dropdown list with deep links (e.g., `/help/expenses#submitting`)
- `Ctrl+K` focuses the search input
- Sufficient for v1 since corpus is small (static text)

### Visual Style
- No gradients — solid backgrounds, solid accent colors
- Accent colors per guide: orange (expenses), green (kitchen), blue (orders), purple (inventory), rose (recipes), amber (analytics)
- Optimized for light mode; dark mode inherits existing app theme tokens
- Guide content uses text-base (16px) for readability
- Max content width 720px within guide layout
- Animations: 200-400ms durations, subtle

### Component Specifications
- **WorkflowDiagram**: Fixed-layout SVG per usage (not a general-purpose graph renderer), vertical layout only, nodes are rounded rectangles with color-coded backgrounds, edges are SVG paths with arrowheads, entrance animation (nodes fade in sequentially, then edges draw via stroke-dashoffset)
- **StepCard**: Numbered circle on left, title + description on right, optional tip (green border-left) or warning (amber border-left) below, connected by vertical dotted line between steps
- **CalloutBox**: tip (Lightbulb, green), warning (AlertTriangle, amber), important (Info, orange) — with corresponding backgrounds for light/dark
- **FaqAccordion**: Uses shadcn Accordion with grouped sections (FaqGroup: title + FaqItem[])
- **RoleTag**: "All Staff" gray, "Manager+" blue, "Admin Only" orange
- **GuideSection**: Anchor ID + scroll-margin-top: 80px for sticky header offset
- **GuideLayout**: Sticky sidebar TOC (200px width) on desktop, horizontal scrollable tabs on mobile, active section tracking via Intersection Observer, back link to /help

### Claude's Discretion
- Exact Tailwind classes for component styling (within the design system constraints above)
- SVG node positioning calculations for WorkflowDiagram
- Intersection Observer threshold values for active section tracking
- Search dropdown positioning and animation
- Exact Framer Motion variants and timing
- GuideLayout sidebar responsive breakpoint

</decisions>

<specifics>
## Specific Ideas

- Guide cards hover: accent color top-bar animates scaleX from 0 to 1, left origin
- Popular questions on landing page deep-link to guide sections: `/help/expenses#submitting`
- GuideRouter renders "Guide not found" state for invalid IDs: centered icon, heading, "Back to Help Center" link
- HubPage card: `visible: () => true` (all authenticated roles)
- Header nav: CircleHelp icon from Lucide
- HubPage: BookOpen icon from Lucide, LINK_ICONS map entries for "All Guides": BookOpen, "Expenses Guide": CreditCard
- WorkflowDiagram node colors: gray (Draft), blue (Submitted), green (Approved/Reimbursed), amber (Awaiting Payment), red (Rejected/Voided)

</specifics>

<deferred>
## Deferred Ideas

- Print/PDF export — guides are web-only for now
- Versioning — guide content is hardcoded in components, versioned by git
- Contextual `?` buttons — per-page help buttons that deep-link to relevant guide sections
- Accessibility audit — WorkflowDiagram SVGs should include `role="img"` and `aria-label` (future)
- Lazy loading — switch to `lazy(() => import(...))` if guides grow to include data fetching

</deferred>

---

*Phase: 55-help-center-infrastructure*
*Context gathered: 2026-03-16 via PRD Express Path*
