import { useState, Component, type ErrorInfo, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  useConvexDashboardSalesSummary,
  useConvexSyncK3MartSales,
  useConvexSyncGoBiz,
  useConvexSyncInternalOrders,
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
  // More visible status colors and indicators
  const statusColor = lastSyncError
    ? "bg-red-500"
    : isActive
    ? "bg-green-500"
    : "bg-amber-500"; // Changed from gray-400 to amber for better visibility

  const statusText = lastSyncError
    ? "Error"
    : lastSyncAt
    ? formatRelativeTime(lastSyncAt)
    : "Not synced yet"; // More explicit than "Never synced"

  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/30">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2.5 h-2.5 rounded-full ${statusColor} flex-shrink-0`} />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{name}</div>
          <div className={`text-xs ${lastSyncError ? "text-red-600 font-medium" : !lastSyncAt ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
            {statusText}
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
  const syncK3MartSales = useConvexSyncK3MartSales();
  const syncGoBiz = useConvexSyncGoBiz();
  const syncInternal = useConvexSyncInternalOrders();

  const [isSyncingK3, setIsSyncingK3] = useState(false);
  const [isSyncingGoBiz, setIsSyncingGoBiz] = useState(false);
  const [isSyncingInternal, setIsSyncingInternal] = useState(false);

  if (isLoading || !data) {
    return <SalesWidgetSkeleton />;
  }

  const handleSyncK3Mart = async () => {
    setIsSyncingK3(true);
    try {
      const result = await syncK3MartSales({ triggeredBy: "dashboard" });
      if (result.success) {
        toast.success(`K3 Mart: ${result.newTransactions} new sales synced`);
      } else {
        toast.error(`K3 Mart sync failed: ${result.error || "Unknown error"}`);
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
        toast.success(`GoBiz sync complete: ${result.totalTransactions ?? 0} transactions`);
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

  const handleSyncInternal = async () => {
    setIsSyncingInternal(true);
    try {
      const result = await syncInternal({ triggeredBy: "dashboard" });
      if (result.success) {
        toast.success(`Internal: ${result.newTransactions} new orders synced`);
      } else {
        toast.error(`Internal sync failed: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Internal sync error:", error);
      toast.error(
        `Internal sync failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsSyncingInternal(false);
    }
  };

  const { platforms, recentRevenue } = data;

  // Extract platform status from last sync logs
  const k3LastSync = platforms.k3mart.lastSync;
  const gobizLastSync = platforms.gobiz.lastSync;
  const internalLastSync = platforms.internal.lastSync;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Sales Integration</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Revenue Summary - Prominent Display for Cofounder */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Gross Revenue</div>
            <div className="text-xl font-bold text-foreground">
              {formatCurrency(recentRevenue.totalGross)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Net Revenue</div>
            <div className="text-xl font-bold text-emerald-600">
              {formatCurrency(recentRevenue.totalNet)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Transactions</div>
            <div className="text-xl font-bold text-foreground">
              {recentRevenue.totalTransactions}
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">{recentRevenue.periodLabel}</div>

        {/* Platform Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
          <PlatformRow
            name="Internal"
            lastSyncAt={internalLastSync?.timestamp ?? null}
            lastSyncError={internalLastSync?.status === "error" ? (internalLastSync.errorMessage ?? "Sync failed") : null}
            isActive={internalLastSync?.status === "success"}
            onSync={handleSyncInternal}
            isSyncing={isSyncingInternal}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Error boundary that prevents SalesWidget crashes from taking down the whole dashboard.
 */
class SalesWidgetErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SalesWidget error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales Integration</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sales data temporarily unavailable. Try refreshing the page.
            </p>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

export function SafeSalesWidget() {
  return (
    <SalesWidgetErrorBoundary>
      <SalesWidget />
    </SalesWidgetErrorBoundary>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="h-16 bg-muted animate-pulse rounded" />
          <div className="h-16 bg-muted animate-pulse rounded" />
          <div className="h-16 bg-muted animate-pulse rounded" />
        </div>
      </CardContent>
    </Card>
  );
}
