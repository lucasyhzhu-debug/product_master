import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync internal orders revenue",
  { hours: 1 },
  internal.integrations.internal.adapter.syncInternalOrders,
  { triggeredBy: "cron" }
);

export default crons;
