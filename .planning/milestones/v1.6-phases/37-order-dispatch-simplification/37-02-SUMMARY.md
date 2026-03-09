---
phase: 37-order-dispatch-simplification
plan: 02
status: complete
requirements-completed: [BFS-05]
---

# Plan 37-02 Summary: Extract Helpers from orders/mutations/orderCrud.ts

## What Was Done
Extracted customer resolution, order number generation, and order item processing logic from `orderCrud.ts` into helper modules.

### Task 1: Customer Resolution (committed separately)
- Created `convex/orders/helpers/customerResolution.ts` with:
  - `resolveCustomer` — unifies customer lookup/creation across `create`, `createDraft`, and `updateDraft`
  - `generateNextOrderNumber` — MMDD-NNN order number generation with uniqueness check
- Updated `create`, `createDraft`, `copyFromCancelled` to use shared helpers

### Task 2: Order Item Processing (committed with review fixes)
- Created `convex/orders/helpers/orderItemProcessing.ts` with pure functions:
  - `buildOrderItems` — builds items with calculated line totals, returns totals
  - `applyItemLinkedVoucherDiscount` — applies per-unit voucher discount to matching items
  - `calculateOrderLevelDiscount` — computes manual order-level discount amount
  - `buildCopiedOrderItems` — shapes items for copy-from-cancelled with total accumulation
- Updated `create` mutation to use `buildOrderItems`, `calculateOrderLevelDiscount`, `applyItemLinkedVoucherDiscount`
- Updated `copyFromCancelled` to use `buildCopiedOrderItems`

### Review Fixes Applied
- **I2**: Replaced `Record<string, unknown>` + `as never` accumulation with conditional spread pattern in `resolveCustomer`
- **C4**: Removed dead `enrichBomComponents` function (68 LOC) and `EnrichedBomComponent` interface from `orderItemProcessing.ts`

## LOC Impact
- `orderCrud.ts`: 1,085 → 958 LOC (−127, 11.7% reduction)
- Target was <700 — not met because most remaining code is ctx-dependent mutation logic (DB inserts, production records, voucher processing) that requires Convex context

## Verification
- `npm run type-check` passes (zero errors)
- `npm run build` succeeds
- `npm run test` — 684/684 tests passing
- All mutation registrations remain in orderCrud.ts (zero API path changes)
