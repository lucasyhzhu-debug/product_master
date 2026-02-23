---
status: resolved
trigger: "The WhatsApp message preview shows 'Payment: Unpaid' even when the order has been paid."
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — paymentStatus field is not auto-updated by normal workflow
test: Read schema, mutations, and whatsapp.ts
expecting: Fix applied and verified
next_action: complete

## Symptoms

expected: WhatsApp message should show "Payment: Paid" (or equivalent) when the order has been confirmed/paid.
actual: WhatsApp message shows "Payment: Unpaid" for paid/confirmed orders.
errors: No runtime errors — wrong value from correct field.
reproduction: Generate any WhatsApp receipt for an order in PaymentReceived, BeingPrepared, AwaitingDelivery, or Complete status.
started: Likely always been broken — paymentStatus field is only auto-set to "Paid" by forceComplete, never by normal status transitions.

## Eliminated

- hypothesis: Bug is in frontend rendering code
  evidence: Message is generated entirely in convex/orders/whatsapp.ts on the backend
  timestamp: 2026-02-23

- hypothesis: The DB template has a wrong variable name
  evidence: DB template uses {payment_info} which maps correctly to the paymentInfo variable in buildTemplateVariables
  timestamp: 2026-02-23

## Evidence

- timestamp: 2026-02-23
  checked: convex/orders/whatsapp.ts lines 83-87, 404-408 (original)
  found: Both buildTemplateVariables() and generateReceipt() computed paymentInfo as `Payment: ${order.paymentStatus}`. This reads the raw stored value.
  implication: If paymentStatus was never updated from "Unpaid", the message will say "Payment: Unpaid".

- timestamp: 2026-02-23
  checked: convex/schema.ts line 168-172
  found: paymentStatus is a union of "Unpaid" | "Partial" | "Paid". Defaults to "Unpaid" on order creation.
  implication: All orders start as "Unpaid" and stay that way unless explicitly updated.

- timestamp: 2026-02-23
  checked: convex/orders/mutations/statusUpdates.ts
  found: paymentStatus is only set to "Paid" in forceComplete (line 715). The updatePayment mutation allows manual updates. No automatic transition sets it to "Paid" when an order advances to PaymentReceived.
  implication: Normal workflow (AwaitingPayment -> PaymentReceived via moveForward) does NOT update paymentStatus. So "paid" orders (status=PaymentReceived+) have paymentStatus="Unpaid".

## Full Variable Sense-Check Results

All template variables audited in buildTemplateVariables() and generateReceipt():

| Variable | Field(s) Used | Verdict |
|---|---|---|
| {customer_name} | order.customer?.name ?? order.customerName | CORRECT — uses live customer name with snapshot fallback |
| {order_number} | order.orderNumber | CORRECT — stored string field |
| {items_list} | order.items (from orderItems query) | CORRECT — fully resolved |
| {total_amount} | order.finalTotal ?? order.totalAmount | CORRECT — uses final (post-discount) total |
| {discount_note} | order.voucherDiscountValue, order.orderLevelDiscount | CORRECT — unified format |
| {payment_info} | order.paymentStatus + order.paymentMethod | FIXED — was reading raw paymentStatus; now uses deriveEffectivePaymentStatus() |
| {delivery_info} | order.deliveryAddress, order.deliveryType, order.pickupLocation | CORRECT — QT-14 fix already in place |
| {delivery_fee} | order.deliveryFee | CORRECT — QT-22 addition, correct field |
| {due_date} | order.dueDate (formatted) | CORRECT — formatDate() called on timestamp |
| {due_date_line} | order.dueDate (formatted with time) | CORRECT |
| {status_label} | order.status | CORRECT — mapped to human labels |
| {channel_suffix} | order.channel | CORRECT — optional channel field |
| {notes_section} | order.notes | CORRECT — optional field |
| {shipping_number} | order.shippingNumber | CORRECT — with "-" fallback |
| {shipping_agency} | order.shippingAgency | CORRECT — with "-" fallback |
| {delivery_address} | order.deliveryAddress | CORRECT — with "" fallback |
| {pickup_location} | order.pickupLocation | CORRECT — with default "Legato Gelato - Goldfinch" fallback |

## Resolution

root_cause: The `paymentStatus` field on orders is a manually-managed field that defaults to `"Unpaid"` and is only ever set to `"Paid"` by the `forceComplete` admin mutation. The normal workflow transition from `AwaitingPayment` to `PaymentReceived` (via `moveForward`) never updates `paymentStatus`. As a result, all normally-confirmed orders had `paymentStatus = "Unpaid"` and the WhatsApp message faithfully rendered that stale value.

fix: Added `deriveEffectivePaymentStatus(order)` helper in `convex/orders/whatsapp.ts`. This function checks if `order.paymentStatus === "Unpaid"` AND `order.status` is in the paid-statuses set (`PaymentReceived`, `BeingPrepared`, `AwaitingDelivery`, `Complete`, plus all legacy statuses). If so, it returns `"Paid"` for display. If the stored paymentStatus is `"Partial"` or `"Paid"`, the stored value is returned as-is, so explicit manual overrides are preserved. Both `buildTemplateVariables()` (DB template path) and `generateReceipt()` (hardcoded fallback path) now use this helper.

verification: npm run type-check PASSED. npm run build PASSED. Logic covers all current and legacy order statuses.

files_changed:
  - convex/orders/whatsapp.ts
