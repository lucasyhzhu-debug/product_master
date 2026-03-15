import { useState, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
// NOTE: WIB_OFFSET_MS and WEEK_MS imported from financialHelpers.tsx.
// Canonical backend implementation: convex/lib/periodRange.ts
import {
  WIB_OFFSET_MS,
  WEEK_MS,
  formatMonthLabel,
  formatPeriodRange,
  type PeriodMode,
} from "@/lib/financialHelpers";
import { wibMidnightToUtc, getCurrentWibMonth } from "@/lib/dateUtils";

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
  // ── Period mode state ──
  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");

  // ── Week mode state ──
  const [weekStart, setWeekStart] = useState(() => getCurrentWeekStart());

  // ── Month mode state ──
  // Compute current WIB month once for all initializers (same pattern as ExpenseAnalytics F13)
  const [initMonth] = useState(() => getCurrentWibMonth());
  const [monthYear, setMonthYear] = useState(initMonth.year);
  const [monthIndex, setMonthIndex] = useState(initMonth.month);

  // ── Custom mode state ──
  // Default custom range: current month
  const [customStart, setCustomStart] = useState<number>(
    () => wibMidnightToUtc(initMonth.year, initMonth.month, 1)
  );
  const [customEnd, setCustomEnd] = useState<number>(
    () => wibMidnightToUtc(initMonth.year, initMonth.month + 1, 1)
  );

  // ── Compute periodStart/periodEnd for non-week modes ──
  const monthPeriod = useMemo(() => {
    const periodStart = wibMidnightToUtc(monthYear, monthIndex, 1);
    const periodEnd = wibMidnightToUtc(monthYear, monthIndex + 1, 1);
    return { periodStart, periodEnd };
  }, [monthYear, monthIndex]);

  // ── Queries (only one fires at a time via "skip") ──
  const weeklyData = useQuery(
    api.reports.incomeStatement.getWeeklyIncomeStatement,
    periodMode === "week" ? { weekStart } : "skip"
  );

  const monthlyData = useQuery(
    api.reports.incomeStatement.getIncomeStatement,
    periodMode === "month"
      ? { periodStart: monthPeriod.periodStart, periodEnd: monthPeriod.periodEnd }
      : "skip"
  );

  const customData = useQuery(
    api.reports.incomeStatement.getIncomeStatement,
    periodMode === "custom"
      ? { periodStart: customStart, periodEnd: customEnd }
      : "skip"
  );

  // ── Merge query results into a single data shape ──
  // The page component doesn't need to know which query ran.
  const data = useMemo(() => {
    if (periodMode === "week") {
      if (!weeklyData) return undefined;
      return {
        periodStart: weeklyData.weekStart,
        periodEnd: weeklyData.weekEnd,
        current: weeklyData.current,
        previous: weeklyData.previous,
        deltas: weeklyData.deltas,
      };
    }
    if (periodMode === "month") {
      if (!monthlyData) return undefined;
      return {
        periodStart: monthlyData.periodStart,
        periodEnd: monthlyData.periodEnd,
        current: monthlyData.current,
        previous: monthlyData.previous,
        deltas: monthlyData.deltas,
      };
    }
    // custom
    if (!customData) return undefined;
    return {
      periodStart: customData.periodStart,
      periodEnd: customData.periodEnd,
      current: customData.current,
      previous: customData.previous,
      deltas: customData.deltas,
    };
  }, [periodMode, weeklyData, monthlyData, customData]);

  // ── Week navigation ──
  const goToPreviousWeek = useCallback(() => {
    setWeekStart((prev) => prev - WEEK_MS);
  }, []);

  const goToNextWeek = useCallback(() => {
    setWeekStart((prev) => prev + WEEK_MS);
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setWeekStart(getCurrentWeekStart());
  }, []);

  // ── Month navigation ──
  const goToPreviousMonth = useCallback(() => {
    setMonthIndex((prev) => {
      if (prev === 0) {
        setMonthYear((y) => y - 1);
        return 11;
      }
      return prev - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setMonthIndex((prev) => {
      if (prev === 11) {
        setMonthYear((y) => y + 1);
        return 0;
      }
      return prev + 1;
    });
  }, []);

  const goToCurrentMonth = useCallback(() => {
    const { year, month } = getCurrentWibMonth();
    setMonthYear(year);
    setMonthIndex(month);
  }, []);

  // ── Labels ──
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

  const monthLabel = useMemo(
    () => formatMonthLabel(monthYear, monthIndex),
    [monthYear, monthIndex]
  );

  const customLabel = useMemo(
    () => formatPeriodRange(customStart, customEnd),
    [customStart, customEnd]
  );

  const periodLabel = useMemo(() => {
    switch (periodMode) {
      case "week":
        return weekLabel;
      case "month":
        return monthLabel;
      case "custom":
        return customLabel;
    }
  }, [periodMode, weekLabel, monthLabel, customLabel]);

  // ── Current period check (prevent future navigation) ──
  const isCurrentWeek = useMemo(() => weekStart >= getCurrentWeekStart(), [weekStart]);

  const isCurrentMonth = useMemo(() => {
    const { year, month } = getCurrentWibMonth();
    return monthYear >= year && (monthYear > year || monthIndex >= month);
  }, [monthYear, monthIndex]);

  const isCurrentPeriod = useMemo(() => {
    switch (periodMode) {
      case "week":
        return isCurrentWeek;
      case "month":
        return isCurrentMonth;
      case "custom":
        return false; // Custom mode has no "current" concept
    }
  }, [periodMode, isCurrentWeek, isCurrentMonth]);

  return {
    data,
    isLoading: data === undefined,
    periodMode,
    setPeriodMode,
    periodLabel,
    isCurrentPeriod,
    // Week navigation
    weekStart,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    // Month navigation
    monthYear,
    monthIndex,
    goToPreviousMonth,
    goToNextMonth,
    goToCurrentMonth,
    // Custom date range
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
  };
}
