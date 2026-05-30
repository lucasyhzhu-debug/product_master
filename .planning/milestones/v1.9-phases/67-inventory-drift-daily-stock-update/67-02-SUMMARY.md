---
phase: 67
plan: 2
title: "Frontend — Daily Stock Count page"
status: complete
completed_at: "2026-03-28"
---

# Summary: 67-02 Frontend — Daily Stock Count page

## What was done

1. **StockCount page**: Created `src/pages/StockCount.tsx` with:
   - Location selector dropdown (active locations only)
   - Product grid showing product name, system count, actual count input
   - Delta calculation and visual diff (green for +, red for -)
   - Large delta warning (amber AlertTriangle for >50% change)
   - "Last counted" timestamp per product from getLastStockCount query
   - Submit button that calls bulkStockCount with only changed rows
   - Toast confirmation with update/skip counts
   - Mobile-friendly layout with 44px touch targets, sticky submit bar
   - Empty states for no location selected, no products, loading skeletons

2. **Route**: Added `/inventory/stock-count` route in `src/App.tsx` with `canAccessInventory` permission guard and lazy-loaded StockCount component

3. **Navigation button**: Added "Count Stock" button with ClipboardCheck icon to the action bar in `src/components/inventory/FinishedGoodsTab.tsx`, navigating to `/inventory/stock-count`

## Files modified

- `src/pages/StockCount.tsx` -- New page component (created)
- `src/App.tsx` -- Added lazy import and route
- `src/components/inventory/FinishedGoodsTab.tsx` -- Added Count Stock button

## Verification

- `npm run build` passes
- StockCount chunk generated in build output
