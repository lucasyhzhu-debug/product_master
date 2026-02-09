import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StockStatusBadge } from "./StockStatusBadge";

type ChannelProduct = {
  productKey: string;
  productName: string;
  currentStock?: number;
  dailyRate: number;
  daysRemaining?: number;
  status?: "critical" | "warning" | "ok";
};

interface ChannelCardProps {
  type: "k3mart" | "gobiz" | "internal";
  outletName?: string;
  lastSnapshotAt?: number;
  products: ChannelProduct[];
  criticalCount?: number;
  warningCount?: number;
  totalDailyDemand: number;
  onClick: () => void;
  isSelected: boolean;
}

const channelLabels: Record<string, string> = {
  k3mart: "K3 Mart",
  gobiz: "GoBiz",
  internal: "Internal",
};

const channelColors: Record<string, string> = {
  k3mart: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
  gobiz: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  internal: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
};

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "Never";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ChannelCard({
  type,
  outletName,
  lastSnapshotAt,
  products,
  criticalCount,
  warningCount,
  totalDailyDemand,
  onClick,
  isSelected,
}: ChannelCardProps) {
  // Top 3 products by urgency (K3 Mart: lowest days remaining) or demand (others: highest daily rate)
  const topProducts = [...products]
    .sort((a, b) => {
      if (type === "k3mart") return (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0);
      return b.dailyRate - a.dailyRate;
    })
    .slice(0, 3);

  // For K3 Mart: find the lowest days remaining for health display
  const lowestDaysRemaining = type === "k3mart" && products.length > 0
    ? Math.min(...products.filter((p) => p.daysRemaining !== undefined).map((p) => p.daysRemaining!))
    : undefined;

  const worstStatus = criticalCount && criticalCount > 0
    ? "critical"
    : warningCount && warningCount > 0
      ? "warning"
      : "ok";

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", channelColors[type])}>
              {channelLabels[type]}
            </Badge>
            {outletName && (
              <CardTitle className="text-base">{outletName}</CardTitle>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Health summary */}
        <div className="flex items-center justify-between">
          {type === "k3mart" ? (
            <>
              <div className="flex items-center gap-2">
                <StockStatusBadge
                  status={worstStatus as "critical" | "warning" | "ok"}
                  daysRemaining={lowestDaysRemaining !== Infinity ? lowestDaysRemaining : undefined}
                />
                <span className="text-sm text-muted-foreground">
                  {products.reduce((sum, p) => sum + (p.currentStock ?? 0), 0)} units in stock
                </span>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              {products.length} product{products.length !== 1 ? "s" : ""} tracked
            </div>
          )}
          <div className="text-sm font-medium">
            {totalDailyDemand}/day
          </div>
        </div>

        {/* K3 Mart alert counts */}
        {type === "k3mart" && (criticalCount! > 0 || warningCount! > 0) && (
          <div className="flex gap-3 text-xs">
            {criticalCount! > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {criticalCount} critical
              </span>
            )}
            {warningCount! > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {warningCount} low
              </span>
            )}
          </div>
        )}

        {/* Top products */}
        {topProducts.length > 0 && (
          <div className="space-y-1.5">
            {topProducts.map((p) => (
              <div key={p.productKey} className="flex items-center justify-between text-sm">
                <span className="truncate max-w-[60%] text-muted-foreground">{p.productName}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{p.dailyRate}/d</span>
                  {p.status && (
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        p.status === "critical" && "bg-red-500",
                        p.status === "warning" && "bg-amber-500",
                        p.status === "ok" && "bg-green-500"
                      )}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Last synced */}
        <p className="text-xs text-muted-foreground pt-1 border-t">
          Synced {formatRelativeTime(lastSnapshotAt)}
        </p>
      </CardContent>
    </Card>
  );
}
