import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Store,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Percent,
  RefreshCw,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  useConvexExternalRevenue,
  useConvexDashboardSalesSummary,
  useConvexRevenueItems,
  useConvexSyncK3MartSales,
  useConvexSyncGoBiz,
  useConvexSyncInternalOrders,
} from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";

type PlatformFilter = "all" | "k3mart" | "gobiz" | "internal";
type ConfidenceLevel = "exact" | "inferred" | "manual";
type MatchConfidence = "exact" | "price_only" | "name_only" | "none";

function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  switch (confidence) {
    case "exact":
      return (
        <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
          Exact
        </Badge>
      );
    case "inferred":
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
          Inferred
        </Badge>
      );
    case "manual":
      return <Badge variant="outline">Manual</Badge>;
    default:
      return null;
  }
}

function MatchStatusBadge({ status }: { status?: MatchConfidence | null }) {
  switch (status) {
    case "exact":
      return (
        <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
          Matched
        </Badge>
      );
    case "price_only":
      return (
        <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50">
          Price Match
        </Badge>
      );
    case "name_only":
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-700 bg-yellow-50">
          Name Match
        </Badge>
      );
    case "none":
      return (
        <Badge variant="outline" className="border-gray-400 text-gray-600 bg-gray-50">
          Unmatched
        </Badge>
      );
    default:
      return null;
  }
}

function PlatformBadge({ platform }: { platform: "k3mart" | "gobiz" | "internal" }) {
  if (platform === "k3mart") {
    return (
      <Badge variant="outline" className="border-blue-500 text-blue-700">
        K3 Mart
      </Badge>
    );
  }
  if (platform === "internal") {
    return (
      <Badge variant="outline" className="border-emerald-500 text-emerald-700">
        Internal
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-purple-500 text-purple-700">
      GoBiz
    </Badge>
  );
}

function ExpandedRevenueItems({ revenueId }: { revenueId: Id<"externalRevenue"> }) {
  const { data: items, isLoading } = useConvexRevenueItems(revenueId);

  if (isLoading) {
    return (
      <tr>
        <td colSpan={9} className="py-3 px-2">
          <Skeleton className="h-16 w-full" />
        </td>
      </tr>
    );
  }

  if (!items || items.length === 0) {
    return (
      <tr>
        <td colSpan={9} className="py-3 px-6 text-sm text-muted-foreground">
          No item details available.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={9} className="p-0">
        <div className="bg-muted/30 px-6 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-medium">Product</th>
                <th className="text-right py-2 px-2 font-medium">Qty</th>
                <th className="text-right py-2 px-2 font-medium">Unit Price</th>
                <th className="text-right py-2 px-2 font-medium">Total</th>
                <th className="text-left py-2 px-2 font-medium">Match</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className="border-b border-muted">
                  <td className="py-2 px-2">
                    {item.menuProductName ? (
                      <span>
                        {item.productName}
                        <span className="text-muted-foreground ml-1">
                          → {item.menuProductName}
                        </span>
                      </span>
                    ) : (
                      item.productName
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">{item.quantity}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 px-2 text-right font-medium">
                    {formatCurrency(item.totalPrice)}
                  </td>
                  <td className="py-2 px-2">
                    <MatchStatusBadge status={item.matchConfidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

function RevenueTable({
  records,
  dateFrom,
  dateTo,
}: {
  records: Array<{
    _id: string;
    periodStart: number;
    source: "k3mart" | "gobiz" | "internal";
    productName?: string;
    quantitySold?: number;
    revenueGross?: number;
    revenueNet?: number;
    confidence: ConfidenceLevel;
    gobizOrderNumber?: string;
    customerStoreName?: string;
  }>;
  dateFrom: string;
  dateTo: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = records.filter((r) => {
    if (dateFrom && r.periodStart < new Date(dateFrom).getTime()) return false;
    if (dateTo && r.periodStart > new Date(dateTo + "T23:59:59").getTime()) return false;
    return true;
  });

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No records match the selected date range.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="w-8 py-3 px-1"></th>
            <th className="text-left py-3 px-2 font-medium">Date</th>
            <th className="text-left py-3 px-2 font-medium">Platform</th>
            <th className="text-left py-3 px-2 font-medium">Customer/Store</th>
            <th className="text-left py-3 px-2 font-medium">Product</th>
            <th className="text-right py-3 px-2 font-medium">Qty</th>
            <th className="text-right py-3 px-2 font-medium">Gross</th>
            <th className="text-right py-3 px-2 font-medium">Net</th>
            <th className="text-left py-3 px-2 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((record) => {
            const isExpandable = record.source === "gobiz" && !!record.gobizOrderNumber;
            const isExpanded = expandedId === record._id;

            return (
              <>
                <tr
                  key={record._id}
                  className={`border-b hover:bg-muted/50 ${isExpandable ? "cursor-pointer" : ""}`}
                  onClick={isExpandable ? () => setExpandedId(isExpanded ? null : record._id) : undefined}
                >
                  <td className="py-3 px-1">
                    {isExpandable && (
                      isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="py-3 px-2">
                    {new Date(record.periodStart).toLocaleDateString("id-ID", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="py-3 px-2">
                    <PlatformBadge platform={record.source} />
                  </td>
                  <td className="py-3 px-2 text-muted-foreground text-xs">
                    {record.customerStoreName || "\u2014"}
                  </td>
                  <td className="py-3 px-2">
                    {record.productName || "(all)"}
                  </td>
                  <td className="py-3 px-2 text-right">
                    {record.quantitySold || "\u2014"}
                  </td>
                  <td className="py-3 px-2 text-right font-medium">
                    {record.revenueGross
                      ? formatCurrency(record.revenueGross)
                      : "\u2014"}
                  </td>
                  <td className="py-3 px-2 text-right">
                    {record.revenueNet
                      ? formatCurrency(record.revenueNet)
                      : "\u2014"}
                  </td>
                  <td className="py-3 px-2">
                    <ConfidenceBadge confidence={record.confidence} />
                  </td>
                </tr>
                {isExpanded && (
                  <ExpandedRevenueItems
                    key={`${record._id}-items`}
                    revenueId={record._id as Id<"externalRevenue">}
                  />
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OverviewTab() {
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  // Fetch data
  const { data: summary, isLoading: loadingSummary } =
    useConvexDashboardSalesSummary();
  const { data: revenueRecords, isLoading: loadingRevenue } =
    useConvexExternalRevenue(
      platformFilter === "all" ? undefined : platformFilter
    );

  // Sync actions
  const syncK3Mart = useConvexSyncK3MartSales();
  const syncGoBiz = useConvexSyncGoBiz();
  const syncInternal = useConvexSyncInternalOrders();

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
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
  const totalActiveOutlets =
    summary.platforms.k3mart.activeOutlets + summary.platforms.gobiz.activeOutlets;
  const totalOutlets =
    summary.platforms.k3mart.outletCount + summary.platforms.gobiz.outletCount;
  const hasCommission = (summary.recentRevenue.totalCommission ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Refresh All Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshAll}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh All"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className={`grid gap-4 md:grid-cols-2 ${hasCommission ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.recentRevenue.totalGross)}
            </div>
            <p className="text-xs text-muted-foreground">{summary.recentRevenue.periodLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.recentRevenue.totalNet)}
            </div>
            <p className="text-xs text-muted-foreground">{summary.recentRevenue.periodLabel}</p>
          </CardContent>
        </Card>

        {hasCommission && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Commission</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(summary.recentRevenue.totalCommission ?? 0)}
              </div>
              <div className="space-y-0.5">
                {(summary.recentRevenue.totalAdBurn ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Ad burn: {formatCurrency(summary.recentRevenue.totalAdBurn ?? 0)}
                  </p>
                )}
                {(summary.recentRevenue.totalPromoBurn ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Promo burn: {formatCurrency(summary.recentRevenue.totalPromoBurn ?? 0)}
                  </p>
                )}
                {(summary.recentRevenue.totalAdBurn ?? 0) === 0 && (summary.recentRevenue.totalPromoBurn ?? 0) === 0 && (
                  <p className="text-xs text-muted-foreground">{summary.recentRevenue.periodLabel}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.recentRevenue.totalTransactions}</div>
            <p className="text-xs text-muted-foreground">{summary.recentRevenue.periodLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Outlets</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalActiveOutlets}</div>
            <p className="text-xs text-muted-foreground">
              {totalOutlets} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Table */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle>Revenue Details</CardTitle>
            <div className="flex gap-2">
              <Badge
                variant={platformFilter === "all" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setPlatformFilter("all")}
              >
                All
              </Badge>
              <Badge
                variant={platformFilter === "k3mart" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setPlatformFilter("k3mart")}
              >
                K3 Mart
              </Badge>
              <Badge
                variant={platformFilter === "gobiz" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setPlatformFilter("gobiz")}
              >
                GoBiz
              </Badge>
              <Badge
                variant={platformFilter === "internal" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setPlatformFilter("internal")}
              >
                Internal
              </Badge>
            </div>
          </div>
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
              <div className="bg-amber-50 border border-amber-200 rounded-full p-4 mb-4">
                <ShoppingCart className="h-8 w-8 text-amber-600" />
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
            <RevenueTable records={revenueRecords} dateFrom={dateFrom} dateTo={dateTo} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
