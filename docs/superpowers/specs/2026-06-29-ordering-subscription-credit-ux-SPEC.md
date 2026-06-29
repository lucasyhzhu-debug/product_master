# SPEC — Ordering screen: B2B subscription-credit UX + flexible daily orders

**Date:** 2026-06-29
**Status:** Draft spec (no code yet) — for a focused, triple-reviewed build later.
**Author:** session with Lucas.

## Problem

The ordering sheet (`src/pages/OrderCreate.tsx`) already has a notion of "this
customer has an active subscription, fund the order from its credit," but it
"doesn't work very well." Lucas wants the B2B/subscription context to be **obvious
at customer-selection time** and the **credit draw-down to be the natural path** for
B2B cafes, not a late, conditional banner.

Broader operational goal: the weekly schedule pre-creates daily orders; staff should
be able to **edit a day's order before it ships** (reduce pieces), and when a cafe
wants **more** that day, **create a new order that draws down the same subscription
credit** — with an **end-of-day summary** of pieces used / left / remaining credit.

## Current state (grounded)

| Piece | Where | Note |
|-------|-------|------|
| Customer dropdown | `src/components/orders/CustomerSearch.tsx` → `useCustomerSearch` → `api.customers.queries.search` (`convex/customers/queries.ts:30`, generic `textSearch` on name/phone) | Returns customer docs incl. `customerType`, but the list UI renders only `name`/`phone`. |
| Credit selector | `src/components/orders/SubscriptionCreditBanner.tsx`, rendered at `OrderCreate.tsx:902` | Gated on `isManagerOrAdmin && customerId !== null && hasItems` **and** a due date. Driven by `useSubscriptionCreditContext` (`src/hooks/…`) keyed on customerId + items. |
| Credit context query | `useSubscriptionCreditContext` → backend credit-context query | Computes per-subscription available credit + per-line eligibility. Requires items to compute the split. |
| Credit-funded order | `api.subscriptions.creditOrder.createCreditFundedOrder` + `getCreditOrderWhatsappDraft` (`OrderCreate.tsx:265`) | Already exists — the draw-down mutation is in place. |
| Schema facts | `customers.customerType: "direct_b2c"|"b2b_wholesale"` (`schema.ts:203`); `subscriptions` has `by_customer` index; `subscriptions.queries` lists subs by customer (`queries.ts:226`) | All the data needed already exists. |

**Why it feels broken:** the credit selector only appears after the operator has
selected a customer, added items, set a due date, *and* is manager/admin. So for a
B2B cafe order the credit path is invisible until late and easy to miss.

## Scope — sliced

### Slice 1 — B2B indicator in the dropdown + subscription selector under the name (THIS request)
The concrete near-term ask.

1. **`[B2B]` prefix in the customer dropdown.** In `CustomerSearch`'s result list,
   prefix the name with `[B2B]` when the customer is `customerType === "b2b_wholesale"`
   **and** has ≥1 active subscription. (Lucas's words: "a flag that says `[B2B]`
   prefixed on their customer name … if they're a b2b customer with subscriptions.")
2. **Subscription selector directly under the selected name.** When a `[B2B]`
   customer is selected, render a compact selector **immediately under the name in
   the Customer card** (not the late, items-gated banner) that lists their active
   subscriptions and lets the operator pick which one's credit to use. Selecting one
   sets `selectedSubId` (the state already exists at `OrderCreate.tsx:114`).
3. **Decouple from items/due-date for visibility.** The *selector* shows on customer
   selection; the *credit split detail* (per-line coverage) can still fill in once
   items + due date exist. Reuse `SubscriptionCreditBanner`'s detail rendering but
   move the **subscription-choice** up to the Customer card.

**Backend:** add a lightweight search-companion (or extend `customers.queries.search`
to return `customerType` + a boolean `hasActiveSubscription`, and a per-customer
`listActiveSubscriptions(customerId)` query for the selector). Keep `[B2B]` purely
derived (B2B + has-active-sub), so non-subscription B2B customers don't get the flag
spuriously.

**Surfaces:** `OrderCreate.tsx` is the primary ordering sheet. Check whether
`OrderForm.tsx` / `OrderFormPOS.tsx` (which also call `useCustomerSearch`) need the
same treatment — per CLAUDE.md Pitfall #20, mirror order features across surfaces.

### Slice 2 — edit a day's existing order before it ships
Reduce (or change) pieces on a not-yet-delivered subscription order directly from the
order tile. **Undelivered only** — no recognized-revenue correction (that's the hard
case we explicitly avoid). On save: update items + production + totals and resync the
week's `plannedDays` (reuse `resyncWeekPlanFromOrders`, shipped 2026-06-29). Wire
**both** `OrderSlideOver.tsx` and `OrderDetail.tsx` (Pitfall #20).

### Slice 3 — "add more" = a new credit-funded order
When creating a new order for a customer with an active subscription, prompt **"This
customer has an active subscription with credit — use it?"** and, if yes, fund via
`createCreditFundedOrder` (draws down the pool). This is largely Slice 1's selector +
the existing credit-funded-order mutation; the new order links to the customer and
draws on the chosen subscription.

### Slice 4 — end-of-day Telegram summary (THE KEY ACCEPTANCE TEST)
Per Lucas: the daily Telegram message is **the primary proof the whole flow works** —
if shipped/left/credit come out right, the orders + draw-down underneath are right. So
this is both a deliverable and the system's acceptance test.

**Message content (per active subscription, once per day):**
- **Shipped today** — BOM-resolved balls (Big+Mid) across the subscription's orders
  *delivered today* (WIB). Count balls, NOT product rows (Business Rule #13). Show pcs
  (and optionally IDR).
- **Left** — *needs definition, see Q5.* Candidate: remaining of the weekly allotment
  = `weeklyQty − balls used so far this week` (used = sum of delivered balls Mon→today).
- **Credit remaining** — `deriveCreditPool(weekLedger).creditRemaining` (integer IDR,
  read the derived pool, never re-key — CRM C10).

**Example:**
```
📦 Crystal Cafe — subscription, Mon 29 Jun (WIB)
Shipped today: 150 pcs
Used this week: 150 / 750 pcs  →  600 left
Credit remaining: Rp 17.400.000
```

**Mechanism:** a daily WIB cron iterates active subscriptions with delivery activity
today and sends via `getChatIdByRole({ role: <Q6> })`; if it's also a `/`-command,
add a `COMMAND_POLICY` entry (deny-by-default). Thread `generatedAt` through (no
`Date.now()` drift — see `lessons_packlist_overdue`).

**Acceptance test (TDD — write first):** seed a subscription week funded with a known
topup, deliver a known qty today (posting the drawdown), and assert the *composed
message string* equals the expected shipped/left/credit line-for-line. This single
test exercises BOM ball-counting, the drawdown, and the derived pool together — the
end-to-end "is it working" check Lucas wants. Extract the message-composition into a
**pure function** `composeSubscriptionDaySummary(...)` so it's unit-tested without
Telegram I/O (mirror the pack-list/sales-summary send pattern).

## Open questions
1. **Dropdown flag rule:** `[B2B]` only when B2B **and** has an active subscription, or
   for any `b2b_wholesale` customer regardless of subscription? (Spec assumes the
   former — matches "b2b customer with subscriptions".)
2. **Multiple active subscriptions:** show all in the selector (radio), default to the
   only one when there's exactly one?
3. **Non-manager staff:** the current banner is manager/admin-only. Should the B2B
   selector be visible (read-only?) to order staff, or stay manager/admin? (Affects the
   backend `roles` — see CLAUDE.md Pitfall #19: keep query roles ⊇ the route's
   permission set.)
4. **Slice 4 timing:** what WIB hour does the end-of-day cron fire?
5. **What "left" means (Slice 4):** remaining of the **weekly allotment** (`weeklyQty −
   balls used this week`), OR remaining **undelivered planned** pieces for the rest of
   the week, OR remaining **credit expressed as pieces** (`creditRemaining ÷ unitPrice`)?
   These differ once a cafe over/under-orders vs plan.
6. **Slice 4 recipient:** internal ops (`subscription-ops`/`founders` Telegram role),
   the **customer** directly, or both? Affects tone + which `telegramChats` role.

## Non-goals
- Editing/reducing **delivered/recognized** orders (recognized-revenue + balanceAfter
  re-chain). Explicitly out — handle "more" via new orders, "less" before ship.

## Build process note
Slices 3–4 touch credit draw-down / recognized counts → build with TDD + triple-review
before merge (per Lucas's workflow for money-path work). Slice 1 is UI + read queries
(low risk). The "Resync from orders" button (shipped 2026-06-29) already covers the
immediate "reset the schedule to match orders" need.
