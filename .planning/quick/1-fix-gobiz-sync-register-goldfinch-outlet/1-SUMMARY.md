---
phase: quick-gobiz-fix
plan: 01
subsystem: integrations/gobiz
tags: [gobiz, sync, outlets, product-mappings, sales-analytics]
dependency_graph:
  requires: []
  provides:
    - "Auto-seeding GoBiz outlets before sync"
    - "Product mapping population from GoFood transactions"
    - "Outlet name display for GoBiz revenue in Sales Analytics"
  affects:
    - convex/integrations/gobiz/adapter.ts
    - convex/externalData/queries.ts
    - docs/CHANGELOG.md
tech_stack:
  added: []
  patterns:
    - "Idempotent outlet upsert before outletMap construction"
    - "Product name collection via Set in fetchAndSaveOrderDetails"
key_files:
  created: []
  modified:
    - convex/integrations/gobiz/adapter.ts
    - convex/externalData/queries.ts
    - docs/CHANGELOG.md
decisions:
  - "Product names used as both externalProductCode and externalProductName (GoFood has no separate code)"
metrics:
  duration: "4 min"
  completed: "2026-02-16"
  tasks: 3
  files: 3
---

# Quick Task 1: GoBiz Sync Fixes Summary

GoBiz outlet auto-registration + product mapping save + outlet name display in Sales Analytics using existing internalUpsertOutlet and saveProductMappings mutations.

## What Was Done

### Task 1: Auto-seed outlets and save product mappings in GoBiz adapter
- Imported `GOBIZ_OUTLET_SEED` from config
- Added outlet auto-seeding via `internalUpsertOutlet` before `outletMap` construction in both `syncGoBizRevenue` and `autoSyncGoBizRevenue`
- Modified `fetchAndSaveOrderDetails` to collect unique product names via `Set<string>` and return them alongside existing metrics
- Added `saveProductMappings` call after Phase B in both sync functions
- **Commit:** `a1a70be`

### Task 2: Add GoBiz outlet name to getRevenue query
- Added `else if (r.source === "gobiz" && r.outletId)` branch in getRevenue's customerStoreName resolution
- Reuses existing `outletNameMap` already built earlier in the function
- **Commit:** `f575546`

### Task 3: Update CHANGELOG
- Added new "GoBiz Sync Fixes" entry above Phase 14.1 entry
- Added two gap closure items to Phase 14.1 Fixed section (AnimatePresence removal, Save as Draft button)
- **Commit:** `c62214f`

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `npm run type-check`: PASSED
- `npm run build`: PASSED
- `internalUpsertOutlet` in adapter.ts: Found in both sync functions (lines 485, 728)
- `saveProductMappings` in adapter.ts: Found in both sync functions (lines 566, 768)
- `gobiz.*outletId` in queries.ts: Found at line 172
- CHANGELOG entries: Both present

## Self-Check: PASSED

- All 3 modified files exist on disk
- All 3 task commits found in git log (a1a70be, f575546, c62214f)
