import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFinancials } from "@/hooks/convex/useFinancials";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataQualityPanel } from "@/components/financials/DataQualityPanel";
import { PLRow } from "@/components/financials/PLRow";
import { ChannelRow } from "@/components/financials/ChannelRow";
import { generateIncomeStatementCSV, downloadCSV } from "@/lib/csvExport";
import {
  WIB_OFFSET_MS,
  WEEK_MS,
  computeDelta,
  formatWeekRange,
  formatPeriodRange,
  DeltaIndicator,
  SectionHeaderRow,
  PLTableSkeleton,
  ErrorCard,
  type PeriodMode,
} from "@/lib/financialHelpers";

// ── Helper: convert UTC epoch ms to YYYY-MM-DD string in WIB for <input type="date"> ──
function utcToWibDateStr(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const d = String(wib.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Helper: convert YYYY-MM-DD string to WIB midnight in UTC epoch ms ──
function wibDateStrToUtc(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  // WIB 00:00 = UTC previous day 17:00
  return Date.UTC(y, m - 1, d, -7, 0, 0, 0);
}

const PERIOD_MODE_LABELS: Record<PeriodMode, string> = {
  week: "Weekly",
  month: "Monthly",
  custom: "Custom Range",
};

/** Merge items from current and previous periods by code, producing a union list sorted by code.
 *  Items present in only one period get 0 for the missing period. */
function unionMergeByCode(
  currentItems: Array<{ code: string; name: string; total: number }>,
  previousItems: Array<{ code: string; name: string; total: number }>
): Array<{ code: string; name: string; currentTotal: number; previousTotal: number }> {
  const map = new Map<string, { name: string; currentTotal: number; previousTotal: number }>();

  for (const item of currentItems) {
    map.set(item.code, { name: item.name, currentTotal: item.total, previousTotal: 0 });
  }

  for (const item of previousItems) {
    const existing = map.get(item.code);
    if (existing) {
      existing.previousTotal = item.total;
    } else {
      map.set(item.code, { name: item.name, currentTotal: 0, previousTotal: item.total });
    }
  }

  const result = Array.from(map.entries())
    .map(([code, data]) => ({ code, ...data }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return result;
}

// ── Main page component ──

export function FinancialStatement() {
  const {
    data,
    isLoading,
    periodMode,
    setPeriodMode,
    periodLabel,
    isCurrentPeriod,
    // Week
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    // Month
    goToPreviousMonth,
    goToNextMonth,
    goToCurrentMonth,
    // Custom
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
  } = useFinancials();

  // Section collapse state
  const [revenueExpanded, setRevenueExpanded] = useState(true);
  const [deductionsExpanded, setDeductionsExpanded] = useState(false);
  const [cogsExpanded, setCogsExpanded] = useState(false);
  const [opexExpanded, setOpexExpanded] = useState(false);
  const [otherExpanded, setOtherExpanded] = useState(false);

  // Mobile comparison toggle
  const [showComparison, setShowComparison] = useState(false);

  // Derive period-agnostic column headers from data
  const columnHeaders = useMemo(() => {
    if (!data) return { current: "This Period", previous: "Prev Period" };
    if (periodMode === "week") {
      const currentLabel = formatWeekRange(data.periodStart);
      const previousStart = data.periodStart - WEEK_MS;
      const previousLabel = formatWeekRange(previousStart);
      return { current: currentLabel, previous: previousLabel };
    }
    // For month and custom, use the generic period range formatter
    const currentLabel = formatPeriodRange(data.periodStart, data.periodEnd);
    const duration = data.periodEnd - data.periodStart;
    const previousLabel = formatPeriodRange(data.periodStart - duration, data.periodStart);
    return { current: currentLabel, previous: previousLabel };
  }, [data, periodMode]);

  // Build a lookup map for previous period channels by source
  type ChannelEntry = NonNullable<typeof data>["previous"]["channels"][0];
  const previousChannelMap = useMemo(() => {
    if (!data) return new Map<string, ChannelEntry>();
    const map = new Map<string, ChannelEntry>();
    for (const ch of data.previous.channels) {
      map.set(ch.source, ch);
    }
    return map;
  }, [data]);

  // Compute delta helpers for deduction rows
  const deductionDeltas = useMemo(() => {
    if (!data) return null;
    const c = data.current;
    const p = data.previous;
    return {
      discounts: computeDelta(c.totalDiscounts, p.totalDiscounts),
      commission: computeDelta(c.totalCommission, p.totalCommission),
      adPromo: computeDelta(
        c.totalAdBurn + c.totalPromoBurn,
        p.totalAdBurn + p.totalPromoBurn
      ),
      revShare: computeDelta(c.totalRevShare, p.totalRevShare),
      totalDeductions: computeDelta(c.totalDeductions, p.totalDeductions),
    };
  }, [data]);

  const cogsDeltas = useMemo(() => {
    if (!data) return null;
    const c = data.current;
    const p = data.previous;
    return {
      production: computeDelta(c.totalProductionCogs, p.totalProductionCogs),
      packaging: computeDelta(c.totalPackagingCogs, p.totalPackagingCogs),
      total: computeDelta(c.totalCogs, p.totalCogs),
    };
  }, [data]);

  // Merged OpEx and Other items (union by code from both periods)
  const mergedOpexItems = useMemo(() => {
    if (!data) return [];
    return unionMergeByCode(data.current.opex, data.previous.opex);
  }, [data]);

  const mergedOtherItems = useMemo(() => {
    if (!data) return [];
    return unionMergeByCode(data.current.otherItems, data.previous.otherItems);
  }, [data]);

  // ── Navigation handlers (mode-aware) ──
  const goToPrevious = periodMode === "week" ? goToPreviousWeek : goToPreviousMonth;
  const goToNext = periodMode === "week" ? goToNextWeek : goToNextMonth;
  const goToCurrent = periodMode === "week" ? goToCurrentWeek : goToCurrentMonth;
  const currentButtonLabel = periodMode === "week" ? "Today" : "This Month";

  // ── Page description ──
  const pageDescription = useMemo(() => {
    switch (periodMode) {
      case "week":
        return "Weekly profit and loss statement";
      case "month":
        return "Monthly profit and loss statement";
      case "custom":
        return "Custom period profit and loss statement";
    }
  }, [periodMode]);

  // ── CSV export filename ──
  const csvFilename = useMemo(() => {
    if (!data) return "frollie-income-statement.csv";
    const wibDate = new Date(data.periodStart + WIB_OFFSET_MS);
    const dateStr = wibDate.toISOString().slice(0, 10);
    return `frollie-income-statement-${periodMode}-${dateStr}.csv`;
  }, [data, periodMode]);

  return (
    <div className="min-w-[280px]">
      <PageHeader
        title="Income Statement"
        description={pageDescription}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!data) return;
              try {
                const csv = generateIncomeStatementCSV(data, periodLabel);
                downloadCSV(csv, csvFilename);
              } catch {
                toast.error("Failed to export CSV");
              }
            }}
            disabled={isLoading || !data}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        }
      />

      {/* Period mode selector + navigation */}
      <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
        {/* Mode selector */}
        <Select
          value={periodMode}
          onValueChange={(val) => setPeriodMode(val as PeriodMode)}
        >
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(PERIOD_MODE_LABELS) as [PeriodMode, string][]).map(
              ([mode, label]) => (
                <SelectItem key={mode} value={mode}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>

        {/* Week / Month navigation (arrows + label + reset button) */}
        {periodMode !== "custom" && (
          <>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={goToPrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[220px] text-center">
              {periodLabel}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={goToNext}
              disabled={isCurrentPeriod}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isCurrentPeriod && (
              <Button
                variant="ghost"
                size="sm"
                onClick={goToCurrent}
                className="ml-2 text-xs"
              >
                {currentButtonLabel}
              </Button>
            )}
          </>
        )}

        {/* Custom date range picker */}
        {periodMode === "custom" && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={utcToWibDateStr(customStart)}
              onChange={(e) => {
                const ms = wibDateStrToUtc(e.target.value);
                if (!isNaN(ms)) setCustomStart(ms);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="date"
              value={utcToWibDateStr(customEnd)}
              onChange={(e) => {
                const ms = wibDateStrToUtc(e.target.value);
                if (!isNaN(ms)) setCustomEnd(ms);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <span className="text-xs text-muted-foreground">(vs prior equal period)</span>
          </div>
        )}
      </div>

      {/* Mobile comparison toggle */}
      <div className="flex justify-end mb-3 md:hidden">
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => setShowComparison(!showComparison)}
        >
          {showComparison ? "Hide comparison" : "Show comparison"}
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && <PLTableSkeleton />}

      {/* Error fallback -- Convex queries rarely fail, but defensive */}
      {!isLoading && !data && (
        <ErrorCard onRetry={goToCurrent} />
      )}

      {/* P&L table */}
      {data && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="py-2.5 pl-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[45%]">
                  Line Item
                </th>
                <th className="py-2.5 pr-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {columnHeaders.current}
                </th>
                <th
                  className={cn(
                    "py-2.5 pr-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider",
                    "md:table-cell",
                    !showComparison && "hidden"
                  )}
                >
                  {columnHeaders.previous}
                </th>
                <th
                  className={cn(
                    "py-2.5 pr-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[80px]",
                    "md:table-cell",
                    !showComparison && "hidden"
                  )}
                >
                  Delta
                </th>
              </tr>
            </thead>
            <tbody>
              {/* -- REVENUE SECTION -- */}
              <SectionHeaderRow
                label="Revenue"
                isExpanded={revenueExpanded}
                onToggle={() => setRevenueExpanded(!revenueExpanded)}
              />

              {revenueExpanded && (
                <>
                  {/* Gross Revenue total row */}
                  <PLRow
                    label="Gross Revenue"
                    currentAmount={data.current.totalGross}
                    previousAmount={data.previous.totalGross}
                    delta={data.deltas.grossRevenue}
                    isBold
                    showComparison={showComparison}
                  />

                  {/* Per-channel breakdown */}
                  {data.current.channels.map((channel) => (
                    <ChannelRow
                      key={channel.source}
                      channel={channel}
                      totalGross={data.current.totalGross}
                      previousChannel={previousChannelMap.get(channel.source) ?? undefined}
                      showComparison={showComparison}
                    />
                  ))}
                </>
              )}

              {/* -- DEDUCTIONS SECTION -- */}
              <SectionHeaderRow
                label="Deductions"
                isExpanded={deductionsExpanded}
                onToggle={() => setDeductionsExpanded(!deductionsExpanded)}
              />

              {deductionsExpanded && deductionDeltas && (
                <>
                  <PLRow
                    label="Customer Discounts & Vouchers"
                    currentAmount={data.current.totalDiscounts}
                    previousAmount={data.previous.totalDiscounts}
                    delta={deductionDeltas.discounts}
                    isNegative
                    invertColor
                    indent={1}
                    showComparison={showComparison}
                  />
                  <PLRow
                    label="Platform Commissions"
                    currentAmount={data.current.totalCommission}
                    previousAmount={data.previous.totalCommission}
                    delta={deductionDeltas.commission}
                    isNegative
                    invertColor
                    indent={1}
                    showComparison={showComparison}
                  />
                  <PLRow
                    label="Ad Spend & Promos"
                    currentAmount={
                      data.current.totalAdBurn + data.current.totalPromoBurn
                    }
                    previousAmount={
                      data.previous.totalAdBurn + data.previous.totalPromoBurn
                    }
                    delta={deductionDeltas.adPromo}
                    isNegative
                    invertColor
                    indent={1}
                    showComparison={showComparison}
                  />
                  <PLRow
                    label="Consignment Rev Share"
                    currentAmount={data.current.totalRevShare}
                    previousAmount={data.previous.totalRevShare}
                    delta={deductionDeltas.revShare}
                    isNegative
                    invertColor
                    indent={1}
                    showComparison={showComparison}
                    labelTooltip="Accrual basis -- revenue recognized by settlement period, not payment receipt date"
                  />
                </>
              )}

              {/* Total Deductions (always visible regardless of section expanded) */}
              <PLRow
                label="Total Deductions"
                currentAmount={data.current.totalDeductions}
                previousAmount={data.previous.totalDeductions}
                delta={deductionDeltas?.totalDeductions ?? null}
                isNegative
                invertColor
                isBold
                showComparison={showComparison}
              />

              {/* -- NET REVENUE -- */}
              <PLRow
                label="NET REVENUE"
                currentAmount={data.current.netRevenue}
                previousAmount={data.previous.netRevenue}
                delta={data.deltas.netRevenue}
                indent={0}
                isBold
                showComparison={showComparison}
                isTopBorder
              />

              {/* -- COGS SECTION -- */}
              <SectionHeaderRow
                label="Cost of Goods Sold"
                isExpanded={cogsExpanded}
                onToggle={() => setCogsExpanded(!cogsExpanded)}
                labelTooltip="Internal order COGS uses order-time snapshot; external channel COGS uses current BOM costs"
              />

              {cogsExpanded && cogsDeltas && (
                <>
                  <PLRow
                    label="Production COGS (Balls)"
                    currentAmount={data.current.totalProductionCogs}
                    previousAmount={data.previous.totalProductionCogs}
                    delta={cogsDeltas.production}
                    isNegative
                    invertColor
                    indent={1}
                    showComparison={showComparison}
                  />
                  <PLRow
                    label="Packaging COGS"
                    currentAmount={data.current.totalPackagingCogs}
                    previousAmount={data.previous.totalPackagingCogs}
                    delta={cogsDeltas.packaging}
                    isNegative
                    invertColor
                    indent={1}
                    showComparison={showComparison}
                  />
                </>
              )}

              {/* Total COGS (always visible) */}
              <PLRow
                label="Total COGS"
                currentAmount={data.current.totalCogs}
                previousAmount={data.previous.totalCogs}
                delta={cogsDeltas?.total ?? null}
                isNegative
                invertColor
                isBold
                showComparison={showComparison}
              />

              {/* -- GROSS PROFIT -- */}
              <PLRow
                label="GROSS PROFIT"
                currentAmount={data.current.grossProfit}
                previousAmount={data.previous.grossProfit}
                delta={data.deltas.grossProfit}
                indent={0}
                isBold
                showComparison={showComparison}
                isTopBorder
              />

              {/* Gross Margin % row */}
              <tr className="bg-muted/20">
                <td className="py-2 pl-6 text-sm font-medium text-muted-foreground">
                  Gross Margin %
                </td>
                <td className="py-2 text-sm text-right tabular-nums font-medium">
                  {data.current.grossMarginPercent != null
                    ? `${data.current.grossMarginPercent.toFixed(1)}%`
                    : "N/A"}
                </td>
                <td
                  className={cn(
                    "py-2 text-sm text-right tabular-nums font-medium",
                    "md:table-cell",
                    !showComparison && "hidden"
                  )}
                >
                  {data.previous.grossMarginPercent != null
                    ? `${data.previous.grossMarginPercent.toFixed(1)}%`
                    : "N/A"}
                </td>
                <td
                  className={cn(
                    "py-2 text-sm text-right",
                    "md:table-cell",
                    !showComparison && "hidden"
                  )}
                >
                  <DeltaIndicator
                    delta={
                      data.deltas.grossMarginPp != null
                        ? { amount: data.deltas.grossMarginPp, percent: data.deltas.grossMarginPp }
                        : null
                    }
                    unit="pp"
                  />
                </td>
              </tr>

              {/* -- OPERATING EXPENSES SECTION -- */}
              <SectionHeaderRow
                label="Operating Expenses"
                isExpanded={opexExpanded}
                onToggle={() => setOpexExpanded(!opexExpanded)}
              />

              {opexExpanded && mergedOpexItems.map((item) => (
                <PLRow
                  key={item.code}
                  label={`${item.code} ${item.name}`}
                  currentAmount={item.currentTotal}
                  previousAmount={item.previousTotal}
                  delta={computeDelta(item.currentTotal, item.previousTotal)}
                  isNegative
                  invertColor
                  indent={1}
                  showComparison={showComparison}
                />
              ))}

              {/* Total Operating Expenses (always visible) */}
              <PLRow
                label="Total Operating Expenses"
                currentAmount={data.current.totalOpEx}
                previousAmount={data.previous.totalOpEx}
                delta={data.deltas.totalOpEx}
                isNegative
                invertColor
                isBold
                showComparison={showComparison}
              />

              {/* -- EBIT -- */}
              <PLRow
                label="EBIT (Operating Profit)"
                currentAmount={data.current.ebit}
                previousAmount={data.previous.ebit}
                delta={data.deltas.ebit}
                isBold
                showComparison={showComparison}
                isTopBorder
              />

              {/* EBIT Margin % row */}
              <tr className="bg-muted/20">
                <td className="py-2 pl-6 text-sm font-medium text-muted-foreground">
                  EBIT Margin %
                </td>
                <td className="py-2 text-sm text-right tabular-nums font-medium">
                  {data.current.ebitMarginPercent != null
                    ? `${data.current.ebitMarginPercent.toFixed(1)}%`
                    : "N/A"}
                </td>
                <td
                  className={cn(
                    "py-2 text-sm text-right tabular-nums font-medium",
                    "md:table-cell",
                    !showComparison && "hidden"
                  )}
                >
                  {data.previous.ebitMarginPercent != null
                    ? `${data.previous.ebitMarginPercent.toFixed(1)}%`
                    : "N/A"}
                </td>
                <td
                  className={cn(
                    "py-2 text-sm text-right",
                    "md:table-cell",
                    !showComparison && "hidden"
                  )}
                >
                  <DeltaIndicator
                    delta={
                      data.deltas.ebitMarginPp != null
                        ? { amount: data.deltas.ebitMarginPp, percent: data.deltas.ebitMarginPp }
                        : null
                    }
                    unit="pp"
                  />
                </td>
              </tr>

              {/* -- OTHER INCOME/EXPENSE SECTION -- */}
              <SectionHeaderRow
                label="Other Income / Expense"
                isExpanded={otherExpanded}
                onToggle={() => setOtherExpanded(!otherExpanded)}
              />

              {otherExpanded && mergedOtherItems.map((item) => (
                <PLRow
                  key={item.code}
                  label={`${item.code} ${item.name}`}
                  currentAmount={item.currentTotal}
                  previousAmount={item.previousTotal}
                  delta={computeDelta(item.currentTotal, item.previousTotal)}
                  isNegative
                  indent={1}
                  showComparison={showComparison}
                />
              ))}

              {/* Total Other Income / Expense (always visible) */}
              <PLRow
                label="Total Other Income / Expense"
                currentAmount={data.current.totalOther}
                previousAmount={data.previous.totalOther}
                delta={data.deltas.totalOther}
                isNegative
                isBold
                showComparison={showComparison}
              />

              {/* -- NET INCOME -- */}
              <PLRow
                label="NET INCOME"
                currentAmount={data.current.netIncome}
                previousAmount={data.previous.netIncome}
                delta={data.deltas.netIncome}
                isBold
                showComparison={showComparison}
                isTopBorder
              />

              {/* Net Margin % row */}
              <tr className="bg-muted/20">
                <td className="py-2 pl-6 text-sm font-medium text-muted-foreground">
                  Net Margin %
                </td>
                <td className="py-2 text-sm text-right tabular-nums font-medium">
                  {data.current.netMarginPercent != null
                    ? `${data.current.netMarginPercent.toFixed(1)}%`
                    : "N/A"}
                </td>
                <td
                  className={cn(
                    "py-2 text-sm text-right tabular-nums font-medium",
                    "md:table-cell",
                    !showComparison && "hidden"
                  )}
                >
                  {data.previous.netMarginPercent != null
                    ? `${data.previous.netMarginPercent.toFixed(1)}%`
                    : "N/A"}
                </td>
                <td
                  className={cn(
                    "py-2 text-sm text-right",
                    "md:table-cell",
                    !showComparison && "hidden"
                  )}
                >
                  <DeltaIndicator
                    delta={
                      data.deltas.netMarginPp != null
                        ? { amount: data.deltas.netMarginPp, percent: data.deltas.netMarginPp }
                        : null
                    }
                    unit="pp"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Data quality panel */}
      {data && (
        <DataQualityPanel
          gapAnalysis={data.current.gapAnalysis}
          channels={data.current.channels}
        />
      )}
    </div>
  );
}
