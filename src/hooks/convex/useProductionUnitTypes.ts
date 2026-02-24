/**
 * Convex hooks for production unit types.
 * PRD-4b: Component editor for menu products.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

// ============================================
// Types
// ============================================

export type ProductionUnitType = Doc<"productionUnitTypes">;

export interface ProductionUnitTypeWithId extends ProductionUnitType {
  _id: Id<"productionUnitTypes">;
}

// ============================================
// Query Hooks
// ============================================

/**
 * List all production unit types.
 * Returns active types by default, sorted by sortOrder.
 */
export function useProductionUnitTypes(includeInactive?: boolean) {
  const data = useQuery(api.productionUnitTypes.queries.list, {
    includeInactive: includeInactive ?? false,
  });

  if (data === undefined) return { data: undefined, isLoading: true };

  return {
    data: data as ProductionUnitTypeWithId[],
    isLoading: false,
  };
}

/**
 * Get a single production unit type by ID.
 */
export function useProductionUnitType(id: Id<"productionUnitTypes"> | undefined) {
  const data = useQuery(
    api.productionUnitTypes.queries.getById,
    id ? { id } : "skip"
  );

  if (data === undefined) return { data: undefined, isLoading: id !== undefined };
  if (data === null) return { data: null, isLoading: false };

  return {
    data: data as ProductionUnitTypeWithId,
    isLoading: false,
  };
}

/**
 * Get a production unit type by code.
 */
export function useProductionUnitTypeByCode(code: string | undefined) {
  const data = useQuery(
    api.productionUnitTypes.queries.getByCode,
    code ? { code } : "skip"
  );

  if (data === undefined) return { data: undefined, isLoading: code !== undefined };
  if (data === null) return { data: null, isLoading: false };

  return {
    data: data as ProductionUnitTypeWithId,
    isLoading: false,
  };
}
