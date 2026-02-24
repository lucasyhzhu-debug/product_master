---
phase: 22-remove-legacy-editors-tags-and-dashboard
plan: 03
subsystem: frontend-hub
tags: [frontend, navigation, hub-page, role-filtering, static-ui]
dependency_graph:
  requires: [22-02]
  provides: [hub-page-at-home, role-based-landing-for-manager-admin]
  affects: [src/App.tsx, src/pages/HubPage.tsx, src/pages/index.ts]
tech_stack:
  added: []
  patterns: [role-filtered-static-ui, no-live-queries, responsive-grid]
key_files:
  created:
    - src/pages/HubPage.tsx
  modified:
    - src/App.tsx
    - src/pages/index.ts
decisions:
  - "HubPage added at /home route inside Layout with canAccessDashboard protection; RoleBasedRedirect sends manager/admin to /home"
  - "No live Convex queries on HubPage — zero bandwidth contribution from hub page visits"
  - "Salad icon used for Ingredients link in Inventory & Supply area (closest available Lucide icon)"
metrics:
  duration: 145s
  completed: 2026-02-23
  tasks_completed: 2
  files_changed: 3
---

# Phase 22 Plan 03: Build Frollie Pro Hub Page Summary

**One-liner:** Created HubPage.tsx with Frollie Pro branding, time-of-day greeting, and 5 role-filtered navigation card areas wired at /home route; manager/admin now land on hub instead of /orders.

## What Was Built

### Task 1: HubPage Component

Created `src/pages/HubPage.tsx` (251 lines) — a static, role-filtered navigation hub replacing the deleted Dashboard.

**Design:**
- "Frollie Pro" branded header with `UtensilsCrossed` icon and uppercase tracking label
- Time-of-day greeting: "Good morning/afternoon/evening, {user.name}" via `useAuth()`
- 5 functional area cards rendered in a responsive grid (1 col mobile, 2 cols md, 3 cols lg)
- Cards are completely hidden (not rendered) when user lacks all permissions for an area
- Pill-style sub-navigation links with Lucide icons and hover effects (border tint, bg accent)
- Subtle card hover: `hover:shadow-md hover:-translate-y-0.5` transitions
- Primary path "Open" link appears on card hover via `opacity-0 group-hover:opacity-100`

**Area cards:**
1. **Operations** — Orders, Kitchen, Packaging (requires canAccessOrders OR canAccessKitchen)
2. **Inventory & Supply** — Inventory, Locations, Restock Planner, Ingredients (canAccessInventory)
3. **Sales & Distribution** — GoFood Depot, Sales Analytics, K3Mart Cockpit (canAccessDashboard)
4. **Configuration** — Production Components, Customers, WhatsApp Templates (mixed permissions)
5. **Admin** — Menu Products, Vouchers, Users (admin-only permissions)

**Zero Convex bandwidth:** No `useQuery` or `useMutation` imports. Hub page visits cost nothing.

### Task 2: Routing and Barrel Export

- `src/pages/index.ts`: Added `export { HubPage } from './HubPage';`
- `src/App.tsx`:
  - Added `HubPage` to page imports (removed BANDWIDTH CONSERVATION comment on import block)
  - Added `/home` route inside `<Route element={<Layout />}>` with `canAccessDashboard` ProtectedRoute
  - Updated `RoleBasedRedirect`: manager/admin now navigate to `/home` (was `/orders` with bandwidth comment)
  - Kitchen → `/kitchen` and order_staff → `/orders` unchanged

## Deviations from Plan

None — plan executed exactly as written. The BANDWIDTH CONSERVATION comment removal on `RoleBasedRedirect` was explicitly specified in the plan (Task 2, step 3).

## Verification Results

- `npm run type-check`: PASS
- `npm run build`: PASS (existing chunk size and CSS minifier warnings are pre-existing, unrelated)
- `grep -n "useQuery|useMutation" src/pages/HubPage.tsx`: CLEAN — zero live queries
- `/home` route renders HubPage inside Layout with canAccessDashboard protection
- RoleBasedRedirect: manager/admin → `/home`; kitchen → `/kitchen`; order_staff → `/orders`

## Commits

| Hash | Message |
|------|---------|
| ca98b6e | feat(22-03): create HubPage with Frollie Pro branding and role-filtered navigation cards |
| cee2385 | feat(22-03): wire HubPage at /home route; RoleBasedRedirect sends manager/admin to /home |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/pages/HubPage.tsx exists (251 lines, > 80) | CONFIRMED |
| HubPage imports useAuth from AuthContext | CONFIRMED |
| HubPage uses Card from shadcn/ui | CONFIRMED |
| No useQuery or useMutation in HubPage | CONFIRMED |
| Responsive grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3) | CONFIRMED |
| "Frollie Pro" branding present | CONFIRMED |
| Cards filtered by hasPermission() | CONFIRMED |
| src/App.tsx /home route renders HubPage | CONFIRMED |
| RoleBasedRedirect sends manager/admin to /home | CONFIRMED |
| npm run type-check passes | CONFIRMED |
| npm run build passes | CONFIRMED |
| commit ca98b6e exists | CONFIRMED |
| commit cee2385 exists | CONFIRMED |
