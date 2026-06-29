# Staff Review: Subscription Credit Drawdown — PLAN

**Date:** 2026-06-29
**Plan:** `docs/superpowers/plans/2026-06-29-subscription-credit-drawdown-order-slideover.md`
**Verdict:** Approve (assumptions verified; fixes folded inline)

## Assumptions verified against real code

| Assumption | Result | Action |
|------------|--------|--------|
| `confirmWeek` builds a complete `OrderInsert` for a subscription order | ✅ `confirmWeek.ts:47-94` | Copied its exact required-field set into T6 (was a "compiler-driven" gap) — added `customerName`, `customerPhone`, `deliveryType`, `createdBy: ctx.user.name`, `createdByUserId`, `isKitchenVisible`; item `discountAmount`. |
| `generateNextOrderNumber` import path | ✅ defined in `orders/helpers/customerResolution.ts`, re-exported via `helpers/index` (used by `orderCrud.ts`) | T6 import `../orders/helpers/index` valid. |
| `useSessionQuery/useSessionMutation` import | ✅ `convex-helpers/react/sessions` (`OrderSlideOver.tsx:12`) | Fixed T8 hook placeholder import. |
| `insertOrderWithItems(ctx, {orderFields, items})` signature | ✅ `orders/helpers/insertOrder.ts:26` | Used as-is. |
| `recognizeSubscriptionDelivery` drawdown line + warning | ✅ `recognition.ts:83,98` | T3 edits the exact lines. |
| Path B live callers | ✅ `OrderSlideOver.tsx:181`, `OrderDetail.tsx:131` | T4 refactors (not deletes); guards `canApplyCredit`. |
| Funded week status set | ✅ `markWeeklyInvoicePaid` → `delivering`; tests use `paid` | T5/T6 use `{paid, delivering}`. |
| `renderTemplate` private in `orders/whatsapp.ts:53` | ✅ | T7 extracts to shared `whatsappTemplates/render.ts`. |

## Residual (acceptable, flagged in plan)
- T6 may surface 1–2 more required `orders` fields at type-check; plan instructs copying from
  `confirmWeek.ts:47-83` and `npm run type-check` drives the list — bounded, not open-ended.
- `plannedDeliveriesRemaining` delivery-state refinement (I1) left as a documented fallback in T5.
- CRM week order-list widening (spec open Q6) is a plan-time check in T11/persona-UAT — additive display, low risk.

## Conclusion
Plan is executable as written. Waves, shared-file/codegen serialization, critical path, and the
headless-impossible persona-UAT gate are all specified. Proceed to land + handoff.
