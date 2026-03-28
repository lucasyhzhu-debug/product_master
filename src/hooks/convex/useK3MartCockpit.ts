import { useState, useCallback, useEffect } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useProtectedMutation } from "./useProtectedMutation";

// ========================
// Query Hooks (7)
// ========================

type OutletProduct = {
  externalProductId: string;
  externalProductCode: string;
  productName: string;
  quantity: number;
  price: number;
  soldToday: number;
  avgDailySales7d: number;
  menuProductId: string | null;
};

type OutletSummaryRow = {
  _id: string;
  name: string;
  externalId: string;
  isActive: boolean;
  lastSyncAt: number | null;
  products: OutletProduct[];
};

type OutletStockSummary = {
  outlets: OutletSummaryRow[];
  lastSyncAt: number | null;
};

export function useOutletStockSummary(date: string) {
  const [data, setData] = useState<OutletStockSummary | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const fetchAction = useAction(api.externalData.actions.fetchOutletStockSummary);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchAction({ date });
      setData(result as OutletStockSummary);
    } catch (error) {
      console.error("Failed to fetch outlet stock summary:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAction, date]);

  useEffect(() => { load(); }, [load]);

  return { data, isLoading, refresh: load };
}

export function useWeeklyDispatchPlans(weekNumber: string) {
  const data = useQuery(api.k3martCockpit.queries.getWeeklyDispatchPlans, { weekNumber });
  return { data, isLoading: data === undefined };
}

export function useProductionReadiness(date: string) {
  const data = useQuery(api.k3martCockpit.queries.getProductionReadiness, { date });
  return { data, isLoading: data === undefined };
}

export function useInventorySources() {
  const data = useQuery(api.k3martCockpit.queries.getInventorySources);
  return { data, isLoading: data === undefined };
}

/**
 * Fetch detailed outlet information including stock history.
 * Skips the query if outletId is not provided.
 */
export function useOutletDetail(outletId?: Id<"externalOutlets">, days?: number) {
  const data = useQuery(
    api.k3martCockpit.queries.getOutletDetail,
    outletId ? { outletId, days } : "skip"
  );
  return { data, isLoading: data === undefined };
}

/**
 * Fetch outlet settings (active/inactive, product visibility, custom pricing).
 */
export function useOutletSettings() {
  const data = useQuery(api.k3martCockpit.queries.getOutletSettings);
  return { data, isLoading: data === undefined };
}

// ========================
// Action Hooks (8)
// ========================

export function useFetchOutletDashboard() {
  return useAction(api.integrations.k3mart.adapter.fetchOutletDashboard);
}

export function useSubmitStockFlow() {
  return useAction(api.integrations.k3mart.adapter.submitStockFlow);
}

export function useSubmitBulkStockIns() {
  return useAction(api.integrations.k3mart.adapter.submitBulkStockIns);
}

export function useCancelStockFlow() {
  return useAction(api.integrations.k3mart.adapter.cancelStockFlow);
}

export function useVerifySubmissionStatuses() {
  return useAction(api.integrations.k3mart.adapter.verifySubmissionStatuses);
}

export function useRefreshOutlets() {
  return useAction(api.integrations.k3mart.adapter.refreshOutlets);
}

// ========================
// Protected Mutation Hooks (7)
// ========================

export function useSaveWeeklyDispatchPlan() {
  return useProtectedMutation(api.k3martCockpit.mutations.saveWeeklyDispatchPlan);
}

export function useConfirmDayPlan() {
  return useProtectedMutation(api.k3martCockpit.mutations.confirmDayPlan);
}

export function useProcessStockOutDestination() {
  return useProtectedMutation(api.k3martCockpit.mutations.processStockOutDestination);
}

export function useToggleOutletActive() {
  return useProtectedMutation(api.k3martCockpit.mutations.toggleOutletActive);
}

export function useSaveOutletSettings() {
  return useProtectedMutation(api.k3martCockpit.mutations.saveOutletSettings);
}

export function useCopyLastWeek() {
  return useProtectedMutation(api.k3martCockpit.mutations.copyLastWeek);
}

export function useSetProductTarget() {
  return useProtectedMutation(api.productionTargets.mutations.setProductTarget);
}
