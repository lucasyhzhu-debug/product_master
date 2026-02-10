import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "refresh k3mart token",
  { hours: 12 },
  internal.platformCredentials.actions.refreshK3MartTokenCron
);

// Sync GoBiz revenue at 8, 10, 12, 14, 16, 18, 20 WIB
// WIB = UTC+7, so: 1, 3, 5, 7, 9, 11, 13 UTC
crons.cron(
  "sync gobiz revenue",
  "0 1,3,5,7,9,11,13 * * *",
  internal.integrations.gobiz.adapter.autoSyncGoBizRevenue
);

export default crons;
