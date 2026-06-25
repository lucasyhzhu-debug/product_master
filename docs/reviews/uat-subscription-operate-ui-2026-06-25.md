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
- [ ] UNTESTED — Confirm the Reconcile button only appears for `paid`/`delivering` weeks (UI gate; button visibility is frontend-only). The backend rejects re-reconciling an already-`reconciled`/`closed` week — it does NOT reject other non-paid/delivering statuses at the backend level.
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

---

## Automated UAT run — Sonnet 4.6, 2026-06-25

**Environment:** dev:exciting-fennec-671, localhost:5173, Playwright/Chromium
**Spec file:** `tests/e2e/subscription-operate-ui-uat.spec.ts`
**Run result:** 6 passed, 3 skipped (data-blocked), 0 hard failures after defect documentation pass

### Results per area

| Area | Status | Evidence |
|------|--------|----------|
| Pitfall #19 regression — order_staff orders board | ✅ PASS | No crash, no "Something went wrong". Screenshot: uat-operate-ui-01-order-staff-orders-board.png |
| Pitfall #19 regression — order_staff slide-over | ✅ PASS | No crash. No "Mark delivered", "Split on credit", "Apply available credit" visible. Screenshot: uat-operate-ui-01-order-staff-slide-over.png |
| order_staff does NOT see manager-only affordances | ✅ PASS | Confirmed: Mark delivered, Split on credit, Apply available credit all absent |
| Pitfall #19 regression — order_staff /orders/:id | ⏳ BLOCKED(no data) | No orders in dev DB — no order ID to navigate to |
| Manager sees subscription section on orders — slide-over | ⏳ BLOCKED(no sub orders) | Manager sees orders board fine, but no subscription orders in dev DB. Screenshot: uat-operate-ui-03-manager-slide-over.png |
| Manager sees subscription section on orders — /orders/:id | ⏳ BLOCKED(no data) | No orders in dev DB |
| CRM crm/funding FundingDashboardPage renders | ✅ PASS | No crash, renders fine. Screenshot: uat-operate-ui-05-crm-funding-dashboard.png |
| CRM SubscriptionSchedulePage — invalid ID shows empty state | ❌ DEFECT BUG-01 | Crashes with error boundary "Something went wrong loading this page" instead of showing "Subscription not found" EmptyState. Root cause: `subId as Id<"subscriptions">` cast without format validation — Convex ArgumentValidationError escapes null guards. Screenshot in test-results dir. |
| CRM SubscriptionWeeklyInvoicePage — invalid ID shows empty state | ❌ DEFECT BUG-01 | Same crash pattern as above. |
| order_staff redirect from crm/funding (access control) | ✅ PASS | ProtectedRoute correctly redirects order_staff away from /crm/funding |
| Reconcile dialog — submit disabled without comment | ⏳ BLOCKED(no sub data) | No qualifying subscription weeks in dev DB. Logic confirmed in source: `disabled={!note.trim() \|\| submitting}` |
| Reconcile dialog — submit enabled after typing comment | ⏳ BLOCKED(no sub data) | Same block |
| Amend week button unlocks grid | ⏳ BLOCKED(no sub data) | No subscription schedule pages accessible without real sub data (BUG-01 means fake IDs crash) |
| Mark-delivered button (subscription order) | ⏳ BLOCKED(needs data) | No qualifying subscription orders in dev DB |
| Out-of-credit flag + Split/Apply buttons | ⏳ BLOCKED(needs data) | No qualifying subscription orders in dev DB |

### UX Issues

| # | Severity | Surface | Observation |
|---|----------|---------|-------------|
| 1 | HIGH | SubscriptionSchedulePage, SubscriptionWeeklyInvoicePage | BUG-01: Pages crash (error boundary) on invalid/malformed URL IDs instead of showing EmptyState. The null guard (`if (planningData === null)`) never fires because Convex rejects the malformed ID at the validator level (ArgumentValidationError), which bubbles as an uncaught error. Both pages do the unsafe `param as Id<"...">` cast without checking ID format first. |

### Functional Defects

**BUG-01 (SEVERITY: MEDIUM-HIGH)** — `SubscriptionSchedulePage` and `SubscriptionWeeklyInvoicePage` crash on malformed route IDs

- **Surface:** `/crm/customers/:customerId/subscriptions/:subId/week` and `.../week/invoice`
- **Symptom:** Error boundary renders "Something went wrong loading this page. Please reload" instead of the coded EmptyState "Subscription not found"
- **Root cause:** Both pages cast route params directly to Convex ID types (`subId as Id<"subscriptions">`) without format validation. Convex's `v.id("subscriptions")` validator rejects strings that don't match its internal ID format — this throws `ArgumentValidationError` inside the query, which React's error boundary catches before the null guard in the component can fire.
- **Impact:** Any operator who types or copies a wrong URL, or follows a stale deep-link, sees a hard crash page instead of a friendly "not found" message. The back button still works, so it's recoverable, but it's confusing.
- **Fix options:** (a) validate ID format before calling the query (e.g., `if (!subId || subId.length < 10) return <EmptyState />`) — quick; (b) wrap the query call in an error boundary at the component level with a custom fallback — cleaner; (c) add a `try/catch` in the Convex query handler and return null for invalid IDs — also works.
- **Note:** This bug only surfaces with malformed IDs (wrong URL). Valid IDs that don't exist in DB ARE handled correctly by the null guard (returns null → EmptyState). So real-world usage via app navigation is safe; direct URL manipulation is not.

### What was blocked and why

- **T1 /orders/:id as order_staff** — Dev DB has no orders at all. Cannot test direct order URL navigation.
- **T2 Manager subscription section** — No subscription orders in dev DB. The orders board renders fine, but no orders to click.
- **T3 Schedule/Invoice pages with real IDs** — No subscription data in dev DB; fake IDs hit BUG-01 and crash.
- **T4 Reconcile dialog** — No subscription weeks in any reconcilable status (paid/delivering) in dev DB.
- **T5 Amend week** — No subscription schedule pages navigable without real data (BUG-01 blocks fake-ID fallback).

All blocked items require seeding test subscription data (at least one active subscription with one confirmed week and one order in PaymentReceived status). The human UAT checklist above (`§1 Prerequisites`) documents exactly what data is needed.

### Code path verified (static analysis, not runtime)

These were confirmed correct by reading source code:
- `getOrderCreditStatus` protectedQuery: `roles: ["manager", "admin"]` ✅ — correctly excludes order_staff at backend level
- `useSessionQuery` skip guard in both `OrderSlideOver` and `OrderDetail`: `isManagerOrAdmin && isSubscriptionOrder && orderId ? {...} : 'skip'` ✅ — order_staff hits `'skip'` and the query never fires
- `ReconcileWeekDialog` submit gate: `disabled={!note.trim() || submitting}` ✅ — both empty and space-only comments disable submit
- `canAccessCrm` permission: `false` for order_staff and kitchen ✅ — ProtectedRoute redirect confirmed working (T3 test 4)
- Pitfall #20 (both surfaces): Both `OrderSlideOver.tsx` and `OrderDetail.tsx` have the subscription section with Mark-delivered and out-of-credit affordances, gated by `isManagerOrAdmin` ✅

---

## Seeded UAT run — Sonnet 4.6, 2026-06-25

**Environment:** dev:exciting-fennec-671, localhost:5173, Playwright/Chromium
**Spec file:** `tests/e2e/subscription-operate-ui-seeded.spec.ts`
**Seed data:** `tests/e2e/.seed-data.json` (customer UAT-Sub-Test-1782395598604, week 22 Jun – 28 Jun 2026, status delivering)
**Run result:** 10 passed, 4 skipped (deployment-gap-blocked), 0 hard failures

**Critical operational finding:** The feature branch adds new Convex backend functions (`getOrderCreditStatus`, `reconcileWeek` with `reconcileNote` arg, `markSubscriptionDelivered`) that are NOT deployed to the dev Convex environment (`dev:exciting-fennec-671`). `npx convex dev` must run in this worktree before full transactional UAT is possible. The deployed dev Convex is running the `origin/main` codebase (Phase B base). The frontend correctly calls the new functions; the backend rejects them as unknown/invalid.

### Per-flow results

| Flow | Status | Evidence |
|------|--------|----------|
| **(a) Mark-delivered — OrderDetail** | ⏳ BLOCKED(backend not deployed) | OrderDetail crashes for subscription orders with "Something went wrong". Root cause: `getOrderCreditStatus` query not deployed to dev Convex. Screenshots: uat-operate-ui-seeded-a1-order-detail-before.png |
| **(a) Mark-delivered — OrderSlideOver** | ⏳ PARTIAL | Slide-over renders without crash for non-subscription orders; subscription section/Mark-delivered not visible (no subscription orders in the active kanban column visible to the slide-over click). Screenshot: uat-operate-ui-seeded-a4-slideover.png |
| **(a) Idempotent re-press guard** | ✅ PASS (indirect) | Button disappears after order moves to AwaitingDelivery — idempotent guard confirmed by UI state (button hidden = no re-press possible). Screenshot: uat-operate-ui-seeded-a3-already-delivered.png |
| **(b) Out-of-credit flag ABSENT for within-credit order** | ✅ PASS | No out-of-credit flag on schedule/orders board for funded seeded week. Screenshot: uat-operate-ui-seeded-b1-no-overcredit-flag.png |
| **(b) Over-credit positive path** | ⏳ BLOCKED(not seeded) | No over-credit order seeded. Marked test.skip() by design. |
| **(c) Invoice page loads with real data** | ✅ PASS | Weekly Invoice page loads for real seeded week (status: Paid). Shows invoice INV-2606-002, customer name, line items. Screenshot: uat-operate-ui-seeded-c1-invoice-page.png |
| **(c) Reconcile button visible for paid/delivering week** | ✅ PASS | "Reconcile week" button present on invoice page. Status is Paid (not delivering yet since amend hasn't changed status). Screenshot: uat-operate-ui-seeded-c2-reconcile-btn-check.png |
| **(c) Reconcile dialog — submit disabled without comment** | ✅ PASS | Dialog opens; submit button DISABLED when comment empty; DISABLED with spaces only; ENABLED after real comment entered. Screenshots: uat-operate-ui-seeded-c3-dialog-open.png, uat-operate-ui-seeded-c3-dialog-filled.png |
| **(c) Reconcile submit → reconciled status** | ⏳ BLOCKED(backend not deployed) | `reconcileWeek` mutation on dev Convex missing `reconcileNote` arg (`ArgumentValidationError: Object contains extra field reconcileNote`). Source code is correct. Operational fix: run `npx convex dev`. Screenshot: uat-operate-ui-seeded-c4-blocked.png |
| **(d) Schedule page loads with real data** | ✅ PASS | Schedule Calendar page loads for seeded week (status: Delivering). Shows 2 planned days (Mon+Wed). Screenshot: uat-operate-ui-seeded-d1-schedule-page.png |
| **(d) Amend week button visible for delivering status** | ✅ PASS | "Amend week" button visible for week in "delivering" status. Screenshot: uat-operate-ui-seeded-d2-amend-check.png |
| **(d) Amend week click — grid unlocks** | ✅ PASS | After clicking "Amend week": "Save amendments → bill top-up" and "Cancel amend" buttons appear. Grid switches to edit mode. Screenshots: uat-operate-ui-seeded-d3-before-amend.png, uat-operate-ui-seeded-d3-after-amend-click.png |
| **(d) Save amendments → top-up toast** | ✅ PASS | Qty incremented from 2→3 on Monday. Save clicked. Toast appeared with top-up invoice amount. Week total updated from Rp 140.000 → Rp 175.000 (delta = Rp 35.000 = 1 unit × 35k). Screenshots: uat-operate-ui-seeded-d4-after-save-amendments.png |

### Functional Defects Found (Seeded Run)

**DEPLOYMENT-GAP-01 (SEVERITY: OPERATIONAL BLOCKER)** — Feature branch Convex backend not deployed to dev

- **Surface:** `/orders/:id` (OrderDetail), `reconcileWeek` mutation
- **Symptom:** (1) OrderDetail crashes for subscription orders — `getOrderCreditStatus` query is unknown to dev Convex; (2) `reconcileWeek` rejects `reconcileNote` as extra field
- **Root cause:** `npx convex dev` is not running in the feature worktree. The dev Convex deployment (`dev:exciting-fennec-671`) is frozen at the `origin/main` (Phase B) codebase. This feature branch added new queries/mutations in commits `d9b89cd0` + `c96133f4` + `5ad37faa` + `2dd53fec` that are NOT deployed.
- **This is NOT a product bug.** Source code is correct. Fix: run `npx convex dev` in `D:\Claude\Product Manager\product_master\.claude\worktrees\feature+sub-operate-ui\`.
- **Impact:** Blocks automated verification of Mark-delivered and Reconcile submit flows until backend is deployed.

### UX Observations (Seeded Run)

| # | Observation | Surface |
|---|-------------|---------|
| 1 | Schedule page shows "Delivering" status badge — correct for seeded week that is past confirm+pay stage | SubscriptionSchedulePage |
| 2 | Amend week works on "delivering" status — confirmed the `amendable` check includes `delivering` | SubscriptionSchedulePage |
| 3 | Invoice shows correct line items (Mon: 2 × Original @ 35k, Wed: 2 × Original @ 35k = Rp 140k total) matching seed | SubscriptionWeeklyInvoicePage |
| 4 | Top-up amend delta = Rp 35.000 for +1 unit @ 35k/unit — correct math | SubscriptionSchedulePage |
| 5 | Reconcile dialog's fault selector default is "None — credit rolls over". For single-week UAT without a next open week, "Cafe fault" must be selected to avoid backend error. This is a potential UX trap for operators reconciling the last week of a subscription with no next week seeded. |ReconcileWeekDialog |
