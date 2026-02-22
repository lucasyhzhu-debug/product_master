---
phase: quick-20
plan: "01"
subsystem: vouchers
tags: [vouchers, orders, discounts, menu-products]
dependency_graph:
  requires: [vouchers, menuProducts, orderCrud]
  provides: [item-linked-voucher]
  affects: [VouchersManager, VoucherInput, orderCrud, validateAndApplyVoucher]
tech_stack:
  added: []
  patterns: [item-level-discount, per-unit-discount, schema-extension]
key_files:
  created: []
  modified:
    - convex/schema.ts
    - convex/vouchers/mutations.ts
    - convex/vouchers/queries.ts
    - convex/orders/helpers/voucherHandling.ts
    - convex/orders/mutations/orderCrud.ts
    - src/hooks/convex/useVouchers.ts
    - src/components/orders/VoucherInput.tsx
    - src/pages/VouchersManager.tsx
decisions:
  - "Item-linked voucher discount is applied at item level during order creation: each matching item's discountAmount increases by discountValue * item.quantity, and lineTotal is recalculated; totalAmount reflects the reduction; finalTotal = totalAmount (no order-level deduction)"
  - "Order update path applies item-linked voucher at order level (not item level) since orderItems are not rebuilt during updates — voucherDiscountValue deducted from order.totalAmount"
  - "validateAndApplyVoucher returns discountValuePerUnit for item-linked vouchers so orderCrud can apply per-unit discount without re-querying the voucher"
metrics:
  duration: "~15 minutes"
  completed: "2026-02-22"
  tasks_completed: 2
  files_modified: 8
---

# Quick Task 20: Item-Linked Voucher Type Summary

## One-Liner

Item-linked vouchers with fixed Rp discount per unit of a specified menu product, applied at order-item level during creation.

## What Was Built

### Backend (Task 1)

**Schema (`convex/schema.ts`)**
- Added `applicableMenuProductId: v.optional(v.id("menuProducts"))` to the `vouchers` table, after `maximumDiscount`.

**Mutations (`convex/vouchers/mutations.ts`)**
- `create`: Added `applicableMenuProductId` arg; validation throws if `applicableMenuProductId` is set and `discountType !== "amount"`; persists field on insert.
- `update`: Same optional arg and validation; included in patch builder.

**Queries (`convex/vouchers/queries.ts`)**
- `ValidatedVoucherResult`: Added `applicableMenuProductId?: string` and `linkedProductName?: string` to the nested voucher object.
- `validateVoucher`: Resolves linked product name via `ctx.db.get(voucher.applicableMenuProductId)`; includes both fields in return.
- `listActiveForCombobox`: Now includes `applicableMenuProductId` in the returned map so the POS dropdown can show `(per item)` labels.

**Voucher Handling Helper (`convex/orders/helpers/voucherHandling.ts`)**
- `AppliedVoucherInfo`: Added `applicableMenuProductId?: Id<"menuProducts">` and `discountValuePerUnit?: number`.
- `validateAndApplyVoucher`: Added optional `orderItems` 4th parameter; for item-linked vouchers, sums matching item quantities and computes `discountValue * matchingQty`; returns `discountValuePerUnit` so callers can apply per-item.

**Order CRUD (`convex/orders/mutations/orderCrud.ts`)**
- Order create: After voucher validation, if `voucherInfo.applicableMenuProductId` is set, iterates `itemsToCreate` and increases `discountAmount` by `perUnitDiscount * item.quantity` for each matching item, recalculates `lineTotal`, updates `totalAmount`; sets `totalDiscount = 0` (discount already in item totals) so no double-deduction.
- Order update: Fetches current `orderItems` from DB before calling `validateAndApplyVoucher` so item-linked discount is computed with the correct matching quantity.

### Frontend (Task 2)

**`src/hooks/convex/useVouchers.ts`**
- Added `applicableMenuProductId?: Id<"menuProducts">` to `VoucherCreateInput` and `VoucherUpdateInput`.

**`src/components/orders/VoucherInput.tsx`**
- `AppliedVoucher`: Added `linkedProductName?: string`.
- `handleApply`: Passes `linkedProductName` from validation result to `onApplyVoucher`.
- Applied state: Shows "Applies to: [product name]" below voucher name when `linkedProductName` is set.
- Validation message: Shows "Rp X off per [product]" instead of generic message for item-linked vouchers.
- Dropdown: Shows `(per item)` span in badge when `applicableMenuProductId` is present.

**`src/pages/VouchersManager.tsx`**
- Imported `useConvexMenuProducts` (called unconditionally at top, before conditionals).
- Imported `Package` from `lucide-react`.
- Imported `Id` from Convex dataModel.
- `VoucherFormState`: Added `applicableMenuProductId: string`.
- `initialFormState`: Added `applicableMenuProductId: ""`.
- `openEditDialog`: Populates `applicableMenuProductId` from voucher.
- `handleCreate`/`handleUpdate`: Pass `applicableMenuProductId` (cast to `Id<"menuProducts">`) or `undefined`.
- `formatDiscountValue`: Appends `/item` for linked vouchers.
- `VoucherCard`: Added `menuProductsMap` prop; shows "Item: [product name]" in stats section with Package icon.
- `VoucherForm`: Added `menuProducts` prop and product selector (only shown when `discountType === "amount"`); switching to percentage auto-resets `applicableMenuProductId`; helper text shows per-unit discount when product is selected.
- Both dialog `VoucherForm` usages pass `menuProducts` from `menuProductsData`.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written with one clarification:

**Design clarification (not a deviation):**
The plan stated "finalTotal = totalAmount (no additional order-level discount when voucher is item-linked)". This was implemented by setting `totalDiscount = 0` for item-linked vouchers in the order creation path, since the discount is already baked into each item's `lineTotal`. The `voucherDiscountValue` is still stored on the order for audit/display purposes (correctly reflects total Rp discounted).

For the order **update** path, item records aren't rebuilt, so the item-linked voucher is applied as an order-level deduction (`patch.finalTotal = order.totalAmount - voucherInfo.voucherDiscountValue`). This is a known limitation documented as a decision.

## Self-Check: PASSED

- All 8 modified files exist and are committed
- Commits: `d4ebea9` (Task 1 backend), `e235382` (Task 2 frontend)
- `npm run type-check`: 0 errors
- `npm run build`: successful (10.42s)
- `applicableMenuProductId` present in schema, mutations, queries, helper, and frontend
- `linkedProductName` returned from `validateVoucher`
- Product selector in VoucherForm (amount type only)
- VoucherCard shows linked product with Package icon
- `/item` suffix in `formatDiscountValue`
