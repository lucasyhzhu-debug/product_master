---
phase: quick-19-replace-hand-rolled-items-pricing-block
plan: "01"
subsystem: orders/ui
tags: [orders, slide-over, refactor, delivery-fee]
dependency_graph:
  requires: [quick-18]
  provides: [delivery-fee-visible-in-slide-over]
  affects: [OrderSlideOver, OrderItems]
tech_stack:
  added: []
  patterns: [shared-component-reuse]
key_files:
  modified:
    - src/components/orders/OrderSlideOver.tsx
decisions:
  - "OrderItem type mapping requires all 11 fields including unit_cost/discount_amount/line_cost/line_margin/created_at with safe defaults (0 or '') since Convex order data uses camelCase and may not carry legacy cost fields"
metrics:
  duration: "5 minutes"
  completed: "2026-02-22"
  tasks_completed: 2
  files_modified: 1
---

# Quick-19: Replace Hand-Rolled Items+Pricing Block in OrderSlideOver

**One-liner:** Replaced ~92-line hand-rolled items+pricing block in OrderSlideOver with shared `OrderItems` component, making the delivery fee input (added in quick-18) visible in the slide-over panel.

## What Was Done

- Removed the hand-rolled items list and pricing summary block from `OrderSlideOver.tsx`
- Removed the now-unused `formatCurrency` import from `@/lib/utils`
- Added `import { OrderItems } from './OrderItems'`
- Rendered `<OrderItems>` with camelCase-to-snake_case field mapping for all required `OrderItem` fields
- Added safe defaults (`?? 0`, `?? null`, `?? ''`) for legacy cost fields not present on Convex order items

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incomplete OrderItem field mapping**
- **Found during:** Task 1 (build verification)
- **Issue:** The initial implementation mapped only 6 of 11 required `OrderItem` fields (`id`, `product_name`, `product_variant`, `quantity`, `unit_price`, `line_total`). TypeScript `tsc -b` rejected the incomplete mapping because `unit_cost`, `discount_amount`, `line_cost`, `line_margin`, and `created_at` are required fields on the `OrderItem` interface.
- **Fix:** Added the 5 missing fields with safe defaults: `unit_cost: item.unitCost ?? 0`, `discount_amount: item.discountAmount ?? 0`, `line_cost: item.lineCost ?? 0`, `line_margin: item.lineMargin ?? 0`, `created_at: item.createdAt ?? ''`. Also changed `product_variant: item.productVariant` to `product_variant: item.productVariant ?? null` to match the `string | null` type.
- **Files modified:** `src/components/orders/OrderSlideOver.tsx`
- **Commit:** 9b2be80 (included in same commit)

## Verification

- `npm run type-check` passed (0 errors)
- `npm run build` passed (0 TypeScript errors; pre-existing CSS warnings unrelated)
- `OrderSlideOver.tsx` contains `import { OrderItems }` and `<OrderItems` usage
- `OrderSlideOver.tsx` does NOT contain `formatCurrency` import or hand-rolled items map block
- Commit 9b2be80 on branch `gsd/phase-19-gofood-depot-management-and-kitchen-production-targets`

## Self-Check: PASSED

- File exists: `src/components/orders/OrderSlideOver.tsx` - FOUND
- Commit exists: `9b2be80` - FOUND
- No `formatCurrency` import in OrderSlideOver - CONFIRMED
- `OrderItems` imported and used - CONFIRMED
