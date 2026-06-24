# Spec — Subscription "operate" UI: deliver/recognize, top-up, reconcile, out-of-credit

> **Status:** draft for `/spec-plan-pipeline`. Captures UAT findings **U2** + **U5** that were a
> *foreseen* Phase-B deferral (backend shipped ship-dark, UI explicitly out of B14/B15 scope and flagged
> in `staffreview-feature-subscription-phase-b-2026-06-24.md`) but did **not** get folded into the
> Phase-D CRM spec/plan. Source: `docs/reviews/uat-subscription-phase-b-findings-2026-06-24.md`.

## Problem

Subscription Phase B shipped a complete, unit-tested backend for the weekly money loop, but four
operator-facing actions have **no UI at all** — a non-technical operator cannot complete the cycle:

1. **Recognize a delivery (U2).** Revenue is recognized only when an order enters `AwaitingDelivery`
   (`recognizeSubscriptionDelivery` posts the per-order `drawdown` + B2B Wholesale revenue). But every
   order surface (`OrderDetail`, `OrderSlideOver`) is **read-only for all roles** on subscription
   orders — "Edit, status, and cancel actions are disabled here." There is no "Mark delivered" button,
   so nothing ever reaches `AwaitingDelivery` from the app → **no sale is ever recognized** and the
   deferred-revenue liability never draws down.
2. **Top-up (U5).** `createTopupInvoice`/`markTopupInvoicePaid` exist, but B10 assumed they'd fire
   *implicitly* from a mid-week schedule edit — and the confirmed/invoiced week's scheduler is read-only
   (finding U1), so the trigger path is blocked. No way to bill a mid-week increase.
3. **Reconcile (U5).** `reconcileWeek` exists (FIFO rollover/expiry, fault handling) but cannot be run
   from the app — weeks accumulate un-reconciled once subscriptions go live.
4. **Out-of-credit (U5).** `splitScheduledOrderOnCredit` / `applyPartialCreditToAdHocOrder` exist but
   are never invoked — an order that exceeds remaining credit has no handling path in the UI.

**Risk if unaddressed:** subscriptions cannot operate in production. Revenue is never recognized (U2),
the deferred-revenue liability accumulates un-reconciled (U5), and mid-week changes can't be billed.

## Goal

Surface the existing, tested backend through operator UI so the full weekly cycle —
plan → confirm → invoice → fund → **deliver/recognize** → **top-up** → **reconcile** — is completable
by a manager/admin without touching the Convex dashboard. **No backend logic changes** beyond thin
wiring; the mutations are correct and unit-tested.

## In scope

- **A. Deliver / recognize (U2).** A subscription-aware "Mark delivered" affordance that advances an
  order into `AwaitingDelivery` (firing `recognizeSubscriptionDelivery` via the existing status path),
  without re-enabling generic edit/cancel on the read-only order. Idempotent; safe to re-press.
- **B. Top-up (U5).** An explicit way to issue + settle a top-up when a week's planned total exceeds
  funded credit (e.g. re-open the schedule for a confirmed week into an "amend" mode, or a dedicated
  "Add top-up" action on the invoice/funding surface) → `createTopupInvoice` → `markTopupInvoicePaid`.
- **C. Reconcile (U5).** A week-end "Reconcile" action (funding dashboard or week page) → `reconcileWeek`
  with a fault selector (`none`/`cafe`/`frollie`); shows resulting rollover/expiry/refund outcome.
- **D. Out-of-credit (U5).** Surface `splitScheduledOrderOnCredit` (scheduled day over remaining credit →
  split: covered draws down, remainder → top-up) and `applyPartialCreditToAdHocOrder` (ad-hoc order →
  `min(remaining,total)` as deposit credit, remainder left `AwaitingPayment`).
- Designed empty / loading / error states on every new surface (CRM principle D12); server-side price
  strip already covers confidential price (D11). Manager+admin gated.

## Out of scope / non-goals

- Any change to the deferred-revenue model, ledger ops, or pure credit-math (all final + tested).
- Auto-funding from bank match (separate gap#1-A2 deferral).
- CRM timeline / taxonomy reconciliation (separate Phase-D item).
- Re-enabling generic order edit/cancel on subscription orders (keep read-only; add only the scoped
  "Mark delivered" action).

## Backend API (all exist, unit-tested — wire, don't rewrite)

| Capability | Function | Args |
|---|---|---|
| Deliver/recognize | order status mutation → `recognizeSubscriptionDelivery` fires on entry to `AwaitingDelivery` (idempotent via `creditLedger.by_order`) | order status transition to `AwaitingDelivery` |
| Top-up create | `subscriptions/invoicing.ts:createTopupInvoice` | `{ subscriptionWeekId, addedLines: {productName,qty,unitPrice,lineTotal}[] }` |
| Top-up pay | `subscriptions/invoicing.ts:markTopupInvoicePaid` | `{ … invoiceId/weekId }` (posts another `topup`) |
| Reconcile | `subscriptions/reconcile.ts:reconcileWeek` | `{ subscriptionWeekId, shortfallFault: "none"|"cafe"|"frollie" }` |
| Out-of-credit (scheduled) | `subscriptions/outOfCredit.ts:splitScheduledOrderOnCredit` | `{ orderId }` |
| Out-of-credit (ad-hoc) | `subscriptions/outOfCredit.ts:applyPartialCreditToAdHocOrder` | `{ orderId }` |
| Pool (read) | `subscriptions/queries.ts:getWeekPool` (derived via `deriveCreditPool` — authoritative) | `{ subscriptionWeekId }` |
| Funding list | `subscriptions/scheduling/queries.ts:getFundingDashboard`, `listWeeks` | — |

Existing surfaces to extend (not greenfield): `SubscriptionSchedulePage.tsx`,
`SubscriptionWeeklyInvoicePage.tsx`, `CrmFundingDashboardPage.tsx`, `OrderSlideOver.tsx` / `OrderDetail.tsx`.

## Open decisions (resolve in pipeline clarify phase)

1. **Where does "Mark delivered" live**, given order surfaces are read-only? Options: (a) a scoped action
   on the read-only order panel (allow this ONE status action), (b) a per-day "Delivered" toggle on the
   scheduler week, (c) the kitchen/packaging flow (which already calls the helper) — confirm it's reachable
   for `PaymentReceived` subscription orders. **Recommendation:** (a) a single guarded "Mark delivered"
   button on both order surfaces, since recognition is per-order.
2. **Top-up trigger:** explicit "Amend week" mode that re-opens the confirmed schedule and computes the
   delta, vs. a manual "Add top-up line" action. Ties into fixing U1 (read-only week).
3. **Reconcile entry point + who triggers it** (manual per-week vs. a week-end prompt on the dashboard).
4. **Out-of-credit:** is it operator-initiated (button when an order is flagged over-credit) or automatic
   on confirm/delivery with a UI surfacing the result? Backend mutations are operator-callable today.

## Acceptance criteria (maps to UAT §4–§6 that couldn't be operator-tested)

- [ ] Manager can mark a funded subscription order **delivered** from the app → exactly one `drawdown`
      posts, `creditConsumed` rises, B2B Wholesale revenue recognized; re-press is a no-op (§4).
- [ ] A mid-week increase above funded credit can be **billed + settled** as a `subscription_topup`
      (delta lines only); pool = weekly + top-ups (§5).
- [ ] Out-of-credit scheduled day **splits** (covered draws down, remainder → top-up); ad-hoc order gets
      `min(remaining,total)` credit (`fundingSource:"deposit"`), remainder `AwaitingPayment` (§5).
- [ ] A week can be **reconciled** from the app with fault = none/cafe/frollie → rollover carry-forward
      (`rolloverFromWeekId`), cafe-fault expiry recognized as B2B revenue, frollie-fault sets `refundDue`
      + `refundStatus:"pending"` (no payout); reconciling a closed/reconciled week is rejected (§6).
- [ ] All surfaces manager+admin gated, with empty/loading/error states; no confidential price leak.
- [ ] `npm run build` green; existing 52 subscription + 60 matchEngine unit tests still pass.
