---
status: resolved
trigger: "i did not get my 1pm cron message for /pack orders on telegram please review and see what happened in the log"
created: 2026-05-29
updated: 2026-05-29
---

# Debug: 1pm pack-list Telegram cron did not deliver

## Symptoms
- Expected: midday "still pending" pack-list message in the Telegram pack-list group at 13:00 WIB.
- Actual: no message arrived.
- Timeline: single occurrence, 2026-05-29.

## Root Cause
Transient Convex platform overload at the exact firing time. Production log:

```
29/05/2026, 1:00:01 pm [CONVEX Q(telegram/chatRegistry:getChatIdByRole)] There are no available workers to process the request
29/05/2026, 1:00:01 pm [CONVEX A(telegram/sendPackList:sendPackList)] Uncaught Error: There are no available workers to process the request
    at async handler (../../convex/telegram/sendPackList.ts:25:15)
```

The `telegram midday pack list` cron (06:00 UTC = 13:00 WIB) invoked `sendPackList`, whose
first step is `ctx.runQuery(getChatIdByRole, {role:"pack-list"})` at sendPackList.ts:25.
The deployment had no free worker at that instant, so the query failed with a system
("no available workers") error and the action threw. **Convex crons do not auto-retry**, so
the run was dropped. No partial message was sent (failure happened before the first chunk).

NOT a config/role bug — chat resolution was never reached. Isolated transient (only 1
incident in the log window; BigSeller sync at 10:13am ran fine).

## Fix
- Immediate: re-send by typing `/pack` in the pack-list Telegram group (webhook dispatches
  sendPackList on demand — webhook.ts:186).
- Durable (recommended): wrap the cron entrypoint so transient system errors self-reschedule
  a retry via `ctx.scheduler.runAfter(backoff, ...)` instead of silently dropping the post.

## Files
- convex/crons.ts (cron defs)
- convex/telegram/sendPackList.ts:25 (throw site)
- convex/telegram/chatRegistry.ts:71 (getChatIdByRole)
