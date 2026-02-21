---
phase: quick-10
plan: "01"
subsystem: inventory
tags: [inventory, component-types, production, bug-fix]
dependency_graph:
  requires: []
  provides: [all-production-components-visible-in-inventory-manager]
  affects: [InventoryManager, getInventoryReport]
tech_stack:
  added: []
  patterns: [union-query, category-index]
key_files:
  created: []
  modified:
    - convex/inventory/queries.ts
    - src/pages/InventoryManager.tsx
decisions:
  - "Union query approach (by_category for production + by_track_inventory filtered to non-production) avoids duplicates and surfaces all production BOM components"
  - "Production components always pass location sub-filter (informational rows); packaging zero-stock behaviour unchanged"
metrics:
  duration: "4 min"
  completed: "2026-02-20"
  tasks_completed: 2
  files_modified: 2
---

# Quick-10: Fix Ingredient Components Missing From Inventory Manager

**One-liner:** Union query in getInventoryReport + location-filter bypass for production rows ensures all production-category componentTypes (balls + ingredient trackers) appear in Inventory Manager Production tab.

## What Was Done

### Task 1 — Extend getInventoryReport (convex/inventory/queries.ts)

The original query fetched only `trackInventory=true` components using `by_track_inventory`. This excluded ball-type production components (`BIG_BALL`, `MID_BALL`) and any production ingredient with `trackInventory=false`.

Changed to a union approach:
- Fetch all production-category components via `by_category` index (regardless of `trackInventory`)
- Fetch packaging components that have `trackInventory=true` (via `by_track_inventory`, filtered to exclude production to avoid duplicates)
- Merge into a single `components` list; existing `activeComponentsOnly` filter and matrix build logic unchanged

### Task 2 — Fix InventoryManager location sub-filter (src/pages/InventoryManager.tsx)

The location sub-filter (lines 70-87) returned `null` for any row with zero stock at the selected location — hiding production components that have not yet received stock.

Changed: production rows now always pass through the location filter. The row is returned with the location's actual stock values (or 0 if no stock record exists). Packaging rows retain their existing behaviour (hidden when zero stock at that location).

## Verification

- `npm run type-check` — passes
- `npm run build` — passes

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files modified exist:
- convex/inventory/queries.ts — FOUND
- src/pages/InventoryManager.tsx — FOUND

### Commits:
- 9810703 — fix(quick-10): extend getInventoryReport to include all production-category components — FOUND
- 0530a47 — fix(quick-10): show production components in inventory manager even with zero stock — FOUND

## Self-Check: PASSED
