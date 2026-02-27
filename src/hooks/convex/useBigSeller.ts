/**
 * Convex hooks for BigSeller sync integration.
 * Wraps sync state query, order queries, unmapped SKUs, order stats, and sync trigger action.
 */
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Subscribe to reactive BigSeller sync state.
 * Returns the current sync stage, poll attempts, summary, etc.
 */
export function useBigSellerSyncState() {
  const { user } = useAuth();
  const data = useQuery(
    api.integrations.bigseller.queries.getSyncState,
    user?.token ? { token: user.token } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * List BigSeller orders with optional filters.
 */
export function useBigSellerOrders(filters?: {
  startDate?: number;
  endDate?: number;
  platform?: string;
  page?: number;
  pageSize?: number;
}) {
  const { user } = useAuth();
  const data = useQuery(
    api.bigsellerOrders.queries.listOrders,
    user?.token
      ? {
          token: user.token,
          startDate: filters?.startDate,
          endDate: filters?.endDate,
          platform: filters?.platform,
          page: filters?.page,
          pageSize: filters?.pageSize,
        }
      : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Get unmapped SKU codes from BigSeller orders for reconciliation UI.
 */
export function useBigSellerUnmappedSkus() {
  const { user } = useAuth();
  const data = useQuery(
    api.bigsellerOrders.queries.getUnmappedSkus,
    user?.token ? { token: user.token } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Get BigSeller order statistics (totals, COGS caveat flag).
 */
export function useBigSellerOrderStats() {
  const { user } = useAuth();
  const data = useQuery(
    api.bigsellerOrders.queries.getOrderStats,
    user?.token ? { token: user.token } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Get the startSync action function for triggering a BigSeller sync.
 */
export function useStartBigSellerSync() {
  return useAction(api.integrations.bigseller.sync.startSync);
}
