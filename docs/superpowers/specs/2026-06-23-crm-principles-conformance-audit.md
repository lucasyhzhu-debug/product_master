# CRM Principles Conformance Audit

**Date:** 2026-06-23
**Scope:** Subscription & Credit System — principles A1–A4 (navigation/linking), B5–B8 (event-log/taxonomy/indexing), C9–C10 (density/money traceability), D11–D12 (access-control/states), audited against the merged codebase + Phase B plan + Phase D/E specs.

## Verdict

The credit/money **core** (Phase A, already merged) is the strongest part: integer-IDR discipline, the append-only `creditLedger` replayed into a derived pool, and `protectedQuery`/`ROLE_PERMISSIONS` role gating are all conformant and should be treated as the reference patterns. The **gaps cluster in two places**: (1) the foundational schema is missing the load-bearing tables/indexes the upcoming surfaces need — `customerActivity` does not exist, `invoices` has no `customerId`/`by_customer` and no `by_subscriptionWeek`, `orders` has no `by_subscription`, and there is no `crmActivityTaxonomy` single-source module; and (2) Phase B introduces confidential partner pricing on subscription orders while the four staff-reachable kanban order queries are still plain `query()` with no role strip (a live D11 leak the moment Phase B orders exist). Because Phase B is mid-implementation and edits the schema, the foundational/shared-lib/Phase-B gaps must be closed first or they block clean Phase D/E planning. The navigation principles (A1/A2) are essentially unbuilt — no `/crm` routes, no `/customers/:id`, no breadcrumb component — but those are correctly owned by Phase D and are sequencing risks rather than design defects.

## Scoreboard

| Principle | Status | Note |
|-----------|--------|------|
| A1 — object refs as links to canonical pages | **gap** | No `/crm` or `/customers/:id` routes exist; customer has no canonical page until Phase D D1 |
| A2 — breadcrumbs mirror hierarchy / deep-links resolve a trail | **gap** | No breadcrumb component anywhere; B14 deep route ships before D's breadcrumb + parent pages |
| A3 — customer-as-hub (router, not scroll-dump) | **partial** | Well-designed in Phase D (QD17); unbuilt, hub links span phases |
| A4 — bidirectional cross-object links / back-ref sections | **partial** | agreement↔subscription conformant; invoice↔week↔customer and ledger↔week↔order back-refs incomplete |
| B5 — derived union over append-only event log | **partial** | Credit pool is a model-correct replay (conformant); `customerActivity` table missing; B2B revenue journal path ungrounded |
| B6 — single-source activity taxonomy | **gap** | No `crmActivityTaxonomy` module; precedent (`platformColors`/`orderConstants`) exists but unused for CRM |
| B7 — "what happened" vs "what's next" separation | **conformant** | Timeline is its own page; funding/reminders are a separate forward layer |
| B8 — facets indexed server-side | **partial** | Core tables indexed; missing `invoices.by_customer`, `orders.by_subscription`, activity type facet, a few more |
| C9 — don't pre-load entire history / windowing | **gap** | `getWeekPool` + `postLedgerEntry` re-`.collect()` full ledger per read/write; `listSubscriptions` unbounded; match engine full-scans |
| C10 — integer money, derived pool, signed-delta + running-balance + ledger link | **partial** | Money core conformant; `markWeeklyInvoicePaid` re-keys total; no statement-style ledger view specified |
| D11 — strip confidential data server-side, never client-only | **partial** | Strip design correct in plan (B16); four kanban queries still unstripped `query()`; `lineMargin`/extra leak sites; Phase D queries spec-only |
| D12 — loading / empty / error states on every surface | **partial** | Loading guards present; error states unspecified for B14/B15; Phase D spec conformant |

## Fix now (foundational + Phase B)

These are owned by `foundational` / `shared-lib` / `phase-B`. Phase B is mid-implementation and edits the schema, so these block clean Phase D/E planning and must land in the in-flight schema PR.

### Critical

**1. [D11] Strip confidential partner pricing in the four kanban order queries — live leak.** `convex/orders/queries.ts:230` (`get`), `:262` (`getByOrderNumber`), `:296` (`getKitchenOrders`); `convex/orders/kitchenQueries.ts:11` (`getKitchenPackingOrders`). All are plain `query()` with no `ctx.user`, returning the full order + items verbatim. Once Phase B `confirmWeek` generates subscription orders carrying the confidential partner `unitPrice` (`schema.ts:2499`) plus `totalAmount`/`finalTotal`/`totalMargin`, kitchen and order_staff receive that money over the wire — client-side hiding does not help (the D11 anti-pattern). **Recommendation:** implement B16 / AMENDMENT gap #2 as written — convert all four to `protectedQuery` with roles `['kitchen','order_staff','manager','admin']`, run results through `stripSubscriptionPricing(order, items, ctx.user.role)`, and switch the consuming hooks (`useOrders.ts:310/324/339`, `useKitchenStats.ts:219`, `useKitchenProduction.ts:169`) to `useSessionQuery`. **Owner:** phase-B.

**2. [B5] `customerActivity` table does not exist.** `convex/schema.ts` (grep returns none). The timeline's logged half (`whatsapp_drafted`, `note`, `manual_milestone`) has no home; Phase D §7.1 / `logCustomerInteraction` / `getCustomerTimeline` depend on it. **Recommendation:** add `customerActivity` to `convex/schema.ts` as a foundational change BEFORE Phase D frontend work, with polymorphic subject-refs: `{ customerId, type: union(...), at: number (explicit WIB ms, NOT _creationTime), actor: Id<users>, note?, subscriptionId?, invoiceId?, orderId? }`. Use explicit `at` over `_creationTime` per the project's own lesson ("_creationTime is insertion time, NOT business event time"). Land it in the schema PR that owns the timeline so the derived+logged union is buildable atomically. **Owner:** foundational.

### Important

**3. [B8] `invoices` has no `customerId` / `by_customer` — subscription weekly invoices unreachable by customer.** `convex/schema.ts:2287-2344` (indexes only `by_order`/`by_status_number`/`by_date`). Standard invoices traverse invoice→order→customerId; subscription weekly/topup invoices have `orderId` undefined (Phase B B9), so a weekly invoice cannot be found by customer via ANY index path. Breaks both A4 (bidirectional invoice↔customer) and B8. **Recommendation:** add `customerId: v.optional(v.id('customers'))` + `.index('by_customer', ['customerId'])` (additive). Backfill `customerId` at creation in `createSubscriptionWeeklyInvoice` (it already loads the customer at plan:752) and from the order at finalize for standard invoices. **Owner:** foundational.

**4. [A4] Confirm `invoices.by_subscriptionWeek` actually lands in the committed schema.** `convex/schema.ts:2342-2344` does NOT yet contain it; the Phase B plan promises it (plan:54/723/870, QD11 "lands in Phase B"). It is the load-bearing back-reference index for invoice↔week — without it `getCustomerTimeline` invoice/payment events and the funding dashboard full-scan invoices. **Recommendation:** verify `.index("by_subscriptionWeek", ["subscriptionWeekId"])` is in the merged schema, not just plan prose. **Owner:** phase-B.

**5. [B8] `orders` has no `by_subscription` index.** `convex/schema.ts:337-353` has `by_customer` + `by_subscriptionWeek` but not `by_subscription`. The timeline's order events and the per-subscription drawdown "delivered vs planned" partition (Phase D AC13, `getCustomerDrawdown`) need all orders for one subscription across weeks — today a per-week loop or a post-scan `by_customer` filter (B8 violation as it grows). **Recommendation:** add `.index('by_subscription', ['subscriptionId'])` (additive, low effort). **Owner:** foundational.

**6. [B6] No single-source `crmActivityTaxonomy` module.** Grep for `ACTIVITY_`/`activityIcon`/`activityType` returns nothing. Phase D §1.3/AC6 require type→icon/color/direction "sourced from the shared crmActivityTaxonomy"; without it the mapping will be inlined into `ActivityTimeline.tsx`/`TimelineItem.tsx` and re-keyed wherever a badge appears, drifting like the pre-Phase-81 platform mappers. **Recommendation:** create `src/lib/crmActivityTaxonomy.ts`: `ACTIVITY_TAXONOMY: Record<ActivityType, { icon, colorClass, label, direction? }>` + `getActivityVisual(type, subtype?)`, mirroring the existing `src/lib/orderConstants.ts` (`STATUS_COLORS`/`getStatusColor`, :14-28) and `src/lib/platformColors.ts`. Define the `ActivityType` union ONCE and import it into both `customerActivity.type` (backend) and the derived-event mapper — the `Record<ActivityType, …>` makes a missing entry a compile error (same trick as Pitfall #22's `COMMAND_POLICY`). Add a test asserting every type produced by `buildCustomerTimeline` has a taxonomy entry. **Owner:** shared-lib.

**7. [B8] `customerActivity` type facet must not be a frontend `.filter()`.** Phase D §7.1 proposes only `by_customer_at`. The type filter (`types?: ActivityType[]`, AC6/AC7) would otherwise be a post-scan/client facet ("`.filter()` is post-scan" — project lesson). **Recommendation:** land `by_customer_at` (covers the dominant window query); for the type facet use the windowed scan + in-memory filter for v1 (one customer / 14 days is low volume) and DOCUMENT it as an intentional post-scan facet, or add `by_customer_type_at ['customerId','type','at']` if multi-type filtering becomes hot. Do NOT implement it as a frontend-only `.filter()` over an unbounded fetch. **Owner:** foundational.

**8. [C9] Replay/list queries `.collect()` entire history with no windowing.** `getWeekPool` re-collects the full per-week `creditLedger` on every read (`queries.ts:31-34`) and `postLedgerEntry` re-collects + re-derives on every insert (`ledger.ts:43-46`) — O(n) per write, unbounded as a subscription accrues entries; `listSubscriptions` does an unfiltered `.collect()` when no `customerId` (`queries.ts:15`); the gap#1 match engine collects ALL final invoices then `.find()`s in memory per bank line (plan:899-909). **Recommendation:** per-week ledger replay is acceptable (bounded by a week's entries) but never `.collect()` `by_subscription` unbounded; add status filter/pagination to `listSubscriptions`; query unpaid `subscription_weekly` invoices via an index + date window in the match engine. **Owner:** phase-B.

**9. [C10] `markWeeklyInvoicePaid` re-keys the funding total from raw lines.** Plan:814 sums `invoice.items[].lineTotal` at post time instead of reading the persisted `invoice.finalTotal` that `createSubscriptionWeeklyInvoice` already wrote (plan:786). If items and `finalTotal` drift (top-up edit, later discount on `finalTotal`), the topup ledger amount silently diverges from what the customer paid. **Recommendation:** fund from the authoritative stored `invoice.finalTotal`, single derivation site. If items must be the source of truth, derive `finalTotal` from items at write time and read it back — do not recompute independently. **Owner:** phase-B.

**10. [B5] Phase B's second money pool (B2B Wholesale at-delivery revenue) is ungrounded.** B9 Step 3b (`recognizeSubscriptionDelivery`, plan:844-867) and B11 reconcile-breakage (plan:957-960) say "post the revenue journal line via the project's GL/journal API" but name no concrete `manualJournal`/GL mutation or table. If at-delivery revenue is written ad-hoc rather than through the normalized journal event log the income statement replays, the P&L total and the credit pool diverge (two sources of truth for one delivered sale). **Recommendation:** before executing B9, ground the exact journal-posting API (`convex/manualJournal/` or the GL writer `fetchAndAggregate` reads) and route BOTH the at-delivery line and the reconcile-breakage line through that single log. Add a test that the delivered subscription order's revenue appears in the income-statement aggregation exactly once and equals `order.totalAmount` (= the credit drawdown). **Owner:** phase-B.

**11. [D11] `stripSubscriptionPricing` misses `item.lineMargin` / `item.lineCost`.** Plan:1141 nulls only `unitPrice`/`lineTotal` on items, but for subscription orders `confirmWeek` sets `lineMargin = lineTotal = qty*partnerPrice` (plan:615-633), so a non-manager reconstructs the confidential price from the un-stripped `lineMargin`. **Recommendation:** extend the helper to also null `item.lineMargin` and `item.lineCost` for non-managers on subscription orders; add a test asserting `item.lineMargin` is undefined for a kitchen caller. **Owner:** phase-B.

**12. [D11] Additional staff-reachable leak sites beyond the four named.** `convex/orders/queries.ts` also exposes `getByCustomer` (`useOrders.ts:352`) and `getPackagingOrders` (`PackagingView.tsx:71`) as plain `query()`. B16's own warning — "a single missed query re-leaks the price" (plan:1148) — applies. **Recommendation:** during B16, grep ALL exported order/orderItems-returning queries reachable by kitchen/order_staff (not just the four), apply `stripSubscriptionPricing` to each or document why each cannot carry subscription orders; explicitly audit `getByCustomer` and `getPackagingOrders`. **Owner:** phase-B.

### Minor

**13. [B8] `creditLedger` has no `by_invoice` index** while rows carry `invoiceId?` (`schema.ts:2585`; indexes `by_order`/`by_subscription`/`by_subscriptionWeek` only, :2590-2592). Phase B gap #1 idempotency and Phase D AC10 ("which topup funded this invoice") currently scan `by_subscriptionWeek` + in-memory `invoiceId` filter. **Recommendation:** add `.index('by_invoice', ['invoiceId'])` (additive) if AC10/gap#1 resolve by `invoiceId` (they do), else document the one-week-scale in-memory filter as acceptable. **Owner:** foundational.

**14. [B8] Gap#1 match engine full-scans final invoices.** Plan:896-911 queries `by_status_number(status='final')` then filters in memory on `invoiceKind === 'subscription_weekly' && paymentStatus !== 'Paid'` — full-scan + post-scan facet, no index on `invoiceKind`/`paymentStatus`. **Recommendation:** add `.index('by_kind_paymentStatus', ['invoiceKind','paymentStatus'])` (additive). **Owner:** phase-B.

**15. [D12] No designed error states for B14/B15 pages.** Plan:1037-1077 has loading guards only. `confirmWeek`/`markWeeklyInvoicePaid`/`reconcileWeek` throw `ConvexError` on out-of-state weeks (plan:591/811-812/962); without try/catch a manager click hits an unhandled rejection. **Recommendation:** wrap those calls in toast/inline-error handling surfacing the ConvexError message; add a designed empty state when `getPlanningWeek` returns null and `getFundingDashboard` returns `[]`; make it a success criterion. **Owner:** phase-B.

## Fix in Phase D/E specs

Gaps the upcoming spec-fix workflow will address (owned by `phase-D` / `phase-E`).

### Important

**16. [A4] Close the invoice↔week↔orders and ledger↔week↔order triangles bidirectionally.** Forward refs exist (`orders.subscriptionWeekId`+`by_subscriptionWeek` :333-353; `creditLedger.orderId/invoiceId/subscriptionWeekId`+`by_order`/`by_subscriptionWeek` :2584-2592), but no UI back-reference section is specified ON the week/ledger/invoice page showing "which orders drew down this credit" / "which invoice funded this topup" as navigable links — the timeline links payment→ledger/week one-directionally only. A4 requires bidirectional back-reference sections. **Recommendation:** add to the week/invoice page (B-built) an explicit back-ref section listing its orders (`orders.by_subscriptionWeek` already exists) and ledger entries (`creditLedger.by_subscriptionWeek`) as links. **Owner:** phase-D.

**17. [C10] Specify the credit-ledger statement view (signed delta + running balance + ledger link).** `creditLedger` stores everything needed — signed `amount` + `balanceAfter` (`schema.ts:2582-2583`), `orderId/invoiceId/rolloverFromWeekId/createdBy/note`; `getWeekPool` returns `entries` (`queries.ts:35`). But neither Phase D nor B specs render the ledger as a statement (signed-delta column, running `balanceAfter` column, per-entry link to its object). The Phase D timeline's "payment confirmed by X" (AC10) is a coarse feed, not the money ledger. Currently unowned. **Recommendation:** add a credit-ledger statement view on the subscription page (design §5:157): `type · signed amount · running balanceAfter · link to orderId/invoiceId/rolloverFromWeekId · createdBy/note`, fed from `getWeekPool().entries`. **Owner:** phase-D.

**18. [A1/A2] CRM routes + breadcrumb are hard preconditions for the linking ACs.** No `/crm` routes and no `/customers/:id` exist (`App.tsx:197-715`, `CustomersManager.tsx` is a flat list); no breadcrumb component exists anywhere (`Breadcrumbs.tsx` is a NEW file in D-spec §2.2:87). The canonical customer page is Phase D D1; the deepest scheduler route `/crm/customers/:id/subscriptions/:subId/week` is built in Phase B B14 BEFORE D's breadcrumb + parent pages exist. **Recommendation:** treat route existence as a hard precondition for A1's linking ACs; build `Breadcrumbs.tsx` in sub-phase D1 (not D3) since every page including B's scheduler needs it; add an AC that existing order surfaces render the customer name as a link to `/crm/customers/:id` once D lands. **Owner:** phase-D.

**19. [D11] Carry the Phase D access-control directives into the (not-yet-written) Phase D plan.** New CRM queries (`getCustomerTimeline`, `getCustomerRecord`, `getCrmHomeActiveSubscriptions`, `getCustomerDrawdown`, `generateAgreementUploadUrl`) are specced `roles:['manager','admin']` (AC1:96) and the spec correctly flags that `generateAgreementUploadUrl` must be a fresh manager+admin wrapper, NOT a reuse of `businessSettings.generateUploadUrl` (admin-only — would crash a manager on the agreement page, the Pitfall #19 Nilson pattern). This is spec-only; no Phase D plan exists to enforce it. **Recommendation:** carry the §2.1:62 directive verbatim into the Phase D plan and add a code-auditor grep over every new CRM registration asserting `roles ⊇ canAccessCrm`'s set. **Owner:** phase-D.

### Minor / sequencing

**20. [A1] Don't render the "Open in scheduler" link to roles that can't reach it.** B16 (plan:1088) links kanban subscription orders to the `/crm` scheduler, but that route is `canAccessCrm` = manager+admin only (B14:1040); kitchen/order_staff who see the kanban hit a permission redirect — a Pitfall #19 reachability concern applied to navigation. **Recommendation:** gate the link itself on `canAccessCrm`, or provide a staff-reachable read-only subscription view. **Owner:** phase-B.

**21. [A2] B14's deep route ships with no resolvable parent trail.** `/crm/customers/:id/subscriptions/:subId/week` (B14:1037-1057) ships strictly before Phase D (QD12, D-spec:190), but the breadcrumb + parent pages (`/crm`, `/crm/customers/:id`, `…/:subId`) are Phase D. **Recommendation:** either Phase B ships a minimal breadcrumb + read-only parent stub so the deep route resolves a trail, or explicitly document the degraded trail until D lands; flag in the B plan. **Owner:** phase-B.

**22. [A3] Hub must not ship dead links to not-yet-existing D2/D3 targets.** The customer-as-hub router (D1) links to subscription page, activity page (D2), agreement page (D1) — split across sub-phases. **Recommendation:** keep the QD17 router-not-scroll-dump design; add a check that every hub link target exists or renders a graceful "coming in Dx" state. **Owner:** phase-D.

**23. [A4] Subscription↔customer must be navigable from the subscription end too.** `subscriptions.customerId`+`by_customer` (:2490/2524) is forward-only (correct for Convex); the customer page renders the back-ref, but a deep-linked subscription must resolve and link its parent customer (breadcrumb + link). **Recommendation:** ensure the subscription canonical page resolves + links its parent customer (ties to A2). **Owner:** phase-D.

**24. [C9] Stale/contradictory drawdown-chart density model.** Design §3:281 and §7:211-212 say the chart "sums the customer's per-subscription pools for display"; Phase D rev-2 (c4) overrides this to a per-subscription selector, "NOT a summed roll-up" (§1.7/AC13/QD5). Phase D is authoritative but the design spec still carries the contradicted sum-language. **Recommendation:** patch design §211-212 and §281 to point to the per-subscription-selector model or strike the sum language; implementer builds `getCustomerDrawdown` per single `subscriptionId`, never summing pools. **Owner:** phase-D.

**25. [C10] Don't present week-scoped `balanceAfter` as a subscription-lifetime running balance.** `postLedgerEntry` seeds `prevBalance` from the last entry of the SAME `subscriptionWeekId` only (`ledger.ts:21-26`), so `balanceAfter` resets weekly (carried credit re-posts as a `rolloverFromWeekId` topup; deliberate per design §227). **Recommendation:** in the ledger statement view (#17), scope the running-balance column per `subscriptionWeek`, or compute a separate cross-week cumulative column from signed amounts in the view layer; document in the Phase D ledger-view task. **Owner:** phase-D.

**26. [D12] Pin the locked-day edit warning to the page owner.** Phase E AC6:107 specs the past-13:00-cutoff warning as behavior, but E only flips the `plannedDays[].locked` flag and owns no UI page. **Recommendation:** pin a visible "past 13:00 cutoff" warning banner on `DayPlanCell` (when `locked` is true) in Phase B B14, which owns the scheduler render. **Owner:** phase-E.

## Already conformant — do not touch

- **C10 — integer IDR everywhere:** `creditMath.computeLineTotal` uses `Math.round` (`creditMath.ts:3-5`); ledger `amount`/`balanceAfter` are signed integer `v.number()` (`schema.ts:2582-2583`); no floats/`toFixed`/`parseFloat` in `convex/subscriptions` or `convex/invoices`; frontend `formatCurrency` uses Intl IDR with `fractionDigits:0` (`utils.ts:8-16`).
- **B5 / C10 — credit pool is a derived replay, not a re-keyed total:** `postLedgerEntry` re-derives the week pool from the FULL ledger via `deriveCreditPool` after every insert (`ledger.ts:42-53`, `creditMath.ts:29-42`); `getWeekPool` returns the freshly-derived pool (`queries.ts:25-37`). This is the reference pattern the timeline must mirror.
- **C10 — `weeklyQty`/`lineTotal` always derived, never re-keyed:** `deriveWeeklyQty` on create+update (`mutations.ts:34/71-75`), `buildPlannedDays` computes `lineTotal` (`weeks.ts:27`). Legacy invoice path also stores money once (`invoices/mutations.ts:79/224/268/326-328`).
- **A4 — agreement↔subscription is fully bidirectional:** `subscriptions.agreementId` (:2514) + `supplyAgreements.subscriptionId` (:2596) + `by_subscription` index (:2636); `linkAgreementToSubscription` writes both sides atomically (D-spec:83/106). (Verify unlink clears both sides.)
- **B6 — single-source color/taxonomy precedent is healthy:** `src/lib/platformColors.ts`, `src/lib/orderConstants.ts:14-34`, `convex/reports/platform.ts:18-40` — reference these in the Phase D plan.
- **B7 — "what happened" vs "what's next" cleanly separated:** timeline is its own page (D §1.3/QD17); funding (`getFundingDashboard`, B13/B15) + Phase E reminder crons are the distinct forward layer.
- **B8 — subscription/credit core tables correctly indexed:** `subscriptions.by_customer`+`by_status` (:2524-2525), `subscriptionWeeks.by_subscription_weekStart`+`by_status` (:2569-2570), `supplyAgreements.by_customer`+`by_subscription` (:2635-2636).
- **B5 — orders carry the polymorphic subject-refs the timeline needs:** `subscriptionId?`/`subscriptionWeekId?`/`fundingSource?`/`deliveryDate?` (:333-336) + `by_subscriptionWeek` (:353), landed additively in Phase A.
- **C9 — timeline windowing + loading guards specced/conventional:** D-spec AC6/§2.2/§4 (14-day window + cursor pagination, pure tested merge with stable tiebreaker); loading guards required in B14/B15 (plan:1050/1070), matching Pitfall #2.
- **C10 — `getWeekPool().pool` consumed (not `week.creditRemaining`):** D-spec AC12/§2.1 N1 mandates reading the derived pool.
- **D11 — `ROLE_PERMISSIONS` + `protectedQuery`/`protectedMutation` single-source gate** (`types.ts:710-830`, `functions.ts:63-65/109-111`); B's new mutations use `roles:['manager','admin']` aligned to `canAccessCrm` (correct Pitfall #19 superset). The B16 AMENDMENT (plan:1090-1158) diagnoses the leak correctly — server-side strip, kitchen/order_staff included, not manager-only, not client-side hide.
- **D11 — Phase E enforcement mutations** (`flipDayLocksAtCutoff`, baseline writes) kept `manager+admin`/internal/cron; EC4 reasons correctly about mount-time subscription (E-spec:113-115/125/148).
- **D12 — Phase D states strong:** empty/loading/error across the surface (D-spec:97/117/118/123/132); B16 renders stripped money as `—` (plan:1152/1154).

## Recommended next actions

**Schema additions — land in the in-flight Phase B schema PR (foundational, additive only):**
1. `customerActivity` table — polymorphic, explicit `at: number` (WIB ms), `+ .index('by_customer_at', ['customerId','at'])`. (Critical #2)
2. `invoices`: `+ customerId: v.optional(v.id('customers'))` `+ .index('by_customer', ['customerId'])`, backfilled at creation/finalize. (#3)
3. `invoices`: verify `.index('by_subscriptionWeek', ['subscriptionWeekId'])` is actually merged. (#4)
4. `orders`: `+ .index('by_subscription', ['subscriptionId'])`. (#5)
5. `creditLedger`: `+ .index('by_invoice', ['invoiceId'])`. (#13)
6. `invoices`: `+ .index('by_kind_paymentStatus', ['invoiceKind','paymentStatus'])`. (#14)

**Shared-lib — create alongside / before Phase D frontend:**
7. `src/lib/crmActivityTaxonomy.ts` — single `ActivityType` union + `Record<ActivityType, Visual>` + `getActivityVisual`, imported by both backend `customerActivity.type` and the derived-event mapper; compile-time-exhaustive; with a test. (#6)

**Phase B (in-flight) execution fixes:**
8. Convert the four kanban queries (+ audit `getByCustomer`/`getPackagingOrders`) to `protectedQuery` + `stripSubscriptionPricing`; extend the helper to null `lineMargin`/`lineCost`. (#1, #11, #12)
9. Fund `markWeeklyInvoicePaid` from stored `invoice.finalTotal`, single derivation site. (#9)
10. Ground the B2B-Wholesale at-delivery + breakage journal posting through the existing GL/journal log; reconcile-test it. (#10)
11. Window the ledger replay / `listSubscriptions` / match engine (no unbounded `.collect()`). (#8)
12. Add designed error + empty states to B14/B15; pin the locked-day warning banner on `DayPlanCell` (B14). (#15, #26)

**Phase D/E spec edits (upcoming spec-fix workflow):**
13. Spec the credit-ledger statement view (signed delta + running `balanceAfter` + per-entry link), week-scoped balance column. (#17, #25)
14. Spec bidirectional week/ledger→orders/invoice back-reference sections. (#16)
15. Make A1/A2 route + breadcrumb preconditions explicit; build `Breadcrumbs.tsx` in D1; add the "render customer name as link" AC. (#18, #21)
16. Carry the `generateAgreementUploadUrl` own-wrapper directive + CRM `roles ⊇ canAccessCrm` grep into the Phase D plan. (#19)
17. Patch design spec §211-212/§281 to the per-subscription drawdown selector; document the activity type facet as post-scan v1. (#24, #7)
18. Gate the kanban "Open in scheduler" link on `canAccessCrm`; resolve subscription→customer parent link. (#20, #23)
