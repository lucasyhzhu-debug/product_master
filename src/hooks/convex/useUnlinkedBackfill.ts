/**
 * Convex hooks for the Phase 80.2 Unlinked Products Backfill admin page.
 *
 * Wraps:
 *   - api.externalData.queries.getK3MartBackfillStats  — K3Mart preflight stats
 *   - api.externalData.queries.getDirectBackfillStats  — Direct preflight stats
 *   - api.externalData.mutations.cascadeAllK3MartMappings — K3Mart cascade
 *   - api.externalData.mutations.backfillInternalRevenueItems — Direct backfill (paginated)
 *
 * Stats are split into two queries (rather than one combined) so each has
 * its own per-query read budget under Convex's 16,384 doc cap, and each can
 * surface its own scanCapReached flag to the UI.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// Types (mirror backend return shapes)
// ============================================

export interface K3MartBackfillStats {
  totalParents: number;
  linkedParents: number;
  unlinkedParents: number;
  nullProductCodeParents: number;
  totalMappings: number;
  activeMappings: number;
  scanCapReached: boolean;
}

export interface DirectBackfillStats {
  totalParents: number;
  parentsWithChildren: number;
  orphanParents: number;
  totalChildren: number;
  scanCapReached: boolean;
}

export interface CascadeK3MartResult {
  mappingsProcessed: number;
  activeMappings: number;
  totalMappings: number;
  externalRevenueUpdatedTotal: number;
  durationMs: number;
  auditLogId: string;
}

export interface BackfillPageResult {
  parentsScanned: number;
  parentsBackfilled: number;
  itemsInserted: number;
  skippedHasChildren: number;
  skippedMissingOrder: number;
  skippedEmptyOrderItems: number;
  continueCursor: string | null;
  isDone: boolean;
}

// ============================================
// Query Hooks
// ============================================

/**
 * Reactive K3Mart preflight stats. Returns `undefined` while loading;
 * auto-updates after mutations run.
 */
export function useK3MartBackfillStats(): K3MartBackfillStats | undefined {
  const { user } = useAuth();
  return useQuery(
    api.externalData.queries.getK3MartBackfillStats,
    user?.token ? { token: user.token } : "skip"
  ) as K3MartBackfillStats | undefined;
}

/**
 * Reactive Direct preflight stats. Returns `undefined` while loading;
 * auto-updates after mutations run.
 */
export function useDirectBackfillStats(): DirectBackfillStats | undefined {
  const { user } = useAuth();
  return useQuery(
    api.externalData.queries.getDirectBackfillStats,
    user?.token ? { token: user.token } : "skip"
  ) as DirectBackfillStats | undefined;
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * One-shot K3Mart cascade — re-applies every active SKU mapping.
 * Idempotent. Admin-only (backend enforces via requireRole).
 *
 * Throws with a clear message if the aggregate write budget (6000) is
 * exceeded mid-loop — re-run to resume (already-patched rows are no-ops).
 */
export function useCascadeAllK3MartMappings() {
  const mutation = useMutation(
    api.externalData.mutations.cascadeAllK3MartMappings
  );
  return mutation as (args: { token: string }) => Promise<CascadeK3MartResult>;
}

/**
 * Paginated Direct backfill — one page per call.
 * Caller is responsible for looping on `continueCursor` until `isDone === true`.
 * Server caps `limit` at 500 regardless of what the caller passes.
 */
export function useBackfillInternalRevenueItems() {
  const mutation = useMutation(
    api.externalData.mutations.backfillInternalRevenueItems
  );
  return mutation as (args: {
    token: string;
    cursor?: string | null;
    limit?: number;
  }) => Promise<BackfillPageResult>;
}
