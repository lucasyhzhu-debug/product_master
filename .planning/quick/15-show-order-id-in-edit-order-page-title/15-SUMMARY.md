---
phase: 15-show-order-id-in-edit-order-page-title
plan: "01"
subsystem: frontend/orders
tags: [ui, orders, page-header, quick-task]
dependency_graph:
  requires: []
  provides: ["dynamic-edit-order-title"]
  affects: ["src/pages/OrderCreate.tsx"]
tech_stack:
  added: []
  patterns: ["conditional template literal in JSX title prop"]
key_files:
  modified:
    - src/pages/OrderCreate.tsx
decisions:
  - "Use optional chaining (existingOrder?.orderNumber) for safe access — existingOrder may be undefined or null while query loads"
metrics:
  duration: "~3 min"
  completed: "2026-02-22"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 15: Show Order ID in Edit Order Page Title — Summary

## One-liner

PageHeader title in OrderCreate now shows "Edit Order MMDD-NNN" when the order has an orderNumber, falling back to "Edit Draft" for pure drafts.

## What Was Done

Updated the `PageHeader` title logic in `src/pages/OrderCreate.tsx` (lines 515-524) to use a three-way conditional:

- `isEditMode = false` → "New Order" (unchanged)
- `isEditMode = true` AND `existingOrder?.orderNumber` is set → `"Edit Order ${existingOrder.orderNumber}"` (e.g., "Edit Order 0222-009")
- `isEditMode = true` AND no `orderNumber` → "Edit Draft" (unchanged fallback for pure drafts)

`existingOrder` is already fetched via `useQuery(api.orders.queries.get, ...)`. `orderNumber` is a `v.string()` field on the `orders` table. No backend changes were needed.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | d09c8bb | feat(15-01): show order number in edit order page title |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run type-check` — PASSED
- `npm run build` — PASSED (build in 14.02s, warnings are pre-existing)

## Self-Check: PASSED

- File modified: `src/pages/OrderCreate.tsx` — FOUND
- Commit d09c8bb — FOUND
