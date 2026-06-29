# Staff Review: Subscription Credit Drawdown in Order Slide-Over

**Date:** 2026-06-29
**Plan:** `docs/superpowers/specs/2026-06-29-subscription-credit-drawdown-order-slideover-design.md` (design spec)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated (spec, not full plan — File Changes / Waves / Rollback are the plan's job; spec has Goal, Decisions, Detailed Design, Testing, Success Criteria, Edge Cases)

---

## 1. Summary

**Overall Assessment:** Revise (then proceed to plan)

The spec's architecture is sound — at-delivery drawdown + reservation-via-order-row + per-line
eligibility is the right model and is grounded in the real schema. But three findings must be
folded in before planning, two of them correctness-grade:

1. **C1** — the spec calls Path B "dormant, no UI". It is **wired into both surfaces** (live
   callers). The reconciliation (not deletion) must be respecified.
2. **C2/C4** — two pricing/status correctness bugs: eligible lines must be **priced at the
   subscription's partner `unitPrice`** (the pool's denomination), and a fully-covered order
   must mirror `markWeeklyInvoicePaid`'s exact status triple, respecting the IMP-3 bypass.

All findings are addressable; the model itself holds.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | Path B has live callers — not dormant; "delete" plan is unsafe | Architecture/Impl | spec §3.3 |
| C2 | Fully-covered order status was mis-specified (confirmWeek ≠ funded state) | Logic | spec §5.3 step 5 |
| C3 | Reservation must exclude already-recognized orders (and historical eager "deposit" rows during migration) | Logic | spec §5.2 step 4 |
| C4 | Eligible lines must be priced at subscription partner `unitPrice`, not retail — pool denomination | Logic/Money | spec §5.1, §5.3 |

### Issue C1: Path B is wired, not dormant

`grep applyPartialCreditToAdHocOrder` →
`src/components/orders/OrderSlideOver.tsx:181` and `src/pages/OrderDetail.tsx:131` both bind it
via `useSessionMutation`, gated by `getOrderCreditStatus` (`convex/subscriptions/queries.ts:120`).
This is the **operate surface** for an *already-open* subscription order (`orderId` set,
`isSubscriptionOrder` true) — the out-of-credit handling shipped 2026-06-25.

The spec's "remove `applyPartialCreditToAdHocOrder`, it has no callers" is wrong and would break
both surfaces.

**Reframe:** the existing flow operates on orders that are *already* subscription-linked. Nothing
today links a freshly-created ad-hoc order to a subscription, so the truly-ad-hoc Path B precondition
is rarely reachable — **the new creation flow (`createCreditFundedOrder`) is the missing link.**

**Recommendation:**
- Keep `getOrderCreditStatus` and Path A (`splitScheduledOrderOnCredit`) — separate scheduler
  concern, untouched.
- **Refactor `applyPartialCreditToAdHocOrder` to the reservation model** (drop the eager
  `postLedgerEntry`; set `subscriptionCreditApplied` + `fundingSource:"deposit"`, leave recognition
  to delivery). This unifies the post-hoc button and the new at-creation flow on one model and
  **resolves IMP-4** (the eager drawdown's `by_order` row currently suppresses the at-delivery
  drawdown — `outOfCredit.ts:75-84`). Do **not** delete the mutation.
- Update `getOrderCreditStatus.canApplyCredit` so it doesn't offer a second credit application on
  an order already credit-reserved at creation (i.e. `subscriptionCreditApplied` already set).

### Issue C2: Fully-covered order status mis-specified

Spec §5.3 said "match how `confirmWeek` seeds planned-order status." But `confirmWeek`
(`scheduling/confirmWeek.ts:56`) seeds **`status:"AwaitingPayment", paymentStatus:"Unpaid"`** —
the *unfunded* state. Orders become funded only when **`markWeeklyInvoicePaid`**
(`invoicing.ts:270-280`) patches every non-terminal order in the week to:

```ts
{ paymentStatus: "Paid", paymentMethod: "subscription_credit", status: "PaymentReceived" }
```

Our ad-hoc order is created **after** the week is funded (`delivering`), so `markWeeklyInvoicePaid`
will never sweep it. **For the `amountDue === 0` branch, set that exact triple at creation.**

Also note **IMP-3** (`invoicing.ts:253-260`): that patch is a *raw* `db.patch`, deliberately
bypassing `statusUpdates` side-effects (packaging stock reservation, status-transition audit,
kitchen-visibility). Subscription-order packaging reservation is **deferred** (Phase D/E). The new
mutation must follow the same deliberate bypass — do **not** route through `statusUpdates` to
"fix" it — and the spec must record that packaging reservation stays deferred for these orders too.

### Issue C3: Reservation netting must exclude recognized + historical eager rows

`pool.creditRemaining` already reflects **recognized** drawdowns (their ledger rows are in the
replay). `reserved` must therefore count only **un-recognized** credit orders — the `by_order`
"no ledger row yet" test in §5.2 step 4 is correct, keep it. Add: during/after the C1 migration,
any **historical** order that the *old* eager path already drew down has a `by_order` ledger row →
correctly excluded from `reserved` (no double count). Add a test asserting an order with an existing
drawdown row is neither re-reserved nor re-recognized.

### Issue C4: Eligible lines priced at partner `unitPrice`, not retail

The credit pool is denominated in **partner-price IDR**: planned orders are priced at
`subscription.unitPrice` (confidential partner price), and `recognizeSubscriptionDelivery` draws
`order.totalAmount` at that price. If an ad-hoc top-up of the same product is priced at normal
**retail** and we draw retail IDR from a partner-priced pool, the customer extracts more value than
their prepaid credit holds — the "150/day" unit accounting breaks.

**Recommendation:** in `computeCreditSplit` + the server re-derivation, **eligible lines are
re-priced at `subscription.unitPrice`**; `creditCovered` and the order's eligible-line `lineTotal`
use that price, so `drawdown == eligible-line value`. Off-plan lines keep normal retail pricing and
are paid normally. The created order's eligible-line `unitPrice` is the partner price (matches
planned orders + the drawdown). The signature of `computeCreditSplit` must therefore take the
subscription `unitPrice` (or pre-priced eligible lines), not the cart's retail `unitPrice`, for
eligible lines.

> Side effect (D11): the created order will display the partner price on eligible lines. Surface is
> manager/admin only, and planned subscription orders already show partner price, so this is
> consistent — but call it out in the plan and confirm no staff-role surface renders it.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Define `plannedDeliveriesRemaining` "delivered" test precisely | M | L |
| I2 | `getSubscriptionCreditContext` must not return partner `unitPrice` | M | L |
| I3 | Banner lives in the **creation** context (no `orderId`), distinct from operate UI | M | L |
| I4 | Recognition under-funded warning must compare `drawdownAmount` | M | L |

- **I1:** "Not yet delivered" = the planned day's generated order has not reached
  `AwaitingDelivery`/`Complete`. Resolve via `orders.by_subscriptionWeek` matched on the planned
  day's date/`deliveryDate`; fall back to `date ≥ todayWIB` count if no order matches. Use
  `getWibDateStr` (`convex/lib/periodRange.ts`).
- **I2:** Return only IDR figures (`availableCredit`, `creditCovered`, per-line eligibility +
  re-priced eligible line totals). Do **not** echo `subscription.unitPrice` as a standalone field
  (it's `confidentialPrice`). It's embedded in line totals by necessity, but don't expose it raw.
- **I3:** The new banner renders during **order building** (customer selected, `draftItems`
  present, no `orderId`). The existing `getOrderCreditStatus` operate UI keys on an existing
  `orderId`. Two distinct contexts in the same component — the plan must wire the banner in the
  creation branch, not the existing operate branch, in both `OrderSlideOver` and `OrderDetail`.
- **I4:** `recognition.ts:83` compares `priorPool.creditRemaining < order.totalAmount`; after the
  `subscriptionCreditApplied` change it must compare against `drawdownAmount`.

---

## 4. Refinements (Optional)

- Consider a `by_subscriptionWeek` + status composite if the reservation scan grows; for now the
  week-scoped order count is small (one week of orders), so `by_subscriptionWeek` + in-memory
  filter is fine (C9 windowed).
- Name the new template seed alongside existing `whatsappTemplates` seeds so it's covered by the
  same seed entrypoint.

---

## 5. Duplication Analysis

### Existing code to leverage
| Code | Location | How to use |
|------|----------|------------|
| `deriveCreditPool`, `postLedgerEntry` | `creditMath.ts:52`, `ledger.ts:6` | Pool replay + ledger append (recognition). |
| `recognizeSubscriptionDelivery` | `recognition.ts:37` | Extend for `subscriptionCreditApplied`. |
| `insertOrderWithItems` | `orders/helpers/insertOrder.ts` | Shared order+items write path. |
| `coveredQty`/`remainderQty` | `outOfCredit.ts:36,48` | Retain (Path A); NOT used by new eligible-subtotal model. |
| `logCustomerInteraction` | `crm/timeline.ts:20` | `whatsapp_drafted` logging — reuse as-is. |
| `renderTemplate` | `orders/whatsapp.ts:53` | **Extract to shared** `whatsappTemplates/render.ts`. |
| `getWibDateStr` | `lib/periodRange.ts` | "today" for `plannedDeliveriesRemaining`. |

### Duplication risks
- A second partial-credit model. **C1 mandates unifying** on reservation; do not leave the eager
  path live alongside the new one.

## 6. Phase / Wave Accuracy

Deferred to the plan. Suggested waves: (1) schema field + pure `computeCreditSplit` + recognition
extension + Path B refactor [backend], (2) `getSubscriptionCreditContext` + `createCreditFundedOrder`
+ WhatsApp draft query [backend, after 1], (3) banner component + both surfaces [frontend, after 2],
(4) verification. Codegen (`convex/_generated/api.d.ts`) serialized once per backend wave.

## 7. Specialist Agent Recommendations

| Phase | Agent | Rationale |
|-------|-------|-----------|
| Backend | `convex-backend` | schema + mutation + recognition |
| Frontend | `react-ui-builder` | banner + both surfaces |
| Tests | `tdd-test-architect` | convex-test + pure-helper + regression |
| Gate | `code-auditor` | type-check + pattern compliance |

## 8. Git Workflow Assessment

| Check | Status |
|-------|--------|
| Feature branch | ✅ (pipeline worktree off main) |
| Squash merge | ✅ repo convention |
| Build before merge | ✅ required |
| Rollback | New field is additive-optional; recognition change is behavior-preserving for planned orders (fallback). Path B refactor is the riskiest revert point — keep it an isolated commit. |

## 9. Documentation Checkpoints

CHANGELOG (always), SCHEMA.md (`orders.subscriptionCreditApplied`), API_REFERENCE
(`getSubscriptionCreditContext`, `createCreditFundedOrder`, `getCreditOrderWhatsappDraft`),
CLAUDE.md (note the new credit-at-creation flow + IMP-4 resolution), FILE_MAP (orders feature row).

## 10. Testing Plan Assessment

**Verdict:** Adequate (spec §8), with additions:
- C3 regression: order with existing drawdown row not re-reserved/re-recognized.
- C4: eligible-line drawdown equals qty × subscription `unitPrice` (not retail).
- C1: both surfaces still render after Path B refactor; `canApplyCredit` suppressed when
  `subscriptionCreditApplied` already set.
- Migration: existing `deposit` orders (if any in dev) behave under the refactored mutation.

## 11. Edge Cases to Address

- [ ] Ad-hoc order created after week funded (`delivering`) → correct funded status triple (C2).
- [ ] Partner-price vs retail on eligible lines (C4).
- [ ] Two un-delivered credit orders → reservation nets (C3).
- [ ] Cancel before delivery → reservation releases.
- [ ] Off-plan-only cart → credit button disabled, mutation rejects.

## 12. Approval Conditions

**To approve, address in the spec:** C1, C2, C3, C4 (fold into §3.3, §5.1, §5.2, §5.3), and I1–I4.

**Then:** proceed to writing-plans.

---

*Generated by /staffreview*
