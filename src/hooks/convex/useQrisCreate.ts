/**
 * Phase 84 Plan 05 — QRIS create-invoice action hook.
 *
 * Kept in its own module (NOT in `useQris.ts`) so `QrisChargeDialog` can import
 * it without tripping the read-hook mock in the R5/R7 RTL test, which only mocks
 * the two query hooks from `@/hooks/convex/useQris`.
 *
 * Invoked via the Convex client's `.action(...)` (provider-tolerant — returns a
 * no-op when there is no ConvexProvider in the tree, e.g. under RTL) + an
 * explicit session `token` read from the auth user, exactly the way every other
 * action in this codebase is called (`useGrabFood.ts:59-62`). There is NO
 * `useSessionAction` wrapper in this project (staffreview C2); the action takes
 * an explicit `token` arg (Plan 03) re-validated server-side via `requireRole`.
 */
import { useConvex } from "convex/react";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function useCreateQrisInvoice() {
  const convex = useConvex();
  const { user } = useAuth();
  const token = user?.token ?? "";
  return (orderId: Id<"orders">) => {
    if (!convex) return Promise.resolve(undefined);
    return convex.action(api.qrisPayments.actions.createQrisInvoice, { orderId, token });
  };
}
