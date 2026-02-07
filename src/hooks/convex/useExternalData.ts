/**
 * Convex hooks for external platform data (K3 Mart, GoBiz).
 * Query hooks for outlets, snapshots, revenue, sync logs.
 * Action hooks for triggering platform syncs.
 */
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================
// Query Hooks
// ============================================

/**
 * List all external outlets, optionally filtered by source.
 */
export function useConvexExternalOutlets(source?: "k3mart" | "gobiz") {
  const data = useQuery(api.externalData.queries.listOutlets, { source });
  return { data, isLoading: data === undefined };
}

/**
 * Get latest stock snapshots for an outlet.
 */
export function useConvexExternalSnapshots(outletId?: Id<"externalOutlets">) {
  const data = useQuery(
    api.externalData.queries.getLatestSnapshots,
    outletId ? { outletId } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Get revenue records, optionally filtered by source and period.
 */
export function useConvexExternalRevenue(
  source?: "k3mart" | "gobiz",
  periodStart?: number,
  periodEnd?: number
) {
  const data = useQuery(api.externalData.queries.getRevenue, {
    source,
    periodStart,
    periodEnd,
  });
  return { data, isLoading: data === undefined };
}

/**
 * Get sync logs, optionally filtered by source.
 */
export function useConvexExternalSyncLogs(
  source?: "k3mart" | "gobiz",
  limit?: number
) {
  const data = useQuery(api.externalData.queries.getSyncLogs, {
    source,
    limit,
  });
  return { data, isLoading: data === undefined };
}

/**
 * Get product mappings, optionally filtered by source.
 */
export function useConvexExternalProductMappings(
  source?: "k3mart" | "gobiz"
) {
  const data = useQuery(api.externalData.queries.getProductMappings, {
    source,
  });
  return { data, isLoading: data === undefined };
}

/**
 * Get dashboard sales summary (outlet counts, recent revenue, last sync per platform).
 */
export function useConvexDashboardSalesSummary() {
  const data = useQuery(api.externalData.queries.getDashboardSummary, {});
  return { data, isLoading: data === undefined };
}

// ============================================
// Action Hooks (Sync Triggers)
// ============================================

/**
 * Trigger K3Mart stock sync action.
 */
export function useConvexSyncK3Mart() {
  return useAction(api.integrations.k3mart.adapter.syncK3MartStock);
}

/**
 * Trigger GoBiz revenue sync action.
 */
export function useConvexSyncGoBiz() {
  return useAction(api.integrations.gobiz.adapter.syncGoBizRevenue);
}

