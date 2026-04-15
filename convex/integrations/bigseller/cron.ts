/**
 * Phase 79 Plan 05 — BigSeller nightly re-sync cron (DA-12).
 *
 * Runs daily at 20:00 UTC (03:00 WIB next day, Indonesia UTC+7, no DST) and
 * re-syncs the trailing 7 days of BigSeller orders so same-day Shopee `--`
 * rows that BigSeller populates within 24h auto-backfill without admin action.
 *
 * D-12 skip-if-busy contract:
 *   - If `bigsellerSyncState.stage !== "idle"`, write a single
 *     `externalSyncLogs` row with `status: "error"` and
 *     `errorMessage: "skipped: manual sync in progress"` (exact wording —
 *     pinned by cron.test.ts), then return without running the sync.
 *
 * D-13 error handling:
 *   - On token-resolution failure or any unexpected exception before the
 *     scheduler chain takes over, log a single `externalSyncLogs` error row
 *     and return. No retry loop, no email/toast alerting.
 *
 * See:
 *   - .planning/phases/79-shopee-item-level-revenue/79-05-cron-and-sync-skip-PLAN.md
 *   - convex/integrations/bigseller/__tests__/cron.test.ts
 */

import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { BIGSELLER_PLATFORM_ID, BIGSELLER_MAX_POLLS } from "./config";
import type { Id } from "../../_generated/dataModel";

/**
 * D-12 skip signal. Exact wording is asserted by cron.test.ts
 * ("skipped: manual sync in progress") — do NOT edit without updating the
 * test file. Keeping it as a module-level `as const` constant makes greps
 * for the literal survive any future inlining refactor.
 */
export const CRON_SKIP_REASON_MANUAL_SYNC =
  "skipped: manual sync in progress" as const;

// Format a Date as YYYY-MM-DD in UTC (BigSeller pageList expects local-date
// strings; UTC avoids the +/- 1 day drift on cron boundaries near midnight).
function formatDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const nightlySync = internalAction({
  args: {},
  handler: async (ctx) => {
    // ── D-12: skip-if-not-idle guard ───────────────────────────────────
    const state = await ctx.runQuery(
      internal.integrations.bigseller.queries.getSyncStateInternal,
      {},
    );
    if (state && state.stage !== "idle") {
      await ctx.runMutation(
        internal.externalData.mutations.createSyncLog,
        {
          source: "bigseller",
          syncType: "cron",
          status: "error",
          errorMessage: CRON_SKIP_REASON_MANUAL_SYNC,
          timestamp: Date.now(),
          triggeredBy: "cron-daily",
        },
      );
      return;
    }

    // ── D-11: trailing 7-day window in UTC ─────────────────────────────
    const now = new Date();
    const endDate = formatDateUTC(now);
    const startDate = formatDateUTC(
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    );

    // Always create a `started` log row for this cron invocation so the
    // admin dashboard shows cron attempts even when they ultimately fail
    // downstream. The scheduler-chain actions below patch this same row
    // to `success` / `error` on completion (see sync.ts error paths).
    const syncLogId: Id<"externalSyncLogs"> = await ctx.runMutation(
      internal.externalData.mutations.createSyncLog,
      {
        source: "bigseller",
        syncType: "cron",
        status: "started",
        timestamp: Date.now(),
        triggeredBy: "cron-daily",
      },
    );

    // Verify a BigSeller token is configured BEFORE kicking off the
    // scheduler chain. Without a token the chain would loop through poll
    // retries and ultimately update the log — but that happens in scheduled
    // functions that the admin dashboard will not observe until the chain
    // completes. Failing fast here keeps the error surface immediate.
    const cred = await ctx.runQuery(
      internal.platformCredentials.queries.getCredentialsInternal,
      { platformId: BIGSELLER_PLATFORM_ID },
    );
    if (!cred?.currentToken) {
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "error",
        errorMessage:
          "No BigSeller token configured — paste token in Settings",
      });
      return;
    }

    // ── D-13: try/catch the scheduler kickoff. Downstream scheduled ────
    // actions manage their own error logging via updateSyncLog.
    try {
      await ctx.runMutation(
        internal.integrations.bigseller.mutations.updateSyncStage,
        {
          stage: "triggering",
          pollAttempt: 0,
          maxPolls: BIGSELLER_MAX_POLLS,
          attempt: 1,
          startDate,
          endDate,
        },
      );

      await ctx.scheduler.runAfter(
        0,
        internal.integrations.bigseller.sync.triggerSync,
        {
          startDate,
          endDate,
          attempt: 1,
          syncLogId,
        },
      );
    } catch (err) {
      // Anything that throws BEFORE the scheduler chain runs (e.g. an
      // updateSyncStage validator failure) is captured here. The chain
      // itself logs its own errors via updateSyncLog.
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  },
});
