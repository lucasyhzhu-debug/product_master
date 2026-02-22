---
status: resolved
trigger: "When editing a draft order (that was previously in AwaitingPayment status and reverted to Draft), pressing 'Save Changes' causes a Convex server error in orders/mutations/orderCrud:updateDraft"
created: 2026-02-22T09:00:00Z
updated: 2026-02-22T09:45:00Z
---

## Current Focus

hypothesis: CONFIRMED - updateDraft receives voucherCode from frontend state but replaceItems already cleared the voucher from the order. This causes updateDraft to treat the voucher as "new/changed" and call validateAndApplyVoucher, which throws if the voucher is inactive (e.g., manager override deactivated on first use) or expired.

test: Code trace through handleSaveDraft -> replaceItemsMutation -> updateDraftMutation
expecting: Fix by not re-applying the same voucher code in updateDraft when it was already on the order before replaceItems cleared it
next_action: Apply fix to updateDraft and replaceItems interaction

## Symptoms

expected: Draft order saves successfully when clicking "Save Changes"
actual: Convex throws server error: M(orders/mutations/orderCrud:updateDraft) Server Error, Called by client
errors: Server error from orderCrud:updateDraft mutation. No specific error message beyond "Server Error".
reproduction: Open an existing draft order (one that was previously AwaitingPayment and reverted to Draft), make changes, click Save Changes
timeline: Unknown exactly when it started. Only observed with one specific order so far.

## Eliminated

- hypothesis: The order's awaitingPaymentSince field causes schema validation error
  evidence: awaitingPaymentSince is v.optional(v.number()) in schema. updateDraft doesn't touch it. Presence of this field on the order doc is valid.
  timestamp: 2026-02-22

- hypothesis: Setting patch.pickupLocation = undefined causes a Convex patch error
  evidence: Convex docs state "Fields set to undefined are removed." PatchValue type explicitly allows undefined for optional fields. This is the correct way to unset optional fields.
  timestamp: 2026-02-22

- hypothesis: Item loading falls back to orderItem._id as menuProductId causing type mismatch
  evidence: Would fail in replaceItems, not updateDraft. Error is reported in updateDraft. Also items with menuProductId set would not hit this path.
  timestamp: 2026-02-22

## Evidence

- timestamp: 2026-02-22
  checked: OrderCreate.tsx handleSaveDraft (lines 335-369)
  found: Calls replaceItemsMutation FIRST, then updateDraftMutation with voucherCode: appliedVoucher?.code
  implication: These are separate Convex mutations, each in their own transaction. replaceItems commits before updateDraft begins.

- timestamp: 2026-02-22
  checked: itemCrud.ts replaceItems handler (lines 168-261)
  found: Calls clearVoucherFromOrder which: (1) calls releaseVoucherUsage - decrements usageCount, deletes voucherUsage record; (2) patches order to set voucherId=undefined, voucherCode=undefined, voucherDiscountValue=undefined
  implication: After replaceItems completes, the order has NO voucher (voucherCode is undefined).

- timestamp: 2026-02-22
  checked: orderCrud.ts updateDraft handler (lines 736-822)
  found: At line 737, reads order from DB (which now has voucherCode=undefined after replaceItems). At line 793, checks args.voucherCode !== order.voucherCode. If args has a voucher code but order doesn't (cleared by replaceItems), this is "CODE" !== undefined = TRUE, triggering the "new/changed voucher" branch.
  implication: updateDraft sees the voucher as "new" even though it was already applied before replaceItems cleared it.

- timestamp: 2026-02-22
  checked: voucherHandling.ts validateAndApplyVoucher (lines 24-121)
  found: Checks voucher.isActive at line 43. If voucher is inactive, throws "This voucher is no longer active".
  implication: Manager override vouchers are deactivated (isActive=false) after first recordVoucherUsage call. clearVoucherFromOrder does NOT reactivate them (by design, for audit trail). So validateAndApplyVoucher will always throw for manager override vouchers.

- timestamp: 2026-02-22
  checked: voucherHandling.ts releaseVoucherUsage comment (line 188)
  found: "IMPORTANT: For manager overrides, do NOT reactivate or clear order link. This maintains audit trail even if order is cancelled/deleted."
  implication: This is intentional design. Manager override vouchers stay inactive. But it means re-applying them in updateDraft is impossible.

- timestamp: 2026-02-22
  checked: voucherHandling.ts recordVoucherUsage (lines 129-162)
  found: For manager override vouchers (voucher.isManagerOverride === true), sets isActive=false on the voucher document.
  implication: After ANY order applies a manager override voucher, the voucher is permanently inactive. Re-validation via validateAndApplyVoucher will always fail.

## Resolution

root_cause: Race condition between replaceItems and updateDraft mutations when editing an order with a voucher applied. replaceItems calls clearVoucherFromOrder which removes the voucher from the order document. Then updateDraft receives the voucher code from the frontend state, sees order.voucherCode is now undefined, and incorrectly treats the SAME voucher as a "new/changed" voucher, triggering full re-validation via validateAndApplyVoucher. This re-validation fails specifically when the voucher is a manager override (deactivated after first use) but can also fail for expired or usage-limited vouchers.

fix: In OrderCreate.tsx, removed voucherCode from updateDraftMutation calls in both handleSaveDraft and executeSubmit. The replaceItems mutation always clears the voucher via clearVoucherFromOrder. Passing the voucher code again to updateDraft caused it to treat the cleared voucher as a "new" voucher and run full re-validation, which fails for manager override vouchers (deactivated after first use). Also cleared appliedVoucher local state in handleSaveDraft after replaceItems succeeds, so the UI reflects that the voucher was cleared.

verification: npm run type-check passes (no TypeScript errors). npm run test shows same pre-existing failures, no new failures. The fix prevents the server error by not attempting to re-apply a voucher that replaceItems already cleared.
files_changed:
  - src/pages/OrderCreate.tsx (handleSaveDraft: removed voucherCode from updateDraftMutation, added setAppliedVoucher(null); executeSubmit: removed voucherCode from updateDraftMutation)
