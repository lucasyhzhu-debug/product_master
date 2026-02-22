---
phase: quick-21
plan: "01"
subsystem: orders
tags: [delivery-fee, order-create, whatsapp-templates]
dependency_graph:
  requires: []
  provides: [delivery-fee-input-on-order-create, corrected-whatsapp-ongkir-position]
  affects: [src/pages/OrderCreate.tsx, convex/orders/whatsapp.ts]
tech_stack:
  added: []
  patterns: [useMutation-for-fee-persistence, controlled-number-input]
key_files:
  created: []
  modified:
    - src/pages/OrderCreate.tsx
    - convex/orders/whatsapp.ts
decisions:
  - "deliveryFee input row is always visible in Order Summary (unconditional), not only when voucher applied"
  - "generateReceipt deliveryFeeLine uses trimStart() to remove leading newline before inserting above Total"
  - "Pre-existing GoFoodDepotManager.tsx build error (tsc -b) is out of scope and already documented in deferred-items.md; tsc --noEmit passes"
metrics:
  duration: "~8 min"
  completed: "2026-02-22"
  tasks_completed: 3
  files_modified: 2
---

# Quick Task 21: Delivery Fee Input on OrderCreate + WhatsApp Ongkir Position Fix Summary

Delivery fee input added to OrderCreate Order Summary with full persistence, and ongkir line repositioned before Total in both WhatsApp hardcoded template functions.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add deliveryFee input to OrderCreate Order Summary | a581345 | src/pages/OrderCreate.tsx |
| 2 | Fix deliveryFeeLine position in WhatsApp hardcoded templates | bd5322c | convex/orders/whatsapp.ts |
| 3 | Build verification | — | — |

## What Was Built

### Task 1: deliveryFee input in OrderCreate
- Added `const [deliveryFee, setDeliveryFee] = useState(0)` after the `notes` state declaration
- Added `updateDeliveryFeeMutation` from `api.orders.mutations.index.updateDeliveryFee`
- Updated total calculation: `subtotal - totalDiscountValue + deliveryFee`
- Added "Delivery Fee" numeric input row unconditionally above Total row in Order Summary card
- Added fee persistence in `executeSubmit` (when draftOrderId exists and deliveryFee > 0)
- Added fee persistence in `handleSaveDraft`
- Pre-fills `deliveryFee` from `existingOrder.deliveryFee` in edit mode

### Task 2: WhatsApp ongkir position fix
- `generatePaymentRequest`: moved `${deliveryFeeLine}` from after Total to before `*Total:*` line. `deliveryFeeLine` already ends with `\n` when non-empty, so it flows naturally into Total.
- `generateReceipt`: moved delivery fee to before Total using `${deliveryFeeLine ? deliveryFeeLine.trimStart() + '\n' : ''}` pattern, removing the trailing `${deliveryFeeLine}` that was appended after `discountNote`.
- `generateProductionStarted` and `generateShippingConfirmation` untouched.

## Deviations from Plan

### Out-of-scope pre-existing build error

**Found during:** Task 3 build verification
**Issue:** `npm run build` (tsc -b) fails on `src/pages/GoFoodDepotManager.tsx` line 198 — `Id<"gofoodDepotStock">` not assignable to `Id<"productInventory">`. This error existed before quick-21 changes (confirmed via git stash test).
**Action:** Logged to `.planning/phases/19-gofood-depot-management-and-kitchen-production-targets/deferred-items.md` (already documented there). Not fixed — out of scope.
**tsc --noEmit passes cleanly.** Only tsc -b fails due to this pre-existing issue.

## Verification

- [x] deliveryFee state initialises to 0
- [x] Order Summary shows "Delivery Fee" input row above Total
- [x] Total = subtotal - discount + deliveryFee
- [x] executeSubmit calls updateDeliveryFeeMutation when fee > 0 and draftOrderId exists
- [x] handleSaveDraft also persists fee
- [x] Edit mode pre-fills fee from existingOrder.deliveryFee
- [x] generatePaymentRequest: ongkir before Total
- [x] generateReceipt: ongkir before Total
- [x] npm run type-check passes (tsc --noEmit)

## Self-Check: PASSED

Commits verified:
- a581345 — feat(quick-21): add deliveryFee state, input row, and persistence to OrderCreate
- bd5322c — fix(quick-21): move ongkir line before Total in WhatsApp templates

Files verified:
- src/pages/OrderCreate.tsx — deliveryFee state at line 92, input row at line 851, total calc at line 209
- convex/orders/whatsapp.ts — generatePaymentRequest deliveryFeeLine before Total at line 295, generateReceipt at line 442
