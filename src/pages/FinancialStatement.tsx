import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFinancials } from "@/hooks/convex/useFinancials";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { DataQualityPanel } from "@/components/financials/DataQualityPanel";
import { PLRow } from "@/components/financials/PLRow";
import { ChannelRow } from "@/components/financials/ChannelRow";
import { generateIncomeStatementCSV, downloadCSV } from "@/lib/csvExport";
import {
  WIB_OFFSET_MS,
  WEEK_MS,
  computeDelta,
  formatWeekRange,
  SectionHeaderRow,
  PLTableSkeleton,
  ErrorCard,
} from "@/lib/financialHelpers";

// ── Main page component ──

export function FinancialStatement() {
  const {
    data,
    isLoading,
    weekStart,
    weekLabel,
    isCurrentWeek,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
  } = useFinancials();

  // Section collapse state
  const [revenueExpanded, setRevenueExpanded] = useState(true);
  const [deductionsExpanded, setDeductionsExpanded] = useState(false);
  const [cogsExpanded, setCogsExpanded] = useState(false);

  // Mobile comparison toggle
  const [showComparison, setShowComparison] = useState(false);

  // Derive period-agnostic column headers from data
  const columnHeaders = useMemo(() => {
    if (!data) return { current: "This Week", previous: "Prev Week" };
    const currentLabel = formatWeekRange(data.weekStart);
    const previousStart = data.weekStart - WEEK_MS;
    const previousLabel = formatWeekRange(previousStart);
    return { current: currentLabel, previous: previousLabel };
  }, [data]);

  // Build a lookup map for previous week channels by source
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

  return (
    <div className="min-w-[280px]">
      <PageHeader
        title="Income Statement"
        description="Weekly profit and loss statement"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!data) return;
              const csv = generateIncomeStatementCSV(data, weekLabel);
              const wibDate = new Date(weekStart + WIB_OFFSET_MS);
              const dateStr = wibDate.toISOString().slice(0, 10);
              downloadCSV(csv, `frollie-income-statement-${dateStr}.csv`);
            }}
            disabled={isLoading || !data}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        }
      />

      {/* Week navigation */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[260px] text-center">
          {weekLabel}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={goToNextWeek}
          disabled={isCurrentWeek}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isCurrentWeek && (
          <Button
            variant="ghost"
            size="sm"
            onClick={goToCurrentWeek}
            className="ml-2 text-xs"
          >
            Today
          </Button>
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
        <ErrorCard onRetry={goToCurrentWeek} />
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
                  {data.deltas.grossMarginPp != null ? (
                    <span
                      className={cn(
                        "inline-flex items-center text-xs",
                        data.deltas.grossMarginPp >= 0
                          ? "text-[var(--color-status-success)]"
                          : "text-[var(--color-status-error)]"
                      )}
                    >
                      {data.deltas.grossMarginPp >= 0 ? (
                        <ArrowUpRight className="h-3 w-3 mr-0.5" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 mr-0.5" />
                      )}
                      {Math.abs(data.deltas.grossMarginPp).toFixed(1)}pp
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
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
