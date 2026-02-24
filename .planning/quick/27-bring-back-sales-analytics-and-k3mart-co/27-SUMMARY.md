---
phase: 27-bring-back-sales-analytics-and-k3mart-co
plan: "01"
subsystem: navigation
tags: [nav, sales-analytics, k3mart, mobile-nav, desktop-nav]
dependency_graph:
  requires: []
  provides: [sales-analytics-nav, k3mart-cockpit-nav]
  affects: [Header.tsx, MobileBottomNav.tsx]
tech_stack:
  added: []
  patterns: [lucide-react icons, permission-gated nav items]
key_files:
  created: []
  modified:
    - src/components/layout/Header.tsx
    - src/components/layout/MobileBottomNav.tsx
    - docs/CHANGELOG.md
decisions:
  - Both items use canAccessSalesAnalytics permission (manager + admin only), same as when originally disabled
metrics:
  duration: "~5 minutes"
  completed: "2026-02-24"
  tasks: 1
  files: 3
---

# Phase 27 Plan 01: Restore Sales Analytics and K3Mart Cockpit Navigation Summary

**One-liner:** Restored TrendingUp/Store icon imports and nav entries for Sales Analytics (mainNavItems + primaryTabs) and K3Mart Cockpit (depotItems + moreItems) after bandwidth conservation period ended March 1st.

## Tasks Completed

| Task | Name | Commit | Files Modified |
|------|------|--------|---------------|
| 1 | Restore Sales Analytics and K3Mart Cockpit nav items | 481c3be | Header.tsx, MobileBottomNav.tsx |

## What Was Done

**Header.tsx:**
- Uncommented `TrendingUp` and `Store` from lucide-react import block; removed BANDWIDTH CONSERVATION comment
- Added `{ path: '/sales', label: 'Sales', icon: TrendingUp, permission: 'canAccessSalesAnalytics' }` to `mainNavItems` after Home, before Orders
- Added `{ path: '/k3mart-cockpit', label: 'K3 Mart', icon: Store, permission: 'canAccessSalesAnalytics' }` to `depotItems` before GoFood Depot

**MobileBottomNav.tsx:**
- Uncommented `TrendingUp` and `Store` from lucide-react import block; removed BANDWIDTH CONSERVATION comment
- Added `{ path: '/sales', icon: TrendingUp, label: 'Sales', permission: 'canAccessSalesAnalytics' }` to `primaryTabs` after Home, before Orders
- Added `{ path: '/k3mart-cockpit', icon: Store, label: 'K3 Mart', permission: 'canAccessSalesAnalytics' }` as first item in `moreItems`

## Verification Results

- `npx tsc --noEmit` passed with no errors
- `npm run build` passed (3426 modules, built in 27.41s)
- All BANDWIDTH CONSERVATION comments removed from both files
- TrendingUp and Store confirmed imported (not commented) in both files
- `/sales` route confirmed in mainNavItems (Header) and primaryTabs (Mobile)
- `/k3mart-cockpit` route confirmed in depotItems (Header) as first item, and moreItems (Mobile) as first item

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/components/layout/Header.tsx` — modified and committed (481c3be)
- [x] `src/components/layout/MobileBottomNav.tsx` — modified and committed (481c3be)
- [x] `docs/CHANGELOG.md` — updated with v1.3.15 entry
- [x] Commit 481c3be verified in git log
- [x] Build passes cleanly
