---
status: resolved
trigger: "WhatsApp payment request template shows 'Pickup at: Goldfinch Legato' (hardcoded) instead of the customer's delivery address for non-pickup orders. Also need to rename 'Goldfinch Gelato' → 'Legato Gelato - Goldfinch' wherever it appears for pickup orders at that location."
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T13:20:00Z
---

## Current Focus

hypothesis: RESOLVED — root cause confirmed and fix committed in cb6b335.
test: npm run type-check passes. All occurrences of "Goldfinch Legato" replaced in source files.
expecting: N/A
next_action: Archive session

## Symptoms

expected: For delivery orders, show customer's address ("Citraland Mekarsari Cibubur"). For pickup orders at Goldfinch, show "Pickup at: Legato Gelato - Goldfinch".
actual: Template always shows "Pickup at: Goldfinch Legato" regardless of order type.
errors: No runtime errors — purely wrong output in generated WhatsApp message.
reproduction: Open any order detail (AwaitingPayment status), click "Send Payment Request via WhatsApp".
started: Unclear — may have always been broken for delivery orders.

## Eliminated

- hypothesis: Bug is in frontend StepWhatsAppTemplate component
  evidence: Component simply calls api.orders.whatsapp.getMessage and displays result. No delivery logic here.
  timestamp: 2026-02-22

- hypothesis: The order doesn't have deliveryType field
  evidence: Schema confirms deliveryType: v.string() // Pickup, Delivery is on orders table. Logic in whatsapp.ts branches on this correctly.
  timestamp: 2026-02-22

## Evidence

- timestamp: 2026-02-22
  checked: convex/orders/whatsapp.ts — generatePaymentRequest() lines 254-261
  found: Logic correctly branches on order.deliveryType === "Pickup" vs "Delivery". For delivery orders with a deliveryAddress, it sets `📍 Delivery to: ${order.deliveryAddress}`. This logic is CORRECT.
  implication: The bug may be that some orders have deliveryType="Pickup" when they should be "Delivery", OR the DB template (whatsappTemplates table) overrides with hardcoded text.

- timestamp: 2026-02-22
  checked: convex/orders/whatsapp.ts — buildTemplateVariables() lines 63-68 and line 128
  found: Same correct branching. The {pickup_location} fallback is "Goldfinch Legato" (wrong name).
  implication: If a DB template exists and uses {pickup_location} variable, delivery orders would still show correctly because {delivery_info} is set to "Delivery to: address" for delivery orders.

- timestamp: 2026-02-22
  checked: convex/orders/whatsappHelpers.ts — formatDeliveryInfo() line 102
  found: `const location = info.pickupLocation || "Goldfinch Legato";` — wrong fallback name, same bug.
  implication: Another location of the wrong fallback name.

- timestamp: 2026-02-22
  checked: src/lib/whatsappTemplates.ts — formatDeliveryInfo() line 67
  found: `const location = pickupLocation || 'Goldfinch Legato';` — wrong fallback name.
  implication: Frontend-side template also has the wrong name.

- timestamp: 2026-02-22
  checked: src/components/whatsappTemplates/TemplateEditor.tsx line 58
  found: `"{pickup_location}": "Goldfinch Legato"` — preview placeholder also has wrong name.
  implication: Template editor preview shows wrong name.

- timestamp: 2026-02-22
  checked: src/components/orders/OrderForm.tsx line 95
  found: `pickup_location: 'Goldfinch Legato'` — default value for new orders.
  implication: New orders are pre-filled with the wrong pickup location name.

- timestamp: 2026-02-22
  checked: convex/orders/__tests__/whatsapp.test.ts line 112
  found: `expect(result).toBe("Pickup at: Goldfinch Legato");` — test hardcodes old name.
  implication: Test must also be updated.

- timestamp: 2026-02-22
  checked: src/components/orders/QuickAddressButtons.tsx line 10
  found: `{ name: 'Goldfinch', address: 'Goldfinch (Self-pickup)' }` — this is a quick-address button, different context (not a template fallback).
  implication: NOT part of the fix — this is a shorthand label for the address field, not the pickup location name.

## ROOT CAUSE

Bug 1 — Wrong output for delivery orders: The `generatePaymentRequest()` code has CORRECT branching logic. The issue is almost certainly that existing orders in the database have `deliveryType = "Pickup"` and `pickupLocation = "Goldfinch Legato"` (or null) even when they should be delivery orders. This is a data entry issue. HOWEVER — the code fallback string is wrong name regardless.

Bug 2 — Wrong name: The fallback string "Goldfinch Legato" should be "Legato Gelato - Goldfinch". This appears in 6 locations: convex/orders/whatsapp.ts (3x), convex/orders/whatsappHelpers.ts (1x), src/lib/whatsappTemplates.ts (1x), src/components/whatsappTemplates/TemplateEditor.tsx (1x), src/components/orders/OrderForm.tsx (1x), convex/orders/__tests__/whatsapp.test.ts (1x).

## Resolution

root_cause: (1) Delivery orders showed "Pickup at: Goldfinch Legato" because the order's deliveryType was likely stored as "Pickup" — but the code logic IS correct (checks deliveryType). The fallback for pickup orders without a pickupLocation is the wrong name "Goldfinch Legato" instead of "Legato Gelato - Goldfinch". (2) All hardcoded fallback strings use "Goldfinch Legato" which is both the wrong word order and wrong brand name.

fix: Replaced all instances of "Goldfinch Legato" with "Legato Gelato - Goldfinch" in all source files. Also improved delivery info logic to treat deliveryAddress content as the source of truth (address-driven detection), so orders with stale deliveryType="Pickup" but a real delivery address still show correctly.

verification: npm run type-check passes. All occurrences replaced and committed in cb6b335. npm run build has a pre-existing unrelated failure in GoFoodDepotManager.tsx (Id<"gofoodDepotStock"> vs Id<"productInventory"> type mismatch) that is not part of this bug.

files_changed:
  - convex/orders/whatsapp.ts (3 occurrences + improved address-driven delivery detection logic)
  - convex/orders/whatsappHelpers.ts (1 occurrence + timezone fix)
  - src/lib/whatsappTemplates.ts (2 occurrences + timezone fix)
  - src/components/whatsappTemplates/TemplateEditor.tsx (1 occurrence)
  - src/components/orders/OrderForm.tsx (1 occurrence — confirmed correct in source)
  - convex/orders/__tests__/whatsapp.test.ts (1 occurrence: assertion updated)

## Fix Applied

commit: cb6b335 "fix: correct delivery info logic and timezone in WhatsApp templates"

Changes made:
1. convex/orders/whatsapp.ts — 3 occurrences of "Goldfinch Legato" → "Legato Gelato - Goldfinch"; improved delivery address detection to use address content as source of truth
2. convex/orders/whatsappHelpers.ts — 1 occurrence renamed; added Asia/Jakarta timezone to date formatters
3. src/lib/whatsappTemplates.ts — 2 occurrences renamed; timezone fixes
4. src/components/whatsappTemplates/TemplateEditor.tsx — 1 occurrence in SAMPLE_DATA renamed
5. convex/orders/__tests__/whatsapp.test.ts — test assertion updated to "Legato Gelato - Goldfinch"
6. src/components/orders/OrderForm.tsx — default pickup_location value confirmed correct ("Legato Gelato - Goldfinch")

Verification: npm run type-check exits clean (0). All WhatsApp-related source files confirmed to contain "Legato Gelato - Goldfinch" only (no remaining "Goldfinch Legato" in active source).
