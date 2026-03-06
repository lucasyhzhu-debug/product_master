import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function GrowthIndicator({
  current,
  previous,
  invertColor,
}: {
  current: number;
  previous: number;
  invertColor?: boolean;
}) {
  if (previous === 0 && current === 0) {
    return (
      <span className="inline-flex items-center text-xs text-muted-foreground">
        <Minus className="h-3 w-3 mr-0.5" />
        0%
      </span>
    );
  }
  if (previous === 0) {
    return (
      <span className="inline-flex items-center text-xs text-muted-foreground">
        New
      </span>
    );
  }

  const pct = ((current - previous) / previous) * 100;
  const isPositive = pct >= 0;
  const isGood = invertColor ? !isPositive : isPositive;

  return (
    <span className={cn("inline-flex items-center text-xs", isGood ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
      {isPositive ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}
