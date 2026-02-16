import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useProtectedMutation } from "./useProtectedMutation";

// ========================
// Query Hooks (7)
// ========================

export function useConvexOutletStockSummary(date: string) {
  const data = useQuery(api.k3martCockpit.queries.getOutletStockSummary, { date });
  return { data, isLoading: data === undefined };
}

export function useConvexWeeklyDispatchPlans(weekNumber: string) {
  const data = useQuery(api.k3martCockpit.queries.getWeeklyDispatchPlans, { weekNumber });
  return { data, isLoading: data === undefined };
}

export function useConvexProductionReadiness(date: string) {
  const data = useQuery(api.k3martCockpit.queries.getProductionReadiness, { date });
  return { data, isLoading: data === undefined };
}

export function useConvexInventorySources() {
  const data = useQuery(api.k3martCockpit.queries.getInventorySources);
  return { data, isLoading: data === undefined };
}

/**
 * Fetch detailed outlet information including stock history.
 * Skips the query if outletId is not provided.
 */
export function useConvexOutletDetail(outletId?: Id<"externalOutlets">, days?: number) {
  const data = useQuery(
    api.k3martCockpit.queries.getOutletDetail,
    outletId ? { outletId, days } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Fetch stock movement history for a specific outlet and date.
 * Skips the query if required parameters are not provided.
 */
export function useConvexStockMovementHistory(
  outletId?: Id<"externalOutlets">,
  date?: string,
  limit?: number
) {
  const data = useQuery(
    api.k3martCockpit.queries.getStockMovementHistory,
    outletId && date ? { outletId, date, limit } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Fetch outlet settings (active/inactive, product visibility, custom pricing).
 */
export function useConvexOutletSettings() {
  const data = useQuery(api.k3martCockpit.queries.getOutletSettings);
  return { data, isLoading: data === undefined };
}

// ========================
// Action Hooks (8)
// ========================

export function useConvexFetchOutletDashboard() {
  return useAction(api.integrations.k3mart.adapter.fetchOutletDashboard);
}

export function useConvexSubmitStockFlow() {
  return useAction(api.integrations.k3mart.adapter.submitStockFlow);
}

export function useConvexSubmitBulkStockIns() {
  return useAction(api.integrations.k3mart.adapter.submitBulkStockIns);
}

export function useConvexCancelStockFlow() {
  return useAction(api.integrations.k3mart.adapter.cancelStockFlow);
}

export function useConvexFetchStockFlowHistory() {
  return useAction(api.integrations.k3mart.adapter.fetchStockFlowHistory);
}

export function useConvexFetchStockFlowDetail() {
  return useAction(api.integrations.k3mart.adapter.fetchStockFlowDetail);
}

export function useConvexVerifySubmissionStatuses() {
  return useAction(api.integrations.k3mart.adapter.verifySubmissionStatuses);
}

export function useConvexRefreshOutlets() {
  return useAction(api.integrations.k3mart.adapter.refreshOutlets);
}

// ========================
// Protected Mutation Hooks (7)
// ========================

export function useConvexSaveWeeklyDispatchPlan() {
  return useProtectedMutation(api.k3martCockpit.mutations.saveWeeklyDispatchPlan);
}

export function useConvexConfirmDayPlan() {
  return useProtectedMutation(api.k3martCockpit.mutations.confirmDayPlan);
}

export function useConvexProcessStockOutDestination() {
  return useProtectedMutation(api.k3martCockpit.mutations.processStockOutDestination);
}

export function useConvexToggleOutletActive() {
  return useProtectedMutation(api.k3martCockpit.mutations.toggleOutletActive);
}

export function useConvexSaveOutletSettings() {
  return useProtectedMutation(api.k3martCockpit.mutations.saveOutletSettings);
}

export function useConvexCopyLastWeek() {
  return useProtectedMutation(api.k3martCockpit.mutations.copyLastWeek);
}

export function useConvexSetProductTarget() {
  return useProtectedMutation(api.productionTargets.mutations.setProductTarget);
}
