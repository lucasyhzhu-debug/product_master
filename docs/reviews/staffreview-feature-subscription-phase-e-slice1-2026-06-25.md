# Staff Review — Subscription Phase E Slice 1 (Telegram Notification Layer)

**Branch:** `feature/subscription-phase-e-slice1` · **Head:** `2a53542b` · **Base:** `origin/main`
**Reviewer:** staff-eng review (plan-to-implementation fidelity + architectural risk)
**Date:** 2026-06-25
**Verdict:** APPROVE WITH NITS — ship after addressing the two Important items (or consciously deferring them with a note).

---

## Summary

Outbound-only subscription Telegram notification layer: 6 WIB reminder/summary crons + 6 watchdogs routed to two new roles (`subscription-ops`, `founders`), driven by 6 read-only `internalQuery`s feeding 6 pure HTML formatters, with a single `kind`-parameterized send/resilient/watchdog triad. Pure-additive, no schema delta, read-only except `telegramDeliveries` receipts, ship-dark.

**Plan fidelity is excellent.** Every task (T1–T7) landed as specified, on the planned files, with the planned interfaces. `npm run type-check` passes clean; `npx vitest run convex/telegram convex/subscriptions convex/crons.test.ts` → **268 passed**. The `invoice-due` Mon 01:30/01:45 collision-avoidance move is in place and asserted. The kind-parameterized triad faithfully mirrors the `sendSalesSummary` template (explicit return types to break circular inference, concrete self-references for `scheduler.runAfter`, fail-fast on unassigned chat, best-effort receipt). AC8/AC9 verified by grep: all new registrations are `internal*`; the only write in non-test source is `recordDelivery`. The `amountDue` derivation in `getWeeklyInvoicesDue` was correctly verified against `createSubscriptionWeeklyInvoice` (Σ `plannedDays[].items[].lineTotal`, not `creditIssued`).

Two issues are worth fixing before this scales past a handful of accounts: (1) **no message-length chunking** — the sender builds one HTML string and the EC9 "mirror breadcrumb-on-partial" was silently dropped; a >4096-char founders/today message will be rejected by Telegram (non-transient → watchdog can't recover); (2) **kind 5 (`reconcile`) has no "prior week" filter** — it lists every `delivering` week, including the freshly-paid current week, so the Monday reminder will nag for reconciliation of weeks whose deliveries haven't happened yet. Neither blocks ship-dark, but both are real spec-fidelity gaps.

---

## Critical Issues

None. The watchdog re-fire semantics are sound (receipt-gated, `recordDelivery` idempotent, no WIB-midnight boundary on any of the six slots so sender and +15m watchdog always compute the same `subscriptionSlotKey`), all new surface is `internalAction`/`internalQuery` (no Pitfall-#19 mount risk), and there are no writes outside `telegramDeliveries`.

---

## Improvements (Important)

### I1 — No message chunking; EC9 "breadcrumb-on-partial" was dropped → long sends fail permanently
**`convex/telegram/subscriptionReminders/sendSubscriptionReminder.ts:61-62`**, formatters in `subscriptionRemindersFormat.ts`.
The template (`sendSalesSummary.ts:99-120`) builds a `chunks[]` array and loops `sendTelegramHtml` per chunk with a partial-send breadcrumb. The spec's **EC9** explicitly required mirroring that behavior. The implementation instead builds a single `html` string via `buildMessage` and calls `sendTelegramHtml` once. `sendTelegramHtml` (`convex/lib/telegramHtml.ts:22-53`) does NOT chunk — it sends one message and throws on non-2xx. Telegram rejects messages > 4096 chars with HTTP 400, which is **non-transient**, so `isTransientError` is false, the resilient wrapper rethrows, and the watchdog (which only re-fires the same too-long message) cannot recover it — the post is permanently lost for that slot.
*Why it matters:* kind 6 (`weekly-delivery-progress`, one block per active account) and kind 3 (`today-deliveries`, per-product split) grow with account/product count. At Frollie's current B2B scale (a handful of accounts) it won't trigger, but the ceiling is unguarded and the EC9 mirror was dropped without a note.
*Fix:* either (a) make the formatters return `string[]` and loop the send with the same breadcrumb-on-partial logic as `sendSalesSummary` (record receipt only after the last chunk, so partial failure lets the watchdog resend), or (b) if single-message is a deliberate scope cut, add a comment documenting the 4096-char assumption and why chunking is deferred, and note the EC9 deviation in the PR. Option (a) is the faithful template mirror.

### I2 — `getWeeksToReconcile` lists ALL `delivering` weeks, not just the prior/overdue week
**`convex/subscriptions/reminders/queries.ts:111-124`**.
Spec §1 kind 5: "prior week in `delivering`/unreconciled → reconcile in app." `markWeeklyInvoicePaid` (`convex/subscriptions/invoicing.ts:257`) sets `status: "delivering"` the moment an invoice is paid, and the week stays `delivering` for the entire active delivery week until an operator runs `reconcileWeek`. The query selects every `delivering` week with no `weekEnd < now` (or "not the current week") guard, so the Monday 09:00 reminder will list the **current, mid-delivery week** alongside genuinely-overdue prior weeks — prompting operators to reconcile a week before its deliveries are done.
*Why it matters:* false-positive nags erode trust in the reminder and contradict the stated intent ("prior week"). It also surfaces `shortfall`/`refundDue` figures (both 0 on a week that hasn't reconciled) as if actionable.
*Fix:* filter to weeks whose delivery window has ended, e.g. `w.weekEnd < now` (or exclude the sub's current week via the same `currentWeek` helper already in the file). Add a test asserting the current `delivering` week is excluded and only the prior one is returned. (Tests today only cover a single prior week, so the false-positive is invisible.)

---

## Refinements (Minor)

### R1 — `change-cutoff` reuses `ConfirmRow`, carrying an unused `subscriptionId`/`weekStart` into the formatter
**`queries.ts:91-109`**, **`subscriptionRemindersFormat.ts:37-41`**.
`getDaysApproachingCutoff` returns `ConfirmRow[]` but `formatChangeCutoffReminder` only renders `r.account`. The `subscriptionId` and `weekStart` fields are dead payload. Harmless, but a dedicated `CutoffRow = { account: string }` (or reusing a minimal shape) would make the contract honest and prevent a future reader assuming the week date is meaningful here. Low priority.

### R2 — `getDaysApproachingCutoff` double-scans weeks via the `?? currentWeek(now)` fallback
**`queries.ts:99`**: `const week = await currentWeek(ctx, sub._id, tomorrow) ?? await currentWeek(ctx, sub._id, now);`
Each `currentWeek` call does a full `by_subscription_weekStart` `.collect()` + linear `.find`. When `tomorrow` falls in the same week as `now` (the common case), the first call already returns it and the fallback is skipped — fine. But when `tomorrow` crosses into next week and that week isn't seeded yet, both calls run. Bounded and cheap at current scale; flagging only as a place where a single windowed read keyed on `[now, tomorrow]` would be cleaner if account count grows. No change needed now.

### R3 — `kinds.ts` `REMINDER_KINDS` and the `KIND` validator union in `sendSubscriptionReminder.ts` are duplicated literal lists
**`kinds.ts:3-10`** vs **`sendSubscriptionReminder.ts:19-26`**.
Two hand-maintained copies of the same six literals (plus a third in `crons.ts` call sites and a fourth in `crons.test.ts`). The `buildMessage` switch is exhaustiveness-checked by the `ReminderKind` type, so a drift in the validator union would surface at type-check — acceptable. If you want belt-and-suspenders, derive the `v.union(...)` from `REMINDER_KINDS` (a small `REMINDER_KINDS.map(v.literal)` spread) so there's one source of truth. Optional.

### R4 — `activeSubscriptions`/`currentWeek` helpers use `.collect()` (bounded N+1)
**`queries.ts:13-24`, kinds 1/5/6**.
Per CLAUDE.md C9 ("never `.collect()` unbounded history"), these are unbounded in principle. In practice the subscription table is a handful of B2B accounts and the plan explicitly accepts the bounded N+1 in cron context. No action; noted so a future reviewer doesn't re-flag it as fresh.

---

## Nitpick

### N1 — `fmtDate` `.slice(-2)` on a 4-digit year is fine, but undocumented for years < 1000
`subscriptionRemindersFormat.ts:11` — `String(year).slice(-2)`. Cosmetic; will never see a sub-1000 year. No change.

### N2 — `crons.test.ts` reads `(crons as any).crons` internal shape
`convex/crons.test.ts:11-14`. Relies on the undocumented `cronJobs()` return shape; the plan flagged a source-regex fallback if introspection breaks. Acceptable, but if a Convex upgrade renames the field the smoke test silently returns `{}` and the `toHaveProperty` assertions catch it (they'd fail loudly), so it degrades safely. Fine as-is.

### N3 — `getWeeklyInvoicesDue` `paymentReceivedAt` guard is redundant with the status filter
`queries.ts:52`. A paid week transitions to `status: "delivering"` (invoicing.ts:257), so it already falls out of the `["confirmed","invoiced"]` scan; the `if (w.paymentReceivedAt) continue` is defensive belt-and-suspenders. Harmless, keep it.

---

## Template-consistency assessment

Faithful mirror of `sendSalesSummary.ts` / `cronRetry.ts` in all the load-bearing ways: explicit handler return types (circular-inference break), concrete self-reference in `scheduler.runAfter`, transient-only retry via the shared `cronRetry` policy (not re-rolled), receipt-gated watchdog with the same incident-2026-06-02 rationale, fail-fast on unassigned chat (ship-dark). The slot-key scheme correctly extends `salesSlotKey`/`packSlotKey` with a generic `subscriptionSlotKey(kind: string, nowMs)` that keeps `deliveryReceipts.ts` decoupled from the subscription module. The **one risky divergence** is dropping the chunked-send + partial breadcrumb (I1) — that part of the template was load-bearing for EC9 and was not carried over.

## Over-engineering check

No over-engineering. The kind-parameterization is the right call (matches `sendSalesSummary(cadence)` precedent, one triad instead of six) and avoids a 6× copy. The formatters are appropriately pure and minimal. If anything the implementation is slightly *under*-built vs the template (I1).
