import { useState, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
// NOTE: WIB_OFFSET_MS and WEEK_MS imported from financialHelpers.tsx.
// Canonical backend implementation: convex/lib/periodRange.ts
import { WIB_OFFSET_MS, WEEK_MS } from "@/lib/financialHelpers";

/** Get the Monday 00:00 WIB epoch ms for the week containing `now`. */
function getCurrentWeekStart(): number {
  const now = Date.now();
  // Convert to WIB local time
  const wibMs = now + WIB_OFFSET_MS;
  const wibDate = new Date(wibMs);
  // Get day of week (0=Sun, 1=Mon, ..., 6=Sat)
  const day = wibDate.getUTCDay();
  // Days since Monday: Mon=0, Tue=1, ..., Sun=6
  const daysSinceMonday = (day + 6) % 7;
  // Set to Monday 00:00 WIB
  wibDate.setUTCHours(0, 0, 0, 0);
  const mondayWibMs = wibDate.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000;
  // Convert back to UTC epoch ms
  return mondayWibMs - WIB_OFFSET_MS;
}

export function useFinancials() {
  const [weekStart, setWeekStart] = useState(() => getCurrentWeekStart());

  const data = useQuery(
    api.reports.incomeStatement.getWeeklyIncomeStatement,
    { weekStart }
  );

  const goToPreviousWeek = useCallback(() => {
    setWeekStart((prev) => prev - WEEK_MS);
  }, []);

  const goToNextWeek = useCallback(() => {
    setWeekStart((prev) => prev + WEEK_MS);
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setWeekStart(getCurrentWeekStart());
  }, []);

  // Format week label: "Week of Feb 24 - Mar 2, 2026" (WIB dates)
  const weekLabel = useMemo(() => {
    const startWib = new Date(weekStart + WIB_OFFSET_MS);
    const endWib = new Date(weekStart + WEEK_MS + WIB_OFFSET_MS - 1); // Sunday 23:59:59 WIB
    const startMonth = startWib.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    const endMonth = endWib.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    const startDay = startWib.getUTCDate();
    const endDay = endWib.getUTCDate();
    const year = endWib.getUTCFullYear();

    if (startMonth === endMonth) {
      return `Week of ${startMonth} ${startDay} - ${endDay}, ${year}`;
    }
    return `Week of ${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  }, [weekStart]);

  // Use >= to prevent navigating into the future even if the component
  // re-renders across a week boundary (e.g., Sunday 23:59 -> Monday 00:01 WIB).
  // Memoized to avoid calling getCurrentWeekStart() on every render.
  const isCurrentWeek = useMemo(() => weekStart >= getCurrentWeekStart(), [weekStart]);

  return {
    data,
    isLoading: data === undefined,
    weekStart,
    weekLabel,
    isCurrentWeek,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
  };
}
