/**
 * Storage Locations hooks for warehouse/office/venue management.
 * Query hooks + factory-generated mutation hooks (with toast notifications).
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createMutationHook } from "./createMutationHook";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/** List all storage locations */
export function useConvexStorageLocations(activeOnly?: boolean) {
  return useQuery(api.storageLocations.queries.list, {
    activeOnly,
  });
}

/** Get location by ID */
export function useConvexStorageLocation(
  id: Id<"storageLocations"> | undefined
) {
  return useQuery(
    api.storageLocations.queries.getById,
    id ? { id } : "skip"
  );
}

/** Get default storage location */
export function useConvexDefaultLocation() {
  return useQuery(api.storageLocations.queries.getDefault);
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/** Create a new storage location */
export const useConvexCreateStorageLocation = createMutationHook(
  api.storageLocations.mutations.create,
  { successMessage: "Location created", errorMessage: "Failed to create location" }
);

/** Update an existing storage location */
export const useConvexUpdateStorageLocation = createMutationHook(
  api.storageLocations.mutations.update,
  { successMessage: "Location updated", errorMessage: "Failed to update location" }
);

/** Delete a storage location */
export const useConvexDeleteStorageLocation = createMutationHook(
  api.storageLocations.mutations.remove,
  { successMessage: "Location deleted", errorMessage: "Failed to delete location" }
);

// ============================================================================
// TYPES
// ============================================================================

export type StorageLocationCreateInput = {
  name: string;
  locationType: "office" | "kitchen" | "venue" | "depot";
  address?: string;
  isActive?: boolean;
  isDefault?: boolean;
};

export type StorageLocationUpdateInput = {
  id: Id<"storageLocations">;
  name?: string;
  locationType?: "office" | "kitchen" | "venue" | "depot";
  address?: string;
  isActive?: boolean;
  isDefault?: boolean;
};

export type StorageLocation = {
  _id: Id<"storageLocations">;
  name: string;
  locationType: "office" | "kitchen" | "venue" | "depot";
  address?: string;
  isActive: boolean;
  isDefault?: boolean;
  createdBy: string;
  createdAt: number;
};
