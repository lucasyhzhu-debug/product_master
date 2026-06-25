# Subscription & Credit System — Phase E **Slice 1**: Telegram notification layer

**Date:** 2026-06-25
**Status:** Draft → pipeline (spec→plan, 2 review gates)
**Depends on:** Phase A (`22b628f7`), **Phase B merged** (`6a6466c4`, B0 schema `62155e13`), Phase D Slice 0 (`4cd362fe`) — all on `main` as of `4cd362fe`.
**Parent spec:** `docs/superpowers/specs/2026-06-23-subscription-credit-system-phase-e-spec.md` (rev-4/5 — the *whole* Phase E). This slice carves out the **notification layer only**; the enforcement layer is **Slice 2** (deferred — see §10).
**Template (reuse, do not re-roll):** `convex/telegram/salesSummary/` + `convex/telegram/cronRetry.ts` + `convex/telegram/deliveryReceipts.ts`.
**Companion visual proof:** `2026-06-23-subscription-cde-visual-mockups.html` (⑨ reminder copy).

> **Why a slice.** Phase E (parent spec) spans two independent subsystems: (1) an outbound Telegram **notification layer** (additive, no schema, ship-dark, reuses the proven sales-summary playbook) and (2) a **rule-enforcement layer** (2 new schema fields + edits *inside* Phase B's `seedWeek`/`confirmWeek` + lock-flip/baseline/termination logic). They share no code beyond the cron file and have different risk profiles. Per the pipeline, this spec is **Slice 1 only**. Slice 2 is charted in §10 but NOT specced here.

---

## 1. WHAT this slice delivers

A read-only, outbound-only **subscription notification layer** on top of merged A+B, mirroring the `sales-updates` bot exactly:

1. **Two new Telegram delivery roles** — `"subscription-ops"` and `"founders"` — appended to `KNOWN_TELEGRAM_ROLES` (`convex/telegram/config.ts`). No new env var (Pitfall #21); each is assigned a chat by an operator via `/admin/telegram-chats`. Ship-dark: until assigned, sends fail fast harmlessly (EC1).
2. **A new module `convex/telegram/subscriptionReminders/`** mirroring `salesSummary/`: ONE `kind`-parameterized send action + its resilient wrapper + its watchdog (Q1: one action parameterized by `kind`, matching the `sendSalesSummary(cadence)` precedent and preserving the `scheduler.runAfter` concrete-self-reference invariant).
3. **Six recurring WIB crons + six watchdogs** (`convex/crons.ts`), each pointing at the resilient wrapper and reusing `cronRetry.ts` + `deliveryReceipts.ts` — **no re-rolled retry/watchdog logic.**
4. **Six read-only `internalQuery`s** (`convex/subscriptions/reminders/`) feeding pure formatters; plus `subscriptionSlotKey(kind, nowMs)` in `deliveryReceipts.ts`.

**All six sends are pure human-nudges / read-only summaries (Q3).** They read already-derived figures from A/B and present them. They perform **NO** write of any kind — no `confirmWeek`, no `markWeeklyInvoicePaid`, no ledger entry, no `locked` flip, no schema field. The watchdog re-sends only the notification.

The six:

| # | `kind` | Audience role | What it says (reads only) | WIB | UTC | Watchdog UTC |
|---|---|---|---|---|---|---|
| 1 | `confirm-next-week` | subscription-ops | weeks still in `planned` for next week → "confirm in app" | Sun 17:00 | Sun 10:00 | Sun 10:15 |
| 2 | `invoice-due` | subscription-ops | weeks `confirmed`/`invoiced` & unpaid → "create/mark-paid invoice" | Mon 08:30 | **Mon 01:30** | **Mon 01:45** |
| 3 | `today-deliveries` | subscription-ops | today's planned subscription deliveries, per-product split | daily 07:05 | daily 00:05 | daily 00:20 |
| 4 | `change-cutoff` | subscription-ops | tomorrow's days approaching the 13:00 change cutoff | daily 12:30 | daily 05:30 | daily 05:45 |
| 5 | `reconcile` | subscription-ops | prior week in `delivering`/unreconciled → "reconcile in app" | Mon 09:00 | Mon 02:00 | Mon 02:15 |
| 6 | `weekly-delivery-progress` | **founders** | per active account: delivered pcs vs week plan + remaining | daily 18:00 | daily 11:00 | daily 11:15 |

> **Cron-collision reconciliation (vs parent spec rev-4):** parent spec put `invoice-due` at **Mon 01:00 UTC**, which collides with the existing `sales summary monthly` (`{day:1, hourUTC:1, minuteUTC:0}` = 1st 01:00 UTC) on any 1st-of-month that is a Monday (and its watchdog at 01:15). **This slice moves `invoice-due` to Mon 01:30 / wd 01:45** to keep the AC-Q4 invariant ("no two primary launches share an exact UTC minute; no two watchdog launches share an exact UTC minute") true against the **current** `crons.ts` (existing primaries 00:00, 06:00, 16:00, Mon 00:00, day-1 01:00; existing watchdogs 00:15, 06:15, 16:15, Mon 00:15, day-1 01:15). The interval cron ("sync internal orders revenue", `{hours:1}`) has no fixed minute and is excluded from the minute-collision check.

### Explicitly OUT of this slice
- **All rule enforcement** — `flipDayLocksAtCutoff` (the `locked` flip), `detectAboveBaseline` + `needsSupplierConfirmation`, `pendingBaselineChange` + apply cron, the `endDate` termination guard inside B's `seedWeek`/`confirmWeek` — **Slice 2** (§10). The `change-cutoff` cron in THIS slice only *notifies*; it does not flip `locked`.
- **Confidential-price strip verification** (parent AC11) — belongs with Slice 2 (it gates the same enforcement merge) or rides on Phase B Task B16; not a Slice-1 deliverable.
- Order generation, invoicing/reconcile math, scheduler/kanban UI, CRM surfaces — Phase B / Phase D.
- Any inbound bot command (parent Q5) — none added; `COMMAND_POLICY`/`parseCommand`/webhook dispatch untouched.

---

## 2. Data & flow

### 2.1 Consumes (all exist on `main` — verified at spec time)

| Artifact | Source | Use |
|---|---|---|
| `KNOWN_TELEGRAM_ROLES` (`["pack-list","sales-updates"]`), `TelegramRole`, `isKnownTelegramRole` | `convex/telegram/config.ts` | append `"subscription-ops"`, `"founders"` |
| `getChatIdByRole`, `getChatAuth` | `convex/telegram/chatRegistry.ts` | resolve destination by role; throws (fail-fast) if unassigned |
| `sendSalesSummary`/`sendSalesSummaryResilient`/`watchdogSalesSummary` shape | `convex/telegram/salesSummary/sendSalesSummary.ts` | structural template for the new triad |
| `RESILIENT_MAX_ATTEMPTS`, `resilientRetryDelayMs`, `isTransientError` | `convex/telegram/cronRetry.ts` | transient-retry, reused verbatim |
| `wasDelivered`, `recordDelivery`, `salesSlotKey`/`packSlotKey` pattern | `convex/telegram/deliveryReceipts.ts` | receipts + new `subscriptionSlotKey` |
| `sendTelegramHtml` | `convex/lib/telegramHtml.ts` | delivery |
| `getWibDateStr`, `utcToWibMonthStr` (+ week range helper) | `convex/lib/periodRange.ts` | WIB day/week math for slot keys + "this week" window (Pitfall #18 — canonical WIB helpers only) |
| `subscriptions` (`status`, `label`, `weeklyQty`, `baselineDailyQty`, `changeCutoffHour`=13, `changeCutoffDayOffset`=-1) + `by_status` index | `convex/schema.ts:2501` | iterate active subs; cutoff window |
| `subscriptionWeeks` (`status` ∈ planned/confirmed/invoiced/paid/delivering/reconciled/closed; `plannedDays[{date,deliverByTime,items[{menuProductId,productName,qty,unitPrice,lineTotal}],locked}]`; `weekStart`/`weekEnd`; `weeklyInvoiceId`; `paymentReceivedAt`) + `by_subscription_weekStart`, `by_status` | `convex/schema.ts:2539` | week-state reads for kinds 1,2,3,4,5,6 |
| `orders` `subscriptionId`/`subscriptionWeekId`/`status` + **`by_subscription`** index (`schema.ts:357`) | `convex/schema.ts` | delivered-pcs count for kind 6 |
| terminal-delivered order status set (`CompleteShipped`, `PickedUp`, + the codebase's "complete" terminal) | `src/lib/orderConstants.ts` / status helpers | "delivered" definition for kind 6 (resolve once, reuse) |

### 2.2 Adds (all additive — no schema migration)

**Config** — append two roles to `KNOWN_TELEGRAM_ROLES`.

**`convex/telegram/subscriptionReminders/`**
- `subscriptionRemindersFormat.ts` — six **pure** formatters (TDD targets):
  `formatConfirmReminder`, `formatInvoiceDueReminder`, `formatTodayDeliveries` (per-product split; ⚠️ deleted-product warning line, EC6), `formatChangeCutoffReminder`, `formatReconcileReminder`, `formatWeeklyDeliveryProgress` (one block per active account: `Week of DD/MM/YY — <Account>` / `<delivered> out of <plan>` / `<remaining> pcs remaining in quota`; integer pcs; over-plan flagged, never negative). Copy locked via unit tests against proof ⑨ (Q2).
- `sendSubscriptionReminder` (`internalAction`, `{ kind: ReminderKind }`) — resolves role from `kind` (kinds 1–5 → `subscription-ops`; kind 6 → `founders`) via `getChatIdByRole`, runs the matching read query, builds the message via the pure formatter, sends via `sendTelegramHtml`, records a receipt via `recordDelivery(subscriptionSlotKey(kind, Date.now()))`. **Read + present only.** Explicit return type (breaks circular inference — same reason as `sendSalesSummary`/`sendPackList`).
- `sendSubscriptionReminderResilient` (`{ kind, attempt? }`) — transient-retry wrapper; `scheduler.runAfter` self-references the concrete resilient action.
- `watchdogSubscriptionReminder` (`{ kind }`) — re-sends the notification only when no receipt exists for the slot.
- `ReminderKind = "confirm-next-week" | "invoice-due" | "today-deliveries" | "change-cutoff" | "reconcile" | "weekly-delivery-progress"`.

**`convex/subscriptions/reminders/`** — six read-only `internalQuery`s (cron context), one per kind:
`getWeeksToConfirm`, `getWeeklyInvoicesDue`, `getTodaySubscriptionDeliveries`, `getDaysApproachingCutoff`, `getWeeksToReconcile`, `getWeeklyDeliveryProgress`.
`getWeeklyDeliveryProgress` returns, per `active` subscription with a current week: `{ account: label, weekStart, weekPlannedPcs (Σ current-week plannedDays[].items[].qty — live, reflects top-ups), deliveredPcs (Σ product qty of this week's subscription orders in a terminal-delivered status, via orders.by_subscription), remaining = max(0, weekPlannedPcs − deliveredPcs), overBy = max(0, deliveredPcs − weekPlannedPcs) }`. **pcs = product pieces, NOT BOM balls** (the plan is denominated in product pcs). Accounts with no active current week are skipped.

**`deliveryReceipts.ts`** — add `ReminderKind` re-export-safe `subscriptionSlotKey(kind, nowMs)`: WIB-keyed (`sub:<kind>:<getWibDateStr(nowMs)>`). None of the six slots sit near WIB midnight, so the +15min watchdog never crosses a WIB-day boundary (kind 3 fires 07:05 WIB; kind 1 Sun 17:00 WIB; etc.). For the weekly kinds (1,2,5) the key is the WIB date of the firing day (Sun for confirm; Mon for invoice/reconcile) — a stable, unambiguous week id (same approach as `salesSlotKey` weekly; no ISO week-year edge case).

**`crons.ts`** — 6 primary + 6 watchdog registrations per the §1 table, each pointing at `sendSubscriptionReminderResilient` / `watchdogSubscriptionReminder` with the `kind` arg.

### 2.3 Invariant
Phase E Slice 1 **never constructs** a `ScheduleLine`/invoice/ledger entry and **never mutates** a subscription, week, order, or schema field. Its only DB writes are `telegramDeliveries` receipts (via the existing `recordDelivery`). No re-keying of any derived total.

---

## 3. Acceptance criteria

- [ ] **AC1** `KNOWN_TELEGRAM_ROLES` includes `"subscription-ops"` AND `"founders"`; no env var; both assignable via `/admin/telegram-chats` (Pitfall #21). `isKnownTelegramRole("subscription-ops")` / `("founders")` → true.
- [ ] **AC2** Six primary crons fire at the §1 WIB/UTC times; each points at `sendSubscriptionReminderResilient` reusing `cronRetry.ts` — no re-rolled retry logic.
- [ ] **AC3** Each of the six has a watchdog 15 min later pointing at `watchdogSubscriptionReminder`, which re-sends **only the notification** when no `telegramDeliveries` receipt exists for the slot; a healthy primary run never double-posts (`recordDelivery` idempotent).
- [ ] **AC4** Send resolves via `getChatIdByRole({ role })` (role derived from `kind`) and fails fast (logged, recoverable) when no chat is assigned — exactly as `sales-updates` does.
- [ ] **AC5** Kind 6 (`weekly-delivery-progress` → `founders`) posts **one block per active subscription account**: `Week of DD/MM/YY — <Account>` / `<deliveredPcs> out of <weekPlannedPcs>` / `<remaining> pcs remaining in quota`. `deliveredPcs` counts **product pieces, NOT BOM balls**; `weekPlannedPcs` = live current-week `plannedDays` qty sum; `remaining = max(0, plan − delivered)` (never negative; over-plan shown via `overBy`); accounts without an active current week are skipped. Delivered count uses `orders.by_subscription` + the terminal-delivered status set.
- [ ] **AC6** No inbound command added (parent Q5): `COMMAND_POLICY`, `parseCommand`, and webhook dispatch are byte-for-byte unchanged. (Recorded explicitly, not left as an unchecked box.)
- [ ] **AC7** All six `format*` functions are **pure** (no ctx/db/network); unit-tested against fixed fixtures (per-product split for kind 3; credit/IDR figures integer for kinds 2,5; pcs integer for kind 6). Copy matches proof ⑨ (Q2).
- [ ] **AC8** Every new query is `internalQuery` and every new action is `internalAction` (cron-only; no public/staff surface, no token). No `protectedQuery`/`protectedMutation` added by this slice → no Pitfall-#19 exposure. code-auditor greps all new registrations to confirm.
- [ ] **AC9** No write outside `telegramDeliveries`: grep the new module + reminders dir for `ctx.db.insert`/`patch`/`replace`/`delete` and `runMutation` → only `recordDelivery`. (Read-only invariant, §2.3.)
- [ ] **AC10** `subscriptionSlotKey(kind, nowMs)` is deterministic per WIB occurrence; sender and watchdog compute the same key (no WIB-midnight boundary for any of the six slots — assert for kind 3's 07:05 WIB / 00:05 UTC and the weekly kinds).
- [ ] **AC11** Cron-minute uniqueness (parent Q4): no two **primary** registrations (existing + new) share an exact UTC minute; no two **watchdog** registrations share an exact UTC minute — verified against the current `crons.ts` (incl. the `invoice-due` → Mon 01:30 move). Smoke test enumerates all cron names: unique, present, pointing at the resilient/watchdog actions.
- [ ] **AC12** `npm run type-check`, `npx vitest run convex/telegram convex/subscriptions`, and `npm run build` pass. **No `convex codegen` schema delta** (additive code only) — but `npx convex codegen` is run to register the new `internal.*` action/query refs and the regenerated `_generated/` is committed (Phase-76/81 lesson: stale `api.d.ts` is a recurring break).

---

## 4. Edge cases

- [ ] **EC1** Cron fires, chat unassigned → fail fast, logged, recoverable (mirrors `sales-updates`; ship-dark default).
- [ ] **EC2** Transient worker spike at firing → `*Resilient` retries; +15m watchdog covers a double-death (incident 2026-06-02).
- [ ] **EC3** Primary sent but receipt-record failed → watchdog re-sends once; `recordDelivery` idempotent → no permanent double-post. Safe because nudges/summaries have no side effect (Q3).
- [ ] **EC4** No active subscriptions / no weeks in the target state → reminder sends a benign "nothing due" message OR is skipped per-kind (decide per formatter; kind 6 skips empty accounts and, if zero active accounts, sends a one-line "no active accounts" rather than an empty post). Must never throw.
- [ ] **EC5** `unitPrice` shown in any money figure (kinds 2,5) reads the week's **snapshotted** `plannedDays[].items.unitPrice` / the week's stored credit figures, never live `subscriptions.unitPrice`. (Confirm at plan time B freezes `plannedDays[].items.unitPrice` at confirm.)
- [ ] **EC6** A `plannedDays[].items` entry whose `menuProductId` no longer resolves in `menuProducts` → kind 3 shows a ⚠️ deleted-product warning beside the stored `productName` (don't silently hide; parent Q13).
- [ ] **EC7** Kind 6 delivered count: an order linked to the subscription but NOT in this week's window (`weekStart..weekEnd`) is excluded; an order in a non-terminal status is excluded (only terminal-delivered counts).
- [ ] **EC8** Week spanning the founders 18:00 fire: "this week" = the WIB week containing `now`; resolved via `periodRange` week helper, not naive `Date`.
- [ ] **EC9** Multi-chunk send fails mid-way (kind 6 with many accounts) → mirror `sendSalesSummary`'s breadcrumb-on-partial behavior; do NOT record a receipt on partial failure (let the watchdog resend) — match the template.

---

## 5. Testing focus

- **T1** `subscriptionSlotKey(kind, nowMs)` — deterministic per WIB occurrence for all six kinds; weekly kinds key on the firing day's WIB date; no midnight boundary.
- **T2** Six `format*` pure formatters — HTML content from fixed fixtures: kind 3 per-product split + deleted-product ⚠️ (EC6); kinds 2/5 integer IDR + snapshot price (EC5); kind 6 block-per-account, `remaining=max(0,…)`, over-plan `overBy`, empty-account skip, zero-account fallback (EC4). Lock proof-⑨ copy.
- **T3** `getWeeklyDeliveryProgress` shaping (convex-test) — plan = live plannedDays sum; delivered = Σ terminal subscription-order qty via `by_subscription` within window; window + status exclusions (EC7); pcs = product pcs not BOM balls.
- **T4** The other five read queries (convex-test) — correct rows selected by week status / cutoff window / today's date; access is `internalQuery` (no token).
- **T5** Cron registration smoke — all 12 names present, unique; no UTC-minute collision among primaries, none among watchdogs (incl. existing crons); each points at the resilient/watchdog action with the right `kind`.
- **Fixtures:** active sub with a current `delivering` week (multi-product day, one deleted product); a `planned` next week (kind 1); a `confirmed`/unpaid week (kind 2); a prior `delivering` week (kind 5); a subscription with delivered + non-delivered + other-week orders (kind 6); a terminated/`ended` sub (excluded from active iteration).

---

## 6. Access control + rollback / ship-dark

- **Access:** everything is `internalAction`/`internalQuery` (cron-only). No public, staff, or token-bearing surface added → no Pitfall-#19 mount-crash risk, no confidential-price exposure (this slice surfaces partner figures only to the `subscription-ops`/`founders` Telegram groups, which are operator-assigned manager/founder chats — not the staff-facing app).
- **Ship-dark:** crons register dark; until an operator assigns the `subscription-ops` and `founders` chats, every send fails fast harmlessly (EC1). No UI, no schema, no behavior change to any existing surface.
- **Rollback:** pure-additive **code** (new module + new read dir + new cron entries + 2 config literals + 1 slot-key fn). **No schema migration.** Revert = revert the commit(s). Check `gh run list` after merge (split-brain guard, `lesson_convex_vercel_splitbrain`).

---

## 7. Schema additions
**None.** `plannedDays[].locked` already exists (`types.ts:15`, `schema.ts:2565`) but is **not touched** here (the lock-flip is Slice 2). The two genuinely-new fields (`plannedDays[].needsSupplierConfirmation`, `subscriptions.pendingBaselineChange`) are **Slice 2**. `orders.by_subscription` already exists (`schema.ts:357`, from B0 `62155e13`). `telegramDeliveries` already exists.

---

## 8. Dependencies on merged Phase B (confirm signatures at plan time)
- **(B)** `confirmWeek` (`convex/subscriptions/scheduling/confirmWeek.ts:16`), `createSubscriptionWeeklyInvoice`/`markWeeklyInvoicePaid` (`convex/subscriptions/invoicing.ts:111/203`), `reconcileWeek` (`convex/subscriptions/reconcile.ts:127`) — kinds 1/2/5 **reference** these in copy as the manager's next action; they never CALL them.
- **(B)** `plannedDays[].items.unitPrice` frozen at confirm (EC5) — confirm at plan time.
- **(B)** subscription order generation + advancement to a terminal-delivered status — kind 6's delivered count is zero until B's generated orders reach terminal status (ship-dark-safe: posts plan with `0 out of N`). The terminal-delivered status set must equal the project's order "delivered" definition (resolve once from `orderConstants`/status helpers; reuse for Phase D parity).
- **(B0)** `orders.by_subscription` index — present (`schema.ts:357`).

---

## 9. Open questions
- **Q2 (visual)** — exact copy for the six messages. Drafted in proof ⑨; refine + lock via the T2 formatter unit tests during execution. Not a blocker (formatters are pure + test-locked).
- **Q-delivered** — confirm the exact terminal-delivered order status literal(s) against `orderConstants`/status helpers at plan time (spec assumes `CompleteShipped`/`PickedUp` + the codebase "complete" terminal). Resolve once; reuse for kind 6 + future Phase D AC13 parity.

---

## 10. Slice 2 (charted, NOT specced here) — rule enforcement
For the follow-up pipeline run. Adds (vs this slice): schema fields `plannedDays[].needsSupplierConfirmation` + `subscriptions.pendingBaselineChange` (+ codegen); `flipDayLocksAtCutoff` (flips `locked` on tomorrow's day past cutoff — metadata only, warn+flag, parent Q6); `detectAboveBaseline` (day-total > `baselineDailyQty` → `needsSupplierConfirmation`, warn-only, parent Q7/Q14); `applyPermanentBaselineChange` (effective at `noticeDate+14d`, daily apply cron, parent Q8); **termination guard inside Phase B's `seedWeek`/`confirmWeek`** (stop future weeks once `endDate` passed; current week reconciles — parent Q9/Q15); confidential-price strip **verification** across all staff-reachable order queries (parent AC11 / audit #1/#11/#12). Slice 2 IS a schema change + edits B code → higher risk; kept out of Slice 1 deliberately.

---

*Slice 1 of Phase E — notification layer only. Reconciled to merged A+B+D-Slice-0. Pure-additive, no schema, ship-dark, reuses the sales-summary resilient/watchdog/receipt playbook. One reconciliation change vs parent rev-4: `invoice-due` cron Mon 01:00→01:30 to clear the monthly-day-1 collision. Two open questions (copy Q2, delivered-status literal), neither blocking.*
