---
status: resolved
trigger: "delivery-fee-not-included-in-final-total"
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED
test: traced exact execution path, updated recalculateFinalTotal to accept deliveryFee param, updated all 5 call sites
expecting: finalTotal now always includes deliveryFee after any item/discount/voucher mutation
next_action: DONE

## Symptoms

expected: Final Total = items subtotal + delivery fee (minus discounts). WhatsApp total should also include ongkir.
actual: After "Save Changes" in OrderCreate (editing AwaitingPayment), Final Total = items only (ongkir excluded). WhatsApp total is also wrong.
errors: No error messages visible
reproduction: Open order with delivery fee set, open Edit Order Items, press "Save Changes". finalTotal reverts to items-only.
started: Unknown, likely since delivery fee feature was added

## Eliminated

- hypothesis: Frontend is not sending deliveryFee to backend
  evidence: Local deliveryFee state IS initialized from existingOrder.deliveryFee (OrderCreate.tsx:127-129). updateDeliveryFeeMutation IS called if deliveryFee > 0.
  timestamp: 2026-02-22

- hypothesis: updateDeliveryFee mutation has wrong logic
  evidence: The mutation math is (finalTotal - oldDeliveryFee) + newDeliveryFee — correct in isolation, but reads from a DB state that's already been corrupted by replaceItems.
  timestamp: 2026-02-22

## Evidence

- timestamp: 2026-02-22
  checked: convex/schema.ts orders table
  found: finalTotal is a stored field. deliveryFee is separate optional field. Schema comment says "Included in finalTotal".
  implication: finalTotal is supposed to always include deliveryFee

- timestamp: 2026-02-22
  checked: convex/orders/mutations/itemCrud.ts replaceItems (line 244-257)
  found: recalculateFinalTotal(totalAmount, order.orderLevelDiscount, order.orderLevelDiscountType) — NO deliveryFee parameter
  implication: replaceItems resets finalTotal = items - discount, completely ignoring existing deliveryFee

- timestamp: 2026-02-22
  checked: convex/orders/helpers.ts recalculateFinalTotal
  found: Only takes totalAmount + discount params, no deliveryFee param
  implication: Every caller of recalculateFinalTotal omits deliveryFee from finalTotal

- timestamp: 2026-02-22
  checked: Execution trace for "Save Changes" on AwaitingPayment order with deliveryFee=36000, items=120000
  found: Step 1: replaceItems → finalTotal=120000 (correct items, no fee). Step 2: updateDeliveryFee → reads finalTotal=120000, oldDeliveryFee=36000 → newFinalTotal=(120000-36000)+36000=120000 (WRONG, subtracts already-missing fee)
  implication: The two-step correction cancels itself out — the bug is that replaceItems strips deliveryFee, and updateDeliveryFee assumes it was still there

- timestamp: 2026-02-22
  checked: itemCrud.ts addItem (line 88-100), removeItem (line 139-151), updateItemQuantity (lines 322+)
  found: All 4 item mutations call recalculateFinalTotal without deliveryFee — all have same bug
  implication: Any item edit on an order with deliveryFee will produce wrong finalTotal until updateDeliveryFee is called

- timestamp: 2026-02-22
  checked: orderCrud.ts updateDraft voucher handling (lines 822, 857)
  found: Both voucher-clear and voucher-apply paths set finalTotal without adding deliveryFee
  implication: Secondary bug — voucher changes on orders with deliveryFee also break finalTotal

- timestamp: 2026-02-22
  checked: convex/orders/whatsapp.ts
  found: Uses order.finalTotal directly for the total shown in WhatsApp message
  implication: WhatsApp total is wrong because it reads the incorrectly stored finalTotal

## Resolution

root_cause: recalculateFinalTotal() and all item/discount/voucher mutation handlers fail to include order.deliveryFee when recalculating finalTotal. When "Save Changes" runs replaceItems first (stripping deliveryFee from finalTotal), the subsequent updateDeliveryFee call subtracts the old fee from an already-fee-free finalTotal, netting out to zero change.

fix: |
  1. Updated recalculateFinalTotal() in convex/orders/helpers.ts to accept optional deliveryFee param
  2. Updated all 4 callers in itemCrud.ts (addItem, removeItem, replaceItems, updateItemQuantity) to pass order.deliveryFee
  3. Fixed clearVoucherFromOrder() in voucherHandling.ts to add deliveryFee to newFinalTotal
  4. Fixed updateOrderDiscount() in orderCrud.ts to add deliveryFee to finalTotal
  5. Fixed updateDraft() voucher-clear and voucher-apply paths in orderCrud.ts to add deliveryFee

verification: npm run type-check passes. Build errors are pre-existing unrelated issues in whatsappTemplates files.

files_changed:
  - convex/orders/helpers.ts (recalculateFinalTotal signature + logic)
  - convex/orders/mutations/itemCrud.ts (4 call sites)
  - convex/orders/mutations/orderCrud.ts (updateOrderDiscount + updateDraft voucher paths)
  - convex/orders/helpers/voucherHandling.ts (clearVoucherFromOrder)
