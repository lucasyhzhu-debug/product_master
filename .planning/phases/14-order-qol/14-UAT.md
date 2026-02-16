---
status: diagnosed
phase: 14-order-qol
tested_by: user
tested_on: 2026-02-16
---

# Phase 14: Order QoL — UAT Diagnosis

## Gaps Found

### GAP-01: Creator shows "admin" instead of actual user name
**Severity:** High
**Where:** Slide-over header ("Created ... by admin"), Kanban cards ("by admin")
**Root cause:** `OrderSlideOver.tsx:144` uses `order.createdBy` (old string field, set to "admin" on legacy orders) instead of resolved user name from `createdByUserId`. Kanban `listForKanban` query does resolve `creatorName` from `createdByUserId` but falls back to `order.createdBy` when `createdByUserId` is null.
**Fix:** Slide-over query must resolve `createdByUserId` → user name like `listForKanban` does. For orders without `createdByUserId`, fall back gracefully.

### GAP-02: Audit trail missing Draft creation event
**Severity:** High
**Where:** Status History panel in slide-over
**Root cause:** `orderCrud.ts` creates the order but doesn't call `logOrderEvent` for the Draft creation. `getAuditTrail` only returns `orderEvents` records — no synthetic "created" event.
**Fix:** Log a "created" event in `orderCrud.ts` when order is first created (Draft status), including `userId`. Alternatively, synthesize a creation event in `getAuditTrail` from the order's `_creationTime` + `createdByUserId`.

### GAP-03: Auto-expedite for Today/Tomorrow due dates on payment
**Severity:** Medium
**Where:** `moveForward` mutation (AwaitingPayment → PaymentReceived transition)
**Root cause:** No auto-expedite logic exists. Expedite is only manual via `expediteOrder` mutation.
**Fix:** In `moveForward`, when transitioning to `PaymentReceived`, check if `dueDate` is today or tomorrow. If so, auto-set `expedited: true` and auto-enter kitchen (BeingPrepared).

### GAP-04: Expedite warning on Today/Tomorrow date pills
**Severity:** Low
**Where:** `DueDatePills` component in OrderCreate
**Root cause:** No warning shown when selecting Today or Tomorrow pills.
**Fix:** Show inline text or toast when Today/Tomorrow selected: "This order will be auto-expedited when payment is received." Add confirmation if needed.

### GAP-05: Delivery section simplification
**Severity:** Medium
**Where:** OrderCreate page delivery section
**Root cause:** Still uses `DeliveryToggle` (Pickup/Delivery switch) with conditional address field.
**Fix:** Remove DeliveryToggle. Single text input for delivery address/pickup note. Add "Crystal" and "Goldfinch" quick-tap buttons that fill the address field with standard pickup text (e.g., "Crystal - self pickup", "Goldfinch - self pickup").

### GAP-06: iPhone mobile responsiveness
**Severity:** High
**Where:** KanbanBoard on iPhone 14 Pro (430×932)
**Root cause:** `min-w-[85vw]` on mobile columns may not fit within viewport with padding. Page header may also overflow.
**Fix:** Adjust column `min-w` to `min-w-[calc(100vw-2rem)]` or similar. Ensure page header (title + new order button) is compact on mobile. Test at 430px viewport.

### GAP-07: Discounted price on slide-over order sheet
**Severity:** Medium
**Where:** OrderSlideOver pricing section
**Root cause:** Slide-over shows `totalAmount` but doesn't prominently show discounted total with struck-through original price like Kanban cards do.
**Fix:** Mirror Kanban card pricing pattern: discounted total prominent, discount badge, struck-through full price.

### GAP-08: Packaging stock override UI
**Severity:** Medium
**Where:** StatusActionButtons when moveForward throws insufficient stock error
**Root cause:** `moveForward` supports `skipStockCheck` and `overrideReason` args, but the UI doesn't catch the ConvexError and offer an override dialog. Error shows as a raw Sonner toast.
**Fix:** Catch the ConvexError in StatusActionButtons, parse shortage details, show a dialog: "Insufficient stock: [details]. Override with reason?" with reason input + confirm button. Call `moveForward` again with `skipStockCheck: true` and `overrideReason`.

### GAP-09: WhatsApp modal not auto-appearing after submit
**Severity:** Medium
**Where:** Order creation flow (OrderCreate → submit → AwaitingPayment)
**Root cause:** Submit creates Draft then moves to AwaitingPayment, but no WhatsApp modal trigger is wired. The modal only shows when manually clicking WhatsApp button in slide-over.
**Fix:** After successful submit (order created + moved to AwaitingPayment), auto-open WhatsApp payment template modal or navigate to order with WhatsApp modal open.

## Summary

| Gap | Severity | Category |
|-----|----------|----------|
| GAP-01 | High | Bug |
| GAP-02 | High | Bug |
| GAP-03 | Medium | Feature |
| GAP-04 | Low | UX |
| GAP-05 | Medium | UX |
| GAP-06 | High | Bug |
| GAP-07 | Medium | Bug |
| GAP-08 | Medium | UX |
| GAP-09 | Medium | Bug |

**Total:** 9 gaps (3 high, 4 medium, 1 low, 1 feature)
