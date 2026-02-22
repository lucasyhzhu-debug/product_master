---
phase: quick-17
plan: "01"
subsystem: orders/customers
tags: [customer, address, order-create, ux, schema]
dependency_graph:
  requires: []
  provides: [customer-defaultAddress, order-address-prefill, address-sync-checkbox]
  affects: [OrderCreate, CustomerSearch, customers-table]
tech_stack:
  added: []
  patterns: [schema-optional-field, computed-flag, checkbox-state-sync]
key_files:
  created: []
  modified:
    - convex/schema.ts
    - convex/customers/mutations.ts
    - convex/orders/mutations/orderCrud.ts
    - src/components/orders/CustomerSearch.tsx
    - src/pages/OrderCreate.tsx
    - docs/CHANGELOG.md
decisions:
  - "defaultAddress is stored on customers table as a single optional string (latest used)"
  - "Address sync is opt-in via checkbox (default checked) rather than automatic to preserve per-order flexibility"
  - "Pre-populate only in new order mode (not edit mode) to avoid overwriting order's already-saved address"
  - "updateCustomerAddress is passed to updateDraft backend; backend does ctx.db.patch on the customer"
metrics:
  duration_minutes: 12
  completed_date: "2026-02-22"
  tasks_completed: 3
  files_modified: 6
---

# Quick Task 17: Customer Address Sync — Pre-populate Address Summary

**One-liner:** Customer defaultAddress field on schema with auto-fill on customer select and optional sync-back checkbox in OrderCreate.

## What Was Built

Added a `defaultAddress` field to the customers table and wired it through the order creation flow so repeat customers no longer need to re-type their delivery address on every order.

### Backend Changes

**`convex/schema.ts`**
- Added `defaultAddress: v.optional(v.string())` to the `customers` table definition (after `notes`, before `createdBy`).

**`convex/customers/mutations.ts`**
- Added `defaultAddress: v.optional(v.string())` to `create` mutation args and insert call.
- Added `defaultAddress: v.optional(v.string())` to `update` mutation args and patch block.

**`convex/orders/mutations/orderCrud.ts`**
- `create` mutation: new customers created through the order form now get `defaultAddress: args.deliveryAddress || undefined` saved automatically.
- `updateDraft` mutation: added `updateCustomerAddress: v.optional(v.boolean())` arg. When `true` and `deliveryAddress` is provided, patches the customer's `defaultAddress` before applying the order patch.

### Frontend Changes

**`src/components/orders/CustomerSearch.tsx`**
- `onCustomerSelect` signature extended to pass `defaultAddress?: string` as 4th argument.
- `handleSelect` reads `customer.defaultAddress` and passes it through.
- Selected state now shows a `MapPin` icon with the saved address (truncated) below the phone number.

**`src/pages/OrderCreate.tsx`**
- Added `customerDefaultAddress` state (tracks the customer's saved default for comparison).
- Added `updateCustomerAddress` state (checkbox value, defaults to `true`).
- Added `customerQueryResult` query (`api.customers.queries.get`) to load customer defaultAddress in edit mode.
- `handleCustomerSelect` accepts `defaultAddress` as 4th param, stores it, and pre-populates `deliveryAddress` when not in edit mode.
- `addressDiffersFromCustomer` computed flag: true when entered address differs from saved default.
- `shouldShowAddressSync` computed flag: true when customer exists, address is entered, and address is new or differs.
- Checkbox "Save as customer's default address" shown below QuickAddressButtons when `shouldShowAddressSync` is true.
- `handleSaveDraft` and `executeSubmit` pass `updateCustomerAddress: updateCustomerAddress && shouldShowAddressSync ? true : undefined` to `updateDraftMutation`.

## Deviations from Plan

None — plan executed exactly as written. The plan's step about `createDraft` new customer (step 3a) was correctly identified as needing no change; instead the `create` mutation (step 3c) was updated to save defaultAddress.

## Self-Check: PASSED

- `convex/schema.ts` — defaultAddress field present
- `convex/customers/mutations.ts` — defaultAddress in create/update
- `convex/orders/mutations/orderCrud.ts` — updateCustomerAddress arg and handler present
- `src/components/orders/CustomerSearch.tsx` — 4th arg in onCustomerSelect, MapPin display
- `src/pages/OrderCreate.tsx` — shouldShowAddressSync, checkbox, updateCustomerAddress passed to mutations
- `npm run type-check` — PASSED
- `npm run build` — PASSED (exit code 0)
- `npm run test` — 4 pre-existing failures (gobiz helpers test), 0 new failures

## Commits

| Hash | Message |
|------|---------|
| 1eee4ae | feat(quick-17): add defaultAddress to customers schema and mutations |
| 1dcd7a8 | feat(quick-17): pre-populate address on customer select with sync checkbox |
