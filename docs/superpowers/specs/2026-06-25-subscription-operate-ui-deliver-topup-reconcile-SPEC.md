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
by a manager/admin without touching the Convex dashboard. The credit math, ledger ops, and deferred-revenue
model are final + unit-tested and are **not** touched. **Three thin, additive backend changes** are required
(see "Thin backend additions" below) — they expose existing logic through a properly-gated seam, compute the
top-up delta server-side, and persist the operator's reconcile comment; none change any credit/ledger calculation.

## Resolved decisions (clarify phase, 2026-06-25)

1. **Mark delivered** → a single guarded "Mark delivered" button on **both** order surfaces
   (`OrderSlideOver` + `OrderDetail`, Pitfall #20), backed by a thin `markSubscriptionDelivered`
   `protectedMutation` (not the unguarded generic `moveForward`). See backend addition #1.
2. **Top-up** → "Amend week" mode re-opens the confirmed week's scheduler; the delta vs. funded credit is
   computed **server-side** (CRM C10 — never re-key a total client-side) and billed as a `subscription_topup`.
   See backend addition #2.
3. **Reconcile** → a manual per-week "Reconcile" button + fault selector (`none`/`cafe`/`frollie`) **with a
   compulsory comment/reason** (required textarea, submit disabled until non-empty). The comment is persisted
   (backend addition #3). Entry point is the **per-week surface** (`SubscriptionWeeklyInvoicePage` /
   `SubscriptionSchedulePage`), **not** the funding dashboard — `getFundingDashboard` only returns
   `confirmed|invoiced` weeks and never the `paid`/`delivering` weeks that are actually reconcilable.
4. **Out-of-credit** → operator-initiated: surface an over-credit **flag** (order `finalTotal` >
   `deriveCreditPool().creditRemaining`) and an explicit button to split (scheduled) / apply partial credit
   (ad-hoc); show the resulting outcome (toast + links/badges).

## Thin backend additions (the only backend changes — additive, no credit-math change)

1. **`markSubscriptionDelivered({ orderId })`** — new `protectedMutation`, `roles: ["manager","admin"]`.
   Asserts the order is a subscription order (`order.subscriptionId` present) in a deliverable status,
   transitions it to `AwaitingDelivery` via the existing recognition path, and calls the existing internal
   helper `recognizeSubscriptionDelivery` (idempotent via `creditLedger.by_order` — re-press is a no-op).
   Rationale: `recognizeSubscriptionDelivery` is an internal helper today, fired only as a side-effect of
   the **bare, unguarded, single-step** `moveForward` mutation (`statusUpdates.ts:535`); a manager-gated
   single-press action needs its own properly-authorized seam.
2. **`amendConfirmedWeek` / `computeTopupDelta` server helper** — diffs the amended plan against the funded
   weekly total **server-side** and produces the `addedLines` for `createTopupInvoice` (then settle via
   `markTopupInvoicePaid({ invoiceId })`). Keeps money math in the unit-tested backend (C10). No change to
   `createTopupInvoice`/`markTopupInvoicePaid` themselves.
3. **`subscriptionWeeks.reconcileNote: v.optional(v.string())`** schema field + **required `reconcileNote:
   v.string()`** arg on `reconcileWeek`; persist it in the existing `ctx.db.patch(week._id, …)` (and stamp
   onto the reconcile ledger note for traceability). Update `docs/SCHEMA.md`.

(Optional, deferred: an over-credit selector query so the flag in decision 4 isn't ad-hoc client math — see
acceptance criteria; client-side `finalTotal > creditRemaining` is acceptable for v1.)

## In scope

- **A. Deliver / recognize (U2).** A scoped "Mark delivered" button on both order surfaces that calls the
  new `markSubscriptionDelivered` mutation (→ `AwaitingDelivery` + `recognizeSubscriptionDelivery`), without
  re-enabling generic edit/cancel on the read-only order. Idempotent; safe to re-press. Manager+admin only.
- **B. Top-up (U5).** "Amend week" mode on `SubscriptionSchedulePage` (flips the `WeekCalendarGrid` `locked`
  prop for a confirmed/invoiced week); on save, the server computes the delta vs. funded credit and bills it
  as a `subscription_topup` via `createTopupInvoice` → `markTopupInvoicePaid` (server-side delta, C10).
- **C. Reconcile (U5).** A per-week "Reconcile" action (on the week / weekly-invoice surface — NOT the
  funding dashboard) → `reconcileWeek` with a fault selector (`none`/`cafe`/`frollie`) **and a compulsory
  comment**; shows resulting rollover/expiry/refund outcome from the mutation return.
- **D. Out-of-credit (U5).** Surface an over-credit flag, then operator buttons:
  `splitScheduledOrderOnCredit` (scheduled day over remaining credit → split: covered draws down, remainder →
  top-up; order cancelled if covered=0) and `applyPartialCreditToAdHocOrder` (ad-hoc order →
  `min(remaining,total)` as deposit credit, remainder left `AwaitingPayment`). Surface the result to the operator.
- Designed empty / loading / error states on every new surface (CRM principle D12); server-side price
  strip already covers confidential price (D11). Manager+admin gated.

## Out of scope / non-goals

- Any change to the deferred-revenue model, ledger ops, or pure credit-math (all final + tested).
- Auto-funding from bank match (separate gap#1-A2 deferral).
- CRM timeline / taxonomy reconciliation (separate Phase-D item).
- Re-enabling generic order edit/cancel on subscription orders (keep read-only; add only the scoped
  "Mark delivered" action).

## Backend API

**Exist today, unit-tested — wire, don't rewrite:**

| Capability | Function | Args (verified against code) |
|---|---|---|
| Recognition helper | `subscriptions/recognition.ts:recognizeSubscriptionDelivery` (internal helper, idempotent via `creditLedger.by_order`) | `(ctx, orderId, createdBy?)` — called by the new mutation below |
| Top-up create | `subscriptions/invoicing.ts:createTopupInvoice` | `{ subscriptionWeekId, addedLines: {productName,qty,unitPrice,lineTotal}[] }` → returns `Id<"invoices">` |
| Top-up pay | `subscriptions/invoicing.ts:markTopupInvoicePaid` | `{ invoiceId }` **only** (resolves week internally; posts another `topup`) |
| Reconcile | `subscriptions/reconcile.ts:reconcileWeek` | `{ subscriptionWeekId, shortfallFault: "none"|"cafe"|"frollie" }` → **gains required `reconcileNote`** (see additions) |
| Out-of-credit (scheduled) | `subscriptions/outOfCredit.ts:splitScheduledOrderOnCredit` | `{ orderId }` → `{ coveredOrderId, topupInvoiceId, drawdownAmount }` |
| Out-of-credit (ad-hoc) | `subscriptions/outOfCredit.ts:applyPartialCreditToAdHocOrder` | `{ orderId }` → `{ coveredAmount, remainderAmount }` |
| Pool (read) | `subscriptions/queries.ts:getWeekPool` (derives `deriveCreditPool` — authoritative) | `{ subscriptionWeekId }` → `{ week, pool, entries }` |
| Funding list | `subscriptions/scheduling/queries.ts:getFundingDashboard` (only `confirmed|invoiced` weeks), `listWeeks` | — |

**New (thin additions — see "Thin backend additions"):** `markSubscriptionDelivered({ orderId })`,
`amendConfirmedWeek`/`computeTopupDelta` helper, `reconcileNote` arg+field.

Existing surfaces to extend (not greenfield): `src/pages/crm/SubscriptionSchedulePage.tsx`,
`src/pages/crm/SubscriptionWeeklyInvoicePage.tsx`, `src/pages/crm/CrmFundingDashboardPage.tsx`,
`src/components/orders/OrderSlideOver.tsx`, `src/pages/OrderDetail.tsx`.

## Acceptance criteria (maps to UAT §4–§6 that couldn't be operator-tested)

- [ ] Manager can mark a funded subscription order **delivered** from **both** order surfaces via
      `markSubscriptionDelivered` → exactly one `drawdown` posts, `creditConsumed` rises, B2B Wholesale
      revenue recognized; re-press is a no-op; non-subscription order / non-manager rejected (§4).
- [ ] "Amend week" mode re-opens a confirmed/invoiced week; a mid-week increase above funded credit is
      **billed + settled** as a `subscription_topup` with the delta computed **server-side**; pool =
      weekly + top-ups (§5).
- [ ] Out-of-credit flag appears when order `finalTotal` > `creditRemaining`; scheduled day **splits**
      (covered draws down, remainder → top-up; order cancelled if covered=0); ad-hoc order gets
      `min(remaining,total)` credit (`fundingSource:"deposit"`), remainder `AwaitingPayment`; operator sees
      the result (§5).
- [ ] A week can be **reconciled** from the per-week surface with fault = none/cafe/frollie **and a
      compulsory comment** (submit disabled until non-empty; persisted to `subscriptionWeeks.reconcileNote`)
      → rollover carry-forward (`rolloverFromWeekId`), cafe-fault expiry recognized as B2B revenue,
      frollie-fault sets `refundDue` + `refundStatus:"pending"` (no payout); reconciling a
      closed/reconciled week is rejected (§6).
- [ ] All surfaces manager+admin gated, with empty/loading/error states (D12); no confidential price leak (D11).
- [ ] `npm run build` green; existing 52 subscription + 60 matchEngine unit tests still pass (update the
      reconcile test call sites for the new required `reconcileNote` arg); new backend fns have unit tests.
