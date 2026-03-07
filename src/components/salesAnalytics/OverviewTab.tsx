import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShoppingCart,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { utcToWibDateStr } from "@/lib/dateUtils";
import { SalesChart } from "./SalesChart";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  useExternalRevenue,
  useDashboardSalesSummaryByPeriod,
  useSyncK3MartSales,
  useSyncGoBiz,
  useSyncInternalOrders,
  useBigSellerOrderStats,
  type PeriodPreset,
} from "@/hooks/convex";
import { PERIOD_PRESETS, DEFAULT_PERIOD, PERIOD_STORAGE_KEY } from "./overviewUtils";
import { LifetimeHero } from "./LifetimeHero";
import { HeroCards } from "./HeroCards";
import { ChannelSummary } from "./ChannelSummary";
import { PlatformHierarchy } from "./PlatformHierarchy";
import { RevenueTable } from "./RevenueTable";

// ─── Main OverviewTab ───

export function OverviewTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const { data: bigSellerStats } = useBigSellerOrderStats();

  // Period preset from URL, then localStorage, then default
  const savedPeriod = localStorage.getItem(PERIOD_STORAGE_KEY) as PeriodPreset | null;
  const selectedPeriod = (searchParams.get("period") as PeriodPreset) || savedPeriod || DEFAULT_PERIOD;

  const setPeriod = (preset: PeriodPreset) => {
    localStorage.setItem(PERIOD_STORAGE_KEY, preset);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (preset === DEFAULT_PERIOD) {
        next.delete("period");
      } else {
        next.set("period", preset);
      }
      return next;
    }, { replace: true });
  };

  // Fetch data using period-based action (on-demand, not reactive subscription)
  const { data: summary, isLoading: loadingSummary, refresh: refreshSummary } =
    useDashboardSalesSummaryByPeriod(selectedPeriod);

  // Compute period bounds for revenue query from summary (or fall back to hook default)
  // When summary is available, pass its bounds so getRevenue uses the indexed path.
  // When summary is loading, the hook defaults to last 90 days (no unbounded scan).
  const revenuePeriodBounds = useMemo(() => {
    if (selectedPeriod === "allTime") {
      // For allTime, pass a wide range (since 2020-01-01) to use the index
      return { periodStart: Date.UTC(2020, 0, 1), periodEnd: undefined as number | undefined };
    }
    if (summary?.currentPeriod) {
      return {
        periodStart: summary.currentPeriod.periodStart,
        periodEnd: summary.currentPeriod.periodEnd,
      };
    }
    // While summary is loading: hook default (last 90 days) applies via undefined
    return { periodStart: undefined, periodEnd: undefined };
  }, [selectedPeriod, summary?.currentPeriod?.periodStart, summary?.currentPeriod?.periodEnd]);

  const { data: revenueRecords, isLoading: loadingRevenue } =
    useExternalRevenue(
      undefined,
      revenuePeriodBounds.periodStart,
      revenuePeriodBounds.periodEnd
    );

  // Sync date range with period preset (WIB-aware)
  useEffect(() => {
    if (summary) {
      setDateFrom(utcToWibDateStr(summary.currentPeriod.periodStart));
      setDateTo(utcToWibDateStr(summary.currentPeriod.periodEnd));
    }
  }, [summary?.currentPeriod.periodStart, summary?.currentPeriod.periodEnd]);

  // Sync actions
  const syncK3Mart = useSyncK3MartSales();
  const syncGoBiz = useSyncGoBiz();
  const syncInternal = useSyncInternalOrders();

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      const results = await Promise.allSettled([
        syncK3Mart({ triggeredBy: "refresh-all" }),
        syncGoBiz({ triggeredBy: "refresh-all" }),
        syncInternal({ triggeredBy: "refresh-all" }),
      ]);

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      // Reload summary data since it's no longer a reactive subscription
      await refreshSummary();

      if (failed === 0) {
        toast.success(`All 3 sources refreshed successfully`);
      } else {
        toast.warning(`${succeeded}/3 sources refreshed (${failed} failed)`);
      }
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  // Loading state
  if (loadingSummary || summary === undefined) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Stats from dashboard summary
  const { currentPeriod, previousPeriod } = summary;

  return (
    <div className="space-y-6">
      {/* Lifetime Hero -- always shows all-time data, unaffected by period selector */}
      <LifetimeHero />

      {/* Period Filter Bar + Refresh Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {PERIOD_PRESETS.map((p) => (
            <Badge
              key={p.value}
              variant={selectedPeriod === p.value ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </Badge>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshAll}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing..." : "Refresh All"}
        </Button>
      </div>

      {/* Row 1: Gross Sales, Net Sales, Commissions Paid, Discounts Given, Delivery Fees */}
      <HeroCards currentPeriod={currentPeriod} previousPeriod={previousPeriod} />

      {/* Row 2: Channel Summary (driver tree) */}
      <ChannelSummary
        currentPeriod={currentPeriod}
        previousPeriod={previousPeriod}
      />

      {/* Revenue Chart */}
      <SalesChart preset={selectedPeriod} defaultExpanded={true} />

      {/* Platform -> Outlet Hierarchy */}
      <PlatformHierarchy preset={selectedPeriod} />

      {/* BigSeller COGS Caveat */}
      {bigSellerStats?.allCostFeeZero && bigSellerStats.totalOrders > 0 && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-status-warning)] bg-[var(--color-status-warning-bg)] border border-[var(--color-status-warning)]/30 rounded-md px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            BigSeller profit margins not available &mdash; COGS not configured in BigSeller.
            Shopee and Tokopedia revenue shown as gross only.
          </span>
        </div>
      )}

      {/* Revenue Table */}
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Sales Details</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">From</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">To</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingRevenue || revenueRecords === undefined ? (
            <Skeleton className="h-64 w-full" />
          ) : revenueRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-full p-4 mb-4">
                <ShoppingCart className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-base font-semibold mb-2">No Revenue Data Yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                Connect your sales platforms and run your first sync to see revenue analytics here.
                This usually takes less than 2 minutes.
              </p>
              <Button
                variant="default"
                onClick={() => navigate("/sales?tab=settings")}
                className="gap-2"
              >
                Go to Settings & Sync
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <RevenueTable
              records={revenueRecords}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
