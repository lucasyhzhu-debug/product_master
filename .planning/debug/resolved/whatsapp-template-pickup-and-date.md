---
status: resolved
trigger: "Two bugs in WhatsApp template rendering: 1. Template shows Pickup at: Goldfinch Legato for a DELIVERY order — should show delivery address instead. 2. Target date shows 21 Feb 2026 but today is 22 Feb 2026 — timezone issue (server uses UTC but should display WIB/Jakarta time which is UTC+7)"
created: 2026-02-22T10:00:00Z
updated: 2026-02-22T10:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: Two separate bugs. Bug 1 (pickup/delivery): The previous fix (commit 80793a1) added PICKUP_PREFIX_RE logic that correctly checks if deliveryAddress starts with "pick up:". However the order #0222-014 may have deliveryType="Pickup" in the DB and ALSO have a real delivery address (not starting with "pick up:"), causing the condition `order.deliveryType === "Pickup" || isPickupAddress` to show pickup info even for delivery orders. OR the order's deliveryAddress field actually starts with "Pick up:" in the database. Bug 2 (date): formatDate() in whatsapp.ts uses `new Date(timestamp)` + `toLocaleDateString("id-ID")` WITHOUT specifying a timezone. On Convex's server (UTC), a timestamp stored as midnight WIB (UTC+7) = 17:00 UTC the previous day, so it displays one day behind.
test: Read the formatDate() functions in both whatsappHelpers.ts and whatsapp.ts, check timezone options. Look for where dueDate is stored/formatted.
expecting: formatDate() missing timeZone option, needs Asia/Jakarta added. Delivery bug needs checking the exact condition logic.
next_action: Analyze the delivery logic bug and the date formatting bug, then fix both.

## Symptoms

expected:
  1. Delivery orders should show "Delivery to: [address]" not "Pickup at: [location]"
  2. Target date should show today's date (22 Feb 2026) correctly in WIB timezone

actual:
  1. Shows "Pickup at: Goldfinch Legato" even for delivery orders
  2. Shows "21 Feb 2026" instead of "22 Feb 2026" (off by 1 day)

errors: No runtime errors — just wrong data displayed in WhatsApp template preview

reproduction: Open order #0222-014 (a delivery order due today), click "Send Payment Request via WhatsApp", observe the template preview

timeline: These issues persist from previous fix attempts. Previous debug session in whatsapp-template-address-and-location-name.md confirmed "Goldfinch Legato" name issue was fixed, but delivery type detection still broken.

## Eliminated

- hypothesis: "Goldfinch Legato" name (wrong brand name) is the issue
  evidence: All occurrences have been replaced with "Legato Gelato - Goldfinch" in uncommitted working changes. The name is correct now. But the order still shows pickup info for delivery order.
  timestamp: 2026-02-22

- hypothesis: Frontend (src/lib/whatsappTemplates.ts) is where delivery info renders for the WhatsApp button
  evidence: The WhatsApp button in OrderDetail uses api.orders.whatsapp.getMessage (backend query), not the frontend generateTemplate(). Frontend templates are for a different UI component (WhatsAppTemplatesManager). The backend whatsapp.ts is what matters for the order flow.
  timestamp: 2026-02-22

## Evidence

- timestamp: 2026-02-22
  checked: git diff — all uncommitted changes
  found: Four files modified but not committed: whatsappHelpers.ts, whatsappTemplates.ts (frontend), TemplateEditor.tsx, and test file. All just rename "Goldfinch Legato" → "Legato Gelato - Goldfinch". These are the previous debug session changes.
  implication: Name fix is staged but uncommitted. The delivery logic bug and date bug are NOT fixed yet.

- timestamp: 2026-02-22
  checked: convex/orders/whatsapp.ts lines 67-73 (buildTemplateVariables) and lines 260-266 (generatePaymentRequest)
  found: Logic is: `if (order.deliveryType === "Pickup" || isPickupAddress)` then show pickup info. isPickupAddress = PICKUP_PREFIX_RE.test(order.deliveryAddress). For delivery orders where deliveryType="Pickup" in DB (stale), this still fires as pickup even if it's really a delivery.
  implication: The PICKUP_PREFIX_RE approach only helps when deliveryType is stale AND deliveryAddress starts with "pick up:" prefix. If deliveryType="Pickup" was set AND deliveryAddress is a real delivery address, the condition shows pickup info. This is the bug.

- timestamp: 2026-02-22
  checked: convex/orders/whatsapp.ts formatDate() function lines 160-168
  found: `date.toLocaleDateString("id-ID", options)` — NO timezone specified. Options only has day/month/year, no timeZone.
  implication: On Convex's UTC server, a dueDate stored as 2026-02-22T00:00:00+07:00 (midnight WIB) = 2026-02-21T17:00:00Z. When formatted in UTC, this renders as "21 Feb 2026" — one day behind.

- timestamp: 2026-02-22
  checked: convex/orders/whatsappHelpers.ts formatDate() function lines 24-32
  found: Same issue — `date.toLocaleDateString("id-ID", options)` with no timeZone option.
  implication: Same timezone bug exists in the helper used by tests.

## Resolution

root_cause:
  Bug 1 (delivery/pickup): The condition in generatePaymentRequest() and buildTemplateVariables() is `order.deliveryType === "Pickup" || isPickupAddress`. The PICKUP_PREFIX_RE approach correctly identifies old-style "pick up: location" addresses. BUT if an order has deliveryType="Pickup" in DB (either stale or newly set) alongside a real delivery address, the `order.deliveryType === "Pickup"` check wins and shows pickup info. The correct logic should invert — check deliveryAddress content FIRST (as source of truth), and only fall back to deliveryType if address is ambiguous. Specifically: if deliveryAddress exists and does NOT start with "pick up:" prefix, it must be a real delivery address → show delivery. If deliveryAddress starts with "pick up:" OR deliveryType="Pickup" with no conflicting address → show pickup.

  Bug 2 (date timezone): formatDate() in both whatsapp.ts and whatsappHelpers.ts uses toLocaleDateString() without timeZone: "Asia/Jakarta". Convex runs on UTC servers. Dates stored as midnight WIB (UTC+7) are 17:00 UTC the previous day, so they render one day behind.

fix:
  1. Fix delivery logic: Reorder condition — deliveryAddress content takes priority over deliveryType field. If deliveryAddress is set and NOT a pickup prefix → show delivery. If isPickupAddress OR (deliveryType==="Pickup" AND no real address) → show pickup.
  2. Fix timezone: Add timeZone: "Asia/Jakarta" to all formatDate() and formatDateTime() Intl.DateTimeFormatOptions in convex/orders/whatsapp.ts and convex/orders/whatsappHelpers.ts.

verification: All 13 WhatsApp tests pass. npm run type-check clean. npm run build succeeds. Logic confirmed correct for both bugs.
files_changed:
  - convex/orders/whatsapp.ts (delivery logic reordered in 2 places, timeZone added to formatDate/formatDateTime)
  - convex/orders/whatsappHelpers.ts (timeZone added to formatDate/formatDateTime, name fix)
  - src/lib/whatsappTemplates.ts (timeZone added to formatDate, name fix)
  - src/components/whatsappTemplates/TemplateEditor.tsx (name fix in preview sample data)
  - convex/orders/__tests__/whatsapp.test.ts (name fix in assertion)
