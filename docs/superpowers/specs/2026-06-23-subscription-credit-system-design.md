# Subscription & Credit System — Design Spec

**Date:** 2026-06-23
**Status:** Greenlit (2026-06-23) — §13 open questions resolved; planning in progress (spec→plan pipeline)
**Companion mockup:** `docs/superpowers/specs/2026-06-23-subscription-credit-mockups.html` (open in browser; has a proofing room for inline comments)
**Driving contract:** `Frollie × Amsterdamn Cafe Supply Agreement` (vFinal ID) — first real instance

---

## 1. Problem & Goal

Frollie has B2B customers (cafés, etc.) who want **regular recurring deliveries** (day-to-day / week-to-week) billed against a **prepaid weekly credit**, not per-order payment. We need to:

1. Manage **subscriptions** (the standing supply arrangement + contract terms) per customer.
2. **Automate ordering** on a schedule (which products, how many, what days/times).
3. **Bill via credit**: invoice a weekly credit amount; every order linked to the customer that week **draws down** that credit instead of asking for payment.
4. **Remind managers** (Telegram) of the recurring actions (confirm schedule, send invoice, deliver, reconcile).
5. Give the team a **CRM surface** to manage customers, subscriptions, credit, invoices, agreements, and order history.

**Generalised model (user's words):** *"Each customer can have a credit subscription — every week they'll be invoiced for X credit, and for every order made that week linked to their name the credit is drawn down instead of asking for payment. There's also an automated ordering system: we map how many they want and at what times."*

---

## 2. The driving contract → system mapping

The Amsterdamn agreement defines the terms the system must manage. Each clause maps to a mechanism:

| # | Contract term | System mechanism |
|---|---|---|
| 1 | 1,050 pcs/wk @ Rp 29,000 = **Rp 30,450,000, paid every Monday in advance**; price confidential | Subscription config: `unitPrice`, `weeklyQty`, `weeklyCreditAmount` (derived from schedule), `billingModel: prepaid_weekly_credit`, `paymentDueDay: Mon`, `confidentialPrice` |
| 2 | 150 pcs/day default, delivered by **09:00** | `baselineDailyQty=150`, `deliverByTime`, 7 auto-generated daily delivery orders |
| 3 | Qty changes need notice **before 13:00 the day before** | Per-day **edit lock** flipping at 13:00 on D-1 |
| 4 | Above-baseline / same-day adds need **Frollie confirmation** | `needsSupplierConfirmation` flag when qty > baseline |
| 5 | Permanent baseline change effective **14 days after written notice** | Effective-dated baseline change (`effectiveDate = noticeDate + 14d`) |
| 6 | **Every Sunday** both sides confirm next week's daily schedule | Weekly cycle `planned → confirmed`; Sunday reminder + confirm action |
| 7 | **Weekly credit must be consumed in-week, non-transferable; Frollie-fault shortfall → refund** | Per-week **credit pool** + ledger; expiry on unused; `shortfallFault`/`refundDue` on reconcile. **Rollover configurable** (default expire) |
| 8 | Price tied to COGS; rise needs mutual agreement | `cogsBasis` snapshot + COGS-rise alert before any price change |
| 9 | Marketing asset reuse with credit | Out of scope (process, not data) |
| 10 | Week-to-week; **30-day written termination notice** | `status`, `terminationNoticeDate`, `endDate = notice + 30d` |

---

## 3. Architecture overview

Two coupled subsystems, both reusable primitives (Amsterdamn is instance #1):

- **Credit wallet** (money): weekly credit pool + append-only ledger. Invoices fund it; orders draw it down.
- **Automated ordering schedule** (fulfilment): per-day, per-product plan that generates real orders and **computes the credit amount**.

**Core invariant:** `schedule total = invoice total = credit granted`. The schedule is the single source of truth; the credit amount is *derived*, never re-keyed. Mid-week changes (top-ups, splits) are deltas to the schedule.

---

## 4. Data model (new tables + changes)

### 4.1 `subscriptions` (new)
The standing agreement / config per customer.

- `customerId: Id<"customers">`
- `label: string` (e.g. "Dubai Chewy Cookies — weekly")
- `status: "draft" | "active" | "terminating" | "ended"`
- `billingModel: "prepaid_weekly_credit"` (extensible literal union)
- `unitPrice: number` (partner price, e.g. 29000) — **confidential**. Overrides the per-product default (`menuProducts.defaultPrice`, `convex/schema.ts`) for all schedule lines.
- `confidentialPrice: boolean`
- `baselineDailyQty: number` (e.g. 150) — drives §11 above-baseline detection (`needsSupplierConfirmation` when a day's qty > baseline) and the Sunday reminder default.
- `weeklyQty: number` (e.g. 1,050) — derived from `scheduleTemplate` (sum of items × days); stored denormalised for the agreement key-terms snapshot (§4.6) and quick display.
- `deliverByTime: string` (e.g. "09:00", WIB)
- `creditRolloverPolicy: "expire" | "rollover"` (default `expire` per clause 7)
- `rolloverExpiryWeeks?: number` (default `4`; only meaningful when `creditRolloverPolicy = "rollover"`; `null`/`undefined` ⇒ never expires — explicit opt-out, see §13.1). Rolled-over credit is consumed **FIFO (oldest week first)** so expiry is deterministic.
- `changeCutoff: { hour: 13, dayOffset: -1 }` (13:00 day-before)
- `permanentChangeNoticeDays: number` (14)
- `terminationNoticeDays: number` (30)
- `cogsBasis: number` (COGS that justified the price; for clause-8 alert)
- `startDate: number`, `terminationNoticeDate?: number`, `endDate?: number`
- `agreementId?: Id<"supplyAgreements">` (optional link — §4.6)
- `scheduleTemplate: Array<{ dayOfWeek: 0–6, items: Array<{ menuProductId, qty }> }>` — default weekly pattern seeding each new week
- `createdBy`, `notes`
- **Indexes:** `by_customer`, `by_status`

### 4.2 `subscriptionWeeks` (new)
One row per ISO week per subscription. Holds the confirmed schedule + the credit pool + reconciliation.

- `subscriptionId: Id<"subscriptions">`
- `weekStart: number` (Monday, WIB), `weekEnd: number` (Sunday)
- `status: "planned" | "confirmed" | "invoiced" | "paid" | "delivering" | "reconciled" | "closed"`
- `plannedDays: Array<{ date: number, deliverByTime: string, items: Array<{ menuProductId, productName, qty, unitPrice, lineTotal }>, locked: boolean }>`
- **Credit pool (derived/denormalised from ledger):** `creditIssued`, `creditConsumed`, `creditRemaining`, `creditExpired`, `shortfall`, `shortfallFault: "none" | "cafe" | "frollie"`, `refundDue: number`, `refundStatus`
- `confirmedAt?`, `confirmedBy?`
- `weeklyInvoiceId?: Id<"invoices">`
- `paymentReceivedAt?`
- **Indexes:** `by_subscription_weekStart`, `by_status`

### 4.3 `creditLedger` (new, append-only — source of truth)
Every credit movement is one immutable entry. Pool fields above are derived from replay.

- `subscriptionId`, `subscriptionWeekId`
- `type: "topup" | "drawdown" | "expiry" | "refund" | "adjustment"`
- `amount: number` (signed: + topup/refund-in, − drawdown/expiry)
- `balanceAfter: number`
- `orderId?: Id<"orders">` (drawdown), `invoiceId?: Id<"invoices">` (topup)
- `rolloverFromWeekId?: Id<"subscriptionWeeks">` (set on the carry-forward `topup` entry when `creditRolloverPolicy = "rollover"`; lets reconcile trace + FIFO-expire carried credit within `rolloverExpiryWeeks`)
- `createdAt`, `createdBy`, `note?`
- **Indexes:** `by_subscriptionWeek`, `by_subscription`, `by_order`

### 4.4 `orders` (changes)
Daily deliveries reuse the existing `orders`/`orderItems`/production pipeline. Add:

- `subscriptionId?: Id<"subscriptions">`
- `subscriptionWeekId?: Id<"subscriptionWeeks">`
- `deliveryDate?: number`
- `fundingSource?: "subscription_credit" | "deposit" | "normal"` (how it was paid)
- **Behaviour:** when funded, a subscription order auto-sets `paymentStatus: "Paid"`, `paymentMethod: "subscription_credit"`, and writes a `drawdown` ledger entry (`qty × unitPrice`).
- **Partner price on `orderItems` (staffreview I3):** the generated order's `orderItems` carry the subscription **partner `unitPrice`** so `orders.totalAmount` (DERIVED sum of `orderItems.lineTotal`) equals the credit drawdown — otherwise the order total and the drawdown diverge.
- **Analytics isolation (staffreview I3):** 1,050 pcs/wk at a confidential B2B price must NOT pollute the existing sales/margin/channel reports (`/financials`, platform analytics). Subscription orders are identified by `subscriptionId`/`fundingSource` and either excluded or bucketed as a distinct channel; BOM ball-counting (Pitfall #11/#13) must still resolve for these products. **Audit every revenue/margin aggregation for subscription leakage before Phase B merge.**
- **Index:** `by_subscriptionWeek`

### 4.5 `invoices` (changes)
> **Staffreview C1/C2 (grounded):** today the invoice model is strictly **1-invoice ↔ 1-order** — `invoices.orderId` is **required** (`convex/schema.ts:2265`) and `createDraft`/`finalize` (`convex/invoices/mutations.ts:145,372`) build `items` from the order's `orderItems` via `by_order`. A weekly subscription invoice covers 7 days × many orders (which may not exist yet at confirm time) and has no single owning order. The changes below make that explicit.

- **`orderId` → optional** (`v.optional(v.id("orders"))`). Standard order invoices keep it; subscription-weekly/top-up invoices leave it null and rely on `subscriptionWeekId`. **Audit every consumer of `invoice.orderId` / `.withIndex("by_order")` for null-tolerance before merge.**
- `subscriptionWeekId?: Id<"subscriptionWeeks">` (nullable) — lets ONE invoice represent a week's credit covering MANY orders. Solves the invoice→many-orders gap.
- `invoiceKind?: "standard" | "subscription_weekly" | "subscription_topup"` — flags top-up invoices in UI/ledger/flows.
- **`items[].date?: number`** — add an optional `date` to the existing `items` object (`{ productName, variant?, qty, unitPrice, lineTotal }`, `convex/schema.ts:2287`). Optional ⇒ existing standard invoices (date null) render flat as today; the visual weekly invoice groups/sorts lines by `date`. Multi-product days produce multiple lines under the same date.
- **New builder, existing path untouched:** keep `createDraft`/`finalize` as-is for standard order invoices. Add `createSubscriptionWeeklyInvoice({ subscriptionWeekId })` that builds `items` from `subscriptionWeeks.plannedDays` (NOT from `orderItems`), reuses `getNextInvoiceNumber`/`invoiceCounters` for the `INV-YYMM-NNN` series, sets `invoiceKind`, and leaves `orderId` null.
- Numbering: keep existing `INV-YYMM-NNN` series.

### 4.6 `supplyAgreements` (new)
Signed contract stored with the customer.

- `customerId`, `subscriptionId?` (bi-directional link)
- `fileStorageId: Id<"_storage">` (the PDF), `fileName`, `fileSize`, `uploadedBy`, `uploadedAt`
- `status: "draft" | "signed" | "expired" | "terminated"`
- `signedDate?`, `governingLaw?`, `signatories?: string`
- **Key terms snapshot** (drives subscription defaults): `weeklyQty`, `unitPrice`, `weeklyCreditAmount`, `baselineDailyQty`, `deliverByTime`, `changeCutoff`, `permanentChangeNoticeDays`, `terminationNoticeDays`, `creditRolloverPolicy`, `termType`
- `versions?: Array<{ fileStorageId, fileName, uploadedAt, lang: "id" | "en" }>` (ID + EN counterparts)
- **Index:** `by_customer`, `by_subscription`

### 4.7 `customers` (changes)
Crisp CRM contact data (additive to existing fields):

- existing: `name`, `phone`, `companyName`, `npwp`, `billingAddress`, `defaultAddress`, `notes`
- add: `keyContactName`, `keyContactRole`, `whatsapp`, `email`, `instagram`, `otherSocials` (array of `{platform, handle, url}`), `deliveryAddress`, `storeAddress`, `otherAddresses` (array), `altPhone`
- All contact/social fields render as **clickable links** (wa.me / mailto / IG / TikTok).

---

## 5. CRM surface & navigation

New **CRM** area (`/crm`). Manager & admin only.

- **CRM home dashboard:** across all customers — *"who hasn't paid / what credit still needs funding"* (invoices awaiting payment → fund credit), plus active subscriptions overview.
- **Customer record** (`/crm/customers/:id`): contact & company, addresses & notes, this-week credit gauge, subscriptions list (each links to its page), invoices & funding to-action, quick actions (prominent: Plan schedule, Mark invoice paid → fund, Settings).
- **Subscription page** (`/crm/customers/:id/subscriptions/:subId`): schedule, credit ledger, weeks, settings.
- **Agreement page**, **Schedule calendar**, **Invoice page**, **Order history** (per customer).

### Navigation principle (note c16) — *everything linkable + breadcrumbs*
- **Chevron breadcrumb trail** on every CRM page, each segment a link back to the parent; the trail accumulates as you drill in (`CRM › Customers › Amsterdamn Cafe › Invoices › INV-2606-014`).
- **Any object reference is a link** to that object's page: subscription name → subscription page, invoice number → invoice, agreement → document, order/day → scheduler, customer → customer record. Contact handles → external links.

---

## 6. Automated ordering schedule

- **Schedule calendar** (note: calendar-style, not a table): a Mon→Sun week grid with **real calendar dates** (month shown across boundaries), planning the *week after*.
- Each day cell holds one or more **products chosen from a dropdown sourced from the POS `menuProducts`** (Original, Bite Sized Single/Double/Triple, Dubai Chewy Cookies, Matcha, …), each with a quantity, **unit price, and line subtotal**; a **day subtotal**; "+ add product" for multi-product days.
- Unit price defaults from the product but the subscription's confidential partner price overrides it.
- **Seed a new week from one of three sources** (note r1.c1 — managers who deviated from the template last week want to repeat *last week's actuals*, not re-derive from the template):
  - **(a) Default template** — the subscription's `scheduleTemplate` (today's only path).
  - **(b) Copy last week** — one-click; seeds `plannedDays` from the **most recent prior `subscriptionWeeks` row's actual `plannedDays`** (carrying products + qty, re-priced at the current `unitPrice`). This is the common case for a steady supply relationship that drifts off-template week to week.
  - **(c) Blank week** — start empty.
  - Backend: `seedWeek` gains `source: "template" | "previousWeek" | "blank"` (default `"template"`); `"previousWeek"` reads the latest prior week by `by_subscription_weekStart` and re-runs line construction at the live `unitPrice` (so a price change since last week is honoured). Idempotency (one week row per `weekStart`) is unchanged; an already-seeded week is never silently overwritten — re-seed requires the week still be `planned` and is an explicit manager action.
- **Week total drives the credit invoice** (schedule = invoice = credit).
- **Confirm → generate orders + invoice** in one action.

### Single edit path (note c23)
- Subscription orders flow through the normal kitchen/production **kanban**, but render in a distinct **"🔒 Subscription"** style and are **read-only there** — no edit/status/delete controls, only an **"Open in scheduler"** link.
- Quantity/product/credit changes happen **exclusively** in the schedule calendar, so kanban actions can never desync the credit pool. Staff still produce/fulfil; status auto-advances.

---

## 7. Billing, credit & the weekly cycle

### Weekly lifecycle (states on `subscriptionWeeks`)
`planned` (Sun seed) → `confirmed` (Sun confirm) → `invoiced` (auto-gen) → `paid` (Mon payment) → `delivering` (Mon–Sun) → `reconciled` (week end) → `closed`.

### Visual weekly invoice (customer-facing)
- **Day-by-day card layout** so the customer sees exactly what arrives each day; per-product **unit price + line subtotal**, per-day subtotal, week total = credit granted.
- Doubles as the week's **delivery confirmation**.
- **1-click send:** render to **PDF/PNG** and push to the customer's saved **WhatsApp** or **email** in one tap; also Print/PDF.
- "Mark paid → fund credit" posts the `+topup` ledger entry and flips that week's orders to Paid.
- **Manager & admin only.**

### Drawdown
Every order linked to the customer that week consumes the pool (`qty × unitPrice` per line). Funded subscription orders auto-Paid via credit.

### Credit drawdown chart (note c24)
- On the **customer dashboard**, **summing the customer's per-subscription pools for display** (each pool stays ring-fenced; this is a visual roll-up, not a shared balance).
- Dual series / dual axis: **bars = pcs/day** (left), **line = credit remaining in Rp** (right).
- **Solid = delivered; dashed & lighter = planned** (future days), with a "today" divider.
- **Flags leftover credit** if the projected line won't reach zero by Sunday (they under-ordered).

### Midweek top-up (note c9) — schedule-driven
- No standalone top-up form. **Edit the current week's schedule** (add days/qty/products).
- If new total > funded credit, system prompts *"This will be a top-up credit for this week"* → same confirm → invoice journey, generating a **top-up invoice for only the delta** (`invoiceKind: subscription_topup`), flagged in invoice + ledger + flows.
- Credit pool = weekly invoice **+** any top-up invoices, all posting `topup` entries against the same `subscriptionWeek`.

### Reconciliation (clause 7)
At week end: `shortfall = issued − consumed`. Manager attributes fault:
- **Cafe under-ordered** → unused credit `expiry` entry (non-transferable, no refund) unless `creditRolloverPolicy = rollover` (then carry forward as a `rolloverFromWeekId`-tagged `topup` on the next week, FIFO-consumed, itself expiring after `rolloverExpiryWeeks` — §13.1).
- **Frollie supply failure** → `refundDue` flagged, `refund` entry on payout.

---

## 8. Out-of-credit handling (notes c11, c25)

Two paths, shortfall always **flagged** first:

- **Path A — scheduled order short on credit** (editable only in scheduler): flag partial fulfilment on that day → **split the order** so only the credit-covered portion bills against remaining credit → the **remainder + rest-of-week plan becomes a new invoice** sent to the customer (same top-up journey). Split happens in the scheduler, never on the kanban.
- **Path B — ad-hoc order** (normal flow): apply whatever credit is left + **collect the remainder via the existing normal/QRIS payment flow** (no new deposit record — see §13.2). The applied-credit portion posts a `drawdown` ledger entry; the uncovered remainder falls back to normal billing (`AwaitingPayment`) and is collected through the existing payment infrastructure (Phase 84 `qrisPayments` / bank transfer). `fundingSource: "deposit"` labels such a part-credit/part-cash order. Or issue a schedule top-up. Auto-resumes next week.

---

## 9. Manager reminders — Telegram

New `subscription-ops` role added to `KNOWN_TELEGRAM_ROLES` (`convex/telegram/config.ts:8`, currently `["pack-list","sales-updates"]`) — follow **Pitfall #21** (extend the registry, no new env var; operator assigns the group via `/admin/telegram-chats`) and **Pitfall #22** (any new bot command needs a `COMMAND_POLICY` entry). Crons (WIB):

- **Sun 17:00** — confirm next week's schedule → generates orders + invoice.
- **Mon 08:00** — weekly credit invoice due (prepaid); send + mark paid.
- **Daily 07:00** — today's subscription deliveries (with per-product split, by 09:00).
- **Daily 12:30** — 13:00 change cutoff for tomorrow.
- **Mon 09:00** — prior-week reconcile (shortfall + fault attribution).

Each reuses the **existing resilient send pattern** from `convex/telegram/salesSummary/` (the `*Resilient` action + 15-min watchdog, plus the transient-retry fix from PR #175) — do not re-roll retry/watchdog logic.

---

## 10. Access control

**All subscription / credit / invoice / CRM / agreement / schedule surfaces are manager & admin only.** Order staff and kitchen never see partner pricing or credit balances. Backend `roles` on every query/mutation must be `["manager","admin"]` (or tighter), aligned with route `requiredPermission` (see CLAUDE.md Pitfall #19). Subscription orders appear on the kanban (staff can produce) but expose no pricing/credit and no edit controls.

---

## 11. Rule-enforcement layer (clauses 3–5, 8, 10)

- **13:00 prior-day lock** on each day's order (Phase 2: hard enforce; Phase 1: warn + flag).
- **Above-baseline** day → `needsSupplierConfirmation`.
- **Permanent baseline change** scheduled at `noticeDate + 14d`.
- **Termination** at `noticeDate + 30d` → stop generating weeks.
- **COGS-rise alert** when product COGS > `cogsBasis` → flag price renegotiation before any change.
- **Confidential price** hidden from non-managers.

---

## 12. Roadmap (explicitly deferred)

- **Generate boilerplate supply agreements** from subscription characteristics for future customers (note c3) — roadmap, not this build.

---

## 13. Open questions / assumptions to confirm

1. ~~Rollover semantics~~ **RESOLVED (2026-06-23): bounded rollover horizon.** When `creditRolloverPolicy = "rollover"`, carried credit expires after `rolloverExpiryWeeks` (default **4**), consumed **FIFO (oldest week's credit drawn down first)** so expiry is deterministic. Setting `rolloverExpiryWeeks = null` is an explicit opt-out ⇒ never expires (use sparingly — unbounded credit is an untracked liability). Default subscription policy remains `expire` (clause 7 spirit: in-week consumption); rollover is opt-in per subscription. Mechanism: on week-end reconcile, unconsumed credit either posts an `expiry` entry (policy `expire`, or rolled credit past its horizon) or carries forward as a fresh `topup`-typed entry tagged `rolloverFromWeekId` against the next open `subscriptionWeek` (policy `rollover`, within horizon).
2. ~~Deposit mechanism (Path B)~~ **RESOLVED (2026-06-23): reuse the existing normal/QRIS payment flow — no new deposit table.** The ad-hoc order's applied-credit portion posts a `drawdown` ledger entry; the uncovered remainder falls to normal billing (`AwaitingPayment`) and is collected through the existing payment infrastructure (Phase 84 `qrisPayments` action + webhook / bank transfer). `orders.fundingSource: "deposit"` is just the order-level label distinguishing a part-credit/part-cash order; it adds no new money-tracking subsystem. Rationale: the credit ledger stays the single source of truth for *credit*, and existing payment reconciliation stays the single source of truth for *cash* — no parallel deposit ledger to keep in sync.
3. ~~Pool scoping~~ **RESOLVED (2026-06-23): per subscription-week pools.** Each subscription has its own ring-fenced weekly credit pool (`subscriptionWeeks` + `creditLedger` keyed by `subscriptionId`); refunds/rollover/expiry are per-agreement. The customer-dashboard drawdown chart (c24) **sums the customer's subscription pools for display only** — it is not a shared balance. An order draws from the pool of the subscription it belongs to.
4. **Refund payout mechanism** (clause 7 Frollie-fault) — manual expense/transfer vs. tracked obligation only. *(Still open — deferred to Phase C reconciliation; default: track `refundDue` as an obligation flag only, actual payout handled manually outside the system for v1.)*

---

## Cross-cutting reuse (staffreview R2/R3)
- **Shared line type:** `subscriptionWeeks.plannedDays[].items`, the invoice `items`, and the generated order lines all share `{ menuProductId, productName, qty, unitPrice, lineTotal }`. Define it ONCE (`convex/subscriptions/types.ts`) and reuse across schedule, invoice builder, and order generation so the `schedule = invoice = credit` invariant is enforced by the type system.
- **WIB week math:** `subscriptionWeeks.weekStart` (Monday WIB) MUST reuse `convex/lib/periodRange.ts` (`getWibDateStr` + week helpers). Pitfall #18 bans the deleted alternatives — do not hand-roll week boundaries.

## Rollback & Deployment (staffreview R1)
- **Ship-dark:** every CRM / credit / invoice / schedule surface is manager+admin gated from day one, so a partially-built phase never exposes half-finished flows to staff.
- **Additive-only schema:** all new tables + field additions are optional/additive (`orderId` becomes optional, never dropped) ⇒ no data migration, no destructive change; reverting a phase = revert its commits.
- **Deployment order:** schema → backend → frontend, per phase (Convex deploys before Vercel rebuild). Atomic commits keep each phase `/gsd-undo`-friendly.
- **Split-brain guard:** convex test-file type errors fail `deploy-convex` while a docs push ships the frontend alone — check `gh run list` after merge (see `lesson_convex_vercel_splitbrain`).

## Git Workflow
**Branch:** `feature/subscription-credit-system` (phased; likely a milestone of several feature branches)
**Checkpoints:** per wave below.

## Implementation Waves
*(Phased delivery. Each phase = its own feature branch, merged before the next.)*

> **Re-phasing (2026-06-23, round-1 proofing — note r1.c2):** original Phases B and C **merge into one phase B** — "Automated ordering schedule + weekly billing cycle." Rationale: a schedule-only phase generates orders nobody can bill (credit never funded), so it is not an independently shippable unit; the *complete weekly cycle* (plan → confirm → orders + weekly invoice → fund → drawdown → top-up → reconcile) is the smallest genuinely-useful slice and ships together. The merged phase reaches **everything including week-end reconciliation** (user decision, 2026-06-23). Phases D (broader CRM surface + agreements) and E (Telegram + rule enforcement) follow unchanged.

### Phase A — Credit wallet + subscriptions (backend spine) [DONE — PR #189, 2026-06-23]
| Agent | Task | Files |
|-------|------|-------|
| schema-architect | `subscriptions`, `subscriptionWeeks`, `creditLedger`, `supplyAgreements` tables + indexes; `orders`/`invoices`/`customers` field additions | `convex/schema.ts` |
| convex-backend | Subscription CRUD, credit ledger ops (topup/drawdown/expiry/refund), pool derivation | `convex/subscriptions/` |

### Phase B — Automated ordering schedule + weekly billing cycle (merged B+C; full money loop) [vertical slice, after A]
*(Backend scheduling + the whole money loop + the schedule/invoice/funding UI + read-only kanban. A manager runs a full live week end-to-end the day it merges, and weeks reconcile at close. Addresses the Phase-A forward-carried findings: week-alignment + template validation, ledger atomicity on confirm, `makeScheduleLine` factory, FIFO rollover tranches, closed-week posting guard, `invoices.by_subscriptionWeek` index.)*

| Agent | Task | Files |
|-------|------|-------|
| convex-backend | `validateScheduleTemplate` + Monday-WIB week alignment (`calculateWeekRange`); `seedWeek` source = template/previousWeek/blank (note r1.c1); `confirmWeek` (planned→confirmed, **atomically** generates `orders`+`orderItems` at partner `unitPrice` so `orders.totalAmount` = drawdown, sets `subscriptionId`/`subscriptionWeekId`/`deliveryDate`/`fundingSource`); `makeScheduleLine` factory | `convex/subscriptions/scheduling/` |
| convex-backend | `createSubscriptionWeeklyInvoice({ subscriptionWeekId })` from `plannedDays` (NOT `orderItems`), `items[].date`, reuse `getNextInvoiceNumber`, `invoiceKind`, `orderId` null; `markWeeklyInvoicePaid` → `postLedgerEntry` topup + flip week orders Paid; drawdown-on-funded; schedule-driven top-up delta invoice; `reconcileWeek` (FIFO rollover tranches via `computeRolloverExpiry`, shortfall/fault, refund flag, closed-week guard); out-of-credit split + apply-partial | `convex/invoices/`, `convex/subscriptions/` |
| react-ui-builder | Schedule calendar (`menuProducts` dropdowns, real dates, partner pricing, day/week subtotals, multi-product days, 3 seed sources, "Confirm → generate orders + invoice"); visual day-by-day weekly invoice (group by `items[].date`), 1-click WhatsApp/email/PDF-PNG; funding dashboard ("who hasn't paid / what needs funding") | `src/pages/crm/`, `src/components/invoice/` |
| react-ui-builder | Read-only "🔒 Subscription" rendering + "Open in scheduler" on **both** `OrderSlideOver.tsx` AND `OrderDetail.tsx` (Pitfall #20) | `src/components/orders/` |

### Phase D — CRM surface + navigation + agreements [after B]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | CRM home, customer record, breadcrumbs + linkable objects, agreement upload/terms, order history, drawdown chart | `src/pages/crm/`, `src/components/crm/` |
| convex-backend | Agreement storage, customer CRM fields | `convex/supplyAgreements/`, `convex/customers/` |

### Phase E — Telegram reminders + rule enforcement [after D]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | `subscription-ops` role, 5 crons, resilient+watchdog sends; 13:00 lock, above-baseline, permanent-change, termination, COGS alert; read-only kanban | `convex/telegram/`, `convex/crons.ts`, `src/components/orders/` |

### Verification (every phase) [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance + access-control audit (Pitfall #19) |
| tdd-test-architect | Backend integration tests (credit invariants, drawdown, reconcile) |
| Bash | `npm run build` |
| triple-review | Mandatory before merge |

## Documentation Updates
- [ ] CHANGELOG.md (per phase)
- [ ] SCHEMA.md (new tables + field additions)
- [ ] API_REFERENCE.md (new queries/mutations)
- [ ] FILE_MAP.md (CRM feature area + permission table)
- [ ] ROADMAP.md (boilerplate-agreement-generation backlog item)

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Schedule total = weekly invoice total = credit granted (enforced + tested).
- [ ] Funded subscription order auto-Paid via credit + writes a drawdown ledger entry.
- [ ] Credit pool reaches zero by week end (or rolls over when configured); leftover flagged.
- [ ] Top-up = schedule-driven delta invoice only; no standalone form.
- [ ] Out-of-credit: scheduled orders split + re-invoice; ad-hoc apply-partial + deposit.
- [ ] Subscription orders read-only on kanban; editable only in scheduler.
- [ ] All subscription/credit/invoice/CRM surfaces manager+admin only.
- [ ] Telegram `subscription-ops` reminders fire on the 5 schedules (resilient + watchdog).
- [ ] Signed agreement stored with customer; terms seed subscription defaults; bi-directional link.
