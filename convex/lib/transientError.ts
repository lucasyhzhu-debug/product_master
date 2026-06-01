/**
 * Transient-error classification — the single source of truth for "is this a
 * momentary Convex platform error that an idempotent re-run will clear?".
 *
 * Lives in `lib/` (not `telegram/cronRetry.ts`) so non-telegram callers — e.g.
 * the GoBiz revenue sync adapter — can decide whether to rethrow for an upstream
 * retry without depending on the telegram module. `cronRetry.ts` re-exports this
 * so existing `import { isTransientError } from "../cronRetry"` sites are unchanged.
 *
 * Observed transient classes:
 * - "no available workers": capacity error at function dispatch (pack-list 2026-05-29).
 * - "internalservererror" / "try again later": Convex platform InternalServerError
 *   ("Your request couldn't be completed. Try again later."). Hit the GoBiz sync
 *   mid-run on 2026-05-31 23:00 WIB (rendered GoFood ✗) and the sales-summary
 *   resilient wrapper on 2026-06-01.
 *
 * Match is case-insensitive on the error message. Only ever gates retries of
 * idempotent work, so a false-positive match is at worst a wasted safe re-run.
 */
const TRANSIENT_ERROR_SUBSTRINGS = [
  "no available workers",
  "internalservererror",
  "try again later",
];

export function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return TRANSIENT_ERROR_SUBSTRINGS.some((s) => msg.includes(s));
}
