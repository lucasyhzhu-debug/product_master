/**
 * Convex hooks for product inventory (finished goods).
 *
 * Queries and mutations for tracking finished goods stock
 * at storage locations with full audit trail.
 */

import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Primary hook for finished goods inventory management.
 * Fetches stock overview, low-stock alerts, settings, and mutations.
 */
export function useProductInventory(locationId?: Id<"storageLocations">) {
  // Queries
  const stockOverview = useQuery(api.productInventory.queries.getStockOverview, {
    locationId,
  });
  const lowStockAlerts = useQuery(api.productInventory.queries.getLowStockAlerts);
  const settings = useQuery(api.productInventory.queries.getSettings);

  // Mutations
  const addStock = useMutation(api.productInventory.mutations.addStock);
  const adjustStock = useMutation(api.productInventory.mutations.adjustStock);
  const updateSettings = useMutation(api.productInventory.mutations.updateSettings);
  const transferStock = useMutation(api.productInventory.mutations.transferStock);

  return {
    stockOverview,
    lowStockAlerts,
    settings,
    addStock,
    adjustStock,
    updateSettings,
    transferStock,
  };
}

/**
 * Hook for the grouped stock overview (by product with per-location breakdown).
 * Used by the Finished Goods hero section and transfer UI.
 * Returns data from getStockOverviewGrouped.
 */
export function useProductInventoryGrouped() {
  return useQuery(api.productInventory.queries.getStockOverviewGrouped);
}

// ============================================================================
// TRANSACTION LOG HOOK (paginated)
// ============================================================================

/**
 * Paginated transaction log hook.
 * Filters by product, location, or transaction type.
 */
export function useProductInventoryTransactions(filters: {
  menuProductId?: Id<"menuProducts">;
  locationId?: Id<"storageLocations">;
  transactionType?: string;
}) {
  return usePaginatedQuery(
    api.productInventory.queries.getTransactions,
    filters,
    { initialNumItems: 20 }
  );
}

// ============================================================================
// STOCK COUNT HOOKS
// ============================================================================

/**
 * Hook for submitting a bulk stock count.
 * Used by the daily stock count UI.
 */
export function useBulkStockCount() {
  return useMutation(api.productInventory.mutations.bulkStockCount);
}

/**
 * Hook for fetching last stock count timestamps per product at a location.
 * Returns undefined while loading, or an object keyed by menuProductId string.
 */
export function useLastStockCount(locationId: Id<"storageLocations"> | undefined) {
  return useQuery(
    api.productInventory.queries.getLastStockCount,
    locationId ? { locationId } : "skip"
  );
}

// ============================================================================
// TYPES
// ============================================================================

/** A single row from getStockOverview */
export type ProductStockRow = {
  _id: Id<"productInventory">;
  menuProduct: {
    _id: Id<"menuProducts">;
    name: string;
    code: string;
    posSlot?: string | null;
    isActive?: boolean;
    defaultPrice?: number;
  } | null;
  location: {
    _id: Id<"storageLocations">;
    name: string;
    locationType: string;
  } | null;
  quantity: number;
  lowStockThreshold?: number;
  effectiveThreshold: number;
  isLowStock: boolean;
  lastUpdated: number;
};

/** A single low-stock alert */
export type ProductLowStockAlert = {
  _id: Id<"productInventory">;
  menuProductName?: string;
  menuProductCode?: string;
  locationName?: string;
  quantity: number;
  effectiveThreshold: number;
  lastUpdated: number;
};

/** Product inventory settings row */
export type ProductInventorySettings = {
  _id: Id<"productInventorySettings">;
  globalLowStockThreshold: number;
  defaultAddLocationId?: Id<"storageLocations">;
  autoAdvanceOnDrawdown: boolean;
  alertMode: "toast" | "toast_and_badge";
  updatedBy: string;
  updatedAt: number;
};

/** Grouped stock data for a single product across all locations */
export type ProductStockGroup = {
  menuProductId: Id<"menuProducts">;
  menuProductName: string;
  menuProductCode: string;
  totalQuantity: number;
  isLowStock: boolean;
  locations: Array<{
    locationId: Id<"storageLocations">;
    locationName: string;
    locationType: string;
    quantity: number;
    effectiveThreshold: number;
    isLowStock: boolean;
    rowId: Id<"productInventory">;
  }>;
};
