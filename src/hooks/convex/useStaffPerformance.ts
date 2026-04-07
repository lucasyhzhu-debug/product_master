/**
 * Staff Performance hook — aggregates kitchen shift records by staff member.
 *
 * Provides monthly production summaries for payment reporting.
 * Manager/admin only.
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";

export function useStaffPerformance(startDate: string, endDate: string) {
  const { user } = useAuth();
  const token = user?.token;

  const data = useQuery(
    api.kitchenShiftRecords.queries.getStaffPerformanceSummary,
    token ? { token, startDate, endDate } : "skip"
  );

  return { data, isLoading: !!token && data === undefined };
}

export type StaffPerformanceData = NonNullable<
  ReturnType<typeof useStaffPerformance>["data"]
>;

export type StaffSummary = StaffPerformanceData["staff"][number];
