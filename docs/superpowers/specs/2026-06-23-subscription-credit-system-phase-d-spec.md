# Subscription & Credit System — Phase D Spec (CRM surface + activity timeline + agreements)

**Date:** 2026-06-23 (rev. 2 — proofing round 1 folded in)
**Status:** Draft — depends on **Phase B merged** for delivered/planned order + invoice/payment data (see §8). The Phase-A-only portions (contact/address/notes, agreements, navigation scaffold, subscriptions list, derived-timeline scaffold) are buildable now; the credit gauge + drawdown chart + the funding/payment timeline events are **BLOCKED until Phase B merges**.
**Predecessor:** Phase A merged (PR #189, squash `22b628f7`). **Phase C (invoicing + reconciliation) is folded into Phase B in totality** — there is no standalone Phase C; all former-C signatures (`createSubscriptionWeeklyInvoice`, `markWeeklyInvoicePaid`, `reconcileWeek`, `invoiceKind`) are owned by **Phase B**.
**Design spec:** `docs/superpowers/specs/2026-06-23-subscription-credit-system-design.md` (§5 CRM, §4.6 agreements, §4.7 customers, §7 drawdown chart)
**Companion visual proofs:** `2026-06-23-subscription-cde-visual-mockups.html` (decision comparison) + `2026-06-23-customer-activity-timeline-design.html` (timeline feature design)

This is a SPEC (WHAT + acceptance), not a PLAN. No task-by-task steps.

> **Rev-2 change log (proofing round 1, Lucas):** Added the **Customer Activity Timeline** as the customer-record centerpiece (c2/c3/c6/c8/c10); **order history folded into the timeline** (c10); **drawdown chart is now per-subscription with a selector, NOT a summed roll-up** (c4); **agreement seeding dropped** — subscriptions are created manually, agreement page only confirms final-version upload + linked subscriptions + last-upload date (c7/c8/c9); **payment-confirmation accountability + invoice# as transfer reference** (c1); **COGS-rise alerting dropped from Phase E** (c12/c13). New schema flagged in §7.
>
> **Rev-3 change log (reconciled against the merged Phase B plan `docs/superpowers/plans/2026-06-23-subscription-phase-b-weekly-cycle.md`):** The consolidated B plan ALREADY builds the CRM *shell* that Phase D was assuming it owned — corrected so D consumes, not rebuilds:
> - **`/crm` route + `canAccessCrm`** (in `ROLE_PERMISSIONS`) are added by **Phase B (Task B14)**. Phase D registers its own sub-routes *under* that gate; D does NOT define `canAccessCrm`.
> - **The funding dashboard + `getFundingDashboard`** ("who hasn't paid / what needs funding") are built by **Phase B (Tasks B13 + B15, `CrmFundingDashboardPage`)**. Phase D's `/crm` home **reuses** that query/page — it does not rebuild a `getCrmHomeDashboard` funding aggregate.
> - **Schedule calendar (`/crm/customers/:id/subscriptions/:subId/week`), the visual weekly invoice page, `markWeeklyInvoicePaid`** are all **Phase B (B14/B15)**. D's "Mark paid → fund" deep-links into them.
> - **`invoices.by_subscriptionWeek` index** lands in **Phase B (Task B9)** — QD11 confirmed.
> - **QD16 confirmed open:** B's `createSubscriptionWeeklyInvoice` synthesizes `orderNumber: WEEK-<date>` and snapshots bank details, but does **NOT** surface the invoice number as the customer's bank-transfer reference nor add `/financials` matching. So c1's "invoice# as transfer ref + financials link" is a **genuine gap to raise** against B (or a follow-up) — not something B already does.

---

## 1. WHAT this phase delivers

Phase D is the **CRM surface** that makes the Phase-A/B backend visible and the Phase-B flows reachable, centered on a **per-customer activity timeline**, plus **supply-agreement document management**.

**In scope:**

1. **`/crm` home dashboard** (manager+admin) — across all customers: a **"needs funding" action list** (unpaid weekly invoices → fund credit) on top, an **active-subscriptions overview** below. **The funding list reuses Phase B's `getFundingDashboard` query / `CrmFundingDashboardPage` (Tasks B13/B15) — Phase D does NOT rebuild the funding aggregate;** it surfaces it on the home + adds the active-subscriptions overview. Each unpaid row carries a **"Draft WhatsApp reminder"** action (dunning — see #4). *(The `/crm` route shell + `canAccessCrm` gate already exist from Phase B Task B14.)*
2. **Customer dashboard page** (`/crm/customers/:id`) *(sub-phase D1 — built FIRST, QD17)* — **two-pane**: left = identity (contact, addresses, notes, agreement), right = the financial story (this-week credit gauge **(B-dependent)**, subscriptions list, invoices & funding action), with prominent quick actions (Plan schedule, Mark invoice paid → fund, Settings) and a **"View activity timeline →"** entry (optionally a short recent-activity preview) linking to the separate Activity page (#3). The timeline is **NOT embedded** in this page.
3. **Customer Activity Timeline** *(its OWN PAGE + its OWN sub-phase D2 — c3, QD17)* — route `/crm/customers/:id/activity`, reached from the customer dashboard. A single vertical, **latest-on-top** feed of everything that has happened with this customer, **default last 14 days**, filterable by activity type. Each entry: a **type-coded icon disc on the left** (the type's **icon inside its colored circle**, sourced from the shared `crmActivityTaxonomy` — one icon per type with per-subtype overrides, e.g. ✓ funded / ⚖ reconcile / 📦 delivered / 💬 WhatsApp / 📄 agreement / 📅 schedule / 🏁 milestone), a description + details on the right, and is **clickable into the underlying object** (order → order detail, invoice → invoice page, payment → ledger/week, WhatsApp message → the logged interaction, agreement → document, schedule change → scheduler). The timeline is a **union of derived events** (from existing tables) **and logged interactions** (a new `customerActivity` table — §7, schema **approved**):
   - **Transactional (mostly B-dependent):** order placed / delivered, weekly invoice sent, **payment confirmed → credit funded** (with **who confirmed it** — c1), top-up invoice, schedule change, week reconciled.
   - **Interactions (new):** **WhatsApp message drafted/sent** (logged when the operator clicks "Draft WhatsApp" — see #4), manual notes.
   - **Milestones (c6):** customer onboarded, agreement sent, agreement signed, subscription started, **contract scheduled to end** (`endDate`), subscription terminated.
   - **This timeline replaces the standalone "order history" page (c10)** — orders are just one filterable activity type within it.
4. **WhatsApp dunning + interaction logging** *(new — c2)* — a compact **"Draft WhatsApp reminder"** button on unpaid invoices (CRM home + customer record). It opens a `wa.me` deep-link with a **pre-filled dunning message** AND writes a `customerActivity` row of type `whatsapp_drafted` so the interaction lands on the timeline. (We log that we *initiated* the message; true delivery isn't confirmable — an optional "sent ✓" marker is cosmetic, not a guarantee.)
5. **Clickable contact fields** — every contact/social field renders as a clickable link: phone/altPhone/`whatsapp` → `wa.me`, `email` → `mailto:`, `instagram` → IG profile, `otherSocials[]` → their `url`. Consumes the Phase-A additive `customers` fields.
6. **Navigation scaffold** — a chevron **breadcrumb trail** on every CRM page (accumulating, each segment a link to its parent), and the principle that **every object reference is a link** to that object's page.
7. **Per-subscription drawdown chart + credit gauge** on the customer dashboard **(B-dependent)** — dual-axis (bars = pcs/day left, line = credit remaining Rp right); solid = delivered, dashed & lighter = planned; "today" divider; flags leftover credit if the projected line won't reach zero by Sunday. **One subscription at a time, chosen via a selector** — **NOT a summed roll-up** (c4): a dropdown/segmented control picks the subscription, the chart title names it, and a small link goes to that subscription's page (breadcrumb-consistent). Each pool stays ring-fenced; we never present a single shared balance.
8. **`supplyAgreements`** *(simplified — c7/c8/c9)* — PDF upload via `_storage`, status, `signedDate`, ID + EN versions with a **last-uploaded/edited date**, and a **"Linked subscriptions"** section (bi-directional `agreementId`↔`subscriptionId`). **No key-terms→subscription auto-seeding** — subscriptions are created manually in Phase B; the agreement page's job is only to confirm *the final version is uploaded* and *which subscriptions it covers*. (`keyTerms` may still be captured for reference but drives no automatic seeding.)
9. **CRM customer-field write** — a dedicated `updateCustomerCrmFields` mutation for the Phase-A `customers` CRM fields.

**Explicitly OUT (belongs to other phases):**

- The **schedule calendar**, week seed/confirm, order generation, drawdown-on-funded, **the visual day-by-day invoice, weekly/top-up invoice builders, reconciliation** — **Phase B** (Phase B now includes former-C invoicing+reconciliation). Phase D only *links to* the scheduler and *reads/surfaces* the data + invoices B produces.
- **Telegram reminders, rule enforcement (13:00 lock, above-baseline), read-only kanban styling** — **Phase E**. (COGS-rise alerting is **dropped** — c12/c13.)

---

## 2. Data & flow

### 2.1 Existing Phase-A/B code this phase CONSUMES (do not re-roll)

| Artifact | Location | Use in Phase D |
|---|---|---|
| `customers` CRM fields | `convex/schema.ts` (Phase A additive) | Render (clickable links) + write |
| `subscriptions` + `listSubscriptions`, `getSubscription` | `convex/subscriptions/queries.ts` | Subscriptions list, drawdown selector, milestones (startDate/endDate/terminationNoticeDate) |
| `getWeekPool({ subscriptionWeekId })` → `{ week, pool, entries }` | `convex/subscriptions/queries.ts` | Credit gauge + drawdown credit-remaining series. **N1:** read the derived `pool`, not `week.creditRemaining` |
| `creditLedger` (topup entries carry `createdBy`) | Phase A table | Timeline "payment confirmed by X" event (c1 accountability — the `topup` entry's `createdBy` IS who confirmed) |
| `supplyAgreements` (+ `versions[]`, `by_customer`, `by_subscription`) | `convex/schema.ts` (Phase A) | Agreement page + upload + linked subscriptions |
| `orders` (`subscriptionId`/`subscriptionWeekId`/`fundingSource`/`deliveryDate`) | Phase A additive | Timeline order events + per-customer order filter |
| Phase-B invoice query + `invoiceKind` (former C) | `convex/invoices/` (Phase B) | Funding dashboard + timeline invoice/payment events |
| `_storage` upload (`generateUploadUrl`) | `convex/businessSettings/mutations.ts:80` | **Body only** — re-roll with `roles:["manager","admin"]`, NOT businessSettings' admin-only roles |
| `protectedMutation`/`protectedQuery` | `convex/lib/functions.ts` | Every CRM query/mutation (`ctx.user`, `SessionIdArg`, **no `token` arg**) |

### 2.2 New queries/mutations this phase ADDS

All `roles: ["manager","admin"]` unless noted.

**Timeline (new):**
- `getCustomerTimeline({ customerId, sinceDays?=14, types?: ActivityType[], cursor? }): { items: TimelineItem[], nextCursor? }` — merges derived events (orders/invoices/ledger-topups/reconciles/milestones from `subscriptions`+`supplyAgreements`) with logged `customerActivity` rows, sorted **desc** by event time, windowed to `sinceDays`, filterable by `types`. `TimelineItem = { id, type, at, actor?, title, detail, linkTo: { kind, id } }`. The derived/logged merge is a **pure, tested function** (§5).
- `logCustomerInteraction({ customerId, type, note?, subscriptionId?, invoiceId?, orderId? }): Id<"customerActivity">` — writes a `customerActivity` row (e.g. `whatsapp_drafted`, `note`). Called by the "Draft WhatsApp" action and manual-note UI.

**Customer record / dashboard:**
- `updateCustomerCrmFields({ customerId, …10 CRM fields…, notes? }): Id<"customers">` — dedicated mutation (NOT an extension of the legacy `customers.update`, which carries none of the 10 fields and is consumed by order/invoice write-backs). Patches only provided fields.
- `getCustomerRecord({ customerId }): { customer, subscriptions, agreements, currentWeekPoolBySubscription, unpaidInvoices }` — aggregates the record view (two-pane layout, §3).
- `getCrmHomeActiveSubscriptions({}): activeSubscriptions[]` — the active-subscriptions overview only. **The "needs funding" list reuses Phase B's `getFundingDashboard` (Task B13)** — do NOT define a parallel `getCrmHomeDashboard` funding aggregate (QD4 is owned by B's funding predicate).
- `getCustomerDrawdown({ subscriptionId, weekStart })` **(B-dependent)** — per-day pcs delivered-vs-planned + credit-remaining trajectory for **one** subscription (per c4 — no multi-subscription sum).

**Agreements:**
- `generateAgreementUploadUrl({}): string` — wraps `ctx.storage.generateUploadUrl()`, `roles:["manager","admin"]`.
- `createSupplyAgreement({ customerId, subscriptionId?, fileStorageId, fileName, fileSize, status, signedDate?, governingLaw?, signatories?, keyTerms?, lang })` — sets `uploadedBy`, `uploadedAt`.
- `addAgreementVersion({ agreementId, fileStorageId, fileName, lang })` — appends to `versions[]` (each version's `uploadedAt` powers the "last upload" display + a timeline milestone).
- `linkAgreementToSubscription({ agreementId, subscriptionId })` — writes BOTH sides atomically.
- `getAgreement`, `listAgreementsByCustomer` — queries. (No `seedSubscriptionDefaultsFromAgreement` — dropped, c9.)

**Frontend — `src/pages/crm/`, `src/components/crm/`:**
`CrmHome.tsx`, `CustomerDashboard.tsx` (two-pane, route `/crm/customers/:id`), **`CustomerActivityPage.tsx`** (its own route `/crm/customers/:id/activity`) + `ActivityTimeline.tsx` + `TimelineItem.tsx` (icon-disc rows, statement-spine), `AgreementPage.tsx`, `Breadcrumbs.tsx`, `LinkableObject` helpers, `DrawdownChart.tsx` + `SubscriptionSelector` **(B-dependent)**, `CreditGauge.tsx` **(B-dependent)**, `AgreementUpload.tsx`, `ContactLinks.tsx`, `DraftWhatsAppButton.tsx` (wa.me deep-link + `logCustomerInteraction`).

### 2.3 schedule = invoice = credit data flow
Phase D is **read-only over the credit invariant** — it never re-keys totals. The gauge + drawdown line come from `getWeekPool`'s derived **`pool`** (source of truth = `creditLedger`). The pcs/day bars come from `subscriptionWeeks.plannedDays[].items[].qty`. There is **no shared/summed balance** — the chart is per-subscription (c4); each `subscriptionWeek` pool is ring-fenced.

---

## 3. Acceptance criteria

- [ ] **AC1** `/crm` gated manager+admin via `<ProtectedRoute requiredPermission="canAccessCrm">`; EVERY new CRM `protectedQuery`/`protectedMutation` uses `roles:["manager","admin"]` (superset-aligned, Pitfall #19). A manager mounting any CRM page never throws `Unauthorized`.
- [ ] **AC2** Customer record renders all Phase-A CRM fields as clickable links (wa.me/mailto/IG/`otherSocials[].url`); empty fields render gracefully.
- [ ] **AC3** `updateCustomerCrmFields` (dedicated mutation, all 10 fields) writes and the record reflects it reactively; the legacy `customers.update` is NOT widened.
- [ ] **AC4** Chevron breadcrumb trail on every CRM page, accumulating on drill-in, each segment a link to its parent.
- [ ] **AC5** Every object reference on a CRM page is a link to that object's page; contact handles → external links.
- [ ] **AC6 — Timeline** The **Activity Timeline page** (`/crm/customers/:id/activity`, linked from the dashboard via "View activity timeline →") shows: latest-on-top, **default 14-day window**, type-coded icon discs, each row clickable into its underlying object, **filterable by activity type**. Orders appear as one filterable type (no separate order-history page). The dashboard page itself does NOT embed the timeline (QD17).
- [ ] **AC7 — Timeline merge** `getCustomerTimeline` correctly merges derived events + logged `customerActivity` rows in one desc-sorted, windowed, type-filtered feed (pure-fn tested, §5).
- [ ] **AC8 — Milestones** The timeline includes lifecycle milestones: onboarded, agreement sent, agreement signed, subscription started, contract end (`endDate`), terminated.
- [ ] **AC9 — Dunning** Each unpaid invoice (CRM home + record) has a "Draft WhatsApp reminder" action that opens a `wa.me` link with a pre-filled message AND writes a `customerActivity` (`whatsapp_drafted`) that appears on the timeline.
- [ ] **AC10 — Accountability** The "payment confirmed → credit funded" timeline event names **who confirmed it** (from the `topup` ledger entry's `createdBy`). *(B-dependent — funding happens in B.)*
- [ ] **AC11 — Agreements** PDF upload uses `_storage` via a manager+admin `generateAgreementUploadUrl`; supports ID + EN `versions[]` (each individually openable) with a visible **last-uploaded date**; linking writes both `supplyAgreements.subscriptionId` AND `subscriptions.agreementId` atomically; the agreement page shows a **"Linked subscriptions"** section. **No auto-seeding of subscription drafts** (manual creation).
- [ ] **AC12 (B-dependent)** Credit gauge reads the authoritative derived `pool` (N1), not `week.creditRemaining`.
- [ ] **AC13 (B-dependent)** Drawdown chart is **per-subscription** (selector picks one; title names it; link to its page): dual-axis, solid=delivered + dashed=planned, "today" divider, leftover-credit flag from `pool.creditRemaining` projected to Sunday. **No multi-subscription sum** (c4).
- [ ] **AC14** No partner pricing or credit balance is reachable by order_staff/kitchen anywhere in the CRM surface.
- [ ] **AC15** `npm run type-check`, `npm run build`, `npx convex codegen` (committed `_generated/`) pass; the new `customerActivity` table + index land; no banned Phase-81 imports; WIB dates via `convex/lib/periodRange.ts` only.

---

## 4. Edge cases

- **Manager opens a CRM query before any dialog opens** (Pitfall #19) — every CRM hook's backend `roles` ⊇ the `/crm` route permission.
- **Empty customer** (no subscription/agreement/orders/activity) — empty states for timeline, subscriptions, agreements, gauge.
- **Timeline window with high volume** — 14-day default + cursor pagination; "load older" extends the window. Define a stable sort tiebreaker (event time, then id).
- **WhatsApp "sent" is not delivery** — we log that the message was *drafted/initiated*, not confirmed delivered; the UI must not claim delivery.
- **Deleted/renamed `menuProducts`** — timeline order rows show the stored snapshot `productName` (N2 sentinel `"Unknown"`), never a re-fetch.
- **Agreement uploaded but unlinked** — renders standalone; "Linked subscriptions" shows none; link action available.
- **Customer with multiple subscriptions** — drawdown is per-subscription via the selector (no alignment problem since there's no sum — c4 resolves former QD5).
- **B-dependent sections before Phase B merges** — gauge/chart/funding/payment-timeline events degrade to explicit empty states, not crashes (though D ships after B — §8).

---

## 5. Testing focus

- **`buildCustomerTimeline(derivedEvents, loggedRows, { sinceDays, types })`** — pure fn: correct desc merge, window cut at `sinceDays`, type filter, stable tiebreaker. Fixture mixes orders + invoices + topups + milestones + logged WhatsApp rows across the boundary.
- **`buildDrawdownSeries(deliveredDays, plannedDays, poolTrajectory)`** — pure fn: solid/dashed partition at `today`; leftover flag fires only when projected line > 0 at Sunday; **single-subscription only** (no sum). Reuse `deriveCreditPool`; never re-key.
- **Contact-link builder** — wa.me/mailto/IG/TikTok URL construction (strip `+`/`@`); table-driven.
- **RTL** — two-pane record renders contact links + timeline rows + empty states; breadcrumb accumulates; object references are anchors to the right route; "Draft WhatsApp" calls `logCustomerInteraction`.
- **Access-control audit** — every new CRM `roles` is `["manager","admin"]`; `generateAgreementUploadUrl` is NOT admin-only.
- **Fixtures** — customer w/ 2 subscriptions + ledger; agreement w/ ID+EN versions + linked subs; empty customer; a 30-day timeline spanning the 14-day cut.

---

## 6. Access control + rollback / ship-dark

- **Access:** manager+admin everywhere; new `<ProtectedRoute requiredPermission="canAccessCrm">`; every CRM query/mutation `roles:["manager","admin"]`. Auth via `protectedMutation`/`protectedQuery`.
- **Ship-dark:** the entire `/crm` area is manager+admin-gated from the first commit. Nav links gated m+a (Header `configItems` + `MobileBottomNav moreItems`, Phase-85 pattern).
- **Rollback:** Phase D adds **one new table** (`customerActivity`, additive) + a permission flag — additive, no destructive change; revert = revert commits. `/gsd-undo`-friendly.
- **Deployment order:** schema (`customerActivity`) → backend → frontend; check `gh run list` after merge (split-brain guard).

---

## 7. Schema additions required

**Phase D is NOT pure-additive-code — it introduces one new table** (proofing round 1 made the timeline + interaction logging first-class):

1. **NEW table `customerActivity`** *(flag — beyond Phase A's frozen set)* — the logged-interaction half of the timeline (derived events are read from existing tables, not stored). Proposed shape (confirm via **QD14**):
   ```
   customerActivity: {
     customerId: Id<"customers">,
     type: union("whatsapp_drafted","note","manual_milestone", …),
     at: number,                      // event time (WIB ms), explicit — not _creationTime
     actor: Id<"users">,              // who did it (accountability)
     note?: string,
     subscriptionId?: Id<"subscriptions">, invoiceId?: Id<"invoices">, orderId?: Id<"orders">,
   } .index("by_customer_at", ["customerId","at"])
   ```
2. **`canAccessCrm` permission flag** — **added by Phase B (Task B14)** to `ROLE_PERMISSIONS` (`src/lib/types.ts`), manager+admin `true`. Phase D does NOT define it; D's sub-routes register under the existing `<ProtectedRoute requiredPermission="canAccessCrm">`. **→ QD10 (resolved; owned by B).**
3. **`invoices.by_subscriptionWeek` index** — lands in **Phase B** (owns weekly-invoice creation + funding lookup), per plan line 1014. Phase D must NOT add it speculatively. **→ QD11 (resolved: Phase B).**
4. **Invoice # as bank-transfer reference (c1)** — the weekly invoice number (`INV-YYMM-NNN`) should be surfaced as the **transfer reference** the customer puts in their bank-transfer comment, mirroring the existing order-number `MMDD-NNN` bank-reference convention, so payment reconciliation in `/financials` can match a transfer to a week. This is primarily a **Phase B** invoice/financials concern; Phase D surfaces it. **→ QD16.**

Any further new field/table/index → FLAG + Open Question, never assume.

---

## 8. Dependencies on Phase B's merged code (the scaffold-vs-data split)

**Buildable on Phase A ALONE — the scaffold:**
- Customer contact/address/notes (render + `updateCustomerCrmFields`); clickable contact links.
- `supplyAgreements` upload + ID/EN versions + last-upload date + bi-directional subscription link + "Linked subscriptions" section.
- Breadcrumb trail + linkable-object nav; subscriptions list.
- `customerActivity` table + `logCustomerInteraction` + the **derived-from-A** timeline events (subscription lifecycle milestones, agreement uploads, logged WhatsApp/notes).

**BLOCKED until Phase B merges — the data-bearing parts:**
- Credit gauge + per-subscription drawdown chart (need confirmed weeks + ledger drawdowns from B).
- Timeline **transactional** events: order placed/delivered, invoice sent, **payment confirmed → funded (with confirmer name — AC10)**, top-up, reconcile.
- CRM home **"needs funding"** list + "Mark invoice paid → fund" action (B owns weekly invoices + `markWeeklyInvoicePaid`).

**Concrete B artifacts Phase D reuses / needs (from the merged B plan):**
- `getFundingDashboard` (`convex/subscriptions/scheduling/queries.ts`, Task B13) + `CrmFundingDashboardPage` (Task B15) — D's `/crm` home reuses these for "needs funding".
- `markWeeklyInvoicePaid` (`convex/subscriptions/invoicing.ts`, Task B9) — D's "Mark paid → fund" deep-links here; its `topup` ledger entry's `createdBy` is the accountability source for the timeline payment event (AC10).
- Scheduler route `/crm/customers/:id/subscriptions/:subId/week` (Task B14) — the `order/day → scheduler` + "Open in scheduler" link target.
- Delivered-vs-planned partition source — B's order status progression marks a day "delivered" (the timeline's order events + drawdown chart solid/dashed read it).
- `canAccessCrm` (Task B14) — D's route gate.

**Sequencing (QD12 resolved):** with C folded into B, ship Phase D **strictly after B** so all data-bearing ACs (AC10, AC12, AC13, funding) are testable at merge.

---

## 9. Open Questions

Resolved in this revision (recorded for the plan):
- **QD1 →** Two-pane customer record (identity left, financial story + timeline right). *(proof ②)*
- **QD2 →** Phase D builds the subscription-page read-only shell + Settings; Phase B wires the editable scheduler. *(c5)*
- **QD3 →** CRM home = two sections (needs-funding list + active-subscriptions overview). *(proof ①)*
- **QD5 →** Drawdown is **per-subscription via a selector**, NOT a summed roll-up. *(c4 — supersedes the design's "sum pools for display")*
- **QD6 →** Order history is **folded into the Activity Timeline** as a filterable type — no separate page. *(c10)*
- **QD7 →** "Mark invoice paid → fund" **deep-links into Phase B's `markWeeklyInvoicePaid`** flow; Phase D stays read-only over credit.
- **QD8 →** Dedicated `updateCustomerCrmFields` (legacy `customers.update` not widened).
- **QD9 →** **Dropped** — no agreement→subscription auto-seeding; subscriptions created manually; agreement page only confirms final-version upload + linked subscriptions. *(c9)*
- **QD10 →** `canAccessCrm`, manager+admin, no admin-only sub-areas.
- **QD11 →** `invoices.by_subscriptionWeek` lands in Phase B.
- **QD12 →** Ship Phase D strictly after B.
- **QD13 →** Agreement page = single page (status → versions w/ last-upload date → **Linked subscriptions** → no seed action). *(c7/c8/c9)*

Resolved this round (Lucas):
- **QD14 →** New `customerActivity` table **approved** (§7). Derived milestones come from `subscriptions.startDate`/`endDate` + agreement `uploadedAt`; "onboarded" + WhatsApp/notes are stored `customerActivity` rows.
- **QD15 →** WhatsApp dunning + interaction-logging is **in Phase D v1** — NOT a fast-follow.
- **QD17 →** The timeline is its **own sub-phase (D2)** AND its **own page** (`/crm/customers/:id/activity`). The **customer dashboard page (D1) is built first** and links to it; the dashboard does not embed the timeline.

Still OPEN:
- **QD16 (cross-phase — PLUGGED IN B)** — Invoice # as the **bank-transfer reference** + `/financials` matching (c1). Confirmed B didn't do it; now **raised as an amendment on Phase B Task B9** (`▶ AMENDMENT gap #1` in `2026-06-23-subscription-phase-b-weekly-cycle.md`): `invoiceNumber` is the transfer reference, surfaced on B's visual invoice, with `/financials` matching to confirm/add. Phase D only *surfaces* the reference on its funding views once B lands it — D builds no financials-matching itself.

### Sub-phase structure (QD17)
- **D1 — Customer dashboard + CRM scaffold:** `/crm` home, two-pane customer dashboard, breadcrumbs + linkable objects, contact links, `updateCustomerCrmFields`, agreements (upload + versions + linked-subscriptions, no seeding), subscriptions list. A-only except the B-dependent gauge/funding.
- **D2 — Customer Activity Timeline (own page):** `customerActivity` table + `logCustomerInteraction`, `getCustomerTimeline` merge, the `/crm/customers/:id/activity` page (statement-spine, filters, milestones), WhatsApp dunning (`DraftWhatsAppButton`). Derived-from-A events ship now; transactional events (orders/invoices/payments) light up as Phase B data lands.
- **D3 — B-dependent visuals:** credit gauge + per-subscription drawdown chart + funding dashboard (after B merges).
