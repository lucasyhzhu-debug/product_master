---
phase: 23-bundle-size-lazy-routes
plan: 01
subsystem: shared-utils
tags: [bundle-splitting, lazy-loading, error-boundary, react]

# Dependency graph
requires: []
provides:
  - "lazyWithPreload: React.lazy wrapper with .preload() method for hover prefetching"
  - "RouteLoadingFallback: spinner component with 200ms delay before showing"
  - "ChunkErrorBoundary: class component with auto-retry, deploy-drift reload, and manual reload prompt"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lazyWithPreload pattern: augments React.lazy result with .preload() for imperative prefetch"
    - "ChunkErrorBoundary: catches chunk load errors, retries once silently, detects deploy drift via window.location.reload()"

key-files:
  created:
    - src/lib/lazyWithPreload.ts
    - src/components/shared/RouteLoadingFallback.tsx
    - src/components/shared/ChunkErrorBoundary.tsx
  modified: []

key-decisions:
  - "200ms delay on RouteLoadingFallback prevents flash-of-spinner on fast connections"
  - "ChunkErrorBoundary distinguishes deploy-drift (auto-reload) from persistent failure (user prompt)"

patterns-established:
  - "lazyWithPreload as project-standard wrapper for all route-level lazy imports"

requirements-completed: []

# Metrics
duration: included in phase 23 single-commit implementation
completed: 2026-02-23
---

# Phase 23 Plan 01: Lazy Loading Infrastructure Summary

**Created lazyWithPreload utility, RouteLoadingFallback spinner, and ChunkErrorBoundary — the three shared primitives required for route-level code splitting**

## Performance

- **Completed:** 2026-02-23
- **Commit:** `82f5a24` — feat(23): implement bundle splitting, lazy routes, and CI size guard

## Accomplishments

- `src/lib/lazyWithPreload.ts` — `lazyWithPreload()` wraps `React.lazy`, exposes `.preload()` method for imperative prefetch on hover/focus
- `src/components/shared/RouteLoadingFallback.tsx` — centered spinning UtensilsCrossed icon, 200ms delay to prevent flash-of-spinner on fast connections
- `src/components/shared/ChunkErrorBoundary.tsx` — class component that silently retries chunk load failures once, auto-reloads on deploy-drift, shows manual "Please reload" prompt after two failures

## Files Created/Modified

- `src/lib/lazyWithPreload.ts` — created (lazy wrapper with preload)
- `src/components/shared/RouteLoadingFallback.tsx` — created (loading UI)
- `src/components/shared/ChunkErrorBoundary.tsx` — created (error recovery)

## Decisions Made

- `.preload()` method attached to the lazy component reference — caller invokes on hover events without needing a separate preload registry
- 200ms CSS delay on fallback spinner avoids visible flash on fast local dev connections

## Deviations from Plan

None — all three files implemented as specified.

## Issues Encountered

None.
