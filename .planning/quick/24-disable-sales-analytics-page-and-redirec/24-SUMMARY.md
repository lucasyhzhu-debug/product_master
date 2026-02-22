---
phase: quick-24
plan: 01
subsystem: routing, navigation
tags: [bandwidth, routing, navigation, temporary]
dependency_graph:
  requires: []
  provides: [bandwidth-conservation]
  affects: [src/App.tsx, src/components/layout/Header.tsx, src/components/layout/MobileBottomNav.tsx, src/components/layout/Footer.tsx]
tech_stack:
  added: []
  patterns: [redirect-disabled-routes, bandwidth-conservation-comments]
key_files:
  created: []
  modified:
    - src/App.tsx
    - src/components/layout/Header.tsx
    - src/components/layout/MobileBottomNav.tsx
    - src/components/layout/Footer.tsx
decisions:
  - Commented out route blocks rather than deleting to allow easy grep-revert
  - Removed unused icon imports (TrendingUp, Store) to keep tsc clean
  - Added redirect routes (sales, k3mart-cockpit) → /orders outside Layout wrapper
metrics:
  duration: ~5min
  completed: 2026-02-22
  tasks_completed: 1
  files_modified: 4
---

# Quick Task 24: Disable Sales Analytics and K3Mart Cockpit — Summary

**One-liner:** Temporarily disabled Sales Analytics and K3Mart Cockpit routes, hiding nav links and redirecting to /orders to conserve Convex query bandwidth until March 1st quota reset.

## Objective

Stop expensive aggregation queries (SalesAnalytics, K3MartCockpit) from consuming production bandwidth quota before the March 1st reset. All changes are clearly marked for easy revert.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Disable expensive routes and redirect to Orders | Done | 7d7fcba |

## Changes Made

### src/App.tsx
- Removed `SalesAnalytics` and `K3MartCockpit` from page imports (with BANDWIDTH CONSERVATION comment)
- Commented out `/sales` and `/k3mart-cockpit` route blocks (kept intact inside JSX comments)
- Added redirect routes: `sales → /orders`, `k3mart-cockpit → /orders`
- Updated `RoleBasedRedirect`: Manager/Admin now land on `/orders` instead of `/sales`

### src/components/layout/Header.tsx
- Commented out `{ path: '/sales', ... }` from `mainNavItems`
- Commented out `{ path: '/k3mart-cockpit', ... }` from `depotItems`
- Removed unused icon imports: `TrendingUp`, `Store`

### src/components/layout/MobileBottomNav.tsx
- Commented out `{ path: '/sales', ... }` from `primaryTabs`
- Commented out `{ path: '/k3mart-cockpit', ... }` from `moreItems`
- Removed unused icon imports: `TrendingUp`, `Store`

### src/components/layout/Footer.tsx
- Commented out `{ path: '/sales', label: 'Sales' }` from `quickLinks`

## Verification

- `npm run build` passes (0 errors, only pre-existing CSS warnings)
- `grep -r "BANDWIDTH CONSERVATION" src/` returns hits in all 4 files (10 total markers)
- Manager/Admin default route (`/`) redirects to `/orders`
- `/sales` redirects to `/orders`
- `/k3mart-cockpit` redirects to `/orders`
- Sales and K3Mart nav links hidden in Header, MobileBottomNav, Footer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused icon import errors**
- **Found during:** Task 1 verification (npm run build)
- **Issue:** Commenting out `TrendingUp` and `Store` usages in nav arrays left imports dangling, causing `tsc` `noUnusedLocals` errors in Header.tsx and MobileBottomNav.tsx
- **Fix:** Commented out the `TrendingUp` and `Store` import lines (with BANDWIDTH CONSERVATION comment) in both files
- **Files modified:** `src/components/layout/Header.tsx`, `src/components/layout/MobileBottomNav.tsx`
- **Commit:** 7d7fcba (same commit — part of task 1)

## How to Revert (after March 1st)

Search for `BANDWIDTH CONSERVATION` across `src/` — 10 markers total:

```bash
grep -rn "BANDWIDTH CONSERVATION" src/
```

For each file:
1. **src/App.tsx**: Restore imports, uncomment route blocks, remove redirect routes, change `RoleBasedRedirect` back to `/sales`
2. **src/components/layout/Header.tsx**: Uncomment `TrendingUp`/`Store` imports and nav items
3. **src/components/layout/MobileBottomNav.tsx**: Uncomment `TrendingUp`/`Store` imports and tab items
4. **src/components/layout/Footer.tsx**: Uncomment `/sales` quick link

## Self-Check: PASSED

- [x] `src/App.tsx` modified — verified (git show 7d7fcba)
- [x] `src/components/layout/Header.tsx` modified — verified
- [x] `src/components/layout/MobileBottomNav.tsx` modified — verified
- [x] `src/components/layout/Footer.tsx` modified — verified
- [x] Commit 7d7fcba exists
- [x] Build passes
- [x] All 4 files have BANDWIDTH CONSERVATION markers
