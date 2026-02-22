---
phase: quick-18
plan: 01
subsystem: orders
tags: [orders, delivery-fee, whatsapp, schema, frontend]
key-decisions:
  - "Delivery fee stored as optional field on orders table; 0 is stored as undefined (no fee)"
  - "finalTotal recalculation strips old fee before adding new fee, making updates idempotent"
  - "Delivery fee row always shown on editable orders (not just when fee is set) so staff know it's available"
  - "Used direct useMutation inside OrderItems component to avoid prop-drilling the handler"
key-files:
  created: []
  modified:
    - convex/schema.ts
    - convex/orders/mutations/orderCrud.ts
    - convex/orders/mutations/index.ts
    - convex/orders/whatsapp.ts
    - src/lib/types.ts
    - src/hooks/convex/useOrders.ts
    - src/hooks/convex/index.ts
    - src/components/orders/OrderItems.tsx
    - src/pages/OrderDetail.tsx
    - docs/CHANGELOG.md
metrics:
  duration: ~12 minutes
  completed: 2026-02-22T06:47:58Z
  tasks_completed: 3
  files_modified: 10
---

# Quick Task 18: Delivery Fee Input Field on Orders — Summary

**One-liner:** Delivery fee inline edit on order detail page with WhatsApp template integration and atomic finalTotal recalculation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema + Backend — deliveryFee field and updateDeliveryFee mutation | 614a6c7 | convex/schema.ts, convex/orders/mutations/orderCrud.ts, convex/orders/mutations/index.ts |
| 2 | WhatsApp + Types/Transforms/Hook — delivery fee in messages and frontend plumbing | 4cdad74 | convex/orders/whatsapp.ts, src/lib/types.ts, src/hooks/convex/useOrders.ts, src/hooks/convex/index.ts |
| 3 | Frontend UI — delivery fee display and inline edit in OrderItems + OrderDetail | ef0aba9 | src/components/orders/OrderItems.tsx, src/pages/OrderDetail.tsx |

## What Was Built

**Backend:**
- `deliveryFee: v.optional(v.number())` field added to orders table in `convex/schema.ts`
- `updateDeliveryFee` mutation in `convex/orders/mutations/orderCrud.ts` that atomically strips the old fee from `finalTotal` and adds the new one. Passing `0` clears the fee (stored as `undefined`). Terminal statuses (Cancelled, Complete) are blocked.
- `updateDeliveryFee` exported from `convex/orders/mutations/index.ts`

**WhatsApp Templates:**
- `generatePaymentRequest` shows `🚚 Ongkir: Rp X` line when fee is set
- `generateReceipt` shows `🚚 Ongkir: Rp X` line when fee is set
- `buildTemplateVariables` exposes `{delivery_fee}` variable for DB-stored templates

**Frontend Plumbing:**
- `delivery_fee: number | null` added to `OrderDetail` interface in `src/lib/types.ts`
- `deliveryFee?: number` added to `ConvexOrderDetail` interface in `useOrders.ts`
- `transformToOrderDetail` maps `order.deliveryFee ?? null` to `delivery_fee`
- `useConvexUpdateOrderDeliveryFee` hook added to `useOrders.ts` and re-exported from `index.ts`

**Frontend UI:**
- `OrderItems` component accepts `deliveryFee`, `orderId`, `canEditDeliveryFee` props
- Delivery fee row appears below discounts/vouchers for non-terminal orders
- Inline edit: click Edit → number input appears → Save or Enter to confirm → Cancel to dismiss
- `finalTotal` display is recalculated to include delivery fee: `finalTotal ?? (totalAmount - voucher + deliveryFee)`
- On no-discount orders, a "Final Total" line replaces "Order Total" when delivery fee is present
- `OrderDetail` passes `deliveryFee={order.delivery_fee}`, `orderId={orderId}`, `canEditDeliveryFee={!['Cancelled', 'Complete'].includes(order.status)}`

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- [x] `npm run type-check` passes
- [x] `npm run build` passes (zero TypeScript errors, pre-existing CSS warnings only)
- [x] `deliveryFee: v.optional(v.number())` on orders table in schema
- [x] `updateDeliveryFee` exported from `convex/orders/mutations/index.ts`
- [x] `OrderDetail.delivery_fee` field in `src/lib/types.ts`
- [x] `OrderItems` renders delivery fee row with inline edit
- [x] WhatsApp templates include delivery fee line when fee > 0

## Self-Check: PASSED

All commits exist:
- 614a6c7: feat(quick-18): add deliveryFee to schema and updateDeliveryFee mutation
- 4cdad74: feat(quick-18): add delivery fee to WhatsApp templates, types, and hook
- ef0aba9: feat(quick-18): add delivery fee inline edit UI to OrderItems and OrderDetail
- 85e8909: docs(quick-18): update CHANGELOG with delivery fee feature
