/**
 * Shared constants, helpers, and sub-components for the Income Statement feature.
 *
 * Extracted from FinancialStatement.tsx (Plan 33-04) to reduce page size and
 * deduplicate logic shared with csvExport.ts and useFinancials.ts.
 */

import {
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type Confidence } from "@/components/financials/ConfidenceIndicator";

// ── Shared constants ──
// NOTE: These MUST stay in sync with convex/lib/periodRange.ts (canonical backend).
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Re-export Confidence type for consumers
export type { Confidence };

// ── computeDelta (shared between UI and CSV export) ──

export function computeDelta(
  curr: number,
  prev: number
): { amount: number; percent: number | null } {
  const amount = curr - prev;
  const percent = prev !== 0 ? ((curr - prev) / prev) * 100 : null;
  return { amount, percent };
}

// ── Format helpers ──

export function formatWeekRange(weekStartUtc: number): string {
  const startWib = new Date(weekStartUtc + WIB_OFFSET_MS);
  const endWib = new Date(weekStartUtc + WEEK_MS + WIB_OFFSET_MS - 1);
  const startMonth = startWib.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const endMonth = endWib.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const startDay = startWib.getUTCDate();
  const endDay = endWib.getUTCDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

/** Format amount with parentheses for negative display (accounting convention). */
export function formatNegative(amount: number): string {
  if (amount === 0) return formatCurrency(0);
  return `(${formatCurrency(Math.abs(amount))})`;
}

/** Format amount with confidence awareness. Missing COGS shows "--" with warning icon. */
export function formatWithConfidence(
  amount: number,
  confidence: Confidence | undefined,
  isNegative: boolean
): React.ReactNode {
  const formatAmount = isNegative ? formatNegative : formatCurrency;

  if (confidence === "missing") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        --
        <AlertTriangle className="h-3 w-3 text-[var(--color-status-warning)]" />
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

export function DeltaIndicator({
  delta,
  invertColor,
  unit = "%",
}: {
  delta: { amount: number; percent: number | null } | null;
  invertColor?: boolean;
  unit?: string; // defaults to "%", use "pp" for percentage points
}) {
  if (!delta) return <span className="text-muted-foreground">-</span>;

  const { amount, percent } = delta;

  if (amount === 0 && (percent === null || percent === 0)) {
    return (
      <span className="inline-flex items-center text-xs text-muted-foreground">
        <Minus className="h-3 w-3 mr-0.5" />
        0{unit}
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
  const precision = unit === "pp" ? 1 : 0;

  return (
    <span
      className={cn(
        "inline-flex items-center text-xs",
        isGood
          ? "text-[var(--color-status-success)]"
          : "text-[var(--color-status-error)]"
      )}
    >
      {isPositive ? (
        <ArrowUpRight className="h-3 w-3 mr-0.5" />
      ) : (
        <ArrowDownRight className="h-3 w-3 mr-0.5" />
      )}
      {Math.abs(percent).toFixed(precision)}{unit}
    </span>
  );
}

// ── Section header row (collapsible) ──

export function SectionHeaderRow({
  label,
  isExpanded,
  onToggle,
  labelTooltip,
}: {
  label: string;
  isExpanded: boolean;
  onToggle: () => void;
  labelTooltip?: string;
}) {
  return (
    <tr className="border-t bg-muted/50">
      <td
        colSpan={4}
        className="py-2 pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none"
        onClick={onToggle}
      >
        <span className="inline-flex items-center gap-1">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
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

// ── Loading skeleton ──

export function PLTableSkeleton() {
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

export function ErrorCard({ onRetry }: { onRetry: () => void }) {
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
