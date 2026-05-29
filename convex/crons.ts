import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync internal orders revenue",
  { hours: 1 },
  api.integrations.internal.adapter.syncInternalOrders,
  { triggeredBy: "cron" }
);

// Telegram pack list bot v1: morning post at 07:00 WIB (= 00:00 UTC).
// Uses the resilient wrapper so a transient Convex worker-spike at firing time
// self-reschedules instead of silently dropping the post (incident 2026-05-29).
crons.daily(
  "telegram morning pack list",
  { hourUTC: 0, minuteUTC: 0 },
  internal.telegram.sendPackList.sendPackListResilient,
  { reason: "morning" },
);

// Telegram pack list bot v1: midday "still pending" reminder at 13:00 WIB (= 06:00 UTC).
crons.daily(
  "telegram midday pack list",
  { hourUTC: 6, minuteUTC: 0 },
  internal.telegram.sendPackList.sendPackListResilient,
  { reason: "midday" },
);

// Sales-updates bot — daily end-of-day summary at 23:00 WIB (= 16:00 UTC).
// Best-effort refreshes GoFood/K3Mart/Internal, then posts revenue + per-SKU by channel.
crons.daily(
  "sales summary daily",
  { hourUTC: 16, minuteUTC: 0 },
  internal.telegram.salesSummary.sendSalesSummary.sendSalesSummary,
  { cadence: "daily" },
);

// Sales-updates bot — weekly round-up Monday 07:00 WIB (= Mon 00:00 UTC), prior Mon–Sun.
crons.weekly(
  "sales summary weekly",
  { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 0 },
  internal.telegram.salesSummary.sendSalesSummary.sendSalesSummary,
  { cadence: "weekly" },
);

// Sales-updates bot — monthly round-up 1st at 08:00 WIB (= 1st 01:00 UTC), prior calendar month.
crons.monthly(
  "sales summary monthly",
  { day: 1, hourUTC: 1, minuteUTC: 0 },
  internal.telegram.salesSummary.sendSalesSummary.sendSalesSummary,
  { cadence: "monthly" },
);

export default crons;
