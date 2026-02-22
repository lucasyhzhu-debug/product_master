# Design: Address-Driven Pickup/Delivery Detection

**Date:** 2026-02-22
**Status:** Approved
**Scope:** Order creation/editing, WhatsApp templates, QuickAddressButtons

---

## Problem

The `orders` schema has three separate fields: `deliveryType` ("Pickup"/"Delivery"), `pickupLocation`, and `deliveryAddress`. The UI only populates `deliveryAddress` — `deliveryType` is never sent by `OrderCreate`, so mutations default it to `"Pickup"` for every order. This causes every WhatsApp payment request to show "Pickup at: Legato Gelato - Goldfinch" regardless of the actual order type.

Additionally, the location name "Goldfinch Gelato"/"Goldfinch Legato" needs to become "Legato Gelato - Goldfinch".

---

## Solution: Parse deliveryAddress to derive deliveryType

### Core Rule

```
if deliveryAddress starts with "Pick up: " (case-insensitive)
  → deliveryType = "Pickup"
  → pickupLocation = everything after "Pick up: "
else if deliveryAddress has 2+ words (lenient heuristic)
  → deliveryType = "Delivery"
  → pickupLocation = undefined
else (empty or single-word)
  → deliveryType = "Delivery"  [but frontend shows confirm modal]
```

---

## Architecture

### Shared parsing utility

`convex/orders/helpers.ts` — add `parseDeliveryAddress(address: string)`:
- Returns `{ deliveryType: "Pickup" | "Delivery", pickupLocation?: string }`
- Pure function, no Convex context needed
- Mirrored in `src/lib/deliveryUtils.ts` for frontend use (same logic, identical output)

### Backend (mutation layer)

`convex/orders/mutations/orderCrud.ts`:
- Remove `deliveryType` and `pickupLocation` from mutation args — callers no longer send them
- Call `parseDeliveryAddress(args.deliveryAddress ?? "")` at save time
- Store derived `deliveryType` and `pickupLocation` into DB
- Applies to: `createOrder`, `updateOrder`, `duplicateOrder`

Schema unchanged — `deliveryType` and `pickupLocation` remain stored in DB, written by parsing.

### Frontend

**`src/components/orders/QuickAddressButtons.tsx`**:
- "Crystal" → fills `"Pick up: Crystal"`
- "Goldfinch" → fills `"Pick up: Legato Gelato - Goldfinch"`

**`src/pages/OrderCreate.tsx`** — live inference badge below address field:
- `📍 Pickup at: [location]` (purple) when input starts with "Pick up:"
- `🚚 Delivery to: [address]` (blue) for all other valid inputs
- Badge hidden when field is empty

**Soft block on save** — if input is empty or single-word:
- Show confirm modal: "This doesn't look like an address — save anyway?"
- Order maker must confirm to proceed; order is still saveable

### WhatsApp templates — no changes

`convex/orders/whatsapp.ts` already branches correctly on `order.deliveryType`. Once DB values are correct, templates work without modification.

---

## Existing orders

No migration. Existing orders retain their current `deliveryType`. Only newly saved/updated orders get parsed values. Users can fix incorrectly typed orders by re-saving with the correct address format.

---

## Files to change

| File | Change |
|------|--------|
| `convex/orders/helpers.ts` | Add `parseDeliveryAddress()` |
| `convex/orders/mutations/orderCrud.ts` | Remove deliveryType/pickupLocation from args, call parser at save |
| `src/lib/deliveryUtils.ts` | Mirror `parseDeliveryAddress()` for frontend |
| `src/components/orders/QuickAddressButtons.tsx` | Fill "Pick up: [name]" format, rename Goldfinch |
| `src/pages/OrderCreate.tsx` | Add inference badge + soft-block confirm modal |

---

## Success Criteria

- [ ] QuickAddressButtons fill "Pick up: Crystal" and "Pick up: Legato Gelato - Goldfinch"
- [ ] Typing a real address shows "🚚 Delivery to: ..." badge
- [ ] Typing "Pick up: X" shows "📍 Pickup at: X" badge
- [ ] Empty/single-word input triggers confirm modal on save
- [ ] WhatsApp payment request shows delivery address for delivery orders
- [ ] WhatsApp payment request shows "Pickup at: Legato Gelato - Goldfinch" for pickup orders
- [ ] `npm run type-check` passes
- [ ] `npm run build` passes
