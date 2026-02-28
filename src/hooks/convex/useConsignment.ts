/**
 * Convex hooks for Consignment Settlement management.
 *
 * Query hooks wrap consignment read operations.
 * Mutation hooks use useProtectedMutation for auto token injection.
 *
 * Created in Phase 29, Plan 02.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useProtectedMutation } from "./useProtectedMutation";
import type { Id } from "../../../convex/_generated/dataModel";

// ========================
// Query Hooks (3)
// ========================

/**
 * Fetch all consignment outlets with computed running totals.
 * Optionally include archived (inactive) outlets.
 */
export function useConsignmentOutlets(includeArchived?: boolean) {
  const data = useQuery(api.consignment.queries.getOutletsWithTotals, {
    includeArchived: includeArchived ?? false,
  });
  return { data, isLoading: data === undefined };
}

/**
 * Fetch all settlements for a specific outlet, newest first.
 * Pass null to skip the query (e.g., when no outlet is selected).
 */
export function useConsignmentSettlements(outletId: Id<"consignmentOutlets"> | null) {
  const data = useQuery(
    api.consignment.queries.getSettlementsByOutlet,
    outletId ? { outletId } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Fetch global consignment summary (total revenue, outstanding, paid, active count).
 */
export function useConsignmentGlobalSummary() {
  const data = useQuery(api.consignment.queries.getGlobalSummary);
  return { data, isLoading: data === undefined };
}

// ========================
// Mutation Hooks (6)
// ========================

/** Create a new consignment outlet. */
export function useCreateConsignmentOutlet() {
  return useProtectedMutation(api.consignment.mutations.createOutlet);
}

/** Update an existing consignment outlet. */
export function useUpdateConsignmentOutlet() {
  return useProtectedMutation(api.consignment.mutations.updateOutlet);
}

/** Create a new consignment settlement. */
export function useCreateConsignmentSettlement() {
  return useProtectedMutation(api.consignment.mutations.createSettlement);
}

/** Update a pending consignment settlement. */
export function useUpdateConsignmentSettlement() {
  return useProtectedMutation(api.consignment.mutations.updateSettlement);
}

/** Mark a consignment settlement as paid. */
export function useMarkConsignmentPaid() {
  return useProtectedMutation(api.consignment.mutations.markAsPaid);
}

/** Delete a pending consignment settlement. */
export function useDeleteConsignmentSettlement() {
  return useProtectedMutation(api.consignment.mutations.deleteSettlement);
}
