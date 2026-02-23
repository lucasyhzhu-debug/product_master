---
status: resolved
trigger: "In the OrderSlideOut component, only the Payment Request template has a WhatsApp send button. Other templates (Production Started, Delivery Complete, Receipt, Shipping Confirmation, Pickup Ready) do not show a button."
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:02:00Z
---

## Current Focus

hypothesis: RESOLVED
test: n/a
expecting: n/a
next_action: n/a

## Symptoms

expected: All relevant WhatsApp templates should have a button in the order slide-out to trigger generating and sending a WhatsApp message for that template type, when the order is in an appropriate status.
actual: Only the "Payment Request" template has a WhatsApp send button in the order slide-out. All other templates (Production Started, Delivery Complete, Receipt, Shipping Confirmation, Pickup Ready) have no button visible.
errors: No visible errors — the other templates simply don't show any trigger button.
reproduction: Open the order manager, click on any order to open the slide-out panel. Look at the WhatsApp section — only payment request has a send button.
started: Always been this way — no prior implementation for the other 5 templates.

## Eliminated

- hypothesis: Bug introduced by Quick Task 19 removing items
  evidence: The WhatsApp button section (lines 461-476) only ever had payment_request. The OrderItems replacement in QT19 replaced a different section (Items+Pricing). No other buttons were ever removed.
  timestamp: 2026-02-23

## Evidence

- timestamp: 2026-02-23
  checked: OrderSlideOver.tsx lines 460-476
  found: Only one WhatsApp block existed: `{order.status === 'AwaitingPayment' && ...}` which rendered a single "Send Payment Request via WhatsApp" button. Opened a Dialog with StepWhatsAppTemplate templateType="payment_request"
  implication: The 5 other template types had zero UI entry points in the slide-over

- timestamp: 2026-02-23
  checked: convex/orders/whatsapp.ts
  found: Backend getMessage query supports all 6 templates: payment_request, production_started, delivery_complete, receipt, shipping, pickup_ready. All have hardcoded generators plus DB template fallback.
  implication: Backend is complete. Gap was purely in the frontend slide-over UI.

- timestamp: 2026-02-23
  checked: StepWhatsAppTemplate.tsx
  found: WhatsAppTemplateType union covers all 6 types. Component fetches message via useQuery and renders Copy + Send WA buttons. Fully functional for any templateType prop.
  implication: The reusable component was ready. Only needed to add buttons in OrderSlideOver with correct templateType.

- timestamp: 2026-02-23
  checked: OrderSlideOver.tsx - Dialog modal (lines 563-582)
  found: The modal was hardcoded: `<StepWhatsAppTemplate orderId={orderId} templateType="payment_request" .../>` with title "Send Payment Request"
  implication: The modal needed to be made generic — accept a templateType state variable so a single Dialog can serve all 6 templates.

## Resolution

root_cause: OrderSlideOver.tsx had only one hardcoded WhatsApp section for payment_request at AwaitingPayment status. The showWhatsAppModal state (boolean) and Dialog were hardcoded to templateType="payment_request". No buttons or modal entries existed for the other 5 templates.

fix: |
  1. Imported WhatsAppTemplateType from StepWhatsAppTemplate
  2. Changed showWhatsAppModal (boolean) -> activeWhatsAppTemplate (WhatsAppTemplateType | null)
  3. Replaced single hardcoded payment_request button with status-aware WhatsApp section
     computing relevant buttons per order status:
       - payment_request: AwaitingPayment
       - receipt: any non-Draft/Cancelled status
       - production_started: BeingPrepared
       - shipping: AwaitingDelivery + Delivery type
       - pickup_ready: AwaitingDelivery + Pickup type
       - delivery_complete: Complete
  4. Genericized the Dialog to use activeWhatsAppTemplate with dynamic title from WHATSAPP_TEMPLATE_TITLES map
  5. Updated all old setShowWhatsAppModal(true) calls to use the new template-specific form

verification: npm run type-check passes. npm run build passes (2760 modules, all chunks within limits). Commit 50c9f4e on branch fix/whatsapp-buttons-missing-order-slideout.

files_changed:
  - src/components/orders/OrderSlideOver.tsx
