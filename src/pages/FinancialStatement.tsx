import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertCircle,
  AlertTriangle,
  Download,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { getPlatformPalette } from "@/lib/platformColors";
import { useFinancials } from "@/hooks/convex/useFinancials";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ConfidenceIndicator,
  type Confidence,
} from "@/components/financials/ConfidenceIndicator";
import { DataQualityPanel } from "@/components/financials/DataQualityPanel";
import { generateIncomeStatementCSV, downloadCSV } from "@/lib/csvExport";

// ── WIB helpers for column headers ──

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function formatWeekRange(weekStartUtc: number): string {
  const startWib = new Date(weekStartUtc + WIB_OFFSET_MS);
  const endWib = new Date(weekStartUtc + WEEK_MS + WIB_OFFSET_MS - 1);
  const startMonth = startWib.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const endMonth = endWib.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const startDay = startWib.getUTCDate();
  const endDay = endWib.getUTCDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

// ── Format helpers ──

/** Format amount with parentheses for negative display (accounting convention). */
function formatNegative(amount: number): string {
  if (amount === 0) return formatCurrency(0);
  return `(${formatCurrency(Math.abs(amount))})`;
}

/** Format amount with confidence awareness. Missing COGS shows "--" with warning icon. */
function formatWithConfidence(
  amount: number,
  confidence: Confidence | undefined,
  isNegative: boolean
): React.ReactNode {
  const formatAmount = isNegative ? formatNegative : formatCurrency;

  if (confidence === "missing") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        --
        <AlertTriangle className="h-3 w-3 text-amber-500" />
      </span>
    );
  }

  if (confidence === "inferred") {
    return (
      <span>
        <span className="text-muted-foreground">~ </span>
        {formatAmount(amount)}
      </span>
    );
  }

  return formatAmount(amount);
}

// ── Delta indicator ──

function DeltaIndicator({
  delta,
  invertColor,
}: {
  delta: { amount: number; percent: number | null } | null;
  invertColor?: boolean;
}) {
  if (!delta) return <span className="text-muted-foreground">-</span>;

  const { amount, percent } = delta;

  if (amount === 0 && (percent === null || percent === 0)) {
    return (
      <span className="inline-flex items-center text-xs text-muted-foreground">
        <Minus className="h-3 w-3 mr-0.5" />
        0%
      </span>
    );
  }

  if (percent === null) {
    return (
      <span className="inline-flex items-center text-xs text-muted-foreground">
        New
      </span>
    );
  }

  const isPositive = percent >= 0;
  const isGood = invertColor ? !isPositive : isPositive;

  return (
    <span
      className={cn(
        "inline-flex items-center text-xs",
        isGood
          ? "text-green-600 dark:text-green-400"
          : "text-red-600 dark:text-red-400"
      )}
    >
      {isPositive ? (
        <ArrowUpRight className="h-3 w-3 mr-0.5" />
      ) : (
        <ArrowDownRight className="h-3 w-3 mr-0.5" />
      )}
      {Math.abs(percent).toFixed(0)}%
    </span>
  );
}

// ── P&L Row component ──

interface PLRowProps {
  label: string;
  currentAmount: number;
  previousAmount: number;
  delta: { amount: number; percent: number | null } | null;
  isNegative?: boolean;
  invertColor?: boolean;
  indent?: number; // 0 = section header, 1 = line item, 2 = sub-item
  isBold?: boolean;
  channelDot?: string;
  percentOfTotal?: number | null;
  confidence?: Confidence;
  showComparison: boolean;
  isTopBorder?: boolean;
  labelTooltip?: string;
}

function PLRow({
  label,
  currentAmount,
  previousAmount,
  delta,
  isNegative = false,
  invertColor = false,
  indent = 1,
  isBold = false,
  channelDot,
  percentOfTotal,
  confidence,
  showComparison,
  isTopBorder = false,
  labelTooltip,
}: PLRowProps) {
  const formatAmount = isNegative ? formatNegative : formatCurrency;
  const paddingClass =
    indent === 0 ? "pl-2" : indent === 1 ? "pl-6" : "pl-10";
  const fontClass = isBold ? "font-semibold" : "font-normal";
  const bgClass = indent === 0 ? "bg-muted/30" : "";

  const labelContent = (
    <span className="inline-flex items-center gap-2">
      {channelDot && (
        <span className={cn("inline-block w-2.5 h-2.5 rounded-full shrink-0", channelDot)} />
      )}
      {labelTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help border-b border-dashed border-muted-foreground/40">
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-[260px]">{labelTooltip}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        label
      )}
      {percentOfTotal != null && (
        <span className="text-xs text-muted-foreground">
          {percentOfTotal.toFixed(1)}%
        </span>
      )}
    </span>
  );

  return (
    <tr
      className={cn(
        bgClass,
        isTopBorder && "border-t-2 border-foreground/20"
      )}
    >
      <td className={cn("py-2 text-sm", paddingClass, fontClass)}>
        {labelContent}
      </td>
      <td className={cn("py-2 text-sm text-right tabular-nums", fontClass)}>
        <span className="inline-flex items-center justify-end">
          {formatWithConfidence(currentAmount, confidence, isNegative)}
          {confidence && confidence !== "missing" && (
            <ConfidenceIndicator level={confidence} />
          )}
        </span>
      </td>
      <td
        className={cn(
          "py-2 text-sm text-right tabular-nums",
          fontClass,
          "md:table-cell",
          !showComparison && "hidden"
        )}
      >
        {formatAmount(previousAmount)}
      </td>
      <td
        className={cn(
          "py-2 text-sm text-right",
          "md:table-cell",
          !showComparison && "hidden"
        )}
      >
        <DeltaIndicator delta={delta} invertColor={invertColor} />
      </td>
    </tr>
  );
}

// ── Section header row (collapsible) ──

function SectionHeaderRow({
  label,
  isExpanded,
  onToggle,
  showComparison,
  labelTooltip,
}: {
  label: string;
  isExpanded: boolean;
  onToggle: () => void;
  showComparison: boolean;
  labelTooltip?: string;
}) {
  return (
    <tr className="border-t bg-muted/50">
      <td
        colSpan={showComparison ? 4 : 2}
        className="py-2 pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none"
        onClick={onToggle}
      >
        <span className="inline-flex items-center gap-1">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
          {labelTooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help border-b border-dashed border-muted-foreground/40">
                  {label}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[300px]">{labelTooltip}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            label
          )}
        </span>
      </td>
    </tr>
  );
}

// ── Channel row (expandable to show gross margin) ──

interface ChannelRowProps {
  channel: {
    source: string;
    displayName: string;
    gross: number;
    cogs: { production: number; packaging: number; total: number };
    netRevenue: number;
    confidence: Confidence;
  };
  totalGross: number;
  previousChannel?: {
    gross: number;
    cogs: { total: number };
    netRevenue: number;
  };
  showComparison: boolean;
}

function ChannelRow({
  channel,
  totalGross,
  previousChannel,
  showComparison,
}: ChannelRowProps) {
  const [expanded, setExpanded] = useState(false);
  const palette = getPlatformPalette(channel.source);
  const percentOfTotal =
    totalGross > 0 ? (channel.gross / totalGross) * 100 : null;

  const prevGross = previousChannel?.gross ?? 0;
  const delta =
    prevGross === 0 && channel.gross === 0
      ? { amount: 0, percent: 0 }
      : prevGross === 0
        ? { amount: channel.gross, percent: null }
        : {
            amount: channel.gross - prevGross,
            percent: ((channel.gross - prevGross) / prevGross) * 100,
          };

  // Channel gross margin (current)
  const channelGrossProfit = channel.netRevenue - channel.cogs.total;
  const channelGrossMargin =
    channel.netRevenue !== 0
      ? (channelGrossProfit / channel.netRevenue) * 100
      : null;

  // Channel gross margin (previous)
  const prevNetRevenue = previousChannel?.netRevenue ?? 0;
  const prevCogs = previousChannel?.cogs?.total ?? 0;
  const prevGrossProfit = prevNetRevenue - prevCogs;
  const prevGrossMargin =
    prevNetRevenue !== 0 ? (prevGrossProfit / prevNetRevenue) * 100 : null;

  // Gross margin delta in percentage points
  const grossMarginDeltaPp =
    channelGrossMargin != null && prevGrossMargin != null
      ? channelGrossMargin - prevGrossMargin
      : null;

  const isConsignment = channel.source === "consignment";

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-1.5 pl-10 text-sm">
          <span className="inline-flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            <span className={cn("inline-block w-2.5 h-2.5 rounded-full shrink-0", palette.dot)} />
            {isConsignment ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help border-b border-dashed border-muted-foreground/40">
                    {channel.displayName}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-[260px]">
                    Accrual basis -- revenue recognized by settlement period, not payment receipt date
                  </p>
                </TooltipContent>
              </Tooltip>
            ) : (
              channel.displayName
            )}
            {percentOfTotal != null && (
              <span className="text-xs text-muted-foreground">
                {percentOfTotal.toFixed(1)}%
              </span>
            )}
          </span>
        </td>
        <td className="py-1.5 text-sm text-right tabular-nums">
          <span className="inline-flex items-center justify-end">
            {formatCurrency(channel.gross)}
            <ConfidenceIndicator level={channel.confidence} />
          </span>
        </td>
        <td
          className={cn(
            "py-1.5 text-sm text-right tabular-nums",
            "md:table-cell",
            !showComparison && "hidden"
          )}
        >
          {formatCurrency(prevGross)}
        </td>
        <td
          className={cn(
            "py-1.5 text-sm text-right",
            "md:table-cell",
            !showComparison && "hidden"
          )}
        >
          <DeltaIndicator delta={delta} />
        </td>
      </tr>
      {expanded && (
        <>
          {/* Gross margin sub-row with previous week comparison */}
          <tr className="bg-muted/10">
            <td className="py-1 pl-16 text-xs text-muted-foreground">
              Gross Margin
            </td>
            <td className="py-1 text-xs text-right tabular-nums font-medium">
              {channelGrossMargin != null
                ? `${channelGrossMargin.toFixed(1)}%`
                : "N/A"}
            </td>
            <td
              className={cn(
                "py-1 text-xs text-right tabular-nums",
                "md:table-cell",
                !showComparison && "hidden"
              )}
            >
              {prevGrossMargin != null
                ? `${prevGrossMargin.toFixed(1)}%`
                : "N/A"}
            </td>
            <td
              className={cn(
                "py-1 text-xs text-right",
                "md:table-cell",
                !showComparison && "hidden"
              )}
            >
              {grossMarginDeltaPp != null ? (
                <span
                  className={cn(
                    "inline-flex items-center text-xs",
                    grossMarginDeltaPp >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  )}
                >
                  {grossMarginDeltaPp >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 mr-0.5" />
                  )}
                  {Math.abs(grossMarginDeltaPp).toFixed(1)}pp
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </td>
          </tr>
          {/* COGS breakdown sub-row */}
          <tr className="bg-muted/10">
            <td colSpan={showComparison ? 4 : 2} className="py-1 pl-16 text-xs text-muted-foreground">
              COGS:{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(channel.cogs.total)}
              </span>
              {" (Production: "}
              {formatCurrency(channel.cogs.production)}
              {", Packaging: "}
              {formatCurrency(channel.cogs.packaging)}
              {")"}
            </td>
          </tr>
        </>
      )}
    </>
  );
}

// ── Loading skeleton ──

function PLTableSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-8 w-[90%]" />
      <Skeleton className="h-8 w-[85%]" />
      <Skeleton className="h-8 w-[80%]" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-8 w-[75%]" />
      <Skeleton className="h-8 w-[70%]" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

// ── Error state ──

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
      <AlertCircle className="h-12 w-12 text-muted-foreground" />
      <div>
        <h3 className="text-lg font-semibold">Unable to load income statement</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Please check your connection and try again.
        </p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

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
  const previousChannelMap = useMemo(() => {
    if (!data) return new Map<string, typeof data.previous.channels[0]>();
    const map = new Map<string, typeof data.previous.channels[0]>();
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
    function computeDelta(curr: number, prev: number) {
      const amount = curr - prev;
      const percent = prev !== 0 ? ((curr - prev) / prev) * 100 : null;
      return { amount, percent };
    }
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
    function computeDelta(curr: number, prev: number) {
      const amount = curr - prev;
      const percent = prev !== 0 ? ((curr - prev) / prev) * 100 : null;
      return { amount, percent };
    }
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
                showComparison={showComparison}
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
                showComparison={showComparison}
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
                showComparison={showComparison}
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
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
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
