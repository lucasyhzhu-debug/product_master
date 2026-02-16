---
phase: 09-ui-brand
plan: 02
subsystem: ui
tags: [framer-motion, scroll-hide, page-transitions, mobile-nav, layout, react-router]

# Dependency graph
requires:
  - phase: none
    provides: n/a
provides:
  - PageContainer component (uniform max-w-[1400px] wrapper)
  - Footer component (desktop-only navigation + copyright)
  - MobileBottomNav component (role-aware bottom tab bar)
  - useScrollDirection hook (rAF-optimized scroll detection)
  - Header scroll-hide with Framer Motion
  - AnimatePresence page transitions in Layout
  - fullWidth layout variant for kitchen/orders
  - App.tsx dual route group structure (standard vs fullWidth)
affects: [09-03, 09-04, 09-05, 09-01]

# Tech tracking
tech-stack:
  added: []
  patterns: [scroll-hide-header, page-transitions, dual-layout-routing, mobile-bottom-nav]

key-files:
  created:
    - src/hooks/useScrollDirection.ts
    - src/components/layout/PageContainer.tsx
    - src/components/layout/Footer.tsx
    - src/components/layout/MobileBottomNav.tsx
  modified:
    - src/components/layout/Layout.tsx
    - src/components/layout/Header.tsx
    - src/App.tsx
    - src/components/ui/sonner.tsx
    - src/components/layout/index.ts

key-decisions:
  - "Used text-primary instead of text-brand for MobileBottomNav active state (brand tokens not yet created by Plan 01)"
  - "Sonner Toaster keeps inline CSS variable styling instead of useTheme (ThemeContext not yet created by Plan 01)"
  - "MobileBottomNav uses Sheet bottom drawer for More items (admin/manager overflow)"
  - "RoleBasedRedirect moved outside Layout route groups (renders Navigate, no shell needed)"
  - "Redirect routes placed outside Layout groups (no shell needed for Navigate)"

patterns-established:
  - "Dual layout routing: fullWidth (kitchen/orders) vs standard (PageContainer) in App.tsx"
  - "Scroll-hide header: useScrollDirection + motion.header with fixed positioning"
  - "Page transitions: AnimatePresence mode=wait + motion.div key=pathname"
  - "Mobile bottom nav: role-filtered tabs + Sheet More menu for admin/manager overflow"

# Metrics
duration: 4min
completed: 2026-02-14
---

# Phase 9 Plan 2: Layout Components Summary

**Scroll-hide header, AnimatePresence page transitions, mobile bottom tab bar, desktop footer, and fullWidth route variant for KitchenView/OrderManager**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-14T08:03:31Z
- **Completed:** 2026-02-14T08:07:11Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Created 4 new layout components: PageContainer, Footer, MobileBottomNav, useScrollDirection
- Header hides on scroll-down and shows on scroll-up using Framer Motion animation
- Layout wraps page content in AnimatePresence for fade-in/out page transitions
- App.tsx routes split into fullWidth (kitchen, orders) and standard (all other pages) layout groups
- Mobile bottom tab bar shows role-filtered navigation with Sheet-based "More" drawer

## Task Commits

Each task was committed atomically:

1. **Task 1: Create PageContainer, Footer, MobileBottomNav, and useScrollDirection** - `0873af1` (feat)
2. **Task 2: Update Layout.tsx and Header.tsx with scroll-hide, page transitions, footer, and mobile nav** - `71b1a70` (feat)

## Files Created/Modified
- `src/hooks/useScrollDirection.ts` - rAF-optimized scroll direction detection for header hide/show
- `src/components/layout/PageContainer.tsx` - Uniform max-w-[1400px] centered container with responsive padding
- `src/components/layout/Footer.tsx` - Desktop-only 3-column footer with brand, quick links, copyright
- `src/components/layout/MobileBottomNav.tsx` - Role-aware bottom tab bar with Sheet More menu
- `src/components/layout/Layout.tsx` - AnimatePresence transitions, Footer/MobileBottomNav integration, fullWidth prop
- `src/components/layout/Header.tsx` - motion.header with scroll-hide, fixed positioning, max-w-[1400px] inner container
- `src/App.tsx` - Dual layout route groups (fullWidth for kitchen/orders, standard for everything else)
- `src/components/ui/sonner.tsx` - Added richColors and closeButton props
- `src/components/layout/index.ts` - Added exports for Footer, MobileBottomNav, PageContainer

## Decisions Made
- Used `text-primary` instead of `text-brand` for MobileBottomNav active state because `--color-brand` CSS variable does not exist yet (created by Plan 09-01 which hasn't executed)
- Sonner Toaster retains inline CSS variable styling instead of `useTheme().resolvedTheme` because ThemeContext does not exist yet (Plan 09-01)
- MobileBottomNav primary tabs: Sales, Orders, Kitchen, Inventory (filtered by permission). More menu: K3 Mart, Production, WhatsApp, Products, Vouchers, Users
- RoleBasedRedirect and redirect routes placed outside Layout groups since they render Navigate (no shell needed)
- Header inner container changed from `container` to `mx-auto max-w-[1400px]` for consistent alignment with PageContainer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used text-primary instead of text-brand for active tab color**
- **Found during:** Task 1 (MobileBottomNav creation)
- **Issue:** Plan specifies `text-brand` for active tabs, but `--color-brand` CSS variable is not defined (created by Plan 09-01 which has not been executed yet)
- **Fix:** Used `text-primary` as stand-in; Plan 09-01 will create brand tokens and can update this
- **Files modified:** src/components/layout/MobileBottomNav.tsx
- **Verification:** Type-check and build pass
- **Committed in:** 0873af1

**2. [Rule 3 - Blocking] Skipped useTheme integration in Sonner Toaster**
- **Found during:** Task 2 (sonner.tsx update)
- **Issue:** Plan specifies importing `useTheme` from ThemeContext, but ThemeContext does not exist yet (Plan 09-01)
- **Fix:** Kept existing inline CSS variable styling; added TODO comment for Plan 09-01 integration
- **Files modified:** src/components/ui/sonner.tsx
- **Verification:** Build passes; toasts render correctly with CSS variable theming
- **Committed in:** 71b1a70

---

**Total deviations:** 2 auto-fixed (2 blocking - missing dependency from unexecuted Plan 01)
**Impact on plan:** Both deviations are forward-compatible. Plan 09-01 creates ThemeContext and brand tokens, after which these can be trivially updated. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Layout shell complete: header, footer, mobile nav, page container, page transitions all wired
- Plans 03/04 can now audit individual pages knowing the container and layout are standardized
- Plan 01 (theme tokens, dark mode) can execute independently and will enhance the layout components with brand colors and theme awareness

## Self-Check: PASSED

- All 9 files verified present on disk
- Commit 0873af1 (Task 1) verified in git log
- Commit 71b1a70 (Task 2) verified in git log
- `npm run build` passes

---
*Phase: 09-ui-brand*
*Completed: 2026-02-14*
