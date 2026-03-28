---
phase: 65
plan: 2
status: complete
---

# Summary: Plan 65-02 — Frontend: Wire price, remove history UI, clean hooks

## What was built

### Task 1: Pass `price` in `submitStockFlow` call
- Added price resolution in `K3MartCockpit.tsx` `handleStockFlowSubmit`:
  - Primary: outlet product data price
  - Fallback: K3MART_CONFIG values (80000 for 47068, 45000 for 47069)
- Price passed as `price: resolvedPrice` in the items array

### Task 2: Editable price field in StockFlowForm
- Added `priceOverride` state with auto-populate from `selectedProduct.price`
- Added `renderPriceField` function with IDR input, step=1000, validation for price <= 0
- Inserted in both Stock In and Stock Out tab content
- Reset on successful submit

### Task 3: Delete StockMovementHistory.tsx
- File deleted

### Task 4-6: Remove StockMovementHistory from all consumers
- Removed from barrel index (`src/components/k3martCockpit/index.ts`)
- Removed from `ExpandedOutletPanel.tsx` (import, props, JSX section)
- Removed from `OutletCardGrid.tsx` (import, type, props, usage)

### Task 7: Remove movements prop plumbing
- Removed `movements` from `outletCardGridData` useMemo return in K3MartCockpit.tsx
- Removed `movements` prop from `<OutletCardGrid>` JSX

### Task 8-9: Remove unused hooks and re-exports
- Deleted `useStockMovementHistory`, `useFetchStockFlowHistory`, `useFetchStockFlowDetail` from `useK3MartCockpit.ts`
- Removed all three from hooks barrel index

## Verification
- `npm run build` passes with 0 errors
- `grep StockMovementHistory src/` returns no matches
- `grep fetchStockFlowHistory src/` returns no matches
- `grep fetchStockFlowDetail src/` returns no matches
- `grep useStockMovementHistory src/` returns no matches
- `grep price: src/pages/K3MartCockpit.tsx` confirms `price: resolvedPrice` in items

## Key files
- `src/pages/K3MartCockpit.tsx` (modified)
- `src/components/k3martCockpit/StockFlowForm.tsx` (modified)
- `src/components/k3martCockpit/ExpandedOutletPanel.tsx` (rewritten)
- `src/components/k3martCockpit/OutletCardGrid.tsx` (rewritten)
- `src/components/k3martCockpit/StockMovementHistory.tsx` (deleted)
- `src/components/k3martCockpit/index.ts` (modified)
- `src/hooks/convex/useK3MartCockpit.ts` (modified)
- `src/hooks/convex/index.ts` (modified)
