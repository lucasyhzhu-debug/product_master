/**
 * Storage Locations hooks for warehouse/office/venue management.
 *
 * Queries and mutations for storage locations.
 */

import { useQuery } from "convex/react";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * List all storage locations
 */
export function useConvexStorageLocations(activeOnly?: boolean) {
  return useQuery(api.storageLocations.queries.list, {
    activeOnly,
  });
}

/**
 * Get location by ID
 */
export function useConvexStorageLocation(
  id: Id<"storageLocations"> | undefined
) {
  return useQuery(
    api.storageLocations.queries.getById,
    id ? { id } : "skip"
  );
}

/**
 * Get default storage location
 */
export function useConvexDefaultLocation() {
  return useQuery(api.storageLocations.queries.getDefault);
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Create a new storage location
 */
export function useConvexCreateStorageLocation() {
  return useSessionMutation(api.storageLocations.mutations.create);
}

/**
 * Update an existing storage location
 */
export function useConvexUpdateStorageLocation() {
  return useSessionMutation(api.storageLocations.mutations.update);
}

/**
 * Delete a storage location
 */
export function useConvexDeleteStorageLocation() {
  return useSessionMutation(api.storageLocations.mutations.remove);
}

// ============================================================================
// TYPES
// ============================================================================

export type StorageLocationCreateInput = {
  name: string;
  locationType: "office" | "kitchen" | "venue";
  address?: string;
  isActive?: boolean;
  isDefault?: boolean;
};

export type StorageLocationUpdateInput = {
  id: Id<"storageLocations">;
  name?: string;
  locationType?: "office" | "kitchen" | "venue";
  address?: string;
  isActive?: boolean;
  isDefault?: boolean;
};

export type StorageLocation = {
  _id: Id<"storageLocations">;
  name: string;
  locationType: "office" | "kitchen" | "venue";
  address?: string;
  isActive: boolean;
  isDefault?: boolean;
  createdBy: string;
  createdAt: number;
};
