---
phase: 23-bundle-size-lazy-routes
plan: 02
subsystem: build
tags: [vite, bundle-splitting, vendor-chunks, ci-guard]

# Dependency graph
requires: []
provides:
  - "Vite manualChunks: 7 vendor chunks (vendor-charts, vendor-react, vendor-ui, vendor-icons, vendor-convex, vendor-motion, vendor)"
  - "vite-plugin-bundlesize: CI build fails if main index chunk exceeds 500kB"
  - "rollup-plugin-visualizer: generates dist/bundle-stats.html after each build"
affects: []

# Tech tracking
tech-stack:
  added:
    - vite-plugin-bundlesize
    - rollup-plugin-visualizer
  patterns:
    - "manualChunks function in vite.config.ts routes node_modules to named vendor chunks"
    - "bundlesize plugin as build-time CI gate on chunk sizes"

key-files:
  created: []
  modified:
    - vite.config.ts
    - package.json

key-decisions:
  - "500kB limit on main index chunk, 350kB on vendor chunks — tight enough to catch regressions, loose enough not to fire on normal deps"
  - "visualizer plugin always runs (not just in CI) for ongoing dev visibility"

patterns-established:
  - "Vendor chunk splitting by library family: charts/react/ui/icons/convex/motion/misc"

requirements-completed: []

# Metrics
duration: included in phase 23 single-commit implementation
completed: 2026-02-23
---

# Phase 23 Plan 02: Vite Vendor Chunk Splitting + CI Bundle Guard Summary

**Configured Vite manualChunks for 7 vendor families, added vite-plugin-bundlesize as CI build gate, and rollup-plugin-visualizer for ongoing analysis**

## Performance

- **Completed:** 2026-02-23
- **Commit:** `82f5a24` — feat(23): implement bundle splitting, lazy routes, and CI size guard

## Accomplishments

- `vite.config.ts` — `manualChunks` function splits `node_modules` into 7 vendor chunks by library family: `vendor-charts` (recharts), `vendor-react` (react/react-dom/react-router), `vendor-ui` (shadcn/@radix-ui), `vendor-icons` (lucide-react), `vendor-convex` (convex), `vendor-motion` (framer-motion), `vendor` (everything else)
- `vite-plugin-bundlesize` installed and configured: main `index` chunk ≤500kB, vendor chunks ≤350kB — build fails if exceeded
- `rollup-plugin-visualizer` installed: generates `dist/bundle-stats.html` treemap after every build
- `npm run build` passes with new configuration; main bundle reduced from 1,474kB to 75.9kB with lazy routes (94.8% reduction)

## Files Created/Modified

- `vite.config.ts` — vendor manualChunks + bundlesize plugin + visualizer plugin
- `package.json` — added `vite-plugin-bundlesize` and `rollup-plugin-visualizer` devDependencies

## Decisions Made

- 500kB main index limit chosen to match common CDN/mobile network budget guidelines
- visualizer runs unconditionally (not just in CI) so devs can inspect bundles locally

## Deviations from Plan

None.

## Issues Encountered

None.
