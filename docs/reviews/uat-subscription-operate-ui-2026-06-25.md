# UAT Checklist — Subscription Operate UI (Phase D operate-UI)
**Date:** 2026-06-25
**Branch:** `feature/subscription-operate-ui`
**Environment:** local dev (`npx convex dev` + `npm run dev`)
**Tester:** _______________

> **IMPORTANT — Human verification required before production use:**
> - **R1 (recognition timing):** Whether a split order's later Mark-delivered double-counts or suppresses the drawdown/recognition has NOT been automatically verified. Test §5 item R1 explicitly before relying on the Split path in production.
> - **R2 (stock/production regression):** Mark-delivered must not advance kitchen production states or deduct packaging inventory. Verify §4 item R2.
> - **R3 (amend does not regenerate orders):** Amending a week generates a top-up invoice for the delta but does NOT create new per-day delivery orders. Verify §5 item R3.
>
> **All items below are marked UNTESTED. Check each box only after manually confirming in the dev environment.**

---

## §1 Prerequisites

- [ ] UNTESTED — `npm run dev` starts without errors; `npx convex dev` is connected to `dev:exciting-fennec-671`.
- [ ] UNTESTED — At least one active subscription exists with a customer in `b2b_wholesale` customerType.
- [ ] UNTESTED — A week exists in `confirmed` status with at least one order in `PaymentReceived` status.
- [ ] UNTESTED — A second week exists in `paid` or `delivering` status for reconcile testing.
- [ ] UNTESTED — Two logins available: one `manager` role, one `order_staff` role.

---

## §2 Setup — user sessions

- [ ] UNTESTED — Login as `manager` (PIN). Confirm role shown correctly.
- [ ] UNTESTED — Open a second incognito window and login as `order_staff` (PIN). Confirm role shown correctly.

---

## §3 Smoke — subscription orders appear on both surfaces

- [ ] UNTESTED — Open `manager` session → Orders kanban. Click a subscription order → `OrderSlideOver` opens. Confirm read-only subscription pricing block is present (no editable price fields).
- [ ] UNTESTED — Navigate directly to the order URL (`/orders/:id`) → `OrderDetail` page. Same read-only subscription block present.

---

## §4 Deliver / Recognize

### §4.1 Mark-delivered button — manager, both surfaces

- [ ] UNTESTED — In `OrderSlideOver` (manager session): find a subscription order in `PaymentReceived` status. Verify "Mark delivered" button is visible inside the subscription read-only lock block.
- [ ] UNTESTED — Click "Mark delivered". Confirm the order status transitions (to `AwaitingDelivery` or next deliverable state). Confirm no error toast.
- [ ] UNTESTED — Navigate to the same order via `OrderDetail` (`/orders/:id`). Verify "Mark delivered" button is also present (Pitfall #20 — both surfaces must have it).

### §4.2 Idempotency — re-press is a no-op

- [ ] UNTESTED — On the same order (now in `AwaitingDelivery`): press "Mark delivered" a second time (or refresh and press once more on an already-delivered order). Confirm:
  - [ ] UNTESTED — No second `creditLedger` drawdown row is created (check Convex dashboard → creditLedger table).
  - [ ] UNTESTED — No second revenue recognition entry is created.
  - [ ] UNTESTED — No error toast; the button either disappears or becomes disabled.

### §4.3 Hidden for non-manager — no crash (R2, Pitfall #19)

- [ ] UNTESTED — Switch to `order_staff` session. Open the same subscription order in `OrderSlideOver`. Verify "Mark delivered" button is NOT visible.
- [ ] UNTESTED — Navigate to `OrderDetail` (`/orders/:id`) as `order_staff`. Verify "Mark delivered" button is NOT visible. The page MUST NOT crash (no "Server Error" / error boundary). _(R2: verifies the `isManagerOrAdmin` skip-guard on `getOrderCreditStatus` prevents Pitfall #19.)_
- [ ] UNTESTED — Confirm order_staff can still see order details (items, status) normally — no regression to existing functionality.

### §4.4 Status guard — non-deliverable order (R2)

- [ ] UNTESTED — Find a subscription order in a non-deliverable status (e.g., `AwaitingPayment`, `Confirmed`, `Cancelled`). Verify "Mark delivered" button is NOT shown for that order in either surface.

### §4.5 Stock / production regression check (R2)

- [ ] UNTESTED — After marking an order delivered, verify in the kitchen view that production counts are unchanged (balls filled, tray counts). Mark-delivered must NOT advance kitchen production states.
- [ ] UNTESTED — Verify packaging inventory counts are unchanged after Mark-delivered (no inventory deduction triggered).

---

## §5 Amend week → top-up invoice + out-of-credit

### §5.1 Amend a confirmed week — top-up delta billed

- [ ] UNTESTED — Login as manager. Navigate to CRM → a subscription's week calendar (`/crm/customers/:cid/subscriptions/:subId/week`) for a week in `confirmed` status.
- [ ] UNTESTED — Click "Amend week" (or equivalent unlock action). Verify the week grid becomes editable.
- [ ] UNTESTED — Increase the quantity for at least one product on one delivery day.
- [ ] UNTESTED — Save. Confirm:
  - [ ] UNTESTED — No error toast.
  - [ ] UNTESTED — A new unpaid top-up invoice appears (check Invoices or the week's invoice page) for the quantity delta amount.
  - [ ] UNTESTED — The top-up invoice `kind` is `subscription_topup` (Convex dashboard → invoices table).
  - [ ] UNTESTED — Decreasing quantity is rejected (try reducing a quantity — should show an error or be blocked).

### §5.2 Mark top-up invoice paid (existing flow)

- [ ] UNTESTED — Mark the newly created top-up invoice as paid (via existing `markTopupInvoicePaid`). Confirm the credit pool increases accordingly (check Convex dashboard → creditLedger for a new `topup` entry).

### §5.3 R3 — No new per-day orders generated

- [ ] UNTESTED — After amending the week (increasing qty), verify that NO new `orders` rows were created for the added quantity. _(R3: amend is invoice-only; fulfillment handled manually by operator.)_ Check Convex dashboard → orders table; count should be unchanged.

### §5.4 Out-of-credit flag on order surface

- [ ] UNTESTED — Identify (or create) a subscription order where `orderTotal > creditRemaining` for that week. Open the order in `OrderSlideOver` (manager session). Verify an out-of-credit flag/badge is visible.
- [ ] UNTESTED — Open the same order in `OrderDetail`. Verify out-of-credit flag is also visible (Pitfall #20 — both surfaces).

### §5.5 Split path (Path A)

- [ ] UNTESTED — On an over-credit order: verify the "Split" button is visible (manager session, `canSplit: true` from `getOrderCreditStatus`).
- [ ] UNTESTED — The Split button shows a visible note that recognition posts at split time (R1 timing note is surfaced in the UI).
- [ ] UNTESTED — Click Split. Confirm:
  - [ ] UNTESTED — Two orders result (covered + remainder) or a top-up invoice for the uncovered portion.
  - [ ] UNTESTED — No error toast.
- [ ] UNTESTED — **R1 recognition-timing check:** After splitting and then marking the covered order delivered, verify in Convex dashboard → creditLedger that EXACTLY ONE drawdown entry exists for the original order amount, NOT two. _(R1: recognition fires at split time; Mark-delivered must be idempotent and not post a second drawdown. This must be verified before relying on the Split path in production.)_

### §5.6 Apply-credit path (Path B)

- [ ] UNTESTED — On an ad-hoc over-credit order (where `canApplyCredit: true`): verify "Apply credit" button is visible (manager session).
- [ ] UNTESTED — Click Apply credit. Confirm:
  - [ ] UNTESTED — A partial drawdown ledger entry is created for `min(creditRemaining, orderTotal)`.
  - [ ] UNTESTED — Order status remains `AwaitingPayment` (remainder collected via QRIS/bank).
  - [ ] UNTESTED — No error toast.

### §5.7 Hidden for order_staff

- [ ] UNTESTED — Switch to `order_staff` session. Open the same over-credit order. Verify:
  - [ ] UNTESTED — Out-of-credit flag NOT visible.
  - [ ] UNTESTED — Split and Apply-credit buttons NOT visible.
  - [ ] UNTESTED — Page does NOT crash (no error boundary).

---

## §6 Reconcile with comment

### §6.1 Reconcile button visible for paid/delivering weeks

- [ ] UNTESTED — Navigate to CRM → `SubscriptionWeeklyInvoicePage` for a week in `paid` or `delivering` status. Verify a "Reconcile" button (or action) is present.

### §6.2 Submit disabled until comment entered

- [ ] UNTESTED — Click Reconcile. The `ReconcileWeekDialog` opens.
- [ ] UNTESTED — Verify the dialog shows a fault selector and a comment/note text field.
- [ ] UNTESTED — Verify the "Submit" / "Confirm" button is DISABLED when the comment field is empty.
- [ ] UNTESTED — Enter a space-only string in the comment field. Submit button should remain disabled (server trims and rejects empty).
- [ ] UNTESTED — Enter a non-empty comment (e.g. "Week ended normally, no shortfall"). Submit button becomes ENABLED.

### §6.3 Reconcile succeeds — note persisted

- [ ] UNTESTED — Select a `shortfallFault` value (e.g. "none"). Confirm and submit.
- [ ] UNTESTED — No error toast.
- [ ] UNTESTED — Week status transitions to `reconciled` (verify on the page or Convex dashboard → subscriptionWeeks).
- [ ] UNTESTED — `subscriptionWeeks.reconcileNote` field contains the entered comment (Convex dashboard → subscriptionWeeks, find the week row).

### §6.4 Closed/reconciled week — re-reconcile rejected

- [ ] UNTESTED — On the now-reconciled week: verify the "Reconcile" button is no longer present OR that attempting to reconcile again shows a clear error. The backend closed-week guard should reject the mutation.

### §6.5 Empty comment — server-side rejection

- [ ] UNTESTED — (If the frontend guard can be bypassed via console or direct mutation call) Call `reconcileWeek` directly with `reconcileNote: ""`. Confirm a `ConvexError` is returned with message containing "reconcileNote is required". This verifies the `assertReconcileNote` server-side guard.

---

## §7 Regression — existing subscription flows unaffected

- [ ] UNTESTED — Confirm the week calendar still shows correctly for a `planned` week (seed/save/confirm flow unchanged).
- [ ] UNTESTED — Confirm `createSubscriptionWeeklyInvoice` + `markWeeklyInvoicePaid` flow still works for a `confirmed` week.
- [ ] UNTESTED — Confirm `reconcileWeek` still rejects a non-`paid`/`delivering` week (e.g. `planned` status) with an appropriate error.
- [ ] UNTESTED — Confirm `CrmFundingDashboardPage` still lists weeks correctly and mark-paid still works.
- [ ] UNTESTED — Confirm existing non-subscription orders on the Orders kanban are unaffected (no regression to split/apply-credit buttons or out-of-credit flag appearing for non-subscription orders).

---

## Sign-off

| Gate | Status |
|------|--------|
| §4 Deliver/recognize | UNTESTED |
| §5 Amend / top-up / out-of-credit | UNTESTED |
| §6 Reconcile-with-comment | UNTESTED |
| §7 Regression | UNTESTED |
| R1 recognition-timing verified | UNTESTED |
| R2 no stock/production regression | UNTESTED |
| R3 no new orders from amend | UNTESTED |

**Tester sign-off:** _______________ **Date:** _______________

**Notes / issues found:**
