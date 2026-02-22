---
phase: quick-16
plan: "01"
subsystem: inventory
tags: [inventory, orders, status-transitions, quick-task]
dependency_graph:
  requires: []
  provides: [fulfillFromInventory-accepts-BeingPrepared, inventory-panel-visible-on-BeingPrepared]
  affects: [convex/productInventory/mutations.ts, src/components/inventory/FulfillFromInventoryButton.tsx]
tech_stack:
  added: []
  patterns: [status-guard-relaxation, dynamic-audit-log-fromStatus]
key_files:
  modified:
    - convex/productInventory/mutations.ts
    - src/components/inventory/FulfillFromInventoryButton.tsx
decisions:
  - "Use dynamic order.status in logStatusTransition instead of hardcoded literal to ensure correct audit trail for both PaymentReceived and BeingPrepared"
  - "isKitchenVisible: false patch retained unchanged — correct for both statuses since BeingPrepared orders are kitchen-visible and need clearing"
metrics:
  duration: "~2 minutes"
  completed: "2026-02-22"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 16: Allow Use-From-Inventory in BeingPrepared Status — Summary

**One-liner:** Extended fulfillFromInventory to accept BeingPrepared orders alongside PaymentReceived, with dynamic audit log fromStatus and matching frontend visibility guard.

## What Was Done

Allow staff to use the "Use Available Inventory" drawdown flow on orders already in BeingPrepared status (in the kitchen queue), not just PaymentReceived. This enables bypassing kitchen production when existing finished goods stock is available, advancing directly to AwaitingDelivery.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Relax backend status guard to accept BeingPrepared | a2023e4 | convex/productInventory/mutations.ts |
| 2 | Show inventory panel on BeingPrepared orders in frontend | 65b1613 | src/components/inventory/FulfillFromInventoryButton.tsx |

## Changes Made

### Task 1 — Backend (convex/productInventory/mutations.ts)

1. **Status guard:** Changed from `order.status !== "PaymentReceived"` to `order.status !== "PaymentReceived" && order.status !== "BeingPrepared"`. Error message updated to mention both statuses.

2. **Audit log fromStatus:** Changed `logStatusTransition` call from hardcoded `"PaymentReceived"` to `order.status` (dynamic). This ensures audit trail records the actual status the order was in when drawdown was triggered.

3. **Comment update:** Updated inline comment on the `ctx.db.patch` call to say "PaymentReceived | BeingPrepared -> AwaitingDelivery".

4. **isKitchenVisible: false retained:** BeingPrepared orders are kitchen-visible, so clearing this flag is the correct behavior when fulfilling from inventory — matches the existing behavior for PaymentReceived.

### Task 2 — Frontend (src/components/inventory/FulfillFromInventoryButton.tsx)

1. **Visibility guard:** Changed from `orderStatus !== 'PaymentReceived'` to `orderStatus !== 'PaymentReceived' && orderStatus !== 'BeingPrepared'`. Panel now renders for both statuses, returns null for all others.

2. **JSDoc comment:** Updated "Only visible when order status is PaymentReceived" to "...PaymentReceived or BeingPrepared".

3. **Descriptive text:** Changed "Skip kitchen production and fulfill this order directly from finished goods stock." to "Fulfill this order directly from finished goods stock. Order will advance to Awaiting Delivery." — accurate for both contexts.

## Verification

- `npm run type-check` passed with no errors
- `npm run build` succeeded (2 pre-existing CSS warnings, unrelated to this change)
- PaymentReceived path unchanged (no behavioral change for that status)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: convex/productInventory/mutations.ts (modified)
- FOUND: src/components/inventory/FulfillFromInventoryButton.tsx (modified)
- FOUND commit a2023e4: fix(quick-16): relax fulfillFromInventory status guard to accept BeingPrepared
- FOUND commit 65b1613: feat(quick-16): show Use Available Inventory panel on BeingPrepared orders
