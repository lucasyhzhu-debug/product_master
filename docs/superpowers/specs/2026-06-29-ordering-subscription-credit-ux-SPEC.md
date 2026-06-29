# SPEC — Ordering screen: B2B subscription-credit UX + flexible daily orders

**Date:** 2026-06-29
**Status:** Slice 4 SHIPPED (PR #226). Slices 1–3 — all open questions RESOLVED
2026-06-29; spec staffreviewed and being planned for a focused, triple-reviewed build.
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
   prefix the name with `[B2B]` when the customer is `customerType === "b2b_wholesale"`.
   **DECISION 2026-06-29 (Q1 resolved):** the flag is purely `b2b_wholesale` — it does
   NOT depend on having an active subscription. The *flag* and the *selector* are
   decoupled: every B2B customer is flagged in the dropdown, but the subscription
   selector (item 2) only appears for those with ≥1 active subscription. (This removes
   the subscription lookup from the dropdown query's hot path — `hasActiveSubscription`
   is no longer needed for the flag, only `customerType` + `companyName`.)
2. **Subscription selector directly under the selected name.** When a selected
   customer has ≥1 active subscription, render a compact selector **immediately under
   the name in the Customer card** (not the late, items-gated banner) that lists their
   active subscriptions and lets the operator pick which one's credit to use. Selecting
   one sets `selectedSubId` (the state already exists at `OrderCreate.tsx:114`).
3. **Decouple from items/due-date for visibility.** The *selector* shows on customer
   selection; the *credit split detail* (per-line coverage) can still fill in once
   items + due date exist. Reuse `SubscriptionCreditBanner`'s detail rendering but
   move the **subscription-choice** up to the Customer card.

**CONFIRMED LIVE BUG — two facets (both must be fixed):**
- **Facet A (documented):** the selector is rendered only when
  `isManagerOrAdmin && customerId !== null && hasItems` **and** a due date
  (`OrderCreate.tsx:902`), and its data hook `useSubscriptionCreditContext`
  (`src/hooks/useSubscriptionCreditContext.ts:12`) passes `"skip"` until
  `draftItems.length > 0`. So with a customer chosen but no items, there is nothing to
  select. → Fix by decoupling the *choice* from items/due-date (item 3).
- **Facet B (revealed by live screenshot 2026-06-29):** even once the banner DOES
  appear, `SubscriptionCreditBanner` renders a radio **only when `multiSub`**
  (`SubscriptionCreditBanner.tsx:135-139` shows the single-sub label as plain text —
  no clickable control), and `selectedSubId` is **never auto-selected** (verified: it
  is only ever set by that radio). So in the common **single-subscription** case
  `selectedSubId` stays `null`, and clicking *Fulfil with Subscription Credit* dead-ends
  at `handleFulfilWithCredit` → `toast.error('Select a subscription above first')`
  (`OrderCreate.tsx:424`) — with nothing above to select. → **DECISION (Q2 resolved):
  default-select when exactly one** active subscription (set `selectedSubId` to the
  sole sub on load), and the new under-the-name selector renders a control for the
  single-sub case too (not plain text), so the choice is always actionable.

**Backend:** the dropdown query only needs `customerType` + `companyName` (the `[B2B]`
flag is `customerType`-only per Q1 — no subscription lookup). Add a separate
per-customer `listActiveSubscriptionsForCustomer(customerId)` query for the selector,
returning `[{ subscriptionId, label, creditRemaining? }]` (active subs only). **Role
scope (Q3 resolved): roles = `["order_staff","manager","admin"]`** — the `/orders/new`
route is `canAccessOrders` (reachable by order_staff per `types.ts:774`), so the
list-subscriptions query MUST include `order_staff` or the selector silently crashes /
stays hidden for them (CLAUDE.md Pitfall #19). Confidential figures (partner price)
stay stripped server-side per role (CRM D11); `creditRemaining` is the derived pool
(`deriveCreditPool` — never re-key, CRM C10).

**`creditRemaining` week resolution (staffreview IMP-3):** the selector renders on
customer-select, before a due date exists, so `listActiveSubscriptionsForCustomer`
cannot key the funding week off `dueDate` like `getSubscriptionCreditContext` does.
Resolve against the **current open week** (today WIB, week `status ∈ {paid, delivering}`)
and label the figure "this week's remaining." If no open funded week exists, return
`creditRemaining: null` (selector still shows; the per-line banner fills detail once
items + due date exist).

**Surfaces (staffreview IMP-4):** `OrderCreate.tsx` is the primary ordering sheet and
the only surface that gets the **subscription selector** in this slice. The
**search-matching fix** (phone/whatsapp/altPhone normalization) lives in the shared
`search` query, so `OrderForm.tsx` / `OrderFormPOS.tsx` (which also call
`useCustomerSearch`) benefit automatically. The **`[B2B]` + companyName dropdown
render** is per-component: mirror it into `OrderForm.tsx` and `OrderFormPOS.tsx` too
(Pitfall #20) so customers look consistent across every order-entry surface — these are
cheap render-only changes. The selector itself stays OrderCreate-only.

#### Slice 1 — ALSO fix two dropdown problems (same slice)
Grounded against the real schema (`schema.ts:178-206`): `customers` has `name`,
`phone?`, `whatsapp?`, **`altPhone?`** (a third number field — must be considered too),
`companyName?`, `customerType?` (**optional** — legacy rows have no value, so the
`[B2B]` test must treat `undefined` as not-B2B). The `search` query already returns
**full customer docs** (`textSearch` returns `Doc<"customers">[]`), so `customerType`,
`companyName`, `whatsapp` are already on the wire — only **matching** and **rendering**
need work, not the return shape.

**(a) Phone ↔ WhatsApp matching (one identity).** `api.customers.queries.search`
currently matches only `["name","phone"]` (`queries.ts:36`) via the generic
`textSearch` (full-table `.collect()` + case-insensitive substring, **no digit
normalization** — `queryHelpers.ts:107-128`). A cafe whose number lives in `whatsapp`
(or `altPhone`) but not `phone` fails to match and looks like a different/duplicate
person. **Fix:** replace the generic call with a customer-specific search that (i)
substring-matches `name` + `companyName`, and (ii) for a query that looks like a phone
number, **digit-normalizes** (strip non-digits; treat leading `0`/`+62`/`62` as
equivalent) and matches the normalized query against the digit-normalized `phone`,
`whatsapp`, AND `altPhone` — so the two/three numbers are ONE identity. Keep it within
the existing full-scan pattern (no new index needed; same cost as today's `textSearch`).
- **Dedup-on-create:** `crm.customers.createCustomer` dedups by an **exact** `by_phone`
  index match only (`customers.ts:99-104`) — it ignores `whatsapp`/`altPhone` and is
  defeated by formatting variants (`0812…` vs `+62812…`). **Fix:** before insert, also
  match the new customer's number (normalized) against existing `phone`/`whatsapp`/
  `altPhone` so the same cafe isn't split. (No unique constraint exists — the known
  concurrent-same-phone race from #211 is out of scope here.)

**(b) Business name in the dropdown.** Render `companyName` alongside the name in each
result and in the selected display so look-alikes are distinguishable — real case: a
D2C "Marchella - Amsterdam" vs a B2B "Marchella" are indistinguishable today. E.g.
`[B2B] Marchella — <companyName>` / `Marchella - Amsterdam`. `CustomerSearch.tsx`'s
local prop/handler types (lines 9-11, 44) currently narrow customers to
`_id/name/phone/defaultAddress` — widen them to carry `customerType` + `companyName`.

### Slice 2 — edit a day's existing order before it ships
Reduce (or change) pieces on a not-yet-delivered subscription order directly from the
order tile. **Undelivered only** — no recognized-revenue correction (that's the hard
case we explicitly avoid). Wire **both** `OrderSlideOver.tsx` and `OrderDetail.tsx`
(Pitfall #20).

**Reuse, don't rebuild (staffreview IMP-1):** `convex/orders/mutations/itemCrud.ts`
already has `updateItemQuantity` (line 269), `removeItem` (111), `replaceItems` (170) —
`updateItemQuantity` already patches `orderItems`, updates the `orderItemProduction`
records (via `updateProductionRecordsForQuantityChange`), recalculates order totals +
`finalTotal`, and clears the voucher. Slice 2 is a **thin orchestrator**:
1. **Guard**: order is a subscription order (`subscriptionId` + `subscriptionWeekId`)
   AND undelivered (status not in delivered/recognized set) — reject otherwise.
2. **Apply** the per-line reductions/removals via the existing `itemCrud` mutation(s).
3. **Re-derive the credit reservation (CRITICAL — staffreview #1):** if the order has
   `subscriptionCreditApplied > 0` and NO `by_order` credit-ledger row (un-recognized),
   the reservation MUST be re-derived/capped to the new eligible total. Recognition at
   delivery draws `subscriptionCreditApplied ?? totalAmount` (`recognition.ts:73`) and
   `computeWeekAvailableCredit` subtracts `Σ subscriptionCreditApplied` for un-recognized
   orders (`creditReservation.ts`) — leaving a stale-high reservation **over-draws the
   pool at delivery** and **under-reports available credit** meanwhile (Pitfall #23). A
   non-credit-funded subscription order (no reservation) needs no adjustment.
4. **Resync** the week's `plannedDays` (reuse `resyncWeekPlanFromOrders`, shipped
   2026-06-29).

**Roles (staffreview IMP-2):** make the new orchestrator a single `protectedMutation`.
If order_staff can edit from the order surfaces, its roles = `["order_staff","manager",
"admin"]` AND `resyncWeekPlanFromOrders` must be widened to match (currently
`["manager","admin"]`, Pitfall #19); otherwise keep Slice 2 manager/admin. **Decision
needed in the plan.** Note the reused `itemCrud` mutations are plain `mutation` (no
auth) — do NOT widen that gap; the orchestrator owns the auth check and calls the item
logic internally.

**TDD (money path → triple-review):** reduce a credit-funded order N→M pieces; assert
`subscriptionCreditApplied` drops accordingly AND `computeWeekAvailableCredit` rises by
the freed amount; assert undelivered-only guard rejects a recognized order; assert the
schedule resyncs; edge: reduce below already-filled production count.

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
- **Counting unit = the subscription's scheduled product pieces** (the `qty` on the
  schedule / `orderItems.quantity`), NOT BOM-resolved balls. The cafe's quota
  (`weeklyQty`) is expressed in those scheduled product pieces, so shipped/used/left
  must use the same unit for the subtraction to be meaningful. Business Rule #13 (count
  balls) governs sales/production-volume metrics, NOT a subscription cafe's piece quota
  — decided 2026-06-29 (Lucas: "whatever product is in the subscription schedule").
- **Shipped today** — sum of `orderItems.quantity` across the subscription's orders
  *delivered today* (WIB).
- **Left** — weekly allotment remaining = `weeklyQty − pieces used so far this week`
  (used = sum of delivered product-unit qty Mon→today).
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
test exercises the piece-counting, the drawdown, and the derived pool together — the
end-to-end "is it working" check Lucas wants. Extract the message-composition into a
**pure function** `composeSubscriptionDaySummary(...)` so it's unit-tested without
Telegram I/O (mirror the pack-list/sales-summary send pattern).

## Decisions (locked 2026-06-29)
- **Counting unit = scheduled product pieces** (`orderItems.quantity`), NOT BOM balls.
- **"Left" = weekly allotment remaining:** `weeklyQty − (pieces delivered Mon→today this week)`.
- **Recipient = founders** — the existing `weekly-delivery-progress` message already
  goes to founders daily at 18:00 WIB; Lucas chose to **extend that message** rather than
  add a separate subscription-ops one. (Supersedes the earlier "subscription-ops" idea.)
- **Mechanism = extend the existing kind:** add the three KPIs to `weekly-delivery-progress`
  (query `getWeeklyDeliveryProgress` + formatter `formatWeeklyDeliveryProgress`), reusing
  its cron + resilient send + watchdog. No new kind, no ball-count helper (pieces only).
- **Build order:** Slice 4 (SHIPPED on `feature/subscription-eod-summary-kpis`) then Slice 1, TDD, triple-review before merge.

### Slices 1–3 decisions (locked 2026-06-29, this planning pass)
- **[B2B] flag = `customerType === "b2b_wholesale"` only** (treat `undefined` as not-B2B);
  decoupled from subscription state. Selector visibility = has-active-sub.
- **Default-select the sole subscription** when a customer has exactly one active sub;
  radio when >1. The single-sub selector renders an actual control (not plain text).
- **Roles = `["order_staff","manager","admin"]`** for the new list-subscriptions query
  and for selector visibility (route is `canAccessOrders`). Pitfall #19.
- **Search matches** `name` + `companyName` + digit-normalized `phone`/`whatsapp`/`altPhone`
  (one identity); dropdown shows `companyName` to disambiguate look-alikes.
- **Dedup-on-create** also considers `whatsapp`/`altPhone` (normalized), not just exact `phone`.
- **No stopgap** — the live single-sub bug is fixed only as part of the full Slice 1.

## Open questions — ALL RESOLVED 2026-06-29 (Slices 1–3)
1. ~~**Dropdown flag rule**~~ — RESOLVED: `[B2B]` for **any `b2b_wholesale`** customer
   (flag decoupled from subscription; the *selector* still requires an active sub).
2. ~~**Multiple active subscriptions**~~ — RESOLVED: radio list when >1; **auto-select
   the sole sub** when exactly one (fixes live-bug Facet B).
3. ~~**Non-manager staff**~~ — RESOLVED: the selector + its list-subscriptions query are
   visible/usable to **`order_staff` + manager + admin** (route is `canAccessOrders`,
   reachable by order_staff). Query `roles` MUST include `order_staff` (Pitfall #19).
   Confidential figures stay stripped server-side per role (CRM D11).
4. ~~**Slice 4 timing**~~ — RESOLVED: reuses the existing 18:00 WIB cron. (Slice 4 SHIPPED.)
5. ~~**What "left" means**~~ — RESOLVED: weekly allotment remaining in **scheduled product
   pieces** (`weeklyQty − pieces used this week`). (Slice 4 SHIPPED.)
6. ~~**Slice 4 recipient**~~ — RESOLVED: founders (extended the existing
   `weekly-delivery-progress` message). (Slice 4 SHIPPED, PR #226.)

## Non-goals
- Editing/reducing **delivered/recognized** orders (recognized-revenue + balanceAfter
  re-chain). Explicitly out — handle "more" via new orders, "less" before ship.

## Build process note
Slices 3–4 touch credit draw-down / recognized counts → build with TDD + triple-review
before merge (per Lucas's workflow for money-path work). Slice 1 is UI + read queries
(low risk). The "Resync from orders" button (shipped 2026-06-29) already covers the
immediate "reset the schedule to match orders" need.
