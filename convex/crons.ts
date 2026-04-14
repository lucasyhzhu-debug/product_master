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

export default crons;
