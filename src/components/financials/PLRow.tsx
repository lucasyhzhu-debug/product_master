import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ConfidenceIndicator,
  type Confidence,
} from "@/components/financials/ConfidenceIndicator";
import {
  formatWithConfidence,
  formatNegative,
  DeltaIndicator,
} from "@/lib/financialHelpers";
import { formatCurrency } from "@/lib/utils";

export interface PLRowProps {
  label: string;
  currentAmount: number;
  previousAmount: number;
  delta: { amount: number; percent: number | null } | null;
  isNegative?: boolean;
  invertColor?: boolean;
  indent?: number; // 0 = section header, 1 = line item, 2 = sub-item
  isBold?: boolean;
  confidence?: Confidence;
  showComparison: boolean;
  isTopBorder?: boolean;
  labelTooltip?: string;
}

export function PLRow({
  label,
  currentAmount,
  previousAmount,
  delta,
  isNegative = false,
  invertColor = false,
  indent = 1,
  isBold = false,
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
