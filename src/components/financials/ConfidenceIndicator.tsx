import { Calculator, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type Confidence = "exact" | "calculated" | "inferred" | "missing";

/**
 * Inline confidence indicator for financial figures.
 *
 * - exact: no indicator (clean number)
 * - calculated: small calc icon with tooltip
 * - inferred: ~ prefix with tooltip
 * - missing: warning icon with tooltip
 */
export function ConfidenceIndicator({ level }: { level: Confidence }) {
  if (level === "exact") return null;

  if (level === "calculated") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Calculator className="h-3 w-3 inline ml-1 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>
          <p>Calculated: derived from BOM ingredient costs</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (level === "inferred") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground ml-0.5 text-xs cursor-help">
            ~
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>Inferred: estimated from stock delta or indirect data</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // missing
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <AlertTriangle className="h-3 w-3 inline ml-1 text-amber-500 cursor-help" />
      </TooltipTrigger>
      <TooltipContent>
        <p>Missing: data source unavailable or product unmapped</p>
      </TooltipContent>
    </Tooltip>
  );
}
