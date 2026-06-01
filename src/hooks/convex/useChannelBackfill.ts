/**
 * Phase 74.5.2 Plan 06 — Per-source channel backfill hooks.
 *
 * Exposes:
 *   - useChannelBackfillPreflight(source): reactive { pendingItems, blockingAuditIssues }
 *   - useRunChannelBackfill(): typed wrapper around `runOneChannelBackfillPage` for
 *     the client-loop pattern (mirrors useBackfillInternalRevenueItems in
 *     useUnlinkedBackfill.ts).
 *
 * Consumed by `UnlinkedProductsBackfill.tsx` Card 4 (Channel Deduction Backfill).
 *
 * Pitfall 1: GoFood's externalSource literal is `"gobiz"`, NOT `"gofood"`.
 * The 6-source list in the admin page uses DISPLAY labels ("GoFood") but passes
 * `source="gobiz"` to these hooks.
 *
 * D74.5.2-L15: GrabFood renders a card but `pendingItems === 0` today (no
 * ingested data); the UI handles this via the `isEmpty` check and disables the
 * button rather than attempting any no-op loop.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import type { ExternalSource } from "../../../convex/lib/externalSource";

// ============================================
// Return types (mirror backend return shapes)
// ============================================

export interface ChannelBackfillPreflight {
  /** Count of un-deducted items for the source (capped at 5000 — display "5000+" above cap). */
  pendingItems: number;
  /** Per-source count of open audit issues with severity="block". Informational — does NOT disable the backfill button (D-17 + Pitfall 4). */
  blockingAuditIssues: number;
}

export interface ChannelBackfillPageResult {
  itemsProcessed: number;
  deducted: number;
  skipped: number;
  /** Items whose route could not be resolved (CHANNEL_ROUTING_NOT_CONFIGURED) — need a routing rule. */
  unroutable: number;
  /** Pagination cursor to pass to the next page; null when the walk is complete. */
  continueCursor: string | null;
  /** True when the cursor has walked the entire source — caller stops looping. */
  isDone: boolean;
}

// ============================================
// Query hook — preflight stats
// ============================================

/**
 * Reactive per-source preflight stats. Returns `undefined` while loading;
 * auto-updates after mutations run. Admin-only (backend enforces via requireRole).
 */
export function useChannelBackfillPreflight(source: ExternalSource): {
  data: ChannelBackfillPreflight | undefined;
  isLoading: boolean;
} {
  const { user } = useAuth();
  const hasToken = Boolean(user?.token);
  const data = useQuery(
    api.productInventory.backfill.getChannelBackfillPreflight,
    hasToken ? { source, token: user!.token } : "skip",
  ) as ChannelBackfillPreflight | undefined;
  // Skipped queries never resolve — don't report isLoading:true forever when
  // the hook is used outside an authenticated route.
  return {
    data,
    isLoading: hasToken ? data === undefined : false,
  };
}

// ============================================
// Mutation hook — one-page backfill (client-loop)
// ============================================

/**
 * Client-loop backfill page runner. Caller invokes in a loop, threading
 * `continueCursor` forward, and stops when `isDone === true`. Server shares the
 * same `backfillOnePageImpl` body as the scheduler path — identical per-row
 * semantics.
 *
 * Admin-only (backend enforces via requireRole).
 */
export function useRunChannelBackfill() {
  const runPage = useMutation(
    api.productInventory.backfill.runOneChannelBackfillPage,
  );
  return runPage as (args: {
    source: ExternalSource;
    token: string;
    cursor?: string | null;
  }) => Promise<ChannelBackfillPageResult>;
}
