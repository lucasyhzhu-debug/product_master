/**
 * Convex hooks for the Phase 80.2 Unlinked Products Backfill admin page.
 *
 * Wraps:
 *   - api.externalData.queries.getUnlinkedBackfillStats — preflight stats
 *   - api.externalData.mutations.cascadeAllK3MartMappings — K3Mart cascade
 *   - api.externalData.mutations.backfillInternalRevenueItems — Direct backfill (paginated)
 *
 * NOTE: These APIs may not yet be in the generated `api.d.ts`. Uses the same
 * `(api as any)` escape pattern as useVouchers.ts until `npx convex dev` regenerates.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";

// ============================================
// Types (mirror backend return shapes)
// ============================================

export interface UnlinkedBackfillStats {
  k3mart: {
    totalParents: number;
    linkedParents: number;
    unlinkedParents: number;
    nullProductCodeParents: number;
    totalMappings: number;
    activeMappings: number;
    scanCapReached?: boolean;
  };
  direct: {
    totalParents: number;
    parentsWithChildren: number;
    orphanParents: number;
    totalChildren: number;
    scanCapReached?: boolean;
  };
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

// Escape hatch for APIs not yet in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const externalDataApi = (api as any).externalData as {
  queries: { getUnlinkedBackfillStats: unknown };
  mutations: {
    cascadeAllK3MartMappings: unknown;
    backfillInternalRevenueItems: unknown;
  };
};

// ============================================
// Query Hook
// ============================================

/**
 * Reactive preflight stats for the backfill page.
 * Returns `undefined` while loading; auto-updates after mutations run.
 */
export function useUnlinkedBackfillStats(): UnlinkedBackfillStats | undefined {
  const { user } = useAuth();
  return useQuery(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    externalDataApi.queries.getUnlinkedBackfillStats as any,
    user?.token ? { token: user.token } : "skip"
  ) as UnlinkedBackfillStats | undefined;
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * One-shot K3Mart cascade — re-applies every active SKU mapping.
 * Idempotent. Admin-only (backend enforces via requireRole).
 */
export function useCascadeAllK3MartMappings() {
  const mutation = useMutation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    externalDataApi.mutations.cascadeAllK3MartMappings as any
  );
  return mutation as (args: { token: string }) => Promise<CascadeK3MartResult>;
}

/**
 * Paginated Direct backfill — one page per call.
 * Caller is responsible for looping on `continueCursor` until `isDone === true`.
 */
export function useBackfillInternalRevenueItems() {
  const mutation = useMutation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    externalDataApi.mutations.backfillInternalRevenueItems as any
  );
  return mutation as (args: {
    token: string;
    cursor?: string | null;
    limit?: number;
  }) => Promise<BackfillPageResult>;
}
