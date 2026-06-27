import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync internal orders revenue",
  { hours: 1 },
  api.integrations.internal.adapter.syncInternalOrders,
  { triggeredBy: "cron" }
);

// POS (Block M) revenue is NOT on its own cron — it is pulled as a best-effort
// step inside the daily sales summary (and the on-demand /sales command), the
// only moments POS data needs to be fresh. See telegram/salesSummary/sendSalesSummary.ts.

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
// Best-effort refreshes GoFood/K3Mart/Internal/POS(Block M), then posts revenue + per-SKU by channel.
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

const subR = internal.telegram.subscriptionReminders.sendSubscriptionReminder;

// 1 — confirm next week: Sun 17:00 WIB = Sun 10:00 UTC
crons.weekly("subscription confirm next week", { dayOfWeek: "sunday", hourUTC: 10, minuteUTC: 0 }, subR.sendSubscriptionReminderResilient, { kind: "confirm-next-week" });
crons.weekly("subscription confirm next week watchdog", { dayOfWeek: "sunday", hourUTC: 10, minuteUTC: 15 }, subR.watchdogSubscriptionReminder, { kind: "confirm-next-week" });

// 2 — weekly invoice due: Mon 08:30 WIB = Mon 01:30 UTC (NOT 01:00 — clears monthly day-1 collision)
crons.weekly("subscription invoice due", { dayOfWeek: "monday", hourUTC: 1, minuteUTC: 30 }, subR.sendSubscriptionReminderResilient, { kind: "invoice-due" });
crons.weekly("subscription invoice due watchdog", { dayOfWeek: "monday", hourUTC: 1, minuteUTC: 45 }, subR.watchdogSubscriptionReminder, { kind: "invoice-due" });

// 3 — today's deliveries: daily 07:05 WIB = 00:05 UTC (off the pack-list 00:00 convoy)
crons.daily("subscription today deliveries", { hourUTC: 0, minuteUTC: 5 }, subR.sendSubscriptionReminderResilient, { kind: "today-deliveries" });
crons.daily("subscription today deliveries watchdog", { hourUTC: 0, minuteUTC: 20 }, subR.watchdogSubscriptionReminder, { kind: "today-deliveries" });

// 4 — change cutoff (tomorrow): daily 12:30 WIB = 05:30 UTC
crons.daily("subscription change cutoff", { hourUTC: 5, minuteUTC: 30 }, subR.sendSubscriptionReminderResilient, { kind: "change-cutoff" });
crons.daily("subscription change cutoff watchdog", { hourUTC: 5, minuteUTC: 45 }, subR.watchdogSubscriptionReminder, { kind: "change-cutoff" });

// 5 — prior-week reconcile: Mon 09:00 WIB = Mon 02:00 UTC
crons.weekly("subscription reconcile", { dayOfWeek: "monday", hourUTC: 2, minuteUTC: 0 }, subR.sendSubscriptionReminderResilient, { kind: "reconcile" });
crons.weekly("subscription reconcile watchdog", { dayOfWeek: "monday", hourUTC: 2, minuteUTC: 15 }, subR.watchdogSubscriptionReminder, { kind: "reconcile" });

// 6 — founders weekly delivery progress: daily 18:00 WIB = 11:00 UTC
crons.daily("subscription delivery progress", { hourUTC: 11, minuteUTC: 0 }, subR.sendSubscriptionReminderResilient, { kind: "weekly-delivery-progress" });
crons.daily("subscription delivery progress watchdog", { hourUTC: 11, minuteUTC: 15 }, subR.watchdogSubscriptionReminder, { kind: "weekly-delivery-progress" });

// Enforcement (Slice 2) — idempotent internal mutations, NO watchdog.
// flipDayLocksAtCutoff: daily 12:25 WIB = 05:25 UTC (just before the 05:30 change-cutoff nudge).
crons.daily(
  "subscription flip day locks",
  { hourUTC: 5, minuteUTC: 25 },
  internal.subscriptions.enforcement.flipDayLocksAtCutoff.flipDayLocksAtCutoff,
  {},
);
// applyPendingBaselineChanges: daily 11:10 WIB = 04:10 UTC (unique minute).
crons.daily(
  "subscription apply baseline changes",
  { hourUTC: 4, minuteUTC: 10 },
  internal.subscriptions.enforcement.applyPendingBaselineChanges.applyPendingBaselineChanges,
  {},
);

export default crons;
