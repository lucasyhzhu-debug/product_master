---
phase: 19-gofood-depot-kitchen-targets
plan: "04"
subsystem: finished-goods-inventory-ui
tags: [frontend, inventory, finished-goods, stock-transfer, ui-redesign]
dependency_graph:
  requires:
    - "19-01 (transferStock mutation + getStockOverviewGrouped query)"
  provides:
    - "Finished Goods as default/primary tab on Inventory page"
    - "FinishedGoodsHero component with grand totals and location-type breakdown"
    - "Product-grouped and location-grouped views with toggle"
    - "Inline Move To / Receive From transfer actions per row"
    - "StockTransferModal for global multi-product transfers"
    - "useProductInventoryGrouped hook"
  affects:
    - "src/pages/InventoryManager.tsx"
    - "src/components/inventory/FinishedGoodsTab.tsx"
    - "src/hooks/convex/useProductInventory.ts"
    - "src/hooks/convex/index.ts"
tech_stack:
  added: []
  patterns:
    - "useProductInventoryGrouped hook wrapping getStockOverviewGrouped query"
    - "Inline transfer form rendered inside each product-at-location row"
    - "Client-side transformation of flat grouped data into location-keyed map for location view"
    - "StockTransferModal with sequential mutation calls for multi-product transfers"
key_files:
  created:
    - "src/components/inventory/FinishedGoodsHero.tsx"
    - "src/components/inventory/StockTransferModal.tsx"
  modified:
    - "src/pages/InventoryManager.tsx"
    - "src/components/inventory/FinishedGoodsTab.tsx"
    - "src/hooks/convex/useProductInventory.ts"
    - "src/hooks/convex/index.ts"
decisions:
  - "Location-type bucketing: office+kitchen=Internal, depot=GoFood, venue=K3Mart; consignment bucket hidden until Phase 21"
  - "Zero-stock rows shown by default with opacity-50 and bg-muted/30 styling (not hidden)"
  - "Grouping toggle renders on client-side from same getStockOverviewGrouped data (no extra query)"
  - "Inline transfer form replaces the row below the action buttons (not a popover)"
  - "StockTransferModal calls transferStock sequentially (not in parallel) to avoid DB conflicts"
metrics:
  duration_minutes: 6
  tasks_completed: 2
  tasks_total: 2
  files_modified: 6
  completed_date: "2026-02-22"
---

# Phase 19 Plan 04: Finished Goods Inventory UI Redesign Summary

**One-liner:** Redesigned Finished Goods as the primary Inventory tab with a hero summary section, product/location grouping toggle, per-row inline transfer actions, and a global Move Stock modal for multi-product transfers.

## What Was Built

### Task 1: Finished Goods Hero Section and Tab Reordering (commit 638a009)

**A. `src/pages/InventoryManager.tsx` — Tab reordering:**
- Changed default tab from `"packaging"` to `"finished_goods"`
- Reordered tab triggers: Finished Goods | Packaging | Ingredients
- Existing Packaging and Ingredients tab content unchanged

**B. `src/components/inventory/FinishedGoodsHero.tsx` — New component:**
- Hero summary with four stat cards in a flex-wrap row
- **Internal** stat card: sums stock at `office` and `kitchen` locations
- **GoFood Outlets** stat card: sums stock at `depot` locations
- **K3Mart** stat card: sums stock at `venue` locations (consignment bucket hidden per Phase 21)
- **Alerts** stat card: counts low-stock (quantity <= threshold) and zero-stock (quantity === 0) location entries; shows "OK" when all healthy with warning styling when alerts exist
- Product count summary line: "Tracking N products — M total units"
- Data comes from `getStockOverviewGrouped` grouped data, computed client-side

**C. `src/hooks/convex/useProductInventory.ts` — New hook:**
- Added `useProductInventoryGrouped()` wrapping `api.productInventory.queries.getStockOverviewGrouped`
- Added `transferStock` mutation to existing `useProductInventory()` return object
- Exported `useProductInventoryGrouped` from `src/hooks/convex/index.ts`

### Task 2: Grouping Toggle, Inline Transfer Actions, Move Stock Modal (commit 9896742)

**A. `src/components/inventory/FinishedGoodsTab.tsx` — Rewritten:**

New features added:
- **Grouping toggle** in action bar: "By Product" (default) / "By Location" — uses `getStockOverviewGrouped` data transformed client-side
- **ProductGroupedView**: one card per menuProduct, sub-list of locations inside. Each location row has "Move -->" and "<-- Receive" action buttons.
- **LocationGroupedView**: one section per storageLocation, list of products inside. Same per-row action buttons.
- **InlineTransferForm**: renders below the action buttons for the selected row. Shows source/dest location select + quantity input with "Available: N" constraint. Validates quantity <= available, blocks over-transfer.
- **"Move Stock" button** in action bar (managers/admins) opens the StockTransferModal
- **Zero-stock rows**: shown by default with `opacity-50 bg-muted/30` styling and "Move -->" disabled; "Receive" still enabled
- All existing functionality preserved: Add Stock dialog, Settings panel, Transaction log, ProductStockCard grid (as fallback while groupedOverview loads)

**B. `src/components/inventory/StockTransferModal.tsx` — New component:**
- Source + Destination location dropdowns (destination excludes source)
- Per-product transfer rows with product select (shows only products with stock at source) + quantity input
- Available stock shown as "max N" below quantity input; over-transfer shows validation error
- "Add another product" button appears when more products with stock exist
- Remove row button for multi-product lists
- "Transfer Stock" button calls `transferStock` mutation for each row sequentially
- Error toast per product if any transfer fails; success toast with source/dest names on completion
- Auto-close on full success; stays open if any product failed

## Deviations from Plan

None — plan executed exactly as written.

### Notes

- Pre-existing build errors in plan 19-03 files (`GoFoodDepotManager.tsx`, `DepotStockTransferDialog.tsx`, etc.) documented in `deferred-items.md`. These are not caused by plan 19-04 changes. `npm run type-check` (tsc --noEmit) passes cleanly.

## Self-Check

**Files exist:**
- `src/components/inventory/FinishedGoodsHero.tsx` — FOUND
- `src/components/inventory/StockTransferModal.tsx` — FOUND
- `src/components/inventory/FinishedGoodsTab.tsx` — modified, FOUND
- `src/pages/InventoryManager.tsx` — modified, FOUND
- `src/hooks/convex/useProductInventory.ts` — modified, FOUND
- `src/hooks/convex/index.ts` — modified, FOUND

**Commits exist:**
- `638a009` — feat(19-04): finished goods hero section and tab reordering
- `9896742` — feat(19-04): grouping toggle, inline transfer actions, and Move Stock modal

**Type check:** `npm run type-check` passes (0 errors)
**Build:** Pre-existing errors from plan 19-03; plan 19-04 files have 0 type errors

## Self-Check: PASSED
