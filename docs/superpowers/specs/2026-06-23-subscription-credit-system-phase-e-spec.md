# Subscription & Credit System — Phase E Spec (Telegram reminders + rule enforcement)

**Date:** 2026-06-23 (rev. 2 — Phase C folded into B; COGS alerting dropped; decisions folded)
**Status:** Draft — DEPENDS ON **Phase B merged**. **Phase C (invoicing + reconciliation) is folded into Phase B in totality** — there is no standalone Phase C; all former-C signatures (`createSubscriptionWeeklyInvoice`, `markWeeklyInvoicePaid`, `reconcileWeek`, `computeRolloverExpiry` wiring, `shortfall`/`shortfallFault`/`refundDue`) are owned by **Phase B**. "Depends on Phase B merged signatures" therefore covers the entire invoicing+reconciliation surface.
**Spec family:** design `docs/superpowers/specs/2026-06-23-subscription-credit-system-design.md` (§9 Telegram, §11 rule enforcement); plan `docs/superpowers/plans/2026-06-23-subscription-credit-system.md`.
**Predecessor reviews:** spec staffreview (I4, I5, §11); Phase A staffreview (M1/M2/M3, N1/N2).
**Companion visual proof:** `2026-06-23-subscription-cde-visual-mockups.html` (⑦ kanban treatment, ⑨ reminder copy).

> **Rev-5 change log (founders daily delivery-progress summary — new feature, confirmed 2026-06-24):** added a **6th daily cron** — a pieces-denominated `weekly-delivery-progress` summary to a NEW **`founders`** Telegram role (delivered product **pcs** vs the week's plan, one block per active account, **~18:00 WIB**). Same `subscriptionReminders` module + resilient-send/watchdog. **B-dependent** (delivered pcs derive from B's delivered subscription orders + `orders.by_subscription`, audit #5). Confirmed decisions: pcs = **product pieces, NOT BOM balls**; `founders` is a **distinct** role from `subscription-ops`.
>
> **Rev-2 change log:** Phase C → Phase B everywhere (C folded into B). **COGS-rise alerting DROPPED entirely** (Lucas, proofing c12/c13): removed `detectCogsRise`, AC10, EC10, Q10, Q16, T5. Folded resolved decisions: human-nudge crons (Q3), warn+flag cutoff (Q6), day-total above-baseline (Q14), stop-future-weeks termination (Q15), one-action triad (Q1), cron offset (Q4), no inbound command (Q5), guard-in-B (Q9), deleted-product warning (Q13).
>
> **Rev-4 change log (folds in the CRM principles conformance audit `docs/superpowers/specs/2026-06-23-crm-principles-conformance-audit.md`):** E was found mostly conformant; light edits only —
> - **#26 (D12):** clarified **AC6** — the visible "past 13:00 cutoff" warning banner is a **Phase B `DayPlanCell` (Task B14)** render concern driven by E's `locked` flag, NOT an E-owned UI surface. E flips the flag and owns no page.
> - **B6 (audit #6):** added the shared `src/lib/crmActivityTaxonomy.ts` (foundational, planned in B) to §2.1 — any subscription-ops/kanban badge sources its type→icon/color/label from it; E does NOT inline its own map.
> - **D11 (audit #1/#11/#12):** confirmed **AC11** is verify-only (kanban price strip is fully Phase B Task B16) and expanded E's verification checklist to cover the **3 extra leak sites** the audit found (`getByCustomer`, `getPackagingOrders` beyond the four named) **plus `lineMargin`/`lineCost`** stripping. Q11 entry updated accordingly.
>
> **Rev-3 change log (reconciled against the merged Phase B plan `docs/superpowers/plans/2026-06-23-subscription-phase-b-weekly-cycle.md`):** The consolidated B plan ALREADY delivers several things this spec had claimed — corrected here:
> - **Kanban read-only "🔒 Subscription" treatment is Phase B (Task B16)**, in BOTH `OrderSlideOver.tsx` + `OrderDetail.tsx`. Phase E no longer "owns" it (was §1.4 / AC10–AC12). **But B16 does NOT strip the partner `unitPrice` server-side** — staff would see confidential pricing on a subscription order. That is a **gap to raise** (fix in B16 or as an E refinement) — see Q11.
> - **`canAccessCrm` is added by Phase B (Task B14)**, not Phase D — Q17 resolved.
> - **Scheduler route is `/crm/customers/:id/subscriptions/:subId/week`** (Task B14) — the "Open in scheduler" target (Q12).
> - The reminder crons reference concrete B files: `confirmWeek` (`convex/subscriptions/scheduling/confirmWeek.ts`), `markWeeklyInvoicePaid`/`createSubscriptionWeeklyInvoice` (`convex/subscriptions/invoicing.ts`), `reconcileWeek` (`convex/subscriptions/reconcile.ts`). E's termination guard edits B's `confirmWeek.ts` + `weeks.ts` (`seedWeek`).

---

## 1. WHAT this phase delivers

Phase E is the **operational + enforcement layer** on top of the merged backend spine (A) and schedule/order-generation/invoicing/reconciliation (B). It adds:

1. **A `subscription-ops` Telegram delivery channel** — the 3rd known role, registered like `pack-list`/`sales-updates` (Pitfall #21: extend `KNOWN_TELEGRAM_ROLES`, no new env var; operator assigns the group via `/admin/telegram-chats`).
2. **5 WIB recurring reminder crons** (+ watchdogs), each reusing the `convex/telegram/salesSummary/` resilient-send playbook. **All 5 are pure human-nudges (Q3 resolved)** — they prompt a manager to act in-app; they perform **no** unattended confirm/mark-paid/credit writes. The watchdog only re-sends the notification. *(These 5 go to `subscription-ops`. A **6th** cron — the `founders` weekly-delivery-progress summary — is item 5 below: same machinery, different audience + a pieces metric.)*
3. **A rule-enforcement layer** for contract clauses 3–5, 10: per-day 13:00 prior-day lock (**warn+flag**, Q6), above-baseline supplier-confirmation flag (**day-total**, Q14), effective-dated permanent baseline change, effective-dated termination that stops **future** week generation (Q15), confidential-price hiding from non-managers. *(Clause 8 COGS-rise alerting is **dropped** — handled as a manual contract-renegotiation journey.)*
4. **(No kanban deliverable.)** The read-only "🔒 Subscription" rendering is **Phase B (Task B16)**, and the confidential-price strip is now a **B Task B16 amendment (gap #2)**. Phase E only *verifies* both landed; it builds neither.
5. **A daily weekly-delivery-progress summary to the `founders` chat** *(new — the pieces-denominated sibling of the credit drawdown)* — a separate daily cron (the 6th) that posts **one block per active subscription account**: how many **product pieces** (pcs — **NOT BOM balls**, since the plan is denominated in product pcs) have been delivered this week vs the account's weekly plan, and the remainder. Format: `Week of DD/MM/YY — <Account> / <delivered> out of <plan> / <remaining> pcs remaining in quota`. Destination is a **new `founders` Telegram role** (Pitfall #21), distinct from `subscription-ops`. **B-dependent** (delivered pcs derive from Phase B's delivered subscription orders — see §8).

### Explicitly OUT (belongs elsewhere)
- Order generation, `confirmWeek`, drawdown-on-funded, schedule calendar UI, **weekly/top-up invoice builders, `reconcileWeek`, funding dashboard, AND the read-only "🔒 Subscription" kanban rendering (Task B16)** — **Phase B** (includes former-C invoicing+reconciliation). Phase E only *reminds* about and *links to* these; it never owns the reconcile/credit math or the kanban rendering.
- CRM home, customer record, breadcrumbs, drawdown chart, agreement upload, **activity timeline** — **Phase D**. Phase E's "Open in scheduler" link targets the Phase B/D route.
- Refund payout mechanism — deferred (design §13 Q4). **COGS-rise alerting — dropped (not deferred).**

---

## 2. Data & flow

### 2.1 Consumes (existing / Phase A–B merged)

| Artifact | Source | Use in Phase E |
|---|---|---|
| `KNOWN_TELEGRAM_ROLES`, `TelegramRole`, `isKnownTelegramRole`, `TELEGRAM_ADMIN_URL`, `TELEGRAM_BOT_USERNAME` | `convex/telegram/config.ts` | add `"subscription-ops"` **and `"founders"`** |
| `getChatIdByRole`, `getChatAuth`, `parseCommand`, `TelegramCommand` | `convex/telegram/chatRegistry.ts` | resolve destination; (no new command — Q5) |
| `COMMAND_POLICY`, `decideWebhookOutcome` | `convex/telegram/webhook.ts` | unchanged (no new command) |
| `sendSalesSummaryResilient`/`watchdogSalesSummary`, `RESILIENT_MAX_ATTEMPTS`, `resilientRetryDelayMs`, `isTransientError` | `convex/telegram/salesSummary/sendSalesSummary.ts`, `cronRetry.ts` | template for the reminder triad |
| `wasDelivered`/`recordDelivery`, slot-key scheme | `convex/telegram/deliveryReceipts.ts` | `subscriptionSlotKey(...)` + receipts for watchdog dedupe |
| `sendTelegramHtml` | `convex/lib/telegramHtml.ts` | delivery |
| `getWibDateStr` + week helpers (`calculateWeekRange`) | `convex/lib/periodRange.ts` | WIB day/week math, slot keys (Pitfall #18) |
| `subscriptions`, `subscriptionWeeks` (`plannedDays[].locked`, `status`), `creditLedger` | Phase A | read for reminders; flip `locked` for the cutoff |
| `subscriptions.baselineDailyQty`, `confidentialPrice`, `unitPrice` | Phase A | above-baseline check; price hiding |
| `subscriptions.terminationNoticeDate`/`endDate`, `permanentChangeNoticeDays`, `terminationNoticeDays` | Phase A | effective-dated termination / permanent-change |
| `orders.subscriptionId`/`subscriptionWeekId`/`fundingSource` | Phase A | identify subscription orders on the kanban |
| `subscriptions.weeklyQty` + `subscriptionWeeks.plannedDays` | Phase A | weekly-delivery-progress **plan total** = the **week's live `plannedDays` pcs sum** (use this, not the static `weeklyQty`, so mid-week top-ups reflect) |
| Delivered subscription orders — `orders.subscriptionId`/`status`/qty + **`orders.by_subscription`** index | Phase A fields + **Phase B** order-gen/delivery + **audit #5** index | weekly-delivery-progress **delivered pcs this week** = Σ product qty of this week's subscription orders in a terminal-delivered `status` (`Complete`/`CompleteShipped`/`PickedUp`) — same "delivered" definition as Phase D AC13 (resolve once, reuse) |
| `confirmWeek`, week status transitions, order-gen, **`markWeeklyInvoicePaid`, `reconcileWeek`** | `convex/subscriptions/scheduling/`, `convex/invoices/` **(Phase B — incl. former C)** | reminders link to / reference these actions |
| `OrderSlideOver.tsx`, `OrderDetail.tsx` Actions | `src/components/orders/`, `src/pages/` | read-only subscription treatment |
| `<ProtectedRoute requiredPermission>` + `ROLE_PERMISSIONS` | `src/App.tsx`, `src/lib/types.ts` | `canAccessCrm` (from Phase D) — the route the kanban link respects |
| `ACTIVITY_TAXONOMY` / `getActivityVisual` | `src/lib/crmActivityTaxonomy.ts` (foundational, planned in B per audit #6/B6) | **B6 alignment (audit #6):** any subscription-ops or kanban badge (type→icon/color/label) MUST source its mapping from this shared module — Phase E does NOT inline its own type→icon/color map (avoids the pre-Phase-81 platform-mapper drift). |

### 2.2 Adds

**Telegram config** — append `"subscription-ops"` **and `"founders"`** to `KNOWN_TELEGRAM_ROLES`. No env var (Pitfall #21); operator assigns each group via `/admin/telegram-chats`.

**Reminder send-actions** — new module `convex/telegram/subscriptionReminders/`, mirroring `salesSummary/`. **Q1 resolved: ONE action parameterized by `kind`** (matches the `sendSalesSummary` cadence-arg precedent; keeps the `scheduler.runAfter` concrete-self-reference invariant):
- `sendSubscriptionReminder(internalAction, { kind: ReminderKind })` — resolves the destination role **from `kind`** via `getChatIdByRole` (the 5 ops nudges → `subscription-ops`; **`weekly-delivery-progress` → `founders`**), builds the per-kind message from a pure formatter, sends via `sendTelegramHtml`, records a receipt. **Human-info only** — reads + presents; performs no confirm/mark-paid/ledger write.
- `sendSubscriptionReminderResilient(internalAction, { kind, attempt? })` — transient-retry wrapper.
- `watchdogSubscriptionReminder(internalAction, { kind })` — re-sends the **notification** only if no receipt for the slot.
- `ReminderKind = "confirm-next-week" | "invoice-due" | "today-deliveries" | "change-cutoff" | "reconcile" | "weekly-delivery-progress"`.
- Pure formatters (TDD): `formatConfirmReminder`, `formatInvoiceDueReminder`, `formatTodayDeliveries` (per-product split), `formatChangeCutoffReminder`, `formatReconcileReminder`, **`formatWeeklyDeliveryProgress`** (one block per active account: `Week of DD/MM/YY — <Account>` / `<delivered> out of <plan>` / `<remaining> pcs remaining in quota`; integer pcs). **Draft copy in the visual proof ⑨** (Q2 — refine there; locked via formatter unit tests).

**Slot keys + read queries**
- `subscriptionSlotKey(kind, nowMs)` in `deliveryReceipts.ts` (WIB day/week keyed).
- Read-only `internalQuery`s feeding formatters (`getWeeksToConfirm`, `getWeeklyInvoicesDue`, `getTodaySubscriptionDeliveries`, `getTomorrowChangeCutoffDays`, `getWeeksToReconcile`, **`getWeeklyDeliveryProgress`**) under `convex/subscriptions/reminders/` — read-only, cron context. `getWeeklyDeliveryProgress` returns, per active subscription with a current week: `{ account, weekStart, weekPlannedPcs (Σ plannedDays qty), deliveredPcs (Σ delivered subscription-order product qty via orders.by_subscription), remaining = max(0, plan − delivered), overBy }`.

**Cron registrations** (`convex/crons.ts`) — 6 primary + 6 watchdog, WIB (UTC = WIB − 7h). **Q4 resolved: the daily-deliveries slot is offset off the pack-list 00:00/00:15 UTC convoy.**
| Reminder | WIB | UTC | Watchdog UTC |
|---|---|---|---|
| confirm next week | Sun 17:00 | Sun 10:00 | Sun 10:15 |
| weekly invoice due | Mon 08:00 | Mon 01:00 | Mon 01:15 |
| today's deliveries | **daily 07:05** | **daily 00:05** | **daily 00:20** |
| change cutoff (tomorrow) | daily 12:30 | daily 05:30 | daily 05:45 |
| prior-week reconcile | Mon 09:00 | Mon 02:00 | Mon 02:15 |
| weekly delivery progress → `founders` | daily 18:00 | daily 11:00 | daily 11:15 |

> **AC (Q4):** no two **primary** cron launches share an exact UTC minute, and no two **watchdog** launches share an exact UTC minute — verified against `crons.ts` (existing pack-list 00:00/00:15, sales-summary Mon 00:00) at plan time. The daily slot moved to 00:05/00:20 UTC to avoid piling onto the pack-list transient window.

**No new inbound bot command (Q5 resolved).** The 5 crons are outbound-only; `COMMAND_POLICY`/`parseCommand`/dispatch are untouched. (If a future `/subscriptions` command is added, it must get a `{requiresRole:"subscription-ops"}` `COMMAND_POLICY` entry — Pitfall #22.) **AC5 → N/A; record explicitly in the acceptance log.**

**Rule-enforcement backend** (`convex/subscriptions/enforcement/`):
- `flipDayLocksAtCutoff` — the 12:30 cron sets `plannedDays[].locked = true` on tomorrow's day for every active week past its cutoff. **Q6 resolved: warn + flag (metadata only)** — the lock does NOT change `items`/totals and Phase B's edit mutation is NOT modified to reject; the scheduler UI warns on a locked-day edit but still allows it. (Hard-enforce is a possible v2.)
- `detectAboveBaseline(dayItems, baselineDailyQty)` — pure predicate. **Q14 resolved: compare the day's TOTAL qty across products** vs `baselineDailyQty`. On exceed, sets **`needsSupplierConfirmation`** (warn-only — Q7) — **NEW schema field, see §7**.
- `applyPermanentBaselineChange` — effective-dated at `noticeDate + permanentChangeNoticeDays` (14d). Pending change staged in a **NEW `subscriptions.pendingBaselineChange` field** (Q8, §7); a daily cron applies it on/after its effective date.
- **Termination guard — Q9/Q15 resolved:** guard lives **inside Phase B's `seedWeek`/`confirmWeek`** (covers BOTH the auto path and the manual scheduler path — a cron-only gate would let the manual scheduler bypass it). It **stops generating FUTURE weeks** once `endDate` has passed; the current in-flight week runs to reconcile normally (Q15). Phase E adds the guard → **Phase E modifies Phase B code** (`seedWeek`/`confirmWeek` become edit targets).
- *(`detectCogsRise` removed — COGS alerting dropped, c12/c13.)*

**Confidential-price suppression (Q11/Q18 — the ONE kanban thing E may still own):**
- The read-only kanban rendering is built in **Phase B Task B16** (badge + hidden Actions + "Open in scheduler" → `/crm/customers/:id/subscriptions/:subId/week`). B16 keeps the order visible so kitchen can produce (design §6) — but it does **not** strip the partner `unitPrice`/credit, and the kanban is reachable by **order_staff/kitchen** with a `useSessionQuery` that subscribes **on mount**.
- **Gap:** confirm against merged B16 whether subscription-order line prices are visible to staff. If they are, fix **server-side** — the staff-facing kanban/order query must **omit `unitPrice`/credit for non-managers** (NOT client-side hide, which leaks over the network; NOT a `["manager","admin"]`-only query, which crashes the kanban for staff on mount — the Nilson Pitfall-#19 pattern). Whether this lands as a B16 amendment or an E refinement is the open part of Q11.

### 2.3 schedule = invoice = credit (Phase E's relationship)
Phase E **never constructs** `ScheduleLine`s/invoices/ledger entries — that invariant is owned by B. Reminders **read** already-derived figures and present them. The only mutation Phase E performs is flipping `plannedDays[].locked` (metadata; no `items`/total change) and writing `needsSupplierConfirmation` (a flag; no total change). No re-keying.

---

## 3. Acceptance criteria

- [ ] **AC1** `KNOWN_TELEGRAM_ROLES` includes `"subscription-ops"`; no env var; assignable via `/admin/telegram-chats` (Pitfall #21).
- [ ] **AC2** 5 primary crons fire at the WIB times above (daily deliveries at 07:05/00:05 UTC); each points at the `*Resilient` wrapper reusing `cronRetry.ts` — no re-rolled retry logic.
- [ ] **AC3** Each reminder has a watchdog 15 min later that re-sends **only the notification** when no `deliveryReceipts` receipt exists for the slot (no double-post on a healthy run; no action re-performed — they're nudges).
- [ ] **AC4** Send resolves via `getChatIdByRole({ role })` (role from `kind`) and fails fast (logged, recoverable) when no chat is assigned (matches `sales-updates`).
- [ ] **AC4b (founders weekly-delivery-progress, B-dependent)** A 6th daily cron (18:00 WIB / 11:00 UTC; watchdog 11:15) posts to the **`founders`** role **one block per active subscription account**: `Week of DD/MM/YY — <Account>` / `<deliveredPcs> out of <weekPlannedPcs>` / `<remaining> pcs remaining in quota`. **`deliveredPcs` counts product pieces, NOT BOM balls**; `weekPlannedPcs` = the week's live `plannedDays` total (reflects top-ups); `remaining = max(0, plan − delivered)` with an over-plan flag (never negative); accounts with no active current week are **skipped**. `founders` is in `KNOWN_TELEGRAM_ROLES`, assignable via `/admin/telegram-chats`. Delivered count uses `orders.by_subscription` + the terminal-delivered `status` set (B-dependent — §8).
- [ ] **AC5 → N/A** No inbound command added (Q5). Recorded explicitly in the acceptance log (not left unchecked).
- [ ] **AC6** The 12:30 cutoff cron flips `plannedDays[].locked = true` for tomorrow's day on every active, non-ended week; **lock is metadata only** — no change to `items`/`lineTotal`/credit; Phase B's edit mutation is unchanged (warn+flag, Q6). **The visible "past 13:00 cutoff" warning banner is a Phase B render concern (audit #26 / D12):** when `plannedDays[].locked` is true, **Phase B's `DayPlanCell` (Task B14, which owns the scheduler render) shows the banner.** Phase E only flips the flag — it owns no page and renders no banner. AC6 verifies the flag flips; the banner appearance is verified against B14.
- [ ] **AC7a (schema)** `needsSupplierConfirmation` field added to `plannedDays[]` entry + codegen committed (gateable now).
- [ ] **AC7b (behavior)** A day whose **total** qty across products > `baselineDailyQty` is flagged `needsSupplierConfirmation` (warn-only); a day at/below baseline is not (Q7/Q14).
- [ ] **AC8** A permanent baseline change staged in `pendingBaselineChange` takes effect exactly at `noticeDate + 14d`, not before (Q8).
- [ ] **AC9** Once `endDate` (= `terminationNoticeDate + 30d`) has passed, no **new/future** weeks are seeded/confirmed — guarded inside Phase B `seedWeek`/`confirmWeek` (both auto + manual). The current in-flight week still reconciles (Q9/Q15).
- [ ] **AC10 (Phase B owns the rendering — verify, don't rebuild):** the "🔒 Subscription" read-only treatment exists in BOTH `OrderSlideOver.tsx` AND `OrderDetail.tsx` (Pitfall #20) — delivered by Phase B Task B16. Phase E does not re-implement it.
- [ ] **AC11 (owned by B Task B16 amendment, gap #2 — Phase E VERIFIES, does not build):** no partner pricing on a subscription order reaches order_staff/kitchen — stripped **server-side** for non-managers (not client-side, not via a manager-only query — Pitfall #19). Phase E verifies this landed in B; it is not an E deliverable. (Q11.) **Per the audit (#1/#11/#12), E's verification checklist confirms B16 covers all of:**
  - **All staff-reachable order queries, not just the four named** (audit #1/#12): `get`, `getByOrderNumber`, `getKitchenOrders` (`convex/orders/queries.ts`), `getKitchenPackingOrders` (`convex/orders/kitchenQueries.ts`) **PLUS the 3 extra leak sites the audit found** — `getByCustomer` and `getPackagingOrders` (`convex/orders/queries.ts`) — each converted to `protectedQuery` + run through `stripSubscriptionPricing`, or documented as unable to carry subscription orders.
  - **`stripSubscriptionPricing` nulls `item.lineMargin` AND `item.lineCost`** in addition to `unitPrice`/`lineTotal` (audit #11) — `confirmWeek` sets `lineMargin = lineTotal = qty*partnerPrice`, so an un-stripped `lineMargin`/`lineCost` lets a non-manager reconstruct the confidential price.
- [ ] **AC12 (M2b — terminal-week guard):** no Phase E cron mutates a `subscriptionWeek` in terminal status (`closed`); reconcile reminder is read-only.
- [ ] **AC13 (access, Pitfall #19 / I5):** every new query/mutation is `roles:["manager","admin"]` (or internal/cron) EXCEPT the deliberately staff-safe kanban query (AC11); the kanban link respects `canAccessCrm`'s route; code-auditor greps all registrations.
- [ ] **AC14** `npm run type-check`, `npx vitest run convex/telegram convex/subscriptions`, `npm run build`, and `npx convex codegen` (committed `_generated/` for the 2 new fields) all pass.

---

## 4. Edge cases (scoped to E)

- [ ] **EC1** Cron fires, no chat assigned → fail fast, logged, recoverable (mirrors `sales-updates`).
- [ ] **EC2** Transient worker spike at firing → `*Resilient` retries; +15m watchdog covers a double-death (incident 2026-06-02).
- [ ] **EC3** Primary sent, receipt not recorded → watchdog re-sends once; `recordDelivery` idempotent → no permanent double-post. (Safe because nudges have no side effect — Q3.)
- [ ] **EC4** Manager/staff mounts the kanban before any dialog → backend `roles` must fit the caller; the staff-safe kanban query is callable by staff (AC11), the manager detail query is not subscribed by staff.
- [ ] **EC5** `unitPrice` changed mid-week → reminders read the **snapshotted** price on `plannedDays[].items`, not live `subscriptions.unitPrice`. **Plan-time:** confirm Phase B freezes `plannedDays[].items.unitPrice` at confirm (not re-derived on read).
- [ ] **EC6** Day's product removed from `menuProducts` (N2 sentinel) → today's-deliveries reminder shows a **⚠️ deleted-product warning** line alongside the stored `productName` (Q13 resolved: warn, don't silently hide).
- [ ] **EC7** Above-baseline on a multi-product day → measured against the day's **total** qty (Q14 resolved).
- [ ] **EC8** Cutoff lock on a day with no template entry → no-op (does not create a day).
- [ ] **EC9** Termination mid-week → stop **future** weeks only; current week runs to reconcile (Q15 resolved).

---

## 5. Testing focus

- **T1** `subscriptionSlotKey(kind, nowMs)` — deterministic per WIB occurrence; the daily-07:05 slot has no WIB-midnight boundary issue.
- **T2** The 5 `format*Reminder` pure formatters — assert HTML content from fixed week/pool data (per-product split for deliveries; credit figures for invoice-due/reconcile; integer IDR). Lock the proof-⑨ copy.
- **T3** `detectAboveBaseline(dayItems, baselineDailyQty)` — **day-total** boundary cases: equal (not flagged), one over (flagged), multi-product sum at/over baseline.
- **T4** `flipDayLocksAtCutoff` lock-decision predicate — given `now`, `changeCutoffHour`/`dayOffset`, target day → locked? WIB-correct via `periodRange`.
- **T5** Effective-date predicates — `permanentChangeEffective(noticeDate, days, now)` and `terminationEffective(noticeDate, days, now)` — at/before/after boundary.
- **T6** Cron registration smoke — all 10 names present, unique, no UTC-minute collision (primaries; watchdogs), point at the resilient/watchdog actions.
- **Fixtures:** a 7-day week with a multi-product + above-baseline day; a week with `unitPrice` changed vs default (EC5); a terminated subscription past `endDate`; a day referencing a deleted product (EC6).

---

## 6. Access control + rollback / ship-dark

- **Access:** reminder data queries + enforcement mutations are `roles:["manager","admin"]` (or internal/cron). `canAccessCrm` is added by **Phase B (Task B14)** — Q17 resolved; E aligns to it, does not invent a key. The only deliberately staff-reachable read is the price-suppression fix IF it's owned by E (AC11).
- **Ship-dark:** crons register dark — until an operator assigns the `subscription-ops` **and `founders`** chats, those sends fail fast harmlessly (EC1). The kanban treatment only triggers when `order.subscriptionId` is set (Phase-B-generated orders).
- **Rollback:** Phase E **IS a schema change** — 2 additive fields (`needsSupplierConfirmation` on `plannedDays[]`, `subscriptions.pendingBaselineChange`) + codegen, NOT pure-additive-code. Otherwise additive (new module, new cron entries, additive frontend branches). Revert = revert commits. Check `gh run list` after merge (split-brain guard).

---

## 7. Schema additions required

Phase E **adds 2 fields** (its first task: schema delta + `npx convex codegen` + commit `_generated/`):

1. **`needsSupplierConfirmation: v.optional(v.boolean())`** on each `subscriptionWeeks.plannedDays[]` entry — set by `detectAboveBaseline` (day-total > baseline), warn-only (Q7/Q14).
2. **`subscriptions.pendingBaselineChange: v.optional(v.object({ newQty: v.number(), effectiveDate: v.number() }))`** — stages a permanent baseline change before its `noticeDate+14d` effective date; a daily cron applies it (Q8).

`plannedDays[].locked` (AC6), `terminationNoticeDate`/`endDate` (AC9), `unitPrice`/`confidentialPrice` (AC11) already exist in Phase A. *(The former COGS-rise de-dupe field is dropped with the feature.)*

The **`founders` role** is a `KNOWN_TELEGRAM_ROLES` config entry (no schema change). The **`orders.by_subscription`** index needed by the delivery-progress count lands in **Phase B's** schema PR (audit #5), not E — no E schema field for cron #6.

---

## 8. Dependencies on Phase B's merged code

Confirm at plan time against **merged Phase B** (paths from the B plan; signatures finalize on merge):
- **(B)** `confirmWeek({ subscriptionWeekId })` — `convex/subscriptions/scheduling/confirmWeek.ts`. Sun-17:00 reminder links to it (human nudge — does NOT call it).
- **(B)** `seedWeek` (`convex/subscriptions/weeks.ts`) + `confirmWeek` — Phase E adds the `endDate` termination guard INSIDE them (Q9 — both are edit targets).
- **(B)** `plannedDays[].items.unitPrice` frozen at confirm via `makeScheduleLine`; `seedWeek` `source:"previousWeek"` re-prices at live `unitPrice` (B Task B6) — confirm reminders read the confirmed week's snapshot, not a re-seed (EC5).
- **(B)** scheduler route `/crm/customers/:id/subscriptions/:subId/week` (Task B14) — the "Open in scheduler" target (Q12).
- **(B)** `createSubscriptionWeeklyInvoice` / `markWeeklyInvoicePaid` — `convex/subscriptions/invoicing.ts`. Mon-08:00 reminder references (human nudge — does NOT call them; Q3). `markWeeklyInvoicePaid` posts the `topup` with `createdBy` (the accountability source Phase D's timeline reads).
- **(B)** `reconcileWeek` — `convex/subscriptions/reconcile.ts`; `shortfall`/`shortfallFault`/`refundDue` populated; per-tranche FIFO via `reconcileMath.ts` (M1/C2). Mon-09:00 reminder reads them; E does not compute.
- **(B)** read-only kanban "🔒 Subscription" rendering (Task B16, both order surfaces) — E verifies the price-suppression gap (AC11), does not rebuild.
- **(B)** `canAccessCrm` in `ROLE_PERMISSIONS` (Task B14) — link target + access alignment.
- **(B) — for the founders weekly-delivery-progress summary (cron #6):** B must (a) generate subscription orders + advance them to a terminal-delivered `status`, and (b) land the **`orders.by_subscription`** index (audit #5). Without delivered orders there are zero pcs to count; the "delivered" status set must match Phase D AC13's delivered-vs-planned definition (resolve once, reuse). The plan total reads the week's `plannedDays` sum (Phase A), so it's available pre-B, but the delivered count is fully B-dependent.

---

## 9. Open Questions

Resolved in this revision (recorded for the plan):
- **Q1 →** One `sendSubscriptionReminder(kind)` triad (salesSummary precedent).
- **Q3 →** Human-nudge crons only — no unattended confirm/mark-paid/ledger writes; watchdog re-sends notification only.
- **Q4 →** Daily deliveries offset to 07:05 WIB (00:05/00:20 UTC); assert no UTC-minute collision among primaries / among watchdogs.
- **Q5 →** No inbound command; AC5 N/A (recorded).
- **Q6 →** Cutoff lock = warn + flag (metadata only); Phase B edit mutation unchanged.
- **Q7 →** `needsSupplierConfirmation` on `plannedDays[]` entry, warn-only (NEW field, §7).
- **Q8 →** `subscriptions.pendingBaselineChange {newQty, effectiveDate}` + daily apply cron (NEW field, §7).
- **Q9 →** Termination guard inside Phase B `seedWeek`/`confirmWeek` (auto + manual).
- **Q12 →** Kanban rendering is **Phase B Task B16** (production/auto-advance stays, edit/status/delete hidden, "Open in scheduler" → `/crm/customers/:id/subscriptions/:subId/week`). E does not rebuild it.
- **Q17 →** `canAccessCrm` is added by **Phase B (Task B14)** — E aligns, does not invent.
- **Q13 →** Today's-deliveries reminder shows a ⚠️ deleted-product warning (not silent).
- **Q14 →** Above-baseline measured on the day's **total** qty across products.
- **Q15 →** Termination stops **future** weeks only; current week reconciles.
- **~~Q10, Q16~~ →** DROPPED with COGS-rise alerting (c12/c13).

Still OPEN:
- **Q2 (visual)** — Exact reminder copy for the 5 nudges. Drafted in visual proof ⑨; refine and lock via formatter unit tests.
- **Q11 (PLUGGED IN B)** — Confidential partner price leaking to staff on the kanban is now **raised as an amendment on Phase B Task B16** (`▶ AMENDMENT gap #2` in `2026-06-23-subscription-phase-b-weekly-cycle.md`): strip `unitPrice`/`lineTotal`/`totalAmount` **plus `lineMargin`/`lineCost`** (audit #11) server-side for non-managers on subscription orders, across **all staff-reachable order queries** — the four named + the 3 extra leak sites the audit found (`getByCustomer`, `getPackagingOrders`; audit #1/#12). Owned by B (it builds the rendering + the order queries). Phase E no longer carries a kanban deliverable — it only verifies B16's coverage per AC11's checklist.

---

*Spec rev-4 — Phase E (Telegram + rule enforcement). Reconciled to the merged Phase B plan AND the CRM conformance audit: kanban rendering + price strip (incl. `lineMargin`/`lineCost` + the 3 extra leak sites) + `canAccessCrm` + scheduler route + the locked-day warning banner on `DayPlanCell` + invoicing/reconcile files are Phase B; E = subscription-ops crons + rule enforcement (+ a price-suppression coverage to VERIFY, and shared `crmActivityTaxonomy` for any badge). 15 resolved, 2 open (Q2 copy, Q11 gap).*
