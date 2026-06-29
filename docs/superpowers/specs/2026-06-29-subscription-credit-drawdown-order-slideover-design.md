# Subscription Credit Drawdown in the Order Slide-Over — Design Spec

**Date:** 2026-06-29
**Status:** Approved design (brainstorming) → ready for staffreview → plan
**Slug:** `subscription-credit-drawdown-order-slideover`
**Target version:** v2.1 (sub-feature → patch within the subscription line)

---

## 1. Problem & Goal

Certain customers (cafes) have an **active prepaid weekly subscription** with a pool of
pre-funded credit (`subscriptions` + `subscriptionWeeks` + `creditLedger`). Today that
credit is only consumed by the subscription's own auto-generated planned-day orders
(`confirmWeek` → `recognizeSubscriptionDelivery`). Staff have no way, from the normal
order-taking surface, to fulfil an **extra / ad-hoc** order for a subscription customer
out of that same weekly credit.

**Goal.** In the order slide-over (and the mirrored full-page `OrderDetail`), when staff
select a customer with an active subscription:

1. Surface a **credit banner** — "this customer has N active subscription(s); Rp X credit
   available this week" — per active subscription.
2. Let staff **fulfil eligible order lines from the weekly credit pool** instead of
   collecting payment, when the ordered products are products the subscription covers.
3. **Flag off-plan lines** (products not in the subscription) as not credit-eligible — those
   are paid normally.
4. Handle **partial credit** — if eligible value exceeds available credit, credit covers
   what it can and the remainder is due via the normal payment flow.
5. Produce a **manual WhatsApp summary** the staff can send the customer ("we used Rp xx
   credit for today's order; you have N deliveries left this week and Rp yy credit
   remaining").
6. **Reflect the drawdown in the subscription week** — the credit ledger shows the drawdown
   and the week lists the ad-hoc credit order. The agreed **planned-day quantities stay
   frozen** (this is consumption on top of the plan, not a plan amendment).

### Non-goals (out of scope)

- WhatsApp **auto-send** integration (Business API). The summary is a manual draft, reusing
  the existing template-draft pattern.
- **Editing the agreed plan** (`plannedDays` quantities) from the order flow. That stays in
  the CRM amend surface (`amendWeekSchedule`).
- Rollover-policy / expiry changes.

---

## 2. Confirmed Decisions (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Core model | **Standalone credit-funded order on top of the plan.** `plannedDays` quantities stay frozen; only the credit pool drops (a `drawdown` ledger entry) and the order links to the `subscriptionWeek`. |
| D2 | Product eligibility | **Per-line.** A line is credit-eligible iff its `menuProductId` ∈ the subscription's allowed product set (distinct `menuProductId`s across `scheduleTemplate[].items`), regardless of day. Off-plan lines are flagged and paid normally. |
| D3 | Insufficient credit | **Partial.** Credit covers what it can on eligible lines; eligible shortfall + off-plan lines = amount due (normal payment). |
| D4 | Drawdown timing | **At delivery/recognition** (mirror `recognizeSubscriptionDelivery`), NOT at order confirmation. |
| D5 | Double-spend prevention | **Reservation-via-order-row.** No new ledger type. `availableCredit = creditRemaining − Σ(reserved on un-recognized credit orders in the week)`. |
| D6 | Multiple active subs | **List, staff picks one** before the credit button enables; banner shows each sub's credit figure. |
| D7 | WhatsApp | **Manual draft**, reusing `whatsappTemplates` + `renderTemplate`. Logs `whatsapp_drafted` `customerActivity`. No auto-send. |
| D8 | "Deliveries left" in summary | Count of this week's `plannedDays` with `date ≥ today` not yet delivered. |

---

## 3. Existing Code — Ground Truth (verified against the repo)

### 3.1 Schema (all already present — only **one new field** is required)

- **`orders`** (`convex/schema.ts:306`): already has `subscriptionId?`, `subscriptionWeekId?`,
  `deliveryDate?`, `fundingSource?` (`"subscription_credit" | "deposit" | "normal"`), and
  indexes `by_subscriptionWeek`, `by_subscription`. **NEW field:** `subscriptionCreditApplied?: v.number()`
  (integer IDR reserved/drawn for this order).
- **`subscriptions`** (`:2506`): `scheduleTemplate: Array<{dayOfWeek, items: Array<{menuProductId, qty}>}>`,
  `status` ∈ `draft|active|terminating|ended`, `unitPrice`. Index `by_customer`, `by_status`.
- **`subscriptionWeeks`** (`:2547`): `plannedDays: Array<{date, deliverByTime, items:[{menuProductId, productName, qty, unitPrice, lineTotal}], locked, needsSupplierConfirmation?}>`,
  `status` ∈ `planned|confirmed|invoiced|paid|delivering|reconciled|closed`, denormalized
  `creditIssued/creditConsumed/creditRemaining/creditExpired`. Index `by_subscription_weekStart`.
- **`creditLedger`** (`:2594`): `type` ∈ `topup|drawdown|expiry|refund|adjustment`, `amount`
  **signed** (drawdown is **negative**), `balanceAfter`, `orderId?`. Indexes `by_subscriptionWeek`,
  `by_order`, `by_subscription`.
- **`customerActivity`** (`:2669`): supports `type:"whatsapp_drafted"` + `subscriptionId`/`orderId`/`summary`.

### 3.2 Functions to reuse / extend

| Function | File | Role in this feature |
|----------|------|----------------------|
| `deriveCreditPool(entries)` | `subscriptions/creditMath.ts:52` | Replay ledger → `{creditIssued, creditConsumed, creditRemaining, creditExpired}`. **drawdown amount is negative.** Reuse for the available-credit query. |
| `postLedgerEntry(ctx, {...})` | `subscriptions/ledger.ts:6` | Append a ledger entry + re-derive the week's denormalized pool. Reuse at recognition. |
| `recognizeSubscriptionDelivery(ctx, orderId, createdBy?)` | `subscriptions/recognition.ts:37` | **EXTEND (see §5.3).** Today posts `drawdown = -order.totalAmount`, idempotent via `creditLedger.by_order`. Must draw down `subscriptionCreditApplied ?? totalAmount`. |
| `recognizeOnDelivery(ctx, orderId, actingUserId?)` | `recognition.ts:130` | Single delivery-recognition entry point already called by status mutations. No signature change. |
| `listSubscriptions({customerId})` | `subscriptions/queries.ts:6` | Returns all subscriptions for a customer (no active filter — filter `status==="active"`). |
| `getWeekPool({subscriptionWeekId})` | `subscriptions/queries.ts:36` | Returns `{week, pool, entries}`. Pattern reference for the new context query. |
| `insertOrderWithItems(...)` | `orders/helpers/insertOrder.ts` | Shared order+items write path used by `orders.mutations.create`. Reuse from the new credit-order mutation. |
| `logCustomerInteraction(...)` | `crm/timeline.ts:20` | Logs `whatsapp_drafted` with `subscriptionId`/`orderId`/`summary`. Reuse for the draft-logging. |
| `renderTemplate(str, vars)` | `orders/whatsapp.ts:53` | Variable substitution. **Currently a private fn** — extract to a shared helper to reuse for the credit summary (different variable set). |

### 3.3 Relationship to the existing credit UI — **refactor, do NOT delete** (staffreview C1)

There is **already** a credit flow wired into both surfaces, but it is the **operate** surface for
an *already-open* subscription order, not a creation flow:

- `getOrderCreditStatus({orderId})` (`subscriptions/queries.ts:120`) drives the buttons.
- `applyPartialCreditToAdHocOrder` (`outOfCredit.ts:251`) — **LIVE callers** at
  `src/components/orders/OrderSlideOver.tsx:181` and `src/pages/OrderDetail.tsx:131`.
- `splitScheduledOrderOnCredit` (Path A) — scheduler over-credit split, separate concern.

`applyPartialCreditToAdHocOrder` today **draws down eagerly at apply-time** against
`week.creditRemaining` (no reservation), labels `fundingSource:"deposit"`, leaves the order
`AwaitingPayment` — the documented **IMP-4 inconsistency**: an eager drawdown's `by_order` ledger
row later **suppresses** the at-delivery drawdown (recognition's idempotency guard keys on
`creditLedger.by_order`), so the sale recognizes early.

**Why it's effectively unreachable today:** nothing links a *freshly-created ad-hoc* order to a
subscription, so the precondition (subscription-linked + `AwaitingPayment` + credit remaining) is
rarely met. **The new at-creation flow (`createCreditFundedOrder`, §5.3) is the missing link** that
produces subscription-linked ad-hoc orders.

**Resolution (this spec):**
1. **Refactor `applyPartialCreditToAdHocOrder`** to the reservation model — drop the eager
   `postLedgerEntry`; set `subscriptionCreditApplied` + `fundingSource:"deposit"`, leave recognition
   to delivery. This unifies the post-hoc button and the at-creation flow on **one** model and
   **resolves IMP-4**. Do **not** delete it (it has live callers).
2. Update `getOrderCreditStatus.canApplyCredit` so it does **not** offer a second credit application
   on an order already credit-reserved at creation (`subscriptionCreditApplied` already set).
3. Keep `splitScheduledOrderOnCredit` (Path A) and `coveredQty`/`remainderQty` (pure helpers, still
   used by Path A) untouched. The `subscriptionCreditApplied`-aware recognition (§5.3) is compatible
   with all paths.

---

## 4. Architecture Overview

```
OrderSlideOver / OrderDetail  (mirror — Pitfall #20, no shared Actions component)
  │
  │ customer selected + items present
  ▼
[Q] getSubscriptionCreditContext({ customerId, dueDate, draftItems })
  → per active subscription:
     { subscriptionId, label, weekId, allowedProductIds,
       availableCredit,                      // net of reservations
       split: computeCreditSplit(...) }      // per-line eligibility + buckets
  │
  ▼
Banner renders; staff picks a subscription (if >1) and clicks
  "Fulfil eligible lines using credit"
  │
  ▼
[M] createCreditFundedOrder({ customerId, subscriptionId, items, dueDate, ... })
  → server RE-derives split (never trust client) + re-checks availableCredit
  → insertOrderWithItems(...)                // shared write path
  → patch order: subscriptionId, subscriptionWeekId,
                 fundingSource, subscriptionCreditApplied (= reserved),
                 status/paymentStatus per amountDue
  → NO ledger entry yet (the order row IS the reservation)
  → returns { orderId, creditCovered, amountDue, summary fields }
  │
  ▼  (order proceeds through normal kanban)
BeingPrepared → AwaitingDelivery edge
  → recognizeOnDelivery → recognizeSubscriptionDelivery (EXTENDED §5.3)
     posts drawdown = -(subscriptionCreditApplied ?? totalAmount)
  │
  ▼
[Q] getCreditOrderWhatsappDraft({ orderId })   // manual summary
  → rendered text + [M] logCustomerInteraction(whatsapp_drafted)
```

---

## 5. Detailed Design

### 5.1 Pure helper — `computeCreditSplit` (shared FE + BE)

**Location:** `convex/subscriptions/creditMath.ts` (pure, already the home of credit math;
importable by both Convex and the frontend — the repo already imports `convex/` pure helpers
into `src/` for other features; staffreview to confirm the import seam, else duplicate a
frontend mirror under `src/lib/`).

```ts
export interface CreditSplitLine {
  menuProductId: Id<"menuProducts">;
  qty: number;
  retailUnitPrice: number;  // normal price (off-plan lines bill at this)
  eligible: boolean;        // menuProductId ∈ allowedProductIds
  // eligible lines are RE-PRICED at the subscription partner price (C4):
  effectiveUnitPrice: number; // = subscriptionUnitPrice if eligible, else retailUnitPrice
  lineTotal: number;        // qty * effectiveUnitPrice
}

export interface CreditSplit {
  lines: CreditSplitLine[];
  eligibleSubtotal: number;   // Σ lineTotal where eligible   (at partner price)
  offPlanTotal: number;       // Σ lineTotal where !eligible  (at retail price)
  creditCovered: number;      // min(eligibleSubtotal, availableCredit)
  eligibleShortfall: number;  // eligibleSubtotal − creditCovered
  amountDue: number;          // eligibleShortfall + offPlanTotal
}

export function computeCreditSplit(
  items: { menuProductId: Id<"menuProducts">; qty: number; retailUnitPrice: number }[],
  allowedProductIds: Set<string>,
  subscriptionUnitPrice: number,   // C4 — eligible lines re-priced to this
  availableCredit: number,
): CreditSplit
```

- Integer IDR throughout (`Math.round` on line totals; no floats — C10).
- **C4 — pool denomination.** The credit pool is funded at the subscription's **partner
  `unitPrice`** (planned orders are priced there; `recognizeSubscriptionDelivery` draws
  `order.totalAmount` at that price). So eligible lines MUST be re-priced to
  `subscriptionUnitPrice` for both the split math and the created order line, otherwise a
  retail-priced top-up would draw more value than the prepaid pool holds. Off-plan lines stay at
  `retailUnitPrice` and are paid normally.
- `creditCovered = min(eligibleSubtotal, max(0, availableCredit))`.
- This single function feeds the banner display (FE) **and** the server re-derivation (BE) so the
  two never diverge. Import seam confirmed: `src/` already imports `convex/` pure helpers (e.g.
  `convex/reports/platform`, `convex/expenses/helpers`) — no `src/lib/` mirror needed.

> **Granularity note (D3).** Coverage is on the **eligible subtotal**, not per-unit floor (unlike
> Path A's `coveredQty`). The order is created whole; credit covers a rupiah amount of the eligible
> lines and the rest is due. We do **not** split order items.
> **Confidentiality (D11/I2).** `subscriptionUnitPrice` is `confidentialPrice`. It is consumed
> server-side and embedded in eligible-line totals (unavoidable — the created order shows partner
> price on those lines, consistent with planned subscription orders). The context query must NOT
> return it as a standalone field. Surface is manager/admin only.

### 5.2 Query — `getSubscriptionCreditContext`

**Location:** `convex/subscriptions/queries.ts` (new export). `protectedQuery`,
`roles: ["manager", "admin"]` (matches the Orders surface permission; Pitfall #19 — the
slide-over is reachable by managers).

```ts
args: {
  customerId: v.id("customers"),
  dueDate: v.number(),                 // resolves which week
  draftItems: v.array(v.object({       // current cart, for live split
    menuProductId: v.id("menuProducts"),
    qty: v.number(),
    retailUnitPrice: v.number(),       // normal price; eligible lines re-priced server-side (C4)
  })),
}
returns: Array<{
  subscriptionId, label,
  weekId: Id<"subscriptionWeeks"> | null,
  allowedProductIds: string[],
  availableCredit: number,
  split: CreditSplit | null,           // null when weekId null; eligible lines at partner price (C4)
  plannedDeliveriesRemaining: number,  // D8, for the eventual summary
  // NOTE (I2): partner `subscription.unitPrice` is NOT returned as a field — only IDR figures
  // (availableCredit, creditCovered, line totals). It is confidentialPrice.
}>
```

**Logic:**
1. `listSubscriptions({customerId})` → filter `status === "active"`.
2. For each active sub, resolve the **current week**:
   `subscriptionWeeks` by `by_subscription_weekStart` where `weekStart ≤ dueDate ≤ weekEnd`
   **and** `status ∈ {paid, delivering}` (funded, still open). No covering funded week →
   `weekId = null`, `availableCredit = 0`, `split = null` (banner shows "no credit available
   this week").
   > Staffreview check: confirm the funded-and-open status set. `creditIssued > 0` happens at
   > `markWeeklyInvoicePaid` (status → `paid`); `delivering` is mid-week. `invoiced`/`confirmed`
   > are not yet funded; `reconciled`/`closed` are terminal. If a funded week can legitimately
   > sit in another status, widen the set.
3. `allowedProductIds` = distinct `menuProductId` across `subscription.scheduleTemplate[].items`
   (string form for Set membership).
4. **availableCredit (reservation-aware, D5):**
   ```
   pool = deriveCreditPool(ledger entries for weekId)         // replayed remaining
   reserved = Σ over orders WHERE
                order.subscriptionWeekId == weekId
                AND (order.subscriptionCreditApplied ?? 0) > 0
                AND order.status != "Cancelled"
                AND order has NO creditLedger row by_order (not yet recognized)
              of (order.subscriptionCreditApplied)
   availableCredit = max(0, pool.creditRemaining − reserved)
   ```
   Query orders via `orders.by_subscriptionWeek`. The "not yet recognized" test = no
   `creditLedger` row for that `orderId` (`by_order`).
   > This reserves for **all** un-recognized credit orders in the week — planned orders too
   > carry credit they will draw at delivery. Netting them is what prevents an ad-hoc order
   > from eating credit already committed to undelivered planned deliveries.
   > **C3 — netting invariant.** `pool.creditRemaining` already excludes *recognized* drawdowns
   > (their ledger rows are in the replay). `reserved` counts only *un-recognized* credit orders
   > (the `by_order` "no ledger row yet" test). A historical order the old eager path already drew
   > down has a `by_order` row → excluded from `reserved` (no double count). Test this explicitly.
5. `split = computeCreditSplit(draftItems, Set(allowedProductIds), subscription.unitPrice, availableCredit)`
   — eligible lines re-priced to the partner `unitPrice` (C4).
6. `plannedDeliveriesRemaining` (D8) = count of `week.plannedDays` with `date ≥ startOfTodayWIB`
   that are not yet delivered. "Not delivered" = the planned day's generated order has not
   reached `AwaitingDelivery`/`Complete` (resolve via `orders.by_subscriptionWeek` matched on
   `deliveryDate`/date), else fall back to `date ≥ today` count. Use the WIB day helper
   `getWibDateStr` (`convex/lib/periodRange.ts`) for "today".

### 5.3 Mutation — `createCreditFundedOrder`

**Location:** new `convex/subscriptions/creditOrder.ts`. `protectedMutation`,
`roles: ["manager", "admin"]`.

```ts
args: {
  customerId: v.id("customers"),
  subscriptionId: v.id("subscriptions"),
  items: v.array(orderItemInput),     // reuse convex/orders/validators
  dueDate: v.number(),
  soldBy: v.optional(v.string()),
  notes: v.optional(v.string()),
  // ...mirror the order-create fields the slide-over already collects
}
returns: { orderId, creditCovered, amountDue, offPlanTotal, eligibleShortfall }
```

**Handler (server is the source of truth — re-derive everything):**
1. Load subscription; assert `status === "active"` and `customerId` matches.
2. Resolve current funded week (same logic as §5.2 step 2). No funded week → `ConvexError`
   ("No funded subscription week covers this date"). **Use `ConvexError`, not `Error`**
   (Pitfall: plain `Error` → opaque "Server Error" in prod — see lesson
   `lesson_convex_error_masking_slot_contract`).
3. Recompute `availableCredit` (reservation-aware) and `split = computeCreditSplit(items,
   allowedProductIds, subscription.unitPrice, availableCredit)` **server-side**. Ignore any
   client-supplied amounts. Eligible lines re-priced to the partner `unitPrice` (C4).
4. Create the order + items via `insertOrderWithItems` (shared write path). Eligible-line
   `unitPrice` = `subscription.unitPrice`; off-plan lines = retail. `order.totalAmount =
   eligibleSubtotal(partner) + offPlanTotal(retail)` (full value; credit is recorded separately
   via `subscriptionCreditApplied`, not by shrinking the order).
5. Patch subscription linkage on the order:
   - `subscriptionId`, `subscriptionWeekId = weekId`, `deliveryDate = dueDate`.
   - `subscriptionCreditApplied = split.creditCovered` (the **reserved** amount, partner-priced).
   - **`fundingSource` + status (C2) — the order is created AFTER the week is funded
     (`delivering`), so `markWeeklyInvoicePaid` will never sweep it; set its funded state directly:**
     - `amountDue === 0` (fully covered) → mirror `markWeeklyInvoicePaid`'s exact triple
       (`invoicing.ts:270-280`): `{ fundingSource:"subscription_credit", paymentStatus:"Paid",
       paymentMethod:"subscription_credit", status:"PaymentReceived" }` → flows into production,
       nothing due.
     - `creditCovered > 0 && amountDue > 0` → `{ fundingSource:"deposit", status:"AwaitingPayment",
       paymentStatus:"Unpaid" }`; remainder via normal QRIS/bank (mirrors refactored Path B).
     - `creditCovered === 0` → reject (step 7); the credit button is disabled in this state.
   > **IMP-3 (C2).** `markWeeklyInvoicePaid` sets that triple via a deliberate **raw `db.patch`**,
   > bypassing `statusUpdates` side-effects (packaging stock reservation, status-transition audit,
   > kitchen-visibility) — subscription-order packaging reservation is DEFERRED. The
   > `amountDue === 0` branch must follow the **same deliberate bypass** (do NOT route through
   > `statusUpdates`); packaging reservation for these ad-hoc orders stays deferred too. Decoupled
   > status/paymentStatus must BOTH be set (Pitfall `lessons_phase_84`).
6. **No ledger entry here.** The order row is the reservation (D5). The drawdown posts at
   delivery (§5.3 recognition extension).
7. If `creditCovered === 0` (caller invoked credit flow but nothing is eligible / no credit):
   either reject with a clear `ConvexError` ("No credit-eligible lines") OR create a plain
   order with no subscription linkage. **Decision:** reject — the UI should not enable the
   credit button when `creditCovered === 0`; the mutation enforces it defensively.

**Recognition extension (`recognition.ts:37`):**

```diff
- amount: -order.totalAmount,
+ const drawdownAmount = order.subscriptionCreditApplied ?? order.totalAmount;
+ // ...funded-pool warning compares against drawdownAmount, not totalAmount...
+ amount: -drawdownAmount,
```

- Planned orders have `subscriptionCreditApplied === undefined` → fall back to `totalAmount`
  (**behavior-preserving**).
- Ad-hoc credit orders draw down exactly the reserved `subscriptionCreditApplied` (≤ total),
  so off-plan + shortfall value is never drawn from credit.
- The under-funded `console.warn` guard (`recognition.ts:83`) must compare
  `priorPool.creditRemaining < drawdownAmount`.
- Idempotency (`by_order`) unchanged: one drawdown per order; cancel-before-delivery posts
  nothing and the reservation simply disappears (order is `Cancelled`, excluded from
  `reserved`).

### 5.4 WhatsApp summary — `getCreditOrderWhatsappDraft`

**Location:** `convex/subscriptions/creditOrder.ts` (query). `protectedQuery`,
`roles:["manager","admin"]`.

- New template seeded into `whatsappTemplates` with code `SUBSCRIPTION_CREDIT_TOPUP`
  (follow the existing seed pattern in `convex/whatsappTemplates/`).
- Variables: `{customerName}`, `{itemsText}`, `{creditUsed}` (= `subscriptionCreditApplied`,
  formatted IDR), `{creditRemaining}` (= `availableCredit` **after** this order's reservation),
  `{plannedDeliveriesRemaining}` (D8).
- Reuse the substitution logic: **extract `renderTemplate` from `orders/whatsapp.ts` into a
  shared helper** (e.g. `convex/whatsappTemplates/render.ts`) so both order and subscription
  drafts use one implementation (no copy-paste — repo discipline, cf. shared `packChunks`
  lesson).
- The FE "Send WhatsApp summary" action: fetch the draft text, open `wa.me`/copy (existing
  StepWhatsAppTemplate UX), then call `logCustomerInteraction({ type:"whatsapp_drafted",
  customerId, subscriptionId, orderId, summary })`.

### 5.5 Frontend — slide-over + detail (Pitfall #20: wire BOTH)

**`src/components/orders/OrderSlideOver.tsx`** and **`src/pages/OrderDetail.tsx`** — each
renders its own Actions/section; mirror by hand. Extract the banner + button into a shared
**presentational** component `src/components/orders/SubscriptionCreditBanner.tsx` to minimize
divergence (data via the shared hook; both surfaces render the same component).

Banner states (D12 — design every state):
- **No active sub** → banner not rendered.
- **Active sub, no funded week** → "Active subscription — no credit available this week."
- **Active sub, credit available, all eligible, credit ≥ subtotal** → button
  "Fulfil using credit (nothing due)".
- **Partial** → "Credit covers Rp X · Rp Y due" + per-line ✓/✗ markers; button "Fulfil
  eligible lines using credit".
- **2+ subs (D6)** → list each with its credit figure; require explicit pick before the
  button enables.
- **Loading / error** states on the context query.

Hook: `useSubscriptionCreditContext(customerId, dueDate, draftItems)` wrapping the query with
the standard loading/skip pattern. **Default `mode:"skip"`** until a customer is selected
(Pitfall #19 — avoid manager-mount crashes; the query roles already match, but skip-until-needed
keeps it clean).

The post-create WhatsApp action appears after the order is created (both surfaces).

---

## 6. Data Flow — "Reflected in subscription details"

Because the ad-hoc order carries `subscriptionWeekId`, the existing CRM week views already
surface it:
- The week's **credit ledger** (`getWeekPool` entries) shows the `drawdown` row after delivery.
- Orders linked to the week (`orders.by_subscriptionWeek`) list the ad-hoc order alongside
  planned ones.
- **`plannedDays` quantities are never touched** (D1). "Reflected like a CRM amend" = the
  credit movement + linked order, not a plan edit.

No new CRM surface is required; staffreview to confirm the week/subscription page already
iterates `orders.by_subscriptionWeek` (if it filters to planned-only, widen it to include
ad-hoc credit orders).

---

## 7. Edge Cases & Invariants

| Case | Behavior |
|------|----------|
| Two un-delivered credit orders, same week | Second order's `availableCredit` already nets the first's reservation → no double-spend (D5). |
| Order cancelled before delivery | No ledger entry ever posted; reservation disappears (excluded by `status != Cancelled`). Credit returns to `availableCredit`. |
| Order edited after creation (qty/items change) | Out of scope for v1 — `subscriptionCreditApplied` is fixed at creation. Flag in plan: either block editing credit orders or recompute on edit (defer recompute). |
| Off-plan-only cart | `creditCovered === 0` → credit button disabled; mutation rejects if forced. Plain order via normal flow. |
| Credit ≥ full eligible subtotal | `amountDue` may still be > 0 if off-plan lines exist; only eligible lines are credit-covered. |
| Multiple active subs, same product | Staff pick which subscription's credit to use (D6). Reservation/recognition target that sub's week. |
| Week unfunded at delivery | Recognition still posts the drawdown and `console.warn`s (existing under-funded invariant) — never silently drops the sale. |
| Integer IDR | All money integer IDR; `creditCovered = min(eligibleSubtotal, availableCredit)`; no floats (C10). |
| Confidential `unitPrice` (D11) | The context query returns only `availableCredit` + line eligibility, not the partner `unitPrice`, unless the surface already exposes order prices (it does — staff see order line prices). No new partner-price leak. |

---

## 8. Testing Strategy

**Backend (Vitest + convex-test):**
- `computeCreditSplit` pure unit tests: all-eligible/credit-covers; all-eligible/partial;
  mixed eligible+off-plan; off-plan-only (creditCovered 0); zero availableCredit; integer-IDR
  rounding.
- `getSubscriptionCreditContext`: no sub; sub w/o funded week; funded week; reservation netting
  (one un-recognized order reduces availableCredit); cancelled order excluded; recognized order
  excluded (its drawdown already in pool); multi-sub.
- `createCreditFundedOrder`: full-cover (`subscription_credit`, no AwaitingPayment); partial
  (`deposit`, AwaitingPayment, remainder = amountDue); off-plan-only reject; server re-derive
  ignores tampered client amounts; sets `subscriptionCreditApplied`.
- Recognition extension: ad-hoc order draws `subscriptionCreditApplied` (not total); planned
  order still draws `totalAmount` (regression); idempotent; cancel-before-delivery posts
  nothing; double-order reservation then both deliver → pool nets correctly.
- WhatsApp draft render: variables substituted; `creditRemaining` reflects post-reservation.
- Path B removal: no remaining callers; helpers `coveredQty`/`remainderQty` retained.

**Frontend:** banner state rendering per §5.5; button enable/disable gating; mirror parity
test (banner present in both OrderSlideOver and OrderDetail).

**Persona-UAT (live env, FE journey):** select subscription customer in slide-over → see
banner → fulfil with credit (full + partial) → deliver → verify drawdown in CRM week → draft
WhatsApp. Run at execution close-out (`/persona-uat`).

---

## 9. Success Criteria

- [ ] `npm run type-check` and `npm run build` pass.
- [ ] Selecting a subscription customer in **both** OrderSlideOver and OrderDetail shows the
      credit banner with correct available credit (reservation-netted).
- [ ] Eligible lines fulfil from credit; off-plan lines flagged + paid normally; partial works.
- [ ] No double-spend across two un-delivered credit orders in the same week.
- [ ] Drawdown posts at delivery for exactly `subscriptionCreditApplied`; planned orders
      unchanged (regression green).
- [ ] CRM week shows the ad-hoc credit order + drawdown ledger row; `plannedDays` unchanged.
- [ ] WhatsApp summary renders correct figures and logs `whatsapp_drafted`.
- [ ] `applyPartialCreditToAdHocOrder` removed with no broken references; recognition path
      unified on `subscriptionCreditApplied`.

---

## 10. Open Questions — RESOLVED by staffreview (2026-06-29)

1. **Funded-week status set** — `markWeeklyInvoicePaid` (`invoicing.ts:281`) sets the funded week
   to **`delivering`**; tests/fixtures also use `paid`. Set = **`{paid, delivering}`**. ✅ Resolved.
2. **Funded-order status** — NOT `confirmWeek` (that sets `AwaitingPayment`). The funded triple is
   `markWeeklyInvoicePaid`'s `{paymentStatus:"Paid", paymentMethod:"subscription_credit",
   status:"PaymentReceived"}` (raw patch, IMP-3). Folded into §5.3 step 5. ✅ Resolved (C2).
3. **Pure-helper import seam** — `src/` already imports `convex/` pure helpers (e.g.
   `convex/reports/platform`, `convex/expenses/helpers`). No mirror needed. ✅ Resolved.
4. **Path B** — NOT dormant; **live callers** at `OrderSlideOver.tsx:181` + `OrderDetail.tsx:131`
   (operate UI for existing orders). **Refactor to reservation model, do not delete.** Folded into
   §3.3. ✅ Resolved (C1).
5. **`plannedDeliveriesRemaining` "delivered" test** — planned day delivered when its generated
   order has reached `AwaitingDelivery`/`Complete`; else `date ≥ todayWIB`. §5.2 step 6 + review I1.
6. **CRM week order list** — still verify at plan-time whether the subscription/week page lists
   `orders.by_subscriptionWeek` including non-planned orders, or needs widening to show ad-hoc
   credit orders. (Lower risk — additive display.) ⏳ Plan-time check.

### Note — existing operate UI vs new creation banner (review I3)
The new credit banner renders during **order building** (`customerId` + `draftItems`, no `orderId`).
The existing `getOrderCreditStatus` operate UI keys on an **existing `orderId`**. These are two
distinct contexts within the same components; the plan wires the banner into the creation branch in
**both** `OrderSlideOver.tsx` and `OrderDetail.tsx` (Pitfall #20).
