import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync internal orders revenue",
  { hours: 1 },
  api.integrations.internal.adapter.syncInternalOrders,
  { triggeredBy: "cron" }
);

export default crons;
