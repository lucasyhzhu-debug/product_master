---
phase: quick-14
plan: "01"
subsystem: orders
tags: [whatsapp, delivery, bugfix, mutations]
dependency_graph:
  requires: []
  provides: [delivery-address-sync, smart-whatsapp-delivery-info]
  affects: [convex/orders/mutations/statusUpdates.ts, convex/orders/whatsapp.ts]
tech_stack:
  added: []
  patterns: [address-content-over-field-value, parse-on-write]
key_files:
  created: []
  modified:
    - convex/orders/mutations/statusUpdates.ts
    - convex/orders/whatsapp.ts
decisions:
  - "Use address content (PICKUP_PREFIX_RE) as source of truth for delivery type in WhatsApp templates, not the deliveryType field which may be stale"
  - "Sync deliveryType/pickupLocation on every deliveryAddress write in updateDetails (parse-on-write pattern)"
metrics:
  duration: "~5 min"
  completed: "2026-02-22"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-14 Plan 01: Fix WhatsApp Template Delivery Address Summary

**One-liner:** Fixed two delivery address bugs — updateDetails now syncs deliveryType/pickupLocation via parseDeliveryAddress, and WhatsApp templates show delivery address based on address content not stale deliveryType field.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Sync deliveryType/pickupLocation in updateDetails mutation | aee3433 | convex/orders/mutations/statusUpdates.ts |
| 2 | Smart delivery info in WhatsApp template generation | 80793a1 | convex/orders/whatsapp.ts |

## Changes Made

### Task 1: updateDetails delivery sync
In `convex/orders/mutations/statusUpdates.ts`:
- Added import of `parseDeliveryAddress` from `"../helpers"`
- Extended the `deliveryAddress` branch in `updateDetails` to also call `parseDeliveryAddress` and write back `deliveryType` and `pickupLocation`
- This mirrors the same parse-on-write logic already in `editOrder` (orderCrud.ts lines 770-775)

### Task 2: Smart WhatsApp delivery info
In `convex/orders/whatsapp.ts`:
- Added module-level `PICKUP_PREFIX_RE = /^pick up:\s*/i` constant (mirrors helpers.ts)
- Updated `buildTemplateVariables`: deliveryInfo now checks address content first — if address starts with "pick up:" treat as pickup, else show delivery address whenever `deliveryAddress` is set (regardless of `deliveryType`)
- Updated `generatePaymentRequest`: same smart logic applied
- The `generateReceipt` `deliveryLine` section was intentionally left unchanged per plan (it shows explicit "Type: X" format)

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run type-check`: PASSED
- `npm run build`: PASSED (pre-existing CSS/chunk size warnings unrelated to these changes)

## Self-Check: PASSED

Files confirmed:
- convex/orders/mutations/statusUpdates.ts — FOUND, contains parseDeliveryAddress import and sync logic
- convex/orders/whatsapp.ts — FOUND, contains PICKUP_PREFIX_RE and updated deliveryInfo logic

Commits confirmed:
- aee3433 — FOUND (fix(quick-14): sync deliveryType/pickupLocation in updateDetails mutation)
- 80793a1 — FOUND (fix(quick-14): smart delivery info in WhatsApp templates checks address content)
