/**
 * Component Types hooks for unified BOM management.
 *
 * Queries and mutations for production and packaging components.
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * List all component types
 */
export function useConvexComponentTypes(activeOnly?: boolean) {
  return useQuery(api.componentTypes.queries.list, {
    activeOnly,
  });
}

/**
 * Get component type by ID
 */
export function useConvexComponentType(id: Id<"componentTypes"> | undefined) {
  return useQuery(
    api.componentTypes.queries.getById,
    id ? { id } : "skip"
  );
}

/**
 * Get component types by category
 */
export function useConvexComponentsByCategory(
  category: "production" | "direct_packaging" | "indirect_packaging",
  activeOnly?: boolean
) {
  return useQuery(api.componentTypes.queries.getByCategory, {
    category,
    activeOnly,
  });
}

/**
 * Get components that track inventory (packaging only)
 */
export function useConvexInventoryTrackedComponents(activeOnly?: boolean) {
  return useQuery(api.componentTypes.queries.getInventoryTracked, {
    activeOnly,
  });
}

/**
 * Get component by code
 */
export function useConvexComponentByCode(code: string | undefined) {
  return useQuery(
    api.componentTypes.queries.getByCode,
    code ? { code } : "skip"
  );
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Create a new component type
 */
export function useConvexCreateComponentType() {
  return useMutation(api.componentTypes.mutations.create);
}

/**
 * Update an existing component type
 */
export function useConvexUpdateComponentType() {
  return useMutation(api.componentTypes.mutations.update);
}

/**
 * Delete a component type
 */
export function useConvexDeleteComponentType() {
  return useMutation(api.componentTypes.mutations.remove);
}

// ============================================================================
// TYPES
// ============================================================================

export type ComponentTypeCreateInput = {
  code: string;
  name: string;
  category: "production" | "direct_packaging" | "indirect_packaging";
  unitCostIdr: number;
  unit: string;
  gramsPerUnit?: number;
  trackInventory: boolean;
  reorderPoint?: number;
  reorderQuantity?: number;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
  createdBy: string;
};

export type ComponentTypeUpdateInput = {
  id: Id<"componentTypes">;
  name?: string;
  unitCostIdr?: number;
  unit?: string;
  gramsPerUnit?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type ComponentType = {
  _id: Id<"componentTypes">;
  code: string;
  name: string;
  category: "production" | "direct_packaging" | "indirect_packaging";
  unitCostIdr: number;
  unit: string;
  gramsPerUnit?: number;
  trackInventory: boolean;
  reorderPoint?: number;
  reorderQuantity?: number;
  color?: string;
  sortOrder: number;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
};
