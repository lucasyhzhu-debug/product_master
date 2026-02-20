/**
 * Convex hooks for inventory management.
 *
 * Queries and mutations for inventory batches, stock levels, and transactions.
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Get low stock alerts
 *
 * Returns components where available stock < reorderPoint.
 * Available = totalStock - totalReserved
 */
export function useConvexLowStockAlerts() {
  return useQuery(api.inventory.queries.getLowStockAlerts);
}

/**
 * Get component inventory (all locations)
 */
export function useConvexComponentInventory(
  componentTypeId: Id<"componentTypes"> | undefined,
  options?: {
    includeTransactions?: boolean;
    transactionLimit?: number;
  }
) {
  return useQuery(
    api.inventory.queries.getComponentInventory,
    componentTypeId
      ? {
          componentTypeId,
          includeTransactions: options?.includeTransactions,
          transactionLimit: options?.transactionLimit,
        }
      : "skip"
  );
}

/**
 * Get location inventory (all components at location)
 */
export function useConvexLocationInventory(
  locationId: Id<"storageLocations"> | undefined,
  activeOnly?: boolean
) {
  return useQuery(
    api.inventory.queries.getLocationInventory,
    locationId
      ? {
          locationId,
          activeOnly,
        }
      : "skip"
  );
}

/**
 * Get inventory report (full matrix: components × locations)
 */
export function useConvexInventoryReport(activeComponentsOnly?: boolean) {
  return useQuery(api.inventory.queries.getInventoryReport, {
    activeComponentsOnly,
  });
}

/**
 * Get component batches at a location
 */
export function useConvexComponentBatches(
  componentTypeId: Id<"componentTypes"> | undefined,
  locationId: Id<"storageLocations"> | undefined,
  includeExpired?: boolean
) {
  return useQuery(
    api.inventory.queries.getComponentBatches,
    componentTypeId && locationId
      ? {
          componentTypeId,
          locationId,
          includeExpired,
        }
      : "skip"
  );
}

/**
 * Get location transactions
 */
export function useConvexLocationTransactions(
  locationId: Id<"storageLocations"> | undefined,
  limit?: number
) {
  return useQuery(
    api.inventory.queries.getLocationTransactions,
    locationId
      ? {
          locationId,
          limit,
        }
      : "skip"
  );
}

/**
 * Get latest batch for a component at a location.
 * Used for pre-filling supplier info when receiving new stock.
 */
export function useConvexLatestBatch(
  componentTypeId: Id<"componentTypes"> | undefined,
  locationId: Id<"storageLocations"> | undefined
) {
  return useQuery(
    api.inventory.queries.getLatestBatch,
    componentTypeId && locationId
      ? { componentTypeId, locationId }
      : "skip"
  );
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Receive stock - Create new batch with supplier info
 */
export function useConvexReceiveStock() {
  return useMutation(api.inventory.mutations.receiveStock);
}

/**
 * Create component and receive stock (combined operation)
 *
 * Creates a new packaging component type on first receipt.
 * Used by Receive Stock dialog for inline component creation.
 */
export function useConvexCreateComponentAndReceiveStock() {
  return useMutation(api.inventory.mutations.createComponentAndReceiveStock);
}

/**
 * Transfer stock between locations
 */
export function useConvexTransferStock() {
  return useMutation(api.inventory.mutations.transferStock);
}

/**
 * Adjust stock - Physical count adjustment
 */
export function useConvexAdjustStock() {
  return useMutation(api.inventory.mutations.adjustStock);
}

/**
 * Delete batch (with reservation protection)
 */
export function useConvexDeleteBatch() {
  return useMutation(api.inventory.mutations.deleteBatch);
}

/**
 * Mark batch as expired
 */
export function useConvexExpireBatch() {
  return useMutation(api.inventory.mutations.expireBatch);
}

// ============================================================================
// TYPES
// ============================================================================

export type ReceiveStockInput = {
  componentTypeId: Id<"componentTypes">;
  locationId: Id<"storageLocations">;
  purchaseDate: number;
  supplierName: string;
  supplierBrand?: string;
  purchaseReference?: string;
  purchaseUrl?: string;
  quantityPurchased: number;
  totalCostIdr: number;
  expiryDate?: number;
  referenceNote?: string;
  createdBy: string;
  copyFromBatchId?: Id<"inventoryBatches">;
};

export type TransferStockInput = {
  componentTypeId: Id<"componentTypes">;
  fromLocationId: Id<"storageLocations">;
  toLocationId: Id<"storageLocations">;
  quantity: number;
  referenceNote?: string;
  createdBy: string;
};

export type AdjustStockInput = {
  batchId: Id<"inventoryBatches">;
  newQuantity: number;
  reason: string;
  createdBy: string;
};

export type LowStockAlert = {
  component: {
    _id: string;
    code: string;
    name: string;
    category: "production" | "packaging";
    unitCostIdr: number;
    unit: string;
    trackInventory: boolean;
    reorderPoint?: number;
    reorderQuantity?: number;
    color?: string;
    sortOrder: number;
    isActive: boolean;
    createdBy: string;
    createdAt: number;
    alarmPercentage?: number;
  };
  location: {
    _id: string;
    name: string;
    locationType: "office" | "kitchen" | "venue" | "depot";
    address?: string;
    isActive: boolean;
    isDefault?: boolean;
    createdBy: string;
  };
  stock: {
    _id: string;
    componentTypeId: string;
    locationId: string;
    totalStock: number;
    totalReserved: number;
    weightedUnitCostIdr: number;
    lastUpdated: number;
    lastRestockTotalStock?: number;
  };
  available: number;
  reorderPoint?: number;
  shortage?: number;
  alarmType?: "units" | "percentage" | "both";
  percentRemaining?: number;
  alarmPercentage?: number;
};
