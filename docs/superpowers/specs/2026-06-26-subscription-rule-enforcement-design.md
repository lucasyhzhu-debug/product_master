# Subscription & Credit System — Phase E **Slice 2**: rule-enforcement layer

**Date:** 2026-06-26
**Status:** Draft → pipeline (spec→plan, 2 review gates)
**Depends on:** Phase A (`22b628f7`), **Phase B merged** (`6a6466c4`, B0 `62155e13`), Phase D (`f78c0037` + UAT fixes through `02eb4925`), **Phase E Slice 1 merged** (`d1125ad1` — notification layer).
**Parent spec:** `docs/superpowers/specs/2026-06-23-subscription-credit-system-phase-e-spec.md` (rev-4/5). This spec is the **enforcement half** of Phase E.
**Slice 1 spec:** `docs/superpowers/specs/2026-06-25-subscription-phase-e-slice1-notifications-SPEC.md` — its **§10 ("Slice 2, charted, NOT specced here")** is formalized here.
**Design source:** `docs/superpowers/specs/2026-06-23-subscription-credit-system-design.md` (§11 rule enforcement; §6/§7).
**Companion visual proof:** `2026-06-23-subscription-cde-visual-mockups.html`.

> **Scope discipline.** Slice 1 shipped the outbound Telegram notification layer (6 read-only crons; no schema; ship-dark). **This Slice 2 is the enforcement layer**: 2 additive schema fields + edits *inside* Phase B's `seedWeek`/`confirmWeek` + four enforcement rules (lock-flip, above-baseline flag, effective-dated baseline change, effective-dated termination) + a verify-only confidential-price audit + minimal scheduler/settings UI so each rule is operational end-to-end. **Clause 8 COGS-rise alerting stays DROPPED** (Lucas c12/c13 — do NOT add it).

---

## 1. WHAT this slice delivers

Enforce supply-agreement clauses **3, 4, 5, 10** on top of merged A/B + the Slice-1 notification layer. Backend logic **plus minimal scheduler/settings UI** so each rule is operational end-to-end. Manager+admin gated; crons internal.

Five workstreams (4 rules + 1 verify-only):

1. **13:00 prior-day cutoff lock (clause 3) — warn + flag.** A new internal cron `flipDayLocksAtCutoff` (daily **05:25 UTC** = 12:25 WIB, fired *just before* Slice 1's existing 12:30-WIB / 05:30-UTC `change-cutoff` Telegram nudge) sets `plannedDays[].locked = true` on **every day whose change-cutoff has already passed as of `now`** — for every active, non-`ended` week. **Cutoff is date-relative, NOT "tomorrow"** (staffreview C1): for a delivery on day `D`, the cutoff is `(D + changeCutoffDayOffset)` at `changeCutoffHour` WIB (with the merged defaults: `(D−1)` at 13:00). A day is locked iff `cutoffMs(D) ≤ now`. This is correct at any firing time and is idempotent / self-healing — a missed run is caught up on the next daily run (so no watchdog is needed); the 12:25 fire is a harmless convenience, not a correctness lever. **Metadata only** — no change to `items`/`lineTotal`/`unitPrice`/credit. UI: `DayPlanCell` surfaces a **non-blocking** "⚠️ past 13:00 cutoff" warning for that day; **editing stays allowed** (true warn+flag).
2. **Above-baseline → `needsSupplierConfirmation` (clause 4) — warn-only.** A new optional schema flag `plannedDays[].needsSupplierConfirmation`. A pure predicate `detectAboveBaseline(dayItems, baselineDailyQty)` compares the day's **total** qty across products vs the subscription baseline. It runs at the `plannedDays` operator-edit write sites (§4). UI: a "needs supplier confirmation" badge on the day in `DayPlanCell`.
3. **Permanent baseline change, effective +14d (clause 5).** A new optional schema field `subscriptions.pendingBaselineChange { newQty, effectiveDate }`. A manager trigger in a subscription-scoped **settings dialog** stages the change at `noticeDate + permanentChangeNoticeDays` (field already exists = 14). A daily internal cron `applyPendingBaselineChanges` (unique UTC minute) applies any pending change whose `effectiveDate ≤ now` to `subscriptions.baselineDailyQty`, then clears the pending field.
4. **Termination +30d → stop future weeks (clause 10).** A manager trigger in the settings dialog gives a 30-day termination notice: sets `terminationNoticeDate` + `endDate = notice + terminationNoticeDays` (field exists = 30), status → `terminating`. A **guard inside Phase B's `seedWeek` + `confirmWeek`** (covers BOTH the auto and the manual scheduler paths) refuses to seed/confirm any week whose `weekStart > endDate`. The current in-flight week still runs to reconcile.
5. **Confidential-price strip — VERIFY ONLY (do NOT build).** `stripSubscriptionPricing` / `stripOrder` / `stripOrders` are **already applied** across the staff-reachable order query sites with tests. This slice adds an **AC11 audit checklist** that VERIFIES coverage (incl. nulling `lineMargin`/`lineCost` and the extra leak sites `getByCustomer`/`getPackagingOrders`). It builds nothing here.

### Explicitly OUT
- **COGS-rise alerting (clause 8)** — DROPPED (c12/c13). Not deferred, not added.
- All Slice-1 notification machinery (already merged) — untouched.
- Hard-block enforcement of the cutoff lock (rejecting edits) — clause 3 is **warn+flag**, not hard-enforce (possible v2).
- Refund payout mechanism — deferred (design §13 Q4).
- Invoicing/reconcile math, credit/ledger writes, order generation — Phase B; this slice never re-keys a derived total.

---

## 2. Data & flow

### 2.1 Consumes (all merged on `main` — verified against code at spec time)

| Artifact | Source (verified) | Use |
|---|---|---|
| `subscriptions` block: `status` (`draft`/`active`/`terminating`/`ended`), `baselineDailyQty`, `unitPrice`, `confidentialPrice`, `changeCutoffHour` (=13), `changeCutoffDayOffset` (=-1), `permanentChangeNoticeDays` (=14), `terminationNoticeDays` (=30), `terminationNoticeDate?`, `endDate?` + `by_status` index | `convex/schema.ts:2506` | iterate active subs; effective-date math; cutoff window |
| Defaults set on create: `changeCutoffHour:13`, `changeCutoffDayOffset:-1`, `permanentChangeNoticeDays:14`, `terminationNoticeDays:30` | `convex/subscriptions/mutations.ts:46` | confirm field names + values at plan time |
| `subscriptionWeeks` block: `status`, `weekStart`/`weekEnd`, `plannedDays[{date,deliverByTime,items[{menuProductId,productName,qty,unitPrice,lineTotal}],locked}]` + `by_subscription_weekStart`, `by_status` | `convex/schema.ts:2544` | iterate weeks; per-day lock-flip; above-baseline read |
| `PlannedDay` type (`date`, `deliverByTime`, `items: ScheduleLine[]`, `locked`) | `convex/subscriptions/types.ts:11` | extend with `needsSupplierConfirmation?` |
| `seedWeek` (`protectedMutation`, roles `["manager","admin"]`) + `buildPlannedDays` + `saveWeekPlan` patch | `convex/subscriptions/weeks.ts:57` / `:12` / `:147` | termination guard target (seed); above-baseline write site (save) |
| `amendConfirmedWeek` (re-prices + patches `plannedDays`, line `:149`) | `convex/subscriptions/amend.ts:77` | above-baseline write site |
| `confirmWeek` (`protectedMutation`, generates orders w/ `subscriptionId`+`subscriptionWeekId`, line `:16`) | `convex/subscriptions/scheduling/confirmWeek.ts` | termination guard target (confirm) |
| `updateSubscription` (already accepts `status`/`terminationNoticeDate`/`endDate`/`baselineDailyQty`) | `convex/subscriptions/mutations.ts:53` | reference (new dedicated mutations compute dates server-side instead) |
| WIB helpers: `getWibComponents`, `getWibDateStr`, `calculateWeekRange`, `wibMidnightToUtc`, `WIB_OFFSET_MS` | `convex/lib/periodRange.ts` | all cutoff/effective-date WIB math (Pitfall #18 — canonical only) |
| `stripSubscriptionPricing` (nulls item `unitPrice`/`lineTotal`/`lineMargin`/`lineCost` + order `totalAmount`/`finalTotal`/`totalMargin`/`totalCost`), `stripOrder`/`stripOrders`, `isSubscriptionOrder` | `convex/orders/helpers/stripSubscriptionPricing.ts`, `stripOrders.ts`, `convex/subscriptions/revenueGate.ts` | AC11 verify-only |
| Strip call sites (10): `list`, `listPaginated`, `get`, `getByOrderNumber`, `getKitchenOrders`, `getByCustomer`, `getPackagingOrders`, `getCompletedToday`, `listForKanban` (`convex/orders/queries.ts`) + `getKitchenPackingOrders` (`convex/orders/kitchenQueries.ts`) | grepped at spec time | AC11 verify-only |
| `crons.ts` existing fixed-minute registrations (see §6 collision table) | `convex/crons.ts` | assert no UTC-minute collision with the 2 new crons |
| FE: `DayPlanCell` (props: `lines`, `unitPrice`, `locked`=grid edit-lock, `onChange`), `WeekCalendarGrid` (forwards one grid-wide `locked`), `SubscriptionSchedulePage` (`gridLocked = isLocked && !amending`; `toLocalWeekPlan`) | `src/components/crm/DayPlanCell.tsx`, `WeekCalendarGrid.tsx`, `src/pages/crm/SubscriptionSchedulePage.tsx` | surface the two per-day flags (new props) |
| FE: `CustomerDashboard` (renders per-subscription sections; existing `CrmFieldsEditDialog` is **customer-scoped**, not subscription-scoped) | `src/pages/crm/CustomerDashboard.tsx` | host the new subscription-scoped settings dialog |

### 2.2 Adds

**Schema (2 additive optional fields — first task, then `npx convex codegen` + commit `_generated/`):**
1. `subscriptionWeeks.plannedDays[].needsSupplierConfirmation: v.optional(v.boolean())` (`convex/schema.ts`) **and** `needsSupplierConfirmation?: boolean` on the `PlannedDay` type (`convex/subscriptions/types.ts`).
2. `subscriptions.pendingBaselineChange: v.optional(v.object({ newQty: v.number(), effectiveDate: v.number() }))` (`convex/schema.ts`).

**Backend module `convex/subscriptions/enforcement/`:**
- `detectAboveBaseline.ts` — **pure** predicate `detectAboveBaseline(dayItems: {qty:number}[], baselineDailyQty: number): boolean` → `Σ qty > baselineDailyQty`. TDD. Imported by the `plannedDays` write sites (§4) to set/clear the per-day flag.
- `effectiveDates.ts` — **pure** predicates `permanentChangeEffective(noticeDate, days, now)` and `terminationEffective(noticeDate, days, now)` → boolean (`noticeDate + days*DAY_MS ≤ now`). TDD; reused by the apply cron and the termination guard.
- `flipDayLocksAtCutoff.ts` — `internalMutation` (cron). Iterates active, non-`ended` subscriptions via `subscriptions.by_status` → their current + upcoming weeks via `by_subscription_weekStart`. For **each** not-yet-`locked` `plannedDays[]` entry, computes `cutoffMs(day.date)` = WIB-midnight of `(day.date + changeCutoffDayOffset*DAY_MS)` plus `changeCutoffHour` hours (via `periodRange` `getWibComponents`/`wibMidnightToUtc`), and patches `locked = true` iff `cutoffMs ≤ now`. **Date-relative, not "tomorrow"-hardcoded** (staffreview C1) → correct at any firing time + self-healing on a missed run. **Metadata only.** Idempotent (re-flip a no-op; never un-locks). Bounded scan (cron context, small account count; iterate only non-terminal weeks to bound the set — C9).
- `applyPendingBaselineChanges.ts` — `internalMutation` (cron). Scans `subscriptions` (small table; no index on `pendingBaselineChange` — full scan acceptable in cron context, C9) for any with `pendingBaselineChange` where `pendingBaselineChange.effectiveDate ≤ now` (the field already stores the absolute effective epoch — a direct comparison; the `permanentChangeEffective` predicate is used at *staging* time to compute that epoch and in tests, not re-derived here), patches `baselineDailyQty = newQty` and clears `pendingBaselineChange`. Idempotent. **Note:** this does NOT retro-sweep existing weeks' `needsSupplierConfirmation` flags — those recompute lazily at the next `plannedDays` edit (warn-only, acceptable; EC11).

**Backend guard edits (inside Phase B code):**
- `convex/subscriptions/weeks.ts` `seedWeek` — after loading `sub`, if `sub.endDate !== undefined && args.weekStart > sub.endDate` → `throw new ConvexError("Subscription ended on <date>; cannot seed a week after termination.")` **before** inserting. The current in-flight week (`weekStart ≤ endDate`) is unaffected.
- `convex/subscriptions/scheduling/confirmWeek.ts` `confirmWeek` — after loading `week` + `sub`, if `sub.endDate !== undefined && week.weekStart > sub.endDate` → `throw new ConvexError(...)` before generating orders.

**Backend trigger mutations (`convex/subscriptions/mutations.ts`, roles `["manager","admin"]`):**
- `scheduleBaselineChange({ subscriptionId, newQty })` — computes `effectiveDate = Date.now() + sub.permanentChangeNoticeDays * DAY_MS`, patches `pendingBaselineChange = { newQty, effectiveDate }`. Validates `newQty` positive integer; rejects if the sub is `ended`. (Overwrites any prior un-applied pending change — last-notice-wins.)
- `giveTerminationNotice({ subscriptionId })` — sets `terminationNoticeDate = Date.now()`, `endDate = Date.now() + sub.terminationNoticeDays * DAY_MS`, `status = "terminating"`. Idempotent-guarded (reject if already `terminating`/`ended`). Server computes the date — the client never passes it.

**Above-baseline wiring at the `plannedDays` operator-edit write sites (§4):** after building `plannedDays`, set each entry's `needsSupplierConfirmation = detectAboveBaseline(entry.items, sub.baselineDailyQty)` before the `insert`/`patch`. Applies at `seedWeek` (insert), `saveWeekPlan` (patch), and `amendConfirmedWeek` (patch).

**Cron registrations (`convex/crons.ts`) — 2 new internal-mutation primaries (idempotent → NO watchdog, NOT Telegram nudges):**
- `flipDayLocksAtCutoff` — `crons.daily(..., { hourUTC: 5, minuteUTC: 25 }, internal.subscriptions.enforcement.flipDayLocksAtCutoff.flipDayLocksAtCutoff)` (12:25 WIB, just before Slice-1's 05:30 change-cutoff nudge).
- `applyPendingBaselineChanges` — `crons.daily(..., { hourUTC: 4, minuteUTC: 10 }, internal.subscriptions.enforcement.applyPendingBaselineChanges.applyPendingBaselineChanges)` (11:10 WIB; minute unique vs all fixed-minute primaries — §6 table).

**Frontend:**
- `DayPlanCell.tsx` — two NEW optional props, **distinct from the existing `locked` edit-disable prop**: `pastCutoff?: boolean` (sourced from `plannedDays[].locked`) → renders the non-blocking "⚠️ past 13:00 cutoff" warning; `needsSupplierConfirmation?: boolean` → renders a "needs supplier confirmation" badge. Both purely visual; neither disables editing.
- `WeekCalendarGrid.tsx` — accept `dayFlags?: { pastCutoff: boolean; needsSupplierConfirmation: boolean }[]` (one per weekday Mon→Sun) and forward `dayFlags?.[i]` to each `DayPlanCell`.
- `SubscriptionSchedulePage.tsx` — derive `dayFlags` from `week.plannedDays` (key each day by `(date - weekStart)/DAY_MS`, read `locked` + `needsSupplierConfirmation`), pass to the grid. (The 13:00 warning is independent of `gridLocked`, which stays the week-status edit-lock — no conflict.)
- `CustomerDashboard.tsx` — a new **subscription-scoped settings dialog** (one per subscription section) wiring `scheduleBaselineChange` and `giveTerminationNotice`. Designed empty/loading/error states (D12). Manager+admin only (the `/crm` route is already `canAccessCrm`-gated — Pitfall #19: do not add a manager-only query to a staff-reachable mount; the dialog calls only manager+admin mutations on user action, no on-mount manager-only query).

### 2.3 Invariant
This slice **never constructs** a `ScheduleLine`/invoice/ledger entry and **never re-keys a derived total**. Its only `plannedDays.items` interactions are unchanged copies. The new writes are: per-day `locked` (metadata), per-day `needsSupplierConfirmation` (flag), `subscriptions.baselineDailyQty`/`pendingBaselineChange` (baseline lifecycle), and `subscriptions.terminationNoticeDate`/`endDate`/`status` (termination lifecycle). No money totals are recomputed.

---

## 3. Acceptance criteria

- [ ] **AC1 (schema)** `plannedDays[].needsSupplierConfirmation: v.optional(v.boolean())` and `subscriptions.pendingBaselineChange: v.optional(v.object({newQty, effectiveDate}))` added; `PlannedDay` type updated; `npx convex codegen` run and `_generated/` committed. Both additive → no migration.
- [ ] **AC2 (cutoff lock — clause 3)** `flipDayLocksAtCutoff` sets `plannedDays[].locked = true` on **every day whose `cutoffMs(date) ≤ now`** (date-relative, `cutoffMs` = `(date + changeCutoffDayOffset*DAY)` at `changeCutoffHour` WIB) for every active, non-`ended` week; a day whose cutoff has not yet passed is NOT locked; **lock is metadata only** — no change to `items`/`lineTotal`/`unitPrice`/credit; idempotent (re-run no-op, never un-locks). `saveWeekPlan` still permits editing a locked day (warn+flag, not hard-block).
- [ ] **AC3 (cutoff warning UI)** `DayPlanCell` renders a non-blocking "⚠️ past 13:00 cutoff" warning when its `pastCutoff` prop (sourced from `plannedDays[].locked`) is true, **without** disabling its inputs. The warning is independent of the existing `locked` (grid edit-lock) prop.
- [ ] **AC4 (above-baseline flag — clause 4)** A day whose **total** qty across products `> baselineDailyQty` is flagged `needsSupplierConfirmation = true` at every operator-edit write site (`seedWeek`, `saveWeekPlan`, `amendConfirmedWeek`); a day `≤ baseline` is flagged `false` (cleared). `DayPlanCell` shows a badge when the flag is true.
- [ ] **AC5 (baseline change staging — clause 5)** `scheduleBaselineChange({subscriptionId, newQty})` stages `pendingBaselineChange = { newQty, effectiveDate: now + permanentChangeNoticeDays*DAY_MS }` (14d). Manager+admin only.
- [ ] **AC6 (baseline change apply)** `applyPendingBaselineChanges` sets `baselineDailyQty = newQty` and clears `pendingBaselineChange` exactly when `effectiveDate ≤ now`, **not before**; idempotent. A change staged at T applies on/after T+14d and not at T+13d.
- [ ] **AC7 (termination notice — clause 10)** `giveTerminationNotice({subscriptionId})` sets `terminationNoticeDate = now`, `endDate = now + terminationNoticeDays*DAY_MS` (30d), `status = "terminating"`; server computes the date; rejects if already `terminating`/`ended`. Manager+admin only.
- [ ] **AC8 (termination guard)** Once `endDate` is set, `seedWeek` and `confirmWeek` both refuse any week with `weekStart > endDate` (covers auto + manual scheduler paths); the current in-flight week (`weekStart ≤ endDate`) still seeds/confirms/reconciles normally.
- [ ] **AC9 (settings UI)** A subscription-scoped settings dialog in `CustomerDashboard` exposes "Change baseline to X (effective in 14 days)" → `scheduleBaselineChange` and "Give 30-day termination notice" → `giveTerminationNotice`, with confirm + designed empty/loading/error states (D12). No on-mount manager-only query (Pitfall #19).
- [ ] **AC10 (access)** Every new mutation (`scheduleBaselineChange`, `giveTerminationNotice`) is `roles:["manager","admin"]`; both new crons are `internalMutation` (no public/staff/token surface). code-auditor greps all new registrations.
- [ ] **AC11 (confidential-price strip — VERIFY ONLY)** Audit confirms `stripSubscriptionPricing` nulls item `unitPrice`/`lineTotal`/`lineMargin`/`lineCost` and order `totalAmount`/`finalTotal`/`totalMargin`/`totalCost`, and that `stripOrder`/`stripOrders` is applied at all 10 staff-reachable order query sites (incl. `getByCustomer`, `getPackagingOrders`). **Builds nothing** — a checklist with code references + a passing assertion that the existing tests cover it.
- [ ] **AC12 (cron uniqueness)** No two **primary** cron registrations (existing + the 2 new) share an exact UTC minute (`flipDayLocksAtCutoff` 05:25, `applyPendingBaselineChanges` 04:10). Smoke test enumerates all cron names: unique, present, pointing at the right internal functions. (Interval cron "sync internal orders revenue" has no fixed minute → excluded.)
- [ ] **AC13 (build/test)** `npm run type-check`, `npx vitest run convex/subscriptions`, and `npm run build` pass. Regenerated `_generated/` committed (Phase-76/81 lesson: stale `api.d.ts` is a recurring break).

---

## 4. `plannedDays` write sites — above-baseline flag

`needsSupplierConfirmation` is derived state of a day's lines, so it MUST be (re)computed wherever `plannedDays` is written from operator edits. The three write sites (grounded against code):

| Write site | File:line | Op | Set flag? |
|---|---|---|---|
| `seedWeek` (insert, via `buildPlannedDays`) | `convex/subscriptions/weeks.ts:112` | insert | yes — per day, before insert |
| `saveWeekPlan` (patch) | `convex/subscriptions/weeks.ts:236` | patch | yes — per day, before patch |
| `amendConfirmedWeek` (patch) | `convex/subscriptions/amend.ts:149` | patch | yes — per day, before patch |

> **Correction vs the locked design note:** the brainstorm referenced "`seedWeek` (weeks.ts:236)"; line 236 is actually the **`saveWeekPlan`** patch. `seedWeek`'s insert is at line 112. Both are real `plannedDays` write sites and both run the detect. `amendConfirmedWeek` (amend.ts:149) is the third. (Slice-1's read-only crons never write `plannedDays`.)

The 13:00 `locked` flip is a **separate** write path (the `flipDayLocksAtCutoff` cron); it patches only the per-day `locked` boolean, never `items` or `needsSupplierConfirmation`.

---

## 5. Edge cases

- [ ] **EC1** Cutoff lock on a day with no template entry → no-op (the day either doesn't exist in `plannedDays` or has empty `items`; do not create a day).
- [ ] **EC2** `flipDayLocksAtCutoff` re-runs (watchdog-free idempotency) → re-flipping an already-`locked` day is a no-op; never un-locks. A missed daily run is self-healed on the next run (date-relative predicate locks all past-cutoff days, not just one).
- [ ] **EC11** A `baselineDailyQty` change applied by `applyPendingBaselineChanges` does NOT retroactively re-sweep `needsSupplierConfirmation` on already-written weeks; the flag recomputes lazily at the next `plannedDays` edit. Warn-only → acceptable.
- [ ] **EC3** Above-baseline boundary: day-total **equal** to baseline → NOT flagged; one over → flagged; multi-product day sums across products (`detectAboveBaseline` operates on the day's total). A day at/below baseline that was previously flagged is **cleared** to `false` on the next edit (flag tracks current state).
- [ ] **EC4** `pendingBaselineChange` overwrite: a second `scheduleBaselineChange` before the first applies → last-notice-wins (overwrites the pending object); only one pending change at a time.
- [ ] **EC5** Baseline apply exactly at boundary: `effectiveDate === now` applies (`≤`); `effectiveDate === now + 1ms` does not. WIB math is not needed for the apply (it's a pure epoch comparison); only the cutoff-lock decision uses WIB components.
- [ ] **EC6** Termination guard on the in-flight week: a week with `weekStart ≤ endDate` is allowed to seed/confirm even after the notice is given; only `weekStart > endDate` is refused. Reconcile of the current week is unaffected (reconcile does not call seed/confirm).
- [ ] **EC7** `giveTerminationNotice` on an already-`terminating`/`ended` sub → rejected (no double-notice, no `endDate` reset).
- [ ] **EC8** `unitPrice` snapshot: enforcement never touches `plannedDays[].items.unitPrice`. (Grounding: `seedWeek`/`saveWeekPlan`/`amendConfirmedWeek` snapshot `sub.unitPrice` onto each line at write time; `confirmWeek` copies the snapshot into orders. So a later `unitPrice` change does not retro-reprice a confirmed week — the lock-flip and flag writes preserve this.)
- [ ] **EC9** A subscription with no `endDate` (never terminated) → the guard is a pure no-op (`endDate === undefined` short-circuits); seeding/confirming proceeds normally.
- [ ] **EC10** Cutoff lock when a sub is `terminating` but the current week is still in-flight → days within the in-flight week are still lock-flippable (the sub is not `ended`); the cron filters on non-`ended`, not non-`terminating`.

---

## 6. Cron minute-collision check

Verified against `convex/crons.ts` at spec time. **Primaries** (fixed UTC minute):

| Cron | UTC | Watchdog UTC |
|---|---|---|
| telegram morning pack list | 00:00 | 00:15 |
| subscription today deliveries (Slice 1) | 00:05 | 00:20 |
| telegram midday pack list | 06:00 | 06:15 |
| sales summary daily | 16:00 | 16:15 |
| sales summary weekly (Mon) | Mon 00:00 | Mon 00:15 |
| sales summary monthly (day 1) | day1 01:00 | day1 01:15 |
| subscription confirm next week (Sun, Slice 1) | Sun 10:00 | Sun 10:15 |
| subscription invoice due (Mon, Slice 1) | Mon 01:30 | Mon 01:45 |
| subscription change cutoff (Slice 1) | 05:30 | 05:45 |
| subscription reconcile (Mon, Slice 1) | Mon 02:00 | Mon 02:15 |
| subscription delivery progress (Slice 1) | 11:00 | 11:15 |
| **flipDayLocksAtCutoff (NEW)** | **05:25** | — (idempotent, no watchdog) |
| **applyPendingBaselineChanges (NEW)** | **04:10** | — (idempotent, no watchdog) |

`05:25` and `04:10` collide with nothing (no existing primary at `04:xx`; `05:25 ≠ 05:30`). The 2 new crons have no watchdogs (they are idempotent internal mutations, not at-most-once Telegram nudges), so they add nothing to the watchdog-minute set. AC12 asserts this with a smoke test. (Interval cron "sync internal orders revenue" `{hours:1}` has no fixed minute → excluded, per Slice-1 convention.)

---

## 7. Testing focus

- **T1 — `detectAboveBaseline` (pure, TDD):** day-total boundaries — equal (not flagged), one over (flagged), multi-product sum at/over baseline, empty day (`Σ=0`, not flagged), clearing a previously-flagged day.
- **T2 — `permanentChangeEffective` / `terminationEffective` (pure, TDD):** at boundary (`now === noticeDate + days*DAY_MS` → true), before (→ false), after (→ true).
- **T3 — `flipDayLocksAtCutoff` lock decision (convex-test):** given `now`, `changeCutoffHour`/`changeCutoffDayOffset`, day → locked iff `cutoffMs(date) ≤ now`, via `periodRange` WIB math; assert at multiple `now` values (before cutoff = unlocked, after cutoff = locked, boundary `cutoffMs === now` = locked); idempotent re-run; missed-run catch-up (two past-cutoff days both locked in one run); `ended`-sub skipped; metadata-only (items unchanged).
- **T4 — `applyPendingBaselineChanges` (convex-test):** applies exactly at +14d (T2 boundary), clears the pending field, idempotent, no-op when no pending change or not yet effective.
- **T5 — termination guard (convex-test):** `seedWeek` and `confirmWeek` reject `weekStart > endDate`; allow the in-flight week (`weekStart ≤ endDate`); no-op when `endDate` undefined.
- **T6 — trigger mutations (convex-test):** `scheduleBaselineChange` stages the right `effectiveDate` and rejects ended subs; `giveTerminationNotice` sets the trio + rejects double-notice; both `roles:["manager","admin"]`.
- **T7 — above-baseline at write sites (convex-test):** `seedWeek`/`saveWeekPlan`/`amendConfirmedWeek` set/clear `needsSupplierConfirmation` correctly.
- **T8 — cron-minute uniqueness smoke:** enumerate all cron names; assert unique primaries (incl. the 2 new), present, pointing at the right `internal.*` functions.
- **Fixtures:** an active sub with a 7-day week (one above-baseline multi-product day, one at-baseline day); a `terminating` sub with `endDate` between two future weeks; a sub with a `pendingBaselineChange` staged at exactly +14d and one at +13d; an `ended` sub (excluded from lock/apply iteration).

---

## 8. Access control + rollback / ship-dark

- **Access:** the 2 trigger mutations are `roles:["manager","admin"]`; both crons are `internalMutation` (cron-only, no token). The settings dialog lives on the already-`canAccessCrm`-gated `/crm` surface and calls only manager+admin mutations on user action — **no on-mount manager-only query** (Pitfall #19). The strip audit (AC11) confirms confidential pricing is server-stripped (D11: strip, don't hide).
- **Ship-dark:** the lock-flip and above-baseline flag are visual/metadata-only; no money/credit behavior changes. The termination guard only bites once a manager has explicitly given notice (`endDate` set). The baseline-apply cron is inert until a manager stages a change. Nothing fires for non-subscription orders or unconfigured subscriptions.
- **Rollback:** 2 additive optional schema fields + new module + 2 cron entries + guard edits + FE props. Additive → no migration. Revert = revert the commit(s). Check `gh run list` after merge (split-brain guard, `lesson_convex_vercel_splitbrain`); audit the schema manually for the Convex index/deploy rules even though type-check + convex-test + CI pass (`lesson_convex_index_deploy_validation` — note: this slice adds **no** new index, but still verify the additive fields deploy clean).

---

## 9. Schema additions

```ts
// convex/schema.ts — subscriptionWeeks.plannedDays[] entry (add field):
needsSupplierConfirmation: v.optional(v.boolean()),

// convex/schema.ts — subscriptions block (add field):
pendingBaselineChange: v.optional(
  v.object({ newQty: v.number(), effectiveDate: v.number() }),
),
```
```ts
// convex/subscriptions/types.ts — PlannedDay (add optional field):
needsSupplierConfirmation?: boolean;
```
Both optional → existing rows read back fine; no backfill. No new index.

---

## 10. Dependencies on merged Phase B / A / E-Slice-1 code (confirm signatures at plan time)

- **(B)** `seedWeek` (`convex/subscriptions/weeks.ts:57`), `saveWeekPlan` (`:147`), `amendConfirmedWeek` (`convex/subscriptions/amend.ts:77`), `confirmWeek` (`convex/subscriptions/scheduling/confirmWeek.ts:16`) — edit targets for the guard + the above-baseline write. Signatures finalize on merged B.
- **(B)** `plannedDays[].items.unitPrice` snapshotted at write (EC8) — confirmed in code; re-confirm at plan time.
- **(A)** `subscriptions` baseline/cutoff/notice fields + defaults set in `createSubscription` (`mutations.ts:46`).
- **(E-S1)** the `change-cutoff` Telegram nudge at 05:30 UTC — `flipDayLocksAtCutoff` fires at 05:25 UTC so the flag is set before the nudge reads/announces. There **is** a real cross-slice coupling: Slice-2's `flipDayLocksAtCutoff` cron **WRITES** `plannedDays[].locked`, and Slice-1's `getDaysApproachingCutoff` (`convex/subscriptions/reminders/queries.ts`) **READS** `!pd.locked` to exclude already-locked days from the approaching-cutoff nudge. The two are safe because the cutoff is **date-relative**: the 05:25 cron only locks days whose cutoff has *already passed*, leaving the upcoming delivery day (whose cutoff is still in the future) unlocked for the 05:30 nudge to announce. Ordering within the window is best-effort, not a correctness lever (the cron is idempotent/self-healing); a regression test in `queries.test.ts` pins the read-side dependency (locked day excluded, unlocked day included).
- **(merged strip)** `stripSubscriptionPricing`/`stripOrder`/`stripOrders` + 10 call sites — AC11 verify-only.

---

## 11. Open questions

- **Q1 (UI copy — non-blocking)** Exact wording/placement of the "⚠️ past 13:00 cutoff" warning and the "needs supplier confirmation" badge in `DayPlanCell`. Lockable at execution via the component + a visual pass; not a blocker.
- **Q2 (settings dialog home — confirm at plan time)** The locked design says the settings dialog "lives in `CustomerDashboard.tsx`", but the existing `CrmFieldsEditDialog` there is **customer-scoped**, not subscription-scoped. This slice adds a **new subscription-scoped** dialog (one per subscription section). Confirm at plan time whether to also expose the same controls on `SubscriptionPage.tsx` (the canonical per-subscription page) for discoverability — recommended, low-cost, but not required by the locked design. Decision: primary surface = `CustomerDashboard` per-subscription section (as locked); `SubscriptionPage` mirror is a plan-time call.
- **Q3 (cutoff scan scope — confirm at plan time)** Whether `flipDayLocksAtCutoff` iterates `subscriptions.by_status` (active) → current/upcoming weeks via `by_subscription_weekStart`, or `subscriptionWeeks.by_status` (non-terminal) → sub. Either is bounded in cron context (C9). Recommend: iterate active subs → their non-terminal weeks, evaluate every not-yet-`locked` day against `cutoffMs ≤ now` (date-relative — no "tomorrow" resolution needed). `applyPendingBaselineChanges` full-scans `subscriptions` (no `pendingBaselineChange` index; small table — acceptable).

---

*Slice 2 of Phase E — rule enforcement. Formalizes Slice-1 §10. 2 additive schema fields + edits inside B's `seedWeek`/`confirmWeek` + 4 rules (lock-flip, above-baseline flag, effective-dated baseline change, effective-dated termination) + AC11 verify-only price-strip audit + minimal scheduler/settings UI. COGS-rise alerting stays DROPPED. Grounded against real code; 3 plan-time confirmations (write-site line correction, settings-dialog scope, cutoff scan shape).*
