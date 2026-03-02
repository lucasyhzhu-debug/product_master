import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { getPlatformPalette } from "@/lib/platformColors";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ConfidenceIndicator,
  type Confidence,
} from "@/components/financials/ConfidenceIndicator";
import { DeltaIndicator } from "@/lib/financialHelpers";

export interface ChannelRowProps {
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

export function ChannelRow({
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
            <span
              className={cn(
                "inline-block w-2.5 h-2.5 rounded-full shrink-0",
                palette.dot
              )}
            />
            {isConsignment ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help border-b border-dashed border-muted-foreground/40">
                    {channel.displayName}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-[260px]">
                    Accrual basis -- revenue recognized by settlement period, not
                    payment receipt date
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
                      ? "text-[var(--color-status-success)]"
                      : "text-[var(--color-status-error)]"
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
            <td
              colSpan={4}
              className="py-1 pl-16 text-xs text-muted-foreground"
            >
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
