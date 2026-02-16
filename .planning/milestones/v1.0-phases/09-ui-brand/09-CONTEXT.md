# Phase 9: UI Brand Consolidation - Context

**Gathered:** 2026-02-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish a brand/UI architecture reference document and enforce visual consistency across all 19 pages. Audit and fix margins, fonts, colors, spacing, layout patterns, header/footer, responsive behavior, and mobile navigation. No backend changes. No component factories (that's Phase 10).

</domain>

<decisions>
## Implementation Decisions

### Brand Visual Identity
- Derive palette and typography from what's currently in the app — formalize as standard, not redesign
- Visual tone: friendly brand app — warm, rounded, approachable (not clinical SaaS)
- Reference style: Notion-style warm — clean but friendly, lots of white space, warm grays
- Accent color direction: fresh green/teal (clean, natural feel for a snack brand)
- Dark mode: support both light and dark themes (system preference toggle)
- Border radius: medium (8-12px) — noticeably rounded, warm and approachable
- Shadows: subtle drop shadows on cards and modals — depth without heaviness
- Animations: moderate — page transitions, list item stagger, button hover feedback, modal enter/exit (Framer Motion)
- Icons: keep default Lucide React, standardize at 24px
- Loading states: skeleton screens (gray shimmer placeholders matching content layout)
- Empty states: friendly illustration + helpful message + CTA button
- Toast placement: contextual — positioned near the action trigger point, not fixed corner
- Table density: comfortable — more padding, easier to read
- Fully responsive: must work well on phones, tablets, and desktop

### Brand Reference Document
- Include component-level guidelines (cards, tables, modals, button hierarchy) — not just fundamentals
- Cover: color palette, typography, spacing scale, margin rules, component patterns, page layout conventions

### Page Layout Standard
- Navigation: top header nav bar (horizontal)
- Header scroll behavior: hide on scroll down, show immediately on scroll up
- Content width: max-width container (centered, ~1200-1400px)
- Page margins: uniform horizontal padding on all pages — no exceptions
- Search/filter bar: below page header, between title and list content
- Footer: moderately detailed — navigation links, copyright, helpful info
- Page transitions: fade in/out between pages
- Mobile navigation: bottom tab bar with key items (tab selection is Claude's discretion based on role permissions)

### Claude's Discretion
- Typography selection (warm/friendly direction)
- Page header component design
- Bottom tab bar items and role-based layout
- Exact spacing scale values
- Skeleton screen component design
- Empty state illustrations approach

</decisions>

<specifics>
## Specific Ideas

- "Notion-style warm" — clean but friendly, white space, warm grays as the visual reference
- Toast notifications should appear near the click point, not in a fixed corner
- Header should fade away on scroll down but immediately reappear on scroll up (mobile-friendly pattern)
- Bottom tab bar on mobile (not hamburger menu)
- Fresh green/teal accent color — clean, natural, health-conscious feel for a snack brand

</specifics>

<deferred>
## Deferred Ideas

- **Centralized notification bell** — notification icon near account/logout button that consolidates key alerts (pending orders, low stock, etc.) with actionable links. Belongs in its own phase (requires notification aggregation system, read/unread state, entity linking).

</deferred>

---

*Phase: 09-ui-brand*
*Context gathered: 2026-02-14*
