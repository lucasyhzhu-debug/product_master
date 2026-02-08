import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "refresh k3mart token",
  { hours: 12 },
  internal.platformCredentials.actions.refreshK3MartTokenCron
);

crons.interval(
  "sync gobiz revenue",
  { hours: 3 },
  internal.integrations.gobiz.adapter.syncGoBizRevenueCron
);

export default crons;
