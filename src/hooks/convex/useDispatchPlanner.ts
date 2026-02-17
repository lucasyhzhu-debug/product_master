/**
 * Convex hooks for the Unified Dispatch Planner.
 *
 * Query hooks wrap all dispatch planner read operations.
 * Mutation hooks use useProtectedMutation for auto token injection.
 *
 * NOTE: These hooks require convex/dispatchPlanner/queries.ts (Plan 17-02)
 * to be deployed before they will resolve at runtime.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useProtectedMutation } from "./useProtectedMutation";

// ========================
// Query Hooks (5)
// ========================

/**
 * Fetch the unified weekly plan grid data for a 7-day window.
 * Assembles data from orders, GoFood, K3Mart, and consignment channels.
 */
export function useDispatchPlannerWeekly(startDate: string) {
  const data = useQuery(api.dispatchPlanner.queries.getUnifiedWeeklyPlan, { startDate });
  return { data, isLoading: data === undefined };
}

/**
 * Fetch all channel configuration records sorted by priority.
 */
export function useDispatchChannelConfig() {
  const data = useQuery(api.dispatchPlanner.queries.getChannelConfig);
  return { data, isLoading: data === undefined };
}

/**
 * Fetch planner settings (daily capacity, etc.).
 */
export function useDispatchPlannerSettings() {
  const data = useQuery(api.dispatchPlanner.queries.getPlannerSettings);
  return { data, isLoading: data === undefined };
}

/**
 * Fetch consignment outlets. Optionally filter to enabled-only.
 * Skips query if enabledOnly is undefined (fetches all).
 */
export function useDispatchConsignmentOutlets(enabledOnly?: boolean) {
  const data = useQuery(
    api.dispatchPlanner.queries.getConsignmentOutlets,
    enabledOnly !== undefined ? { enabledOnly } : {}
  );
  return { data, isLoading: data === undefined };
}

/**
 * Simulate inventory sufficiency for a 7-day window.
 * Skips query when startDate is empty.
 */
export function useDispatchSimulateInventory(startDate: string) {
  const data = useQuery(
    api.dispatchPlanner.queries.simulateInventory,
    startDate ? { startDate } : "skip"
  );
  return { data, isLoading: data === undefined };
}

// ========================
// Mutation Hooks (7)
// ========================

/**
 * Save or update a single plan cell (quantity for a channel/outlet/product/date).
 */
export function useDispatchSavePlanCell() {
  return useProtectedMutation(api.dispatchPlanner.mutations.savePlanCell);
}

/**
 * Update configuration for a single channel (commission rate, enabled, display name, color).
 */
export function useDispatchUpdateChannelConfig() {
  return useProtectedMutation(api.dispatchPlanner.mutations.updateChannelConfig);
}

/**
 * Reorder channel priorities. Pass ordered array of channelKeys (top = priority 1).
 */
export function useDispatchReorderPriorities() {
  return useProtectedMutation(api.dispatchPlanner.mutations.reorderChannelPriorities);
}

/**
 * Update planner settings (daily capacity).
 */
export function useDispatchUpdateSettings() {
  return useProtectedMutation(api.dispatchPlanner.mutations.updatePlannerSettings);
}

/**
 * Add a new consignment outlet with product mappings.
 */
export function useDispatchAddConsignmentOutlet() {
  return useProtectedMutation(api.dispatchPlanner.mutations.addConsignmentOutlet);
}

/**
 * Update an existing consignment outlet.
 */
export function useDispatchUpdateConsignmentOutlet() {
  return useProtectedMutation(api.dispatchPlanner.mutations.updateConsignmentOutlet);
}

/**
 * Remove a consignment outlet and its associated dispatch plans.
 */
export function useDispatchRemoveConsignmentOutlet() {
  return useProtectedMutation(api.dispatchPlanner.mutations.removeConsignmentOutlet);
}
