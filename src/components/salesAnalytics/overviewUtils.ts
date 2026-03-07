/**
 * Types, constants, and period presets for the OverviewTab and its sub-components.
 */
import type { PeriodPreset } from "@/hooks/convex";

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "past24hours", label: "Past 24h" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "thisWeek", label: "This Week" },
  { value: "last7days", label: "Last 7 Days" },
  { value: "last30days", label: "Last 30 Days" },
  { value: "thisMonth", label: "This Month" },
  { value: "allTime", label: "All Time" },
];

export const DEFAULT_PERIOD: PeriodPreset = "last7days";
export const PERIOD_STORAGE_KEY = "frollie:salesPeriod";

/** Period summary data shape from useDashboardSalesSummaryByPeriod. */
export type PeriodData = {
  totalGross: number;
  totalNet: number;
  totalTransactions: number;
  totalCommission: number;
  totalAdBurn: number;
  totalPromoBurn: number;
  totalDiscounts: number;
  totalDeliveryFees: number;
  platformGross: number;
  internalGross: number;
  channels: Array<{ source: string; displayName: string; gross: number; net: number; transactions: number }>;
  periodLabel?: string;
  comparisonLabel?: string;
  periodStart?: number;
  periodEnd?: number;
};
