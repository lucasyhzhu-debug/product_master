/**
 * Convex hooks for QRIS payments (Phase 84).
 *
 * The two read paths use `useSessionQuery` (the order_staff-safe protectedQuery
 * endpoints from Plan 03). The create-invoice path is an ACTION — invoked via
 * `useAction` + an explicit auth `token` read from the session user, exactly the
 * way every other action in this codebase is called (see `useGrabFood.ts:59-62`,
 * `useBigSeller.ts`). There is NO `useSessionAction` wrapper in this project
 * (staffreview C2); the action takes an explicit `token` arg (Plan 03) which is
 * re-validated server-side via `requireRole`.
 *
 * `undefined` from `useSessionQuery` means LOADING (Convex pitfall #2) — every
 * consumer must handle it.
 */
import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * QRIS feature config — `{ enabled, qrisNmid, merchantName } | undefined`.
 * `undefined` while the subscription resolves. Read this UNCONDITIONALLY at the
 * top of any consuming component (hooks-order, pitfall #9).
 */
export function useQrisConfig() {
  return useSessionQuery(api.qrisPayments.queries.getQrisConfig, {});
}

/**
 * The active QRIS payment row for an order (most-recent non-expired row).
 * `undefined` = loading, `null` = no active row, else the qrisPayments row.
 * Pass `undefined` to skip the subscription (e.g. before the order id resolves).
 */
export function useActiveQrisPayment(orderId: Id<"orders"> | undefined) {
  return useSessionQuery(
    api.qrisPayments.queries.getActiveQrisPayment,
    orderId ? { orderId } : "skip",
  );
}

// The create-invoice hook lives in `useQrisCreate.ts` (provider-tolerant, so
// QrisChargeDialog can import it without tripping the read-hook mock in the
// R5/R7 RTL test). Do NOT re-add a copy here — it caused a dead/divergent
// duplicate (triple-review C1).
