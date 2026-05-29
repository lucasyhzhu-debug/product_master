/**
 * Shared transient-error retry policy for cron-triggered Telegram sends.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Convex crons fire a function exactly once with NO auto-retry. A Telegram
 * send-action's first step is always a `getChatIdByRole` runQuery; if a
 * transient Convex capacity error ("There are no available workers to process
 * the request") coincides with the firing time, the runQuery throws BEFORE any
 * message is sent and the post is silently dropped. This bit the pack-list
 * midday cron on 2026-05-29 (13:00 WIB).
 *
 * ── The playbook (see docs/telegram/telegram-bot-integration.md §Resilience) ──
 * Every cron-triggered send gets a thin `*Resilient` wrapper internalAction that:
 *   1. runs the real send-action via `ctx.runAction`,
 *   2. on a TRANSIENT error only, self-reschedules a backed-off retry
 *      (`ctx.scheduler.runAfter`) up to `RESILIENT_MAX_ATTEMPTS`,
 *   3. rethrows anything else.
 * Crons point at the wrapper; the raw send-action stays the on-demand
 * (`/pack`, admin test) entrypoint, where a human can simply re-issue it.
 *
 * Why a per-action wrapper and not one generic action: Convex `scheduler.runAfter`
 * needs a concrete function reference to reschedule, and function references are
 * not serialisable as args — so each cron needs its own wrapper that references
 * itself. The shared part (transient classification + backoff schedule) lives
 * here so the policy has a single source of truth.
 *
 * ── Why retrying is safe ─────────────────────────────────────────────────────
 * Transient errors are classified by message substring and only ever occur
 * before the send loop (at a Convex runQuery/runAction). A mid-chunk Telegram
 * send failure does NOT match `isTransientError`, so it is never retried — that
 * matters because re-running a partially-sent action would double-post earlier
 * chunks. Any pre-send work that DOES re-run on retry (e.g. the sales-summary
 * best-effort syncs) must be idempotent.
 */

/** Initial attempt + 2 retries. */
export const RESILIENT_MAX_ATTEMPTS = 3;

/** Linear backoff: 60s before retry 1, 120s before retry 2. `attempt` is 0-based. */
export function resilientRetryDelayMs(attempt: number): number {
  return 60_000 * (attempt + 1);
}

/**
 * Substrings that identify a transient Convex system/overload error — the only
 * class of failure safe to retry from a cron wrapper. Match is case-insensitive.
 */
const TRANSIENT_ERROR_SUBSTRINGS = ["no available workers"];

export function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return TRANSIENT_ERROR_SUBSTRINGS.some((s) => msg.includes(s));
}
