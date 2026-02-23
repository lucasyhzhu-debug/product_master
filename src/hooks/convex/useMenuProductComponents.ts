/**
 * Convex hooks for menu product components.
 * Unified BOM: Components use componentTypeId.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

// ============================================
// Types
// ============================================

export interface MenuProductComponentWithType extends Doc<"menuProductComponents"> {
  componentType: Doc<"componentTypes"> | null;
}

// ============================================
// Query Hooks
// ============================================

/**
 * Get all components for a menu product.
 * Returns components with their production unit type details.
 */
export function useMenuProductComponents(menuProductId: Id<"menuProducts"> | undefined) {
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
export function useMenuProductComponentsBatch(
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
