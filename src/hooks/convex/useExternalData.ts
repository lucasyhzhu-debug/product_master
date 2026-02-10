/**
 * Convex hooks for external platform data (K3 Mart, GoBiz, Internal).
 * Query hooks for outlets, snapshots, revenue, sync logs.
 * Action hooks for triggering platform syncs.
 */
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================
// Query Hooks
// ============================================

/**
 * List all external outlets, optionally filtered by source.
 */
export function useConvexExternalOutlets(source?: "k3mart" | "gobiz" | "internal") {
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
  source?: "k3mart" | "gobiz" | "internal",
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
  source?: "k3mart" | "gobiz" | "internal",
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
  source?: "k3mart" | "gobiz" | "internal"
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

/**
 * Period preset type for sales analytics time filters.
 */
export type PeriodPreset = "today" | "yesterday" | "last7days" | "last30days" | "thisMonth";

/**
 * Get dashboard sales summary by period preset (with current vs previous comparison).
 */
export function useConvexDashboardSalesSummaryByPeriod(preset: PeriodPreset) {
  const data = useQuery(api.externalData.queries.getDashboardSummaryByPeriod, { preset });
  return { data, isLoading: data === undefined };
}

/**
 * Get order details by order number (for expanding internal order rows).
 * Uses skip pattern - pass undefined to skip the query.
 */
export function useConvexOrderDetailsByOrderNumber(orderNumber?: string) {
  const data = useQuery(
    api.externalData.queries.getOrderDetailsByOrderNumber,
    orderNumber ? { orderNumber } : "skip"
  );
  return { data, isLoading: data === undefined };
}

// ============================================
// Platform Credentials Hooks
// ============================================

/**
 * Get credential status for a platform (admin-only).
 */
export function useConvexCredentialStatus(
  platformId: string,
  token?: string
) {
  const data = useQuery(
    api.platformCredentials.queries.getCredentialStatus,
    token ? { token, platformId } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Get the refreshK3MartToken action reference.
 */
export function useConvexRefreshK3MartToken() {
  return useAction(api.platformCredentials.actions.refreshK3MartToken);
}

// ============================================
// Action Hooks (Sync Triggers)
// ============================================

/**
 * Trigger K3Mart outlet discovery via product detail API (<1s).
 */
export function useConvexDiscoverK3MartOutlets() {
  return useAction(api.integrations.k3mart.adapter.discoverK3MartOutlets);
}

/**
 * Trigger K3Mart sales sync action (incremental, ~2s).
 */
export function useConvexSyncK3MartSales() {
  return useAction(api.integrations.k3mart.adapter.syncK3MartSales);
}

/**
 * Trigger K3Mart stock refresh via product detail API (<1s).
 */
export function useConvexSyncK3MartStock() {
  return useAction(api.integrations.k3mart.adapter.syncK3MartStock);
}

/**
 * Trigger GoBiz revenue sync action.
 */
export function useConvexSyncGoBiz() {
  return useAction(api.integrations.gobiz.adapter.syncGoBizRevenue);
}

/**
 * Trigger internal orders sync action.
 */
export function useConvexSyncInternalOrders() {
  return useAction(api.integrations.internal.adapter.syncInternalOrders);
}

/**
 * Get revenue line items for a specific revenue record.
 * Uses skip pattern for conditional fetching (only when expanded).
 */
export function useConvexRevenueItems(revenueId?: Id<"externalRevenue">) {
  const data = useQuery(
    api.externalData.queries.getRevenueItems,
    revenueId ? { revenueId } : "skip"
  );
  return { data, isLoading: data === undefined };
}

// ============================================
// Restock Planner Hooks
// ============================================

/**
 * Get restock overview (all channels with stock + demand summary).
 */
export function useConvexRestockOverview() {
  const data = useQuery(api.externalData.queries.getRestockOverview, {});
  return { data, isLoading: data === undefined };
}

/**
 * Get detailed sell-through analysis for a channel/outlet.
 * Uses skip pattern when channel is null.
 */
export function useConvexChannelSellThrough(
  channel?: "k3mart" | "gobiz" | "internal",
  outletId?: Id<"externalOutlets">
) {
  const data = useQuery(
    api.externalData.queries.getChannelSellThrough,
    channel ? { channel, outletId } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Save a restock target mutation.
 */
export function useConvexSaveRestockTarget() {
  return useMutation(api.restock.mutations.saveRestockTarget);
}

/**
 * Update manual stock entry mutation.
 */
export function useConvexUpdateManualStock() {
  return useMutation(api.restock.mutations.updateManualStock);
}
