# Phase 22: Remove Legacy Editors, Tags & Dashboard - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove ~5,200 lines of dead code: legacy recipe/packaging/product editor pages, tags system, and Dashboard page. Drop 11 unused schema tables. Replace Dashboard with a new role-filtered hub page. Clean up navigation and rebrand to "Frollie Pro".

</domain>

<decisions>
## Implementation Decisions

### Landing Page Replacement
- Replace Dashboard with a **role-filtered hub page** at `/`
- **Branded header** at top: "Frollie Pro" with user greeting
- **Static navigation cards** (no live data snippets) organized by **functional area** (not workflow)
- Each section is a card with **icon** (Lucide), area name, description, and sub-section buttons for pages within that area
- Cards **completely hidden** for roles without access (not greyed out)
- **Simplified grouping** — Claude proposes logical groupings based on remaining pages, doesn't need to mirror sidebar exactly
- English language throughout
- **Fresh visual look** — polished, modern feel within existing design system (use `frontend-design` skill for full design)
- The frontend-designer skill should handle the entire hub page design

### Data Preservation
- **Check if tables are empty** in production before dropping
- If data exists: **targeted dumps** of just the 11 tables being dropped (not full snapshot)
- Export stored in **`docs/legacy-export/`** and committed to repo
- If tables are empty, proceed directly with dropping

### Navigation Cleanup
- **Reorganize remaining** sidebar navigation (not just delete dead links)
- Claude proposes clean sidebar groupings during planning
- Rename "Dashboard" sidebar link to **"Home"** pointing to the new hub page
- **Rebrand to "Frollie Pro"** — update all instances of "Frollie Recipe Master" throughout the codebase (sidebar, header, page titles, etc.)

### Removal Boundaries
- costInvalidation.ts: **remove entirely if possible** (inline menu product invalidation at call sites); otherwise strip to minimal
- Ingredients and Materials pages: **check usage first** during planning — remove if no active system references them, keep if still used by menu products/BOM
- PackagingView page: **check first** during planning — remove if legacy, keep if still serves kitchen staff
- Dead code detection: **aggressive sweep** — remove ALL orphaned code (unused hooks, helpers, types, components, not just what's directly tied to the 11 tables)

### Claude's Discretion
- Exact sidebar grouping/ordering for remaining pages
- Hub page card layout, spacing, responsive behavior
- How to handle edge cases in costInvalidation inlining
- Removal order/sequencing across waves

</decisions>

<specifics>
## Specific Ideas

- Hub page should have "some information theory and workflow kind of organisation" — boxes organized by functional areas with descriptions of each area
- Each section card has sub-section buttons for individual pages (like the dropdown menu items in the current sidebar)
- Use frontend-designer skill to ensure the hub page is well-designed
- "Fresh look" for the hub — take this opportunity to make it polished and modern

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-remove-legacy-editors-tags-and-dashboard*
*Context gathered: 2026-02-22*
