---
phase: 23-bundle-size-lazy-routes
plan: 03
subsystem: routing
tags: [react-lazy, app-router, hover-prefetch, code-splitting]

# Dependency graph
requires:
  - phase: 23-bundle-size-lazy-routes
    provides: lazyWithPreload utility and RouteLoadingFallback component
  - phase: 23-bundle-size-lazy-routes
    provides: vite manualChunks vendor splitting
provides:
  - "All 16 page routes converted to React.lazy via lazyWithPreload"
  - "Single Suspense + ChunkErrorBoundary wrapper in App.tsx"
  - "Hover prefetching on Header and MobileBottomNav nav links"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lazyWithPreload for all route-level imports — enables .preload() on nav hover events"
    - "Single top-level Suspense boundary pattern (not per-route) for simpler error recovery"

key-files:
  created: []
  modified:
    - src/App.tsx
    - src/components/layout/Header.tsx
    - src/components/layout/MobileBottomNav.tsx
    - src/pages/WhatsAppTemplatesManager.tsx

key-decisions:
  - "Login and HubPage stay eager — they are the entry points and must load immediately without Suspense"
  - "Single Suspense boundary wraps all Routes — simpler than per-route Suspense, and ChunkErrorBoundary above it catches chunk failures globally"
  - "Hover/focus events on nav links call .preload() — downloads chunk before user clicks"
  - "WhatsAppTemplatesManager page-fade animation removed — was causing visible flash on chunk load"

patterns-established:
  - "Hover-prefetch pattern: onMouseEnter + onFocus on nav links triggers .preload() for zero-wait navigation"

requirements-completed: []

# Metrics
duration: included in phase 23 single-commit implementation
completed: 2026-02-23
---

# Phase 23 Plan 03: App.tsx Route Splitting + Hover Prefetch Summary

**Converted all 16 page routes in App.tsx to React.lazy, added Suspense + ChunkErrorBoundary wrapper, and wired hover prefetching on all nav links — main bundle reduced 94.8% (1,474kB → 75.9kB)**

## Performance

- **Completed:** 2026-02-23
- **Commit:** `82f5a24` — feat(23): implement bundle splitting, lazy routes, and CI size guard
- **UAT:** `581562c` — 7/7 tests passed, 0 issues
- **Phase closed:** `93370c5`

## Accomplishments

- All 16 page components converted to `lazyWithPreload()` in `App.tsx`; Login and HubPage remain eager (entry points)
- Single `<ChunkErrorBoundary>` wrapping a single `<Suspense fallback={<RouteLoadingFallback />}>` around all `<Routes>` — clean global recovery
- `Header.tsx` and `MobileBottomNav.tsx` nav links call `.preload()` on `onMouseEnter` + `onFocus` events — pages begin downloading before click
- `WhatsAppTemplatesManager.tsx` page-fade animation removed — was causing flash of invisible content during chunk load
- Main `index` chunk: **75.9kB** (down from 1,474kB). 7-item UAT passed: build guard, separate chunks, visualizer, all routes navigate, spinner, hover prefetch, no page fade

## Files Created/Modified

- `src/App.tsx` — 16 routes converted to lazyWithPreload, Suspense + ChunkErrorBoundary wrappers
- `src/components/layout/Header.tsx` — hover/focus prefetch on nav links
- `src/components/layout/MobileBottomNav.tsx` — hover/focus prefetch on mobile nav links
- `src/pages/WhatsAppTemplatesManager.tsx` — removed page-fade animation wrapper

## Decisions Made

- Login and HubPage kept eager — they're the first pages users land on; lazy-loading them would add latency at the worst moment
- Single Suspense boundary chosen over per-route boundaries — simpler, and ChunkErrorBoundary above handles errors globally
- WhatsApp page animation removed proactively — the fade was masking the chunk loading delay, not enhancing UX

## Deviations from Plan

None — all must_haves verified in UAT.

## Issues Encountered

None.
