/**
 * Expense Analytics Dashboard
 *
 * Full dashboard replacing the Phase 48 stub. Shows:
 * - Total OpEx with GL category pie chart
 * - Pending reimbursement metrics
 * - 6-month OpEx trend line chart
 * - Employee spend breakdown
 * - Fraud flag alerts
 *
 * Period defaults to current month with month/custom mode toggle.
 */
import { useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOpExAnalytics, useExpenseMetrics, useFraudFlags } from "@/hooks/convex/useExpenseAnalytics";
import { MONTH_NAMES } from "@/lib/financialHelpers";
import {
  type ExpensePeriodMode,
  getCurrentWibMonth,
  computePeriodRange,
  prevMonth,
  nextMonth,
  isCurrentOrFutureMonth,
  wibMidnightToUtc,
} from "@/lib/expenseAnalyticsPeriod";
import { utcToWibDateStr, wibDateStrToUtcMs } from "@/lib/dateUtils";
import { OpExSummaryCard } from "@/components/expenseAnalytics/OpExSummaryCard";
import { PendingMetricsCard } from "@/components/expenseAnalytics/PendingMetricsCard";
import { MonthlyTrendChart } from "@/components/expenseAnalytics/MonthlyTrendChart";
import { SpendByEmployeeCard } from "@/components/expenseAnalytics/SpendByEmployeeCard";
import { FraudFlagsCard } from "@/components/expenseAnalytics/FraudFlagsCard";

export function ExpenseAnalytics() {
  // Period mode state
  const [periodMode, setPeriodMode] = useState<ExpensePeriodMode>("month");

  // Single init computation shared across useState initializers
  const initMonth = useMemo(() => getCurrentWibMonth(), []);

  // Month mode state
  const [monthYear, setMonthYear] = useState(initMonth.year);
  const [monthIndex, setMonthIndex] = useState(initMonth.month);

  // Custom mode state (defaults to current month range)
  const [customStart, setCustomStart] = useState<number>(
    wibMidnightToUtc(initMonth.year, initMonth.month, 1)
  );
  const [customEnd, setCustomEnd] = useState<number>(
    wibMidnightToUtc(initMonth.year, initMonth.month + 1, 1)
  );

  // Compute period range
  const { periodStart, periodEnd } = useMemo(
    () => computePeriodRange(periodMode, monthYear, monthIndex, customStart, customEnd),
    [periodMode, monthYear, monthIndex, customStart, customEnd]
  );

  // All hooks called unconditionally before any conditional returns
  const opexData = useOpExAnalytics(periodStart, periodEnd);
  const metricsData = useExpenseMetrics(periodStart, periodEnd);
  const fraudData = useFraudFlags();

  // Month navigation
  const goToPreviousMonth = useCallback(() => {
    const prev = prevMonth(monthYear, monthIndex);
    setMonthYear(prev.year);
    setMonthIndex(prev.month);
  }, [monthYear, monthIndex]);

  const goToNextMonth = useCallback(() => {
    const next = nextMonth(monthYear, monthIndex);
    setMonthYear(next.year);
    setMonthIndex(next.month);
  }, [monthYear, monthIndex]);

  const goToCurrentMonth = useCallback(() => {
    const { year, month } = getCurrentWibMonth();
    setMonthYear(year);
    setMonthIndex(month);
  }, []);

  const isCurrentMonth = useMemo(
    () => isCurrentOrFutureMonth(monthYear, monthIndex),
    [monthYear, monthIndex]
  );

  const monthLabel = `${MONTH_NAMES[monthIndex]} ${monthYear}`;

  return (
    <div>
      <PageHeader
        title="Expense Analytics"
        description="OpEx analysis and fraud monitoring"
      />

      {/* Period selector row */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {/* Mode toggle */}
        <div className="flex items-center gap-1">
          {(["month", "custom"] as const).map((mode) => (
            <Badge
              key={mode}
              variant={periodMode === mode ? "default" : "outline"}
              className="cursor-pointer text-xs capitalize"
              onClick={() => setPeriodMode(mode)}
            >
              {mode === "month" ? "Monthly" : "Custom Range"}
            </Badge>
          ))}
        </div>

        {/* Month navigation */}
        {periodMode === "month" && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={goToPreviousMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[130px] text-center">
              {monthLabel}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={goToNextMonth}
              disabled={isCurrentMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={goToCurrentMonth}
            >
              Today
            </Button>
          </div>
        )}

        {/* Custom date inputs */}
        {periodMode === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              value={utcToWibDateStr(customStart)}
              onChange={(e) => {
                if (e.target.value) setCustomStart(wibDateStrToUtcMs(e.target.value));
              }}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              value={utcToWibDateStr(customEnd)}
              onChange={(e) => {
                if (e.target.value) setCustomEnd(wibDateStrToUtcMs(e.target.value));
              }}
            />
          </div>
        )}
      </div>

      {/* Dashboard grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <OpExSummaryCard data={opexData} />
        <PendingMetricsCard data={metricsData} />
        <MonthlyTrendChart data={opexData} />
        <div className="lg:col-span-2">
          <SpendByEmployeeCard data={metricsData} />
        </div>
        <FraudFlagsCard data={fraudData} />
      </div>
    </div>
  );
}
