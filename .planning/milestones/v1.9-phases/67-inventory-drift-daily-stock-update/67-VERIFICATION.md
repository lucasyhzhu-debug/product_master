---
phase: 67
status: passed
verifier: claude-opus-4.6
verified_at: "2026-03-28"
requirements_verified: [INV-01, INV-02]
---

# Phase 67 Verification: Inventory Drift & Daily Stock Update

## Goal
Packaging and product inventory counts stay accurate, and staff can quickly update daily stock levels per location.

## Success Criteria

### 1. Root cause of stock count drift identified and fixed
**Status:** PASS

The context document identifies the root cause: locations with untracked sales channels (GrabFood at non-K3Mart outlets, Grab, direct POS walk-ins) cause inventory to drift because the system cannot auto-track those sales. The solution implements daily manual counting as the correction mechanism via a new `stock_count` transaction type in `productInventoryTransactions`.

**Evidence:**
- `convex/schema.ts`: Added `v.literal("stock_count")` to transactionType union
- `convex/productInventory/mutations.ts`: `bulkStockCount` mutation calculates delta and records corrections
- Transaction audit trail preserves `previousQuantity`, `newQuantity`, `delta`, `performedBy`, and `createdAt`

### 2. Staff can open a quick stock update view, select a location, and set current stock for each product in one screen
**Status:** PASS

**Evidence:**
- `src/pages/StockCount.tsx`: Full page with location selector dropdown, product grid (name, system count, actual count input), single-screen workflow
- `src/App.tsx`: Route at `/inventory/stock-count` with `canAccessInventory` permission guard
- `src/components/inventory/FinishedGoodsTab.tsx`: "Count Stock" navigation button with ClipboardCheck icon
- Mobile-friendly: 44px touch targets, sticky submit bar, stacked layout on small screens
- All roles with inventory access can count (kitchen, order_staff, manager, admin)

### 3. Stock update UI writes correct adjustments to inventory transactions
**Status:** PASS

**Evidence:**
- `bulkStockCount` mutation: Calculates `delta = actualCount - previousQuantity` for each product
- Only rows where count changed are processed (delta !== 0 skipped)
- Each adjustment creates a `productInventoryTransactions` record with type `stock_count`
- Frontend filters unchanged rows before submission (`changedRows` computed from diff)
- Toast confirmation shows updated/unchanged counts

## Requirements Traceability

| Req ID | Description | Status |
|--------|-------------|--------|
| INV-01 | Stock count drift identified and fixed | Verified |
| INV-02 | Quick daily stock update UI | Verified |

## Human Verification Items

None required. All criteria are verifiable from code inspection.

## Additional Quality Notes

- Code reuse: `formatRelativeTime` deduplicated to use shared `src/lib/formatters.ts` (simplify pass)
- `getLastStockCount` query shows "last counted" timestamp per product for staff awareness
- Large delta warning (>50% change) with amber AlertTriangle icon guards against typos
- Empty states for no location selected, no products at location, and loading skeletons
