---
status: fixing
trigger: "why didn't my frollieProBot update my '/ship' this morning? cehck the logs"
created: 2026-06-02
updated: 2026-06-02
---

# Debug: pack-list Telegram cron dropped — resilient retry's own launch hit a platform transient

## Symptoms
- Expected: morning "what to ship today" pack-list post in the Telegram group.
- Actual: no message arrived.
- User reported it as the morning post; the run provable from logs is the 13:00 WIB run
  (the 07:00 WIB run had already rolled off Convex's CLI log buffer — earliest retained
  entry was ~12:22 WIB at time of investigation).

## Evidence (prod `decisive-wombat-7`, 2026-06-02)
Midday cron `telegram midday pack list` fired `sendPackListResilient(reason=midday)` at
13:00:00 WIB (06:00 UTC):

1. `getChatIdByRole(pack-list)` succeeded but took **8.8s** (normally ~5ms) → deployment
   severely degraded at firing time. Config OK (chat resolved, returned a chatId).
2. `getOrdersForPackList` threw `"Your request couldn't be completed. Try again later."`
   (transient platform error) → `sendPackList` threw at `sendPackList.ts:35`.
3. Wrapper caught it: `[sendPackListResilient] transient error on attempt 1/3
   (reason=midday); retrying in 60000ms` → scheduled retry, completed cleanly.
4. **60s later the scheduled retry never executed**: `sendPackListResilient` via Scheduler
   errored with `"Transient error while executing action"`, `environment: "invalid"`,
   `willRetry: false`. The failure was at the PLATFORM layer (action couldn't launch), so
   the handler's `try/catch` never ran → no attempt 2/3 scheduled → chain died silently.
   No pack list delivered.

## Root Cause
Two layers:
- **Proximate:** transient Convex prod capacity degradation window around 13:00 WIB
  (8.8s queries, "couldn't be completed" errors). Same failure CLASS as 2026-05-29
  (`midday-pack-cron-no-workers.md`).
- **Real gap (the bug):** `sendPackListResilient` / `sendSalesSummaryResilient` only retry
  transient errors thrown INSIDE the handler. When the *scheduled retry action itself*
  fails to launch (`"Transient error while executing action"`, `environment:"invalid"`,
  `willRetry:false`), that's outside the `try/catch` and Convex does not auto-retry actions
  → permanent silent drop. The resilient wrapper added 2026-05-29 has a blind spot for the
  retry's own launch failure — exactly what bit today.

## Fix (chosen: watchdog cron)
Independent verification cron offset ~15min after each Telegram cron slot. Senders record a
per-slot WIB-keyed delivery receipt on success; the watchdog re-fires the resilient sender
only if no receipt exists. A fresh cron invocation at a later time sidesteps the dead retry
chain (platform almost always recovered by then). Receipt check failing → no resend
(avoids double-post; manual `/pack` remains the human fallback).

- New table `telegramDeliveries` (by_slotKey).
- `convex/telegram/deliveryReceipts.ts` — slotKey builders + recordDelivery + wasDelivered.
- `sendPackList`/`sendSalesSummary` record receipt on success.
- `watchdogPackList` / `watchdogSalesSummary` internalActions.
- 5 watchdog crons in `convex/crons.ts`.

Immediate recovery: type `/pack` in the group (webhook dispatches sendPackList on demand).

## Files
- convex/schema.ts (telegramDeliveries)
- convex/telegram/deliveryReceipts.ts (new)
- convex/telegram/sendPackList.ts (record + watchdogPackList)
- convex/telegram/salesSummary/sendSalesSummary.ts (record + watchdogSalesSummary)
- convex/crons.ts (watchdog crons)
- convex/telegram/cronRetry.ts (context on the resilient-wrapper gap)
