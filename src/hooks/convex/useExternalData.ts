/**
 * Convex hooks for external platform data (K3 Mart, GoBiz, Internal).
 * Query hooks for outlets, snapshots, revenue, sync logs.
 * Action hooks for triggering platform syncs.
 */
import { useState, useCallback, useEffect } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Return shape of getDashboardSummaryByPeriodInternal / fetchDashboardSummaryByPeriod. */
export type ChannelBreakdown = { source: string; displayName: string; gross: number; net: number; transactions: number; commission: number; promoBurn: number; deliveryFees: number };
type PeriodSummary = {
  totalGross: number;
  totalNet: number;
  totalTransactions: number;
  totalCommission: number;
  totalAdBurn: number;
  totalPromoBurn: number;
  totalDiscounts: number;
  totalDeliveryFees: number;
  platformGross: number;
  internalGross: number;
  channels: ChannelBreakdown[];
};
type PlatformStatus = {
  outletCount: number;
  activeOutlets: number;
  lastSync: null | { _id: string; _creationTime: number; source: string; status: string; syncedAt: number; recordCount: number; errorMessage?: string };
};
type DashboardSummaryByPeriod = {
  platforms: { k3mart: PlatformStatus; gobiz: PlatformStatus; internal: PlatformStatus };
  currentPeriod: PeriodSummary & { periodLabel: string; comparisonLabel: string; periodStart: number; periodEnd: number };
  previousPeriod: PeriodSummary;
};

// ============================================
// Query Hooks
// ============================================

/**
 * List all external outlets, optionally filtered by source.
 */
export function useExternalOutlets(source?: "k3mart" | "gobiz" | "internal") {
  const data = useQuery(api.externalData.queries.listOutlets, { source });
  return { data, isLoading: data === undefined };
}

/**
 * Get latest stock snapshots for an outlet.
 */
export function useExternalSnapshots(outletId?: Id<"externalOutlets">) {
  const data = useQuery(
    api.externalData.queries.getLatestSnapshots,
    outletId ? { outletId } : "skip"
  );
  return { data, isLoading: data === undefined };
}


/**
 * Get sync logs, optionally filtered by source.
 */
export function useExternalSyncLogs(
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
export function useExternalProductMappings(
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
export function useDashboardSalesSummary() {
  const data = useQuery(api.externalData.queries.getDashboardSummary, {});
  return { data, isLoading: data === undefined };
}

/**
 * Period preset type for sales analytics time filters.
 */
export type PeriodPreset = "past24hours" | "today" | "yesterday" | "thisWeek" | "last7days" | "last30days" | "thisMonth" | "allTime";

/**
 * Get dashboard sales summary by period preset (with current vs previous comparison).
 * Uses on-demand action fetch instead of reactive subscription to eliminate
 * bandwidth spikes during sync runs (~205 MB / 1.9K calls savings).
 */
export function useDashboardSalesSummaryByPeriod(preset: PeriodPreset) {
  const [data, setData] = useState<DashboardSummaryByPeriod | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const fetchAction = useAction(api.externalData.actions.fetchDashboardSummaryByPeriod);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchAction({ preset });
      setData(result as DashboardSummaryByPeriod);
    } catch (error) {
      console.error("Failed to fetch dashboard summary:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAction, preset]);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, refresh: load };
}

/** Return shape of getLifetimeTotalsInternal / fetchLifetimeTotals. */
export type LifetimeTotals = {
  totalBalls: number;
  lifetimeRevenue: number;
  lifetimeTransactions: number;
  avgRevenuePerBall: number;
};

/**
 * Get lifetime totals (all-time units sold, revenue, per-product breakdown).
 * Uses on-demand action fetch -- loads once on mount, never re-fetches on period changes.
 * The hero card always shows all-time data, independent of the period selector.
 */
export function useLifetimeTotals() {
  const [data, setData] = useState<LifetimeTotals | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const fetchAction = useAction(api.externalData.actions.fetchLifetimeTotals);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAction({});
      setData(result as LifetimeTotals);
    } catch (err) {
      console.error("Failed to fetch lifetime totals:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [fetchAction]);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, error, refresh: load };
}


// ============================================
// Platform Credentials Hooks
// ============================================

/**
 * Get credential status for a platform (admin-only).
 */
export function useCredentialStatus(
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
export function useRefreshK3MartToken() {
  return useAction(api.platformCredentials.actions.refreshK3MartToken);
}

// ============================================
// Action Hooks (Sync Triggers)
// ============================================

/**
 * Trigger K3Mart outlet discovery via product detail API (<1s).
 */
export function useDiscoverK3MartOutlets() {
  return useAction(api.integrations.k3mart.adapter.discoverK3MartOutlets);
}

/**
 * Trigger K3Mart sales sync action (incremental, ~2s).
 */
export function useSyncK3MartSales() {
  return useAction(api.integrations.k3mart.adapter.syncK3MartSales);
}

/**
 * Trigger K3Mart stock refresh via product detail API (<1s).
 */
export function useSyncK3MartStock() {
  return useAction(api.integrations.k3mart.adapter.syncK3MartStock);
}

/**
 * Trigger GoBiz revenue sync action.
 */
export function useSyncGoBiz() {
  return useAction(api.integrations.gobiz.adapter.syncGoBizRevenue);
}

/**
 * Trigger internal orders sync action.
 */
export function useSyncInternalOrders() {
  return useAction(api.integrations.internal.adapter.syncInternalOrders);
}


// ============================================
// Restock Planner Hooks
// ============================================

/** Return shape of getRestockOverviewInternal / fetchRestockOverview. */
type RestockProduct = {
  productKey: string;
  productName: string;
  currentStock?: number;
  dailyRate: number;
  daysRemaining?: number;
  status?: "critical" | "warning" | "ok";
};
type RestockK3MartChannel = {
  type: "k3mart";
  outletId: Id<"externalOutlets">;
  outletName: string;
  lastSnapshotAt: number | undefined;
  products: (RestockProduct & { status: "critical" | "warning" | "ok" })[];
  criticalCount: number;
  warningCount: number;
  totalDailyDemand: number;
};
type RestockChannel =
  | RestockK3MartChannel
  | { type: "gobiz"; products: RestockProduct[]; totalDailyDemand: number }
  | { type: "internal"; products: RestockProduct[]; totalDailyDemand: number };
type RestockOverview = {
  summary: { activeChannels: number; lowStockAlerts: number; lastSyncAt: number | null };
  channels: RestockChannel[];
};

/**
 * Get restock overview (all channels with stock + demand summary).
 * On-demand fetch: loads on page visit, no persistent subscription.
 */
export function useRestockOverview() {
  const [data, setData] = useState<RestockOverview | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const fetchAction = useAction(api.externalData.actions.fetchRestockOverview);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchAction({});
      setData(result as RestockOverview);
    } catch (error) {
      console.error("Failed to fetch restock overview:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAction]);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, refresh: load };
}

/**
 * Get detailed sell-through analysis for a channel/outlet.
 * Uses skip pattern when channel is null.
 */
export function useChannelSellThrough(
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
export function useSaveRestockTarget() {
  return useMutation(api.restock.mutations.saveRestockTarget);
}

/**
 * Update manual stock entry mutation.
 */
export function useUpdateManualStock() {
  return useMutation(api.restock.mutations.updateManualStock);
}

// ============================================
// Product Mapping Hooks
// ============================================

/**
 * Get count of revenue items that would be affected by a mapping change.
 */
export function useCountMappingImpact(
  source?: "k3mart" | "gobiz" | "internal" | "grabfood" | "bigseller" | "consignment" | "shopee" | "tiktok",
  externalProductName?: string
) {
  const data = useQuery(
    api.externalData.queries.countMappingImpact,
    source && externalProductName ? { source, externalProductName } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Update a product mapping with retroactive revenue item updates.
 */
export function useUpdateProductMapping() {
  return useMutation(api.externalData.mutations.updateProductMapping);
}

// ============================================
// Sales Analytics Chart Hooks
// ============================================

/**
 * Get time-series revenue data for stacked charts.
 * Bucketed by daily/weekly/monthly, split by platform.
 */
export function useRevenueTimeSeries(
  preset: PeriodPreset,
  granularity: "hourly" | "daily" | "weekly" | "monthly",
  metric: "gross" | "net" | "volume"
) {
  const data = useQuery(api.externalData.queries.getRevenueTimeSeries, {
    preset,
    granularity,
    metric,
  });
  return { data, isLoading: data === undefined };
}

/** Return shape of getRevenueByOutletInternal / fetchRevenueByOutlet. */
type OutletData = { outletId: string | null; name: string; gross: number; net: number; transactions: number };
type RevenueByOutlet = Array<{
  platform: string;
  platformName: string;
  outlets: OutletData[];
  totals: { gross: number; net: number; transactions: number };
}>;

/**
 * Get revenue grouped by platform and outlet for hierarchy drill-down.
 * On-demand fetch: loads on component mount and when preset changes.
 * Eliminates reactive subscription (~30 MB bandwidth savings).
 */
export function useRevenueByOutlet(preset: PeriodPreset) {
  const [data, setData] = useState<RevenueByOutlet | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const fetchAction = useAction(api.externalData.actions.fetchRevenueByOutlet);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchAction({ preset });
      setData(result as RevenueByOutlet);
    } catch (error) {
      console.error("Failed to fetch revenue by outlet:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAction, preset]);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, refresh: load };
}
