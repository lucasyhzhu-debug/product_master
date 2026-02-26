/**
 * Convex hooks for GrabFood integration.
 * Query hooks for orders + stats.
 * Action hooks for sync, store status, menu management.
 */
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../contexts/AuthContext";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================
// Query Hooks
// ============================================

/**
 * List GrabFood orders with optional outlet and date range filters.
 * Returns orders sorted newest-first.
 */
export function useGrabFoodOrders(
  outletId?: Id<"externalOutlets">,
  fromMs?: number,
  toMs?: number
) {
  const { user } = useAuth();
  const token = user?.token;

  const data = useQuery(
    api.grabfoodOrders.queries.listOrders,
    token ? { token, outletId, fromMs, toMs } : "skip"
  );

  return { orders: data, isLoading: data === undefined && !!token };
}

/**
 * Get aggregate stats for GrabFood orders (total count + last sync time).
 */
export function useGrabFoodOrderStats(outletId?: Id<"externalOutlets">) {
  const { user } = useAuth();
  const token = user?.token;

  const data = useQuery(
    api.grabfoodOrders.queries.getOrderStats,
    token ? { token, outletId } : "skip"
  );

  return { stats: data, isLoading: data === undefined && !!token };
}

// ============================================
// Action Hooks
// ============================================

/**
 * Returns action wrappers for all GrabFood operations.
 * Each wrapper auto-injects the auth token.
 */
export function useGrabFoodActions() {
  const { user } = useAuth();
  const token = user?.token ?? "";

  const syncOrdersAction = useAction(api.integrations.grabfood.adapter.syncOrders);
  const getStoreStatusAction = useAction(api.integrations.grabfood.adapter.getStoreStatus);
  const pauseStoreAction = useAction(api.integrations.grabfood.adapter.pauseStore);
  const batchUpdateAction = useAction(api.integrations.grabfood.adapter.batchUpdateAvailability);
  const getMenuItemsAction = useAction(api.integrations.grabfood.adapter.getMenuItems);

  return {
    syncOrders: (
      merchantID: string,
      outletId?: Id<"externalOutlets">,
      fromDate?: string,
      toDate?: string
    ) => syncOrdersAction({ token, merchantID, outletId, fromDate, toDate }),

    getStoreStatus: (merchantID: string) =>
      getStoreStatusAction({ token, merchantID }),

    pauseStore: (merchantID: string, pauseDuration: number) =>
      pauseStoreAction({ token, merchantID, pauseDuration }),

    unpauseStore: (merchantID: string) =>
      pauseStoreAction({ token, merchantID, pauseDuration: 0 }),

    batchUpdateAvailability: (
      merchantID: string,
      items: Array<{ id: string; availableStatus: "AVAILABLE" | "UNAVAILABLE" }>
    ) => batchUpdateAction({ token, merchantID, items }),

    getMenuItems: (merchantID: string) =>
      getMenuItemsAction({ token, merchantID }),
  };
}

// ============================================
// Outlet Hooks
// ============================================

/**
 * List GrabFood outlets from externalOutlets table (source: "grabfood").
 */
export function useGrabFoodOutlets() {
  const data = useQuery(api.externalData.queries.listOutlets, {
    source: "grabfood",
  });
  return { outlets: data, isLoading: data === undefined };
}
