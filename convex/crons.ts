import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync internal orders revenue",
  { hours: 1 },
  api.integrations.internal.adapter.syncInternalOrders,
  { triggeredBy: "cron" }
);

// Phase 79 (DA-12): Daily BigSeller re-sync at 03:00 WIB (= 20:00 UTC,
// Indonesia UTC+7, no DST). Re-fetches the trailing 7 days so same-day
// Shopee `--` rows auto-backfill once BigSeller catches up (within 24h).
// Skip-if-not-idle guard lives inside nightlySync (D-12).
crons.daily(
  "bigseller nightly 7d resync",
  { hourUTC: 20, minuteUTC: 0 },
  internal.integrations.bigseller.cron.nightlySync,
);

// Telegram pack list bot v1: morning post at 07:00 WIB (= 00:00 UTC).
crons.daily(
  "telegram morning pack list",
  { hourUTC: 0, minuteUTC: 0 },
  internal.telegram.sendPackList.sendPackList,
  { reason: "morning" },
);

// Telegram pack list bot v1: midday "still pending" reminder at 13:00 WIB (= 06:00 UTC).
crons.daily(
  "telegram midday pack list",
  { hourUTC: 6, minuteUTC: 0 },
  internal.telegram.sendPackList.sendPackList,
  { reason: "midday" },
);

export default crons;
