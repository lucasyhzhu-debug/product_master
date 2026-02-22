---
phase: quick-13
plan: 13
subsystem: orders, header-nav
tags: [ux, orders, customers, navigation]
dependency_graph:
  requires: []
  provides: [customers-in-config-nav, inline-phone-edit-in-order-form]
  affects: [Header.tsx, OrderForm.tsx]
tech_stack:
  added: []
  patterns: [inline-edit, useConvexCustomer, useConvexUpdateCustomer]
key_files:
  created: []
  modified:
    - src/components/layout/Header.tsx
    - src/components/orders/OrderForm.tsx
decisions:
  - "Used isSavingPhone local state instead of updateCustomer.isPending because createMutationHook does not expose isPending — only mutate/mutateAsync"
  - "Wrapped the falsy branch of isNewCustomer ternary in a React fragment to allow two sibling elements (search div + phone row)"
metrics:
  duration: 3 min
  completed: 2026-02-22T05:12:50Z
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 13: Add Phone Number Editing in New Order Form — Summary

**One-liner:** Added Customers link to Config nav dropdown and inline phone display/edit for selected customers in OrderForm using useConvexCustomer + useConvexUpdateCustomer hooks.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Customers to Config nav in Header | af04a2d | src/components/layout/Header.tsx |
| 2 | Inline phone display and edit for selected existing customer in OrderForm | 71d7c8b | src/components/orders/OrderForm.tsx |

## What Was Built

### Task 1: Customers in Config Nav
Added `{ path: '/customers', label: 'Customers', icon: Users, permission: 'canAccessOrders' }` to the `configItems` array in `Header.tsx`. The `Users` icon was already imported. The `canAccessOrders` permission matches the existing `/customers` route protection, giving access to order_staff, manager, and admin roles.

### Task 2: Inline Phone Edit in OrderForm
When an existing customer is selected (`customerId` is set, `isNewCustomer` is false), the form now shows their phone number inline below the customer search input:

- **Display mode:** Shows `Phone: {number}` or `No phone on record` with a pencil icon button
- **Edit mode:** Input pre-filled with current phone, Check button, Enter to save, Escape to cancel
- **Save:** Calls `updateCustomer.mutateAsync({ id: customerId, phone: phoneEdit || undefined })` which shows a "Customer updated" toast on success
- **Reset:** Phone edit state is cleared when customer selection changes or is cleared

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing isPending on createMutationHook**
- **Found during:** Task 2
- **Issue:** Plan specified `disabled={updateCustomer.isPending}` but `createMutationHook` only returns `{ mutate, mutateAsync }` — no `isPending` property. TypeScript would have caught this.
- **Fix:** Added `isSavingPhone` local state variable, set to true before await and false in finally block. Used `disabled={isSavingPhone}` on the Check button.
- **Files modified:** src/components/orders/OrderForm.tsx

**2. [Rule 1 - Bug] Fixed JSX structure — ternary false branch needed fragment**
- **Found during:** Task 2
- **Issue:** Plan showed two sibling elements in the falsy branch of `isNewCustomer ? ... : (...)` (the `<div className="relative">` and the `{customerId && ...}` block). JSX ternary false branches can only be one expression.
- **Fix:** Wrapped the false branch in a React fragment `<>...</>` to contain both sibling elements.
- **Files modified:** src/components/orders/OrderForm.tsx

## Self-Check

### Created files exist
- N/A (no new files created)

### Modified files verified
- `src/components/layout/Header.tsx` — Customers entry added to configItems
- `src/components/orders/OrderForm.tsx` — Phone inline edit implemented

### Commits exist
- af04a2d: feat(quick-13): add Customers link to Config nav dropdown in Header
- 71d7c8b: feat(quick-13): add inline phone display and edit for selected customer in OrderForm

## Self-Check: PASSED
