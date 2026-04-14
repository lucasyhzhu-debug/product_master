import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAnalyticsFilters, type AnalyticsFilters } from "@/contexts/AnalyticsFilterContext";

function buildArgs(f: AnalyticsFilters) {
  return {
    fromTs: f.fromTs,
    toTs: f.toTs,
    channels: f.channels.length ? f.channels : undefined,
    menuProductIds: f.menuProductIds.length ? f.menuProductIds : undefined,
  };
}

export function useKpiSummary() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.kpiSummary, buildArgs(filters));
}

export function useByWeekday() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.byWeekday, buildArgs(filters));
}

export function useDayHourHeatmap() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.dayHourHeatmap, buildArgs(filters));
}

export function useChannelEconomics() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.channelEconomics, buildArgs(filters));
}

export function useVolumeByType(granularity: "day" | "week") {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.volumeByType, {
    ...buildArgs(filters),
    granularity,
  });
}

export function useUnitsPerTxnByChannel() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.unitsPerTxnByChannel, buildArgs(filters));
}

export function useAovByChannel() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.aovByChannel, buildArgs(filters));
}

export function useSkuPareto(topN = 10) {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.skuPareto, { ...buildArgs(filters), topN });
}

export function useSkuChannelMatrix(topN = 8) {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.skuChannelMatrix, { ...buildArgs(filters), topN });
}

export function useChannelMomentum() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.channelMomentum, buildArgs(filters));
}

export function useRollingTrend() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.rollingTrend, buildArgs(filters));
}
