import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  useConvexDashboardSalesSummary,
  useConvexSyncK3Mart,
  useConvexSyncGoBiz,
} from "@/hooks/convex";
import { formatCurrency } from "@/lib/utils";

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

interface PlatformRowProps {
  name: string;
  lastSyncAt: number | null;
  lastSyncError: string | null;
  isActive: boolean;
  onSync: () => void;
  isSyncing: boolean;
}

function PlatformRow({
  name,
  lastSyncAt,
  lastSyncError,
  isActive,
  onSync,
  isSyncing,
}: PlatformRowProps) {
  const statusColor = lastSyncError
    ? "bg-red-500"
    : isActive
    ? "bg-green-500"
    : "bg-gray-400";

  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/30">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full ${statusColor} flex-shrink-0`} />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{name}</div>
          <div className="text-xs text-muted-foreground">
            {lastSyncAt ? formatRelativeTime(lastSyncAt) : "Never synced"}
          </div>
          {lastSyncError && (
            <Badge variant="destructive" className="text-xs mt-1">
              {lastSyncError}
            </Badge>
          )}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onSync}
        disabled={isSyncing}
        className="flex-shrink-0"
      >
        {isSyncing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

export function SalesWidget() {
  const { data, isLoading } = useConvexDashboardSalesSummary();
  const syncK3Mart = useConvexSyncK3Mart();
  const syncGoBiz = useConvexSyncGoBiz();

  const [isSyncingK3, setIsSyncingK3] = useState(false);
  const [isSyncingGoBiz, setIsSyncingGoBiz] = useState(false);

  if (isLoading || !data) {
    return <SalesWidgetSkeleton />;
  }

  const handleSyncK3Mart = async () => {
    setIsSyncingK3(true);
    try {
      const result = await syncK3Mart({ triggeredBy: "dashboard" });
      if (result.success) {
        toast.success(`K3 Mart sync complete: ${result.totalProducts ?? 0} products`);
      } else {
        toast.error(`K3 Mart sync failed: ${result.errors?.join(", ") || "Unknown error"}`);
      }
    } catch (error) {
      console.error("K3 Mart sync error:", error);
      toast.error(
        `K3 Mart sync failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsSyncingK3(false);
    }
  };

  const handleSyncGoBiz = async () => {
    setIsSyncingGoBiz(true);
    try {
      const result = await syncGoBiz({ triggeredBy: "dashboard" });
      if (result.success) {
        toast.success(`GoBiz sync complete: ${result.transactionCount ?? 0} transactions`);
      } else {
        toast.error(`GoBiz sync failed: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("GoBiz sync error:", error);
      toast.error(
        `GoBiz sync failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsSyncingGoBiz(false);
    }
  };

  const { platforms, recentRevenue } = data;

  // Extract platform status from last sync logs
  const k3LastSync = platforms.k3mart.lastSync;
  const gobizLastSync = platforms.gobiz.lastSync;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Sales Integration</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm text-muted-foreground">
            {formatCurrency(recentRevenue.totalGross)} gross · {formatCurrency(recentRevenue.totalNet)} net ·{" "}
            {recentRevenue.totalTransactions} transactions
          </div>
          <div className="text-xs text-muted-foreground mt-1">{recentRevenue.periodLabel}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PlatformRow
            name="K3 Mart"
            lastSyncAt={k3LastSync?.timestamp ?? null}
            lastSyncError={k3LastSync?.status === "error" ? (k3LastSync.errorMessage ?? "Sync failed") : null}
            isActive={platforms.k3mart.activeOutlets > 0}
            onSync={handleSyncK3Mart}
            isSyncing={isSyncingK3}
          />
          <PlatformRow
            name="GoBiz"
            lastSyncAt={gobizLastSync?.timestamp ?? null}
            lastSyncError={gobizLastSync?.status === "error" ? (gobizLastSync.errorMessage ?? "Sync failed") : null}
            isActive={platforms.gobiz.activeOutlets > 0}
            onSync={handleSyncGoBiz}
            isSyncing={isSyncingGoBiz}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function SalesWidgetSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        <div className="h-4 w-4 bg-muted animate-pulse rounded" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="h-4 w-full bg-muted animate-pulse rounded" />
          <div className="h-3 w-24 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="h-16 bg-muted animate-pulse rounded" />
          <div className="h-16 bg-muted animate-pulse rounded" />
        </div>
      </CardContent>
    </Card>
  );
}
