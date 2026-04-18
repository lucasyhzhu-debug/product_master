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

// -----------------------------------------------------------------------------
// Snapshot hooks — 3 subscriptions cover all 13 widgets. Convex dedupes identical
// useQuery calls within the same React tree, so widgets calling the selectors
// below share these subscriptions automatically.
// -----------------------------------------------------------------------------

export function useKpiAndChannelSnapshot() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.kpiAndChannelSnapshot, buildArgs(filters));
}

export function useTimeSeriesSnapshot() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.timeSeriesSnapshot, buildArgs(filters));
}

export function useSkuSnapshot() {
  const { filters } = useAnalyticsFilters();
  return useQuery(api.reports.unitEconomics.skuSnapshot, buildArgs(filters));
}

// -----------------------------------------------------------------------------
// 11 backward-compatible field selectors — preserve every existing hook name so
// widget files keep working. `undefined` while loading; optional-chain propagates.
//
// NOTE: no sparkline-specific selector — channelSparklines was dropped from
// kpiAndChannelSnapshot (data is redundant with channelMomentum.channels[].sparklines).
// -----------------------------------------------------------------------------

export const useKpiSummary = () => useKpiAndChannelSnapshot()?.kpi;
export const useChannelEconomics = () => useKpiAndChannelSnapshot()?.channelEconomics;
export const useChannelMomentum = () => useKpiAndChannelSnapshot()?.channelMomentum;

export const useByWeekday = (mode: "weekday" | "rolling" = "weekday") => {
  const snap = useTimeSeriesSnapshot();
  if (snap === undefined) return undefined;
  return mode === "rolling" ? snap.byWeekdayRolling : snap.byWeekday;
};
export const useRollingTrend = () => useTimeSeriesSnapshot()?.rollingTrend;
export const useDayHourHeatmap = () => useTimeSeriesSnapshot()?.dayHourHeatmap;
export const useVolumeByType = (g: "day" | "week") =>
  useTimeSeriesSnapshot()?.volumeByType[g];
export const useTypeMixOverTime = (g: "day" | "week") =>
  useTimeSeriesSnapshot()?.typeMixOverTime[g];

export const useSkuPareto = (topN = 10) =>
  useSkuSnapshot()?.skuTop.slice(0, topN);
export const useSkuChannelMatrix = (topN = 8) =>
  useSkuSnapshot()?.skuChannelMatrix.slice(0, topN);

// unitsPerTxnByChannel + aovByChannel were subset selectors of channelEconomics
// in the legacy API. Widgets calling them receive the channelEconomics array.
export const useUnitsPerTxnByChannel = () => useKpiAndChannelSnapshot()?.channelEconomics;
export const useAovByChannel = () => useKpiAndChannelSnapshot()?.channelEconomics;
