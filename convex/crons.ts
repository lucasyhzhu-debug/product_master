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

// Watchdogs: fire 15min after each pack-list slot and re-send ONLY if no
// delivery receipt exists. Covers the gap where the primary run AND its
// scheduled retry both die to a platform-level transient (the in-handler retry
// wrapper can't catch a failed retry LAUNCH — incident 2026-06-02). A fresh
// cron launch at a later time isn't coupled to the dead retry chain.
crons.daily(
  "telegram morning pack list watchdog",
  { hourUTC: 0, minuteUTC: 15 },
  internal.telegram.sendPackList.watchdogPackList,
  { reason: "morning" },
);
crons.daily(
  "telegram midday pack list watchdog",
  { hourUTC: 6, minuteUTC: 15 },
  internal.telegram.sendPackList.watchdogPackList,
  { reason: "midday" },
);

// Sales-updates bot — daily end-of-day summary at 23:00 WIB (= 16:00 UTC).
// Best-effort refreshes GoFood/K3Mart/Internal, then posts revenue + per-SKU by channel.
// Uses the resilient wrapper (see convex/telegram/cronRetry.ts) so a transient
// Convex worker-spike at firing time self-reschedules instead of dropping the post.
crons.daily(
  "sales summary daily",
  { hourUTC: 16, minuteUTC: 0 },
  internal.telegram.salesSummary.sendSalesSummary.sendSalesSummaryResilient,
  { cadence: "daily" },
);

// Sales-updates bot — weekly round-up Monday 07:00 WIB (= Mon 00:00 UTC), prior Mon–Sun.
crons.weekly(
  "sales summary weekly",
  { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 0 },
  internal.telegram.salesSummary.sendSalesSummary.sendSalesSummaryResilient,
  { cadence: "weekly" },
);

// Sales-updates bot — monthly round-up 1st at 08:00 WIB (= 1st 01:00 UTC), prior calendar month.
crons.monthly(
  "sales summary monthly",
  { day: 1, hourUTC: 1, minuteUTC: 0 },
  internal.telegram.salesSummary.sendSalesSummary.sendSalesSummaryResilient,
  { cadence: "monthly" },
);

// Sales-summary watchdogs — fire 15min after each slot; re-send only if no
// receipt. Same rationale as the pack-list watchdogs above (incident 2026-06-02).
crons.daily(
  "sales summary daily watchdog",
  { hourUTC: 16, minuteUTC: 15 },
  internal.telegram.salesSummary.sendSalesSummary.watchdogSalesSummary,
  { cadence: "daily" },
);
crons.weekly(
  "sales summary weekly watchdog",
  { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 15 },
  internal.telegram.salesSummary.sendSalesSummary.watchdogSalesSummary,
  { cadence: "weekly" },
);
crons.monthly(
  "sales summary monthly watchdog",
  { day: 1, hourUTC: 1, minuteUTC: 15 },
  internal.telegram.salesSummary.sendSalesSummary.watchdogSalesSummary,
  { cadence: "monthly" },
);

export default crons;
