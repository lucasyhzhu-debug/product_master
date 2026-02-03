/**
 * Convex hooks for menu product components.
 * PRD-4b: Component editor for menu products.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

// ============================================
// Types
// ============================================

export interface MenuProductComponentWithType extends Doc<"menuProductComponents"> {
  productionUnitType: Doc<"productionUnitTypes"> | null;
}

// ============================================
// Query Hooks
// ============================================

/**
 * Get all components for a menu product.
 * Returns components with their production unit type details.
 */
export function useConvexMenuProductComponents(menuProductId: Id<"menuProducts"> | undefined) {
  const data = useQuery(
    api.menuProductComponents.queries.getByMenuProduct,
    menuProductId ? { menuProductId } : "skip"
  );

  if (data === undefined) return { data: undefined, isLoading: menuProductId !== undefined };

  return {
    data: data as MenuProductComponentWithType[],
    isLoading: false,
  };
}

/**
 * Get components for multiple menu products (batch).
 */
export function useConvexMenuProductComponentsBatch(
  menuProductIds: Id<"menuProducts">[] | undefined
) {
  const data = useQuery(
    api.menuProductComponents.queries.getByMenuProductIds,
    menuProductIds && menuProductIds.length > 0 ? { menuProductIds } : "skip"
  );

  if (data === undefined)
    return { data: undefined, isLoading: menuProductIds !== undefined && menuProductIds.length > 0 };

  return {
    data: data as Record<string, MenuProductComponentWithType[]>,
    isLoading: false,
  };
}
