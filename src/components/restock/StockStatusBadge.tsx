import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StockStatusBadgeProps {
  status: "critical" | "warning" | "ok";
  daysRemaining?: number;
}

export function StockStatusBadge({ status, daysRemaining }: StockStatusBadgeProps) {
  const label =
    status === "critical"
      ? "Critical"
      : status === "warning"
        ? "Low"
        : "OK";

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium",
        status === "critical" && "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400",
        status === "warning" && "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        status === "ok" && "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
      )}
    >
      <span
        className={cn(
          "inline-block w-1.5 h-1.5 rounded-full mr-1.5",
          status === "critical" && "bg-red-500",
          status === "warning" && "bg-amber-500",
          status === "ok" && "bg-green-500"
        )}
      />
      {label}
      {daysRemaining !== undefined && ` (${daysRemaining}d)`}
    </Badge>
  );
}
