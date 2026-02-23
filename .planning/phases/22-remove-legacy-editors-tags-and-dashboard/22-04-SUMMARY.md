---
phase: 22-remove-legacy-editors-tags-and-dashboard
plan: "04"
subsystem: ui
tags: [react, branding, navigation, lucide-react]

# Dependency graph
requires:
  - phase: 22-02
    provides: canAccessRecipes/Products/Materials stripped from ROLE_PERMISSIONS; /tags route removed
provides:
  - "Frollie Pro" branding across all user-facing surfaces (Header, Footer, Login, useDocumentTitle, index.html)
  - Home nav link (/home, canAccessDashboard) in both desktop Header and MobileBottomNav for manager/admin
  - Clean navigation with no dead links to removed pages
affects: [22-03, 22-05, all future UI changes involving Header/Footer/Login]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mainNavItems first item is Home for manager/admin (canAccessDashboard permission)"
    - "Brand string 'Frollie Pro' used throughout — never 'Frollie Recipe Master' or 'Frollie Master'"

key-files:
  created: []
  modified:
    - src/components/layout/Header.tsx
    - src/components/layout/Footer.tsx
    - src/components/layout/MobileBottomNav.tsx
    - src/pages/Login.tsx
    - src/hooks/useDocumentTitle.ts
    - index.html

key-decisions:
  - "Home nav link added as first item in mainNavItems and primaryTabs — forward-declared before /home route exists (22-03 creates the route); parallel execution is safe because nav link simply navigates to a route"
  - "Tags nav item removal was already handled in 22-02; 22-04 verified zero /tags or canAccessRecipes refs in layout components"
  - "MobileBottomNav Home item uses canAccessDashboard (manager+admin only) matching desktop Header behavior"

patterns-established:
  - "Home icon from lucide-react used for /home nav link in both desktop and mobile nav"

requirements-completed:
  - SC-3
  - SC-7

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 22 Plan 04: Rebrand to Frollie Pro and Update Navigation Summary

**"Frollie Pro" brand name applied across all surfaces with Home nav link added for manager/admin in desktop and mobile navigation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-23T05:14:46Z
- **Completed:** 2026-02-23T05:17:04Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments
- Replaced all instances of "Frollie Recipe Master" and "Frollie Master" with "Frollie Pro" in Header, Footer, Login (h1 + footer copyright), useDocumentTitle hook (JSDoc + runtime), and index.html title tag
- Added `Home` icon import and `/home` nav item (permission: `canAccessDashboard`) as the first item in desktop `mainNavItems` (Header.tsx) and mobile `primaryTabs` (MobileBottomNav.tsx)
- Verified zero occurrences of dead nav references (`/tags`, `canAccessRecipes`, `canAccessProducts`, `canAccessMaterials`) in layout components — Tags nav removal was already completed in 22-02
- Full type-check and build pass with no errors

## Task Commits

1. **Task 1: Rebrand to Frollie Pro and update navigation** - `f4d0ebe` (feat)

**Plan metadata:** [pending final commit]

## Files Created/Modified
- `src/components/layout/Header.tsx` - Added `Home` icon import, Home nav item as first in mainNavItems, renamed brand from "Frollie Recipe Master" to "Frollie Pro"
- `src/components/layout/Footer.tsx` - Brand name updated to "Frollie Pro"
- `src/components/layout/MobileBottomNav.tsx` - Added `Home` icon import and Home tab as first in primaryTabs
- `src/pages/Login.tsx` - Both h1 heading and footer copyright updated to "Frollie Pro"
- `src/hooks/useDocumentTitle.ts` - All 3 occurrences of "Frollie Master" updated to "Frollie Pro" (JSDoc x2, runtime x1)
- `index.html` - `<title>` tag updated from "Frollie Master" to "Frollie Pro"

## Decisions Made
- Home nav link forward-declared before `/home` route exists (22-03 creates the route); parallel plan execution is safe since the link simply navigates and will work once 22-03 completes
- `canAccessDashboard` permission used for Home (manager + admin only) matching the intended audience for the hub page

## Deviations from Plan

None — plan executed exactly as written. Tags nav item removal was already done in 22-02 (confirmed via grep — no `/tags` or `canAccessRecipes` references in layout components).

## Issues Encountered

None — the `/home` route already existed in App.tsx because plan 22-03 had been run before this plan, which also meant HubPage.tsx already contained "Frollie Pro" branding. All our targeted changes were clean and non-conflicting.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Branding and navigation are complete — "Frollie Pro" is consistent across all surfaces
- Home nav link is active; /home route provided by 22-03 (already exists)
- Plan 22-05 (backend table drops) can proceed independently

---
*Phase: 22-remove-legacy-editors-tags-and-dashboard*
*Completed: 2026-02-23*
