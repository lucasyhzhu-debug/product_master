---
phase: 27-grabfood-pos-integration
plan: 03
subsystem: ui
tags: [grabfood, react, frontend, manager-page, orders, store-status, menu, outlet-selector]

# Dependency graph
requires:
  - phase: 27-01
    provides: "GrabFood OAuth2 token, grabRequest helper"
  - phase: 27-02
    provides: "syncOrders, getStoreStatus, pauseStore, batchUpdateAvailability, getMenuItems actions; grabfoodOrders queries"
  - phase: 27.1
    provides: "Webhook endpoints, HMAC validation, Settings tab, Webhooks tab"
  - phase: 27.2
    provides: "GrabFood Menu Simulator page"
provides:
  - "GrabFoodManager.tsx (1486 lines) with 5 tabs: Orders, Store Status, Menu, Settings, Webhooks"
  - "useGrabFood.ts hook with useGrabFoodOrders, useGrabFoodOrderStats, useGrabFoodActions, useGrabFoodOutlets"
  - "/grabfood route in App.tsx with ProtectedRoute (canAccessSalesAnalytics)"
  - "GrabFood nav link in Header.tsx for manager/admin roles"
  - "Barrel exports in hooks/convex/index.ts"
affects:
  - phase: 30 (unified sales analytics — GrabFood orders available as revenue source)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Action-based hooks (useAction) for GrabFood API calls — not reactive queries, since data comes from external API"
    - "Local state for store status and menu items — fetched on-demand via actions, not Convex subscriptions"
    - "Pending changes Map for menu toggle accumulation with batch publish"
    - "Countdown timer via useEffect interval (30s) using pauseUntil timestamp"
    - "Page-level outlet selector filtering all tabs via shared selectedOutletId state"
---

# Summary

## One-liner
GrabFood Manager frontend page with outlet selector, order sync, store pause/unpause with countdown, and menu availability toggle with batch publish.

## What was done

### Task 1: GrabFood Hook + Page with All 3 Tabs
- **Already implemented** by Phases 27.1 and 27.2 — `GrabFoodManager.tsx` (1486 lines) has all 5 tabs (Orders, Store Status, Menu, Settings, Webhooks)
- `useGrabFood.ts` (114 lines) provides `useGrabFoodOrders`, `useGrabFoodOrderStats`, `useGrabFoodActions`, `useGrabFoodOutlets`
- Added barrel exports to `src/hooks/convex/index.ts` for all 4 GrabFood hook exports

### Task 2: Route Registration + Build Verification
- **Already registered** — `/grabfood` route in `App.tsx` line 300 with `ProtectedRoute requiredPermission="canAccessSalesAnalytics"`
- **Nav link already present** — `Header.tsx` line 94 with `UtensilsCrossed` icon
- `npm run build` passes with zero errors

### Task 3: Visual + Functional Verification (Automated)
- All 9 must_haves verified via code-level checks
- `GrabFoodManager.tsx` ≥200 lines (actual: 1486) ✓
- Hook exports present ✓
- Route + nav link registered ✓
- Dark mode: 10 `dark:` class references ✓
- Build: passes ✓

## Key files

### key-files
created:
  - (none — all files existed from Phases 27.1/27.2)
modified:
  - src/hooks/convex/index.ts (barrel exports added for useGrabFood hooks)

## Deviations
- Tasks 1 and 2 were already implemented by sub-phases 27.1 and 27.2 — only barrel exports were new
- Page has 5 tabs instead of the planned 3 (bonus Settings + Webhooks from Phase 27.1)
- Task 3 checkpoint was auto-verified via code-level checks instead of manual browser testing

## Self-Check: PASSED
- [x] All 9 must_haves verified in code
- [x] All 3 artifact requirements met
- [x] All 3 key_links verifiable in source
- [x] npm run build passes
- [x] Commits present (489c66e)
