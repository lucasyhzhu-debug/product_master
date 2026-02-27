---
status: resolved
trigger: "free-voucher-submit-blocked and date-picker-missing"
created: 2026-02-26T00:00:00Z
updated: 2026-02-26T00:00:00Z
---

## Current Focus

hypothesis: Two independent bugs confirmed via code reading
test: Fix both and verify
expecting: Free orders submit; date picker shows calendar
next_action: Apply fixes to all 3 files

## Symptoms

expected: Free voucher orders (total=0) should submit and auto-confirm; date fields should show calendar popup
actual: Submit button disabled when total=0; backend throws on finalPrice<=0; date uses hidden link to native input
errors: Frontend disabled check `total <= 0`; Backend `validateFinalPrice` throws on <= 0
reproduction: Apply 100% voucher -> total=Rp 0 -> Submit disabled; Open order create -> due date has pills + hidden "Pick a date" link
started: Likely always

## Eliminated

(none)

## Evidence

- timestamp: 2026-02-26T00:01
  checked: OrderCreate.tsx line 920
  found: `disabled={isSubmitting || !hasItems || !customerSet || total <= 0}`
  implication: Frontend hard-blocks submit when total is 0 (free voucher case)

- timestamp: 2026-02-26T00:02
  checked: voucherHandling.ts line 261
  found: `if (finalPrice <= 0) throw new Error("Discount cannot exceed order total...")`
  implication: Backend also blocks 0-total orders -- even valid free voucher orders

- timestamp: 2026-02-26T00:03
  checked: orderCrud.ts executeSubmit flow (lines 460-548)
  found: Always transitions to AwaitingPayment, never auto-confirms free orders
  implication: Even after fixing validation, free orders would sit in AwaitingPayment unnecessarily

- timestamp: 2026-02-26T00:04
  checked: DueDatePills.tsx
  found: 7-day pill buttons + hidden "Pick a date" link that reveals native `<input type="date">`
  implication: Calendar is behind a click; no shadcn Calendar component installed but Popover exists

## Resolution

root_cause: |
  Issue 1: Three-layer block on free (Rp 0) orders:
    (a) Frontend button disabled when `total <= 0` (OrderCreate.tsx:920)
    (b) Backend `validateFinalPrice` throws when `finalPrice <= 0` (voucherHandling.ts:261)
    (c) No auto-confirm logic: free orders still go to AwaitingPayment

  Issue 2: DueDatePills hides the manual date input behind a "Pick a date" link.
    The native `<input type="date">` does show a calendar on most browsers,
    but it's not immediately visible -- user must click the link first.

fix: |
  Issue 1:
    (a) Change frontend: allow total === 0 (disable only if total < 0)
    (b) Change backend: allow finalPrice === 0 (block only negative)
    (c) In executeSubmit: if total === 0, auto-transition to Confirmed (skip AwaitingPayment)

  Issue 2:
    Show the date input by default (always visible) instead of behind a link.

verification: |
  - TypeScript type check: PASS (npx tsc --noEmit)
  - Full build: PASS (npm run build)
  - Logic review: validateFinalPrice allows 0, isLowPrice skips 0, submit button allows 0, auto-confirm for free orders
files_changed:
  - src/pages/OrderCreate.tsx
  - convex/orders/helpers/voucherHandling.ts
  - src/components/orders/DueDatePills.tsx
