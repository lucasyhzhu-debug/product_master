/**
 * Convex hooks for GoFood Depot Management (Phase 19).
 *
 * Wraps all depot-related queries and mutations for the GoFoodDepotManager page.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useProtectedMutation } from "./useProtectedMutation";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Check if seedFinishedGoodsLocations migration has been run.
 * Returns seedRequired=true when any GoBiz outlet lacks linkedStorageLocationId.
 */
export function useGoFoodDepotSeedCheck() {
  const data = useQuery(api.gofoodDepot.queries.isSeedRequired);
  return { data, isLoading: data === undefined };
}

/**
 * List all active GoBiz (GoFood) outlets.
 * Used for the outlet selector at the top of the depot page.
 */
export function useGoFoodDepotOutlets() {
  const data = useQuery(api.externalData.queries.listOutlets, { source: "gobiz" });
  return { data, isLoading: data === undefined };
}

/**
 * Get depot stock for a specific outlet.
 * Returns enriched stock rows with menuProductName and productInventoryQty.
 * Skips the query when outletId is not provided.
 */
export function useGoFoodDepotStock(outletId?: Id<"externalOutlets">) {
  const data = useQuery(
    api.gofoodDepot.queries.getDepotStock,
    outletId ? { outletId } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Get restock suggestions for a specific outlet.
 * Uses 3-day rolling average with WIB timezone rules.
 * Skips the query when outletId is not provided.
 */
export function useGoFoodRestockSuggestions(outletId?: Id<"externalOutlets">) {
  const data = useQuery(
    api.gofoodDepot.queries.getRestockSuggestions,
    outletId ? { outletId } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Get per-outlet product mappings (GoFood product name -> internal menuProduct).
 * Includes unmapped products detected from recent revenue data.
 * Skips the query when outletId is not provided.
 */
export function useGoFoodOutletMappings(outletId?: Id<"externalOutlets">) {
  const data = useQuery(
    api.gofoodDepot.queries.getOutletProductMappings,
    outletId ? { outletId } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Get all menu products for mapping dropdowns.
 */
export function useGoFoodMenuProducts() {
  const data = useQuery(api.menuProducts.queries.list, { activeOnly: true });
  return { data, isLoading: data === undefined };
}

/**
 * Get stock overview grouped by product for the stock transfer source selector.
 */
export function useGoFoodStockOverviewGrouped() {
  const data = useQuery(api.productInventory.queries.getStockOverviewGrouped, {});
  return { data, isLoading: data === undefined };
}

/**
 * Get all storage locations for transfer source dropdown.
 */
export function useGoFoodStorageLocations() {
  const data = useQuery(api.storageLocations.queries.list, { activeOnly: true });
  return { data, isLoading: data === undefined };
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Save (upsert) per-outlet product mappings.
 * Admin only. Explicit-save pattern.
 */
export function useGoFoodSaveOutletMappings() {
  return useProtectedMutation(api.gofoodDepot.mutations.saveOutletProductMappings);
}

/**
 * Initialize a new outlet's product mappings from the most recently configured outlet.
 * Admin only. No-op if target outlet already has mappings.
 */
export function useGoFoodInitOutletMappings() {
  return useProtectedMutation(api.gofoodDepot.mutations.initOutletMappingsFromPrevious);
}

/**
 * Adjust depot stock for a menu product.
 * Manager/admin only.
 */
export function useGoFoodAdjustDepotStock() {
  return useProtectedMutation(api.gofoodDepot.mutations.adjustDepotStock);
}

/**
 * Transfer finished goods stock from one storage location to another.
 * Manager/admin only.
 */
export function useGoFoodTransferStock() {
  return useProtectedMutation(api.productInventory.mutations.transferStock);
}
