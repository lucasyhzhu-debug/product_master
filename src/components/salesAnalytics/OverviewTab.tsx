import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, TrendingUp, ShoppingCart, Store, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  useConvexExternalRevenue,
  useConvexDashboardSalesSummary,
} from "@/hooks/convex";

type PlatformFilter = "all" | "k3mart" | "gobiz" | "internal";
type ConfidenceLevel = "exact" | "inferred" | "manual";

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
  }>;
  dateFrom: string;
  dateTo: string;
}) {
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
            <th className="text-left py-3 px-2 font-medium">Date</th>
            <th className="text-left py-3 px-2 font-medium">Platform</th>
            <th className="text-left py-3 px-2 font-medium">Product</th>
            <th className="text-right py-3 px-2 font-medium">Qty</th>
            <th className="text-right py-3 px-2 font-medium">Gross</th>
            <th className="text-right py-3 px-2 font-medium">Net</th>
            <th className="text-left py-3 px-2 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((record) => (
            <tr key={record._id} className="border-b hover:bg-muted/50">
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OverviewTab() {
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const navigate = useNavigate();

  // Fetch data
  const { data: summary, isLoading: loadingSummary } =
    useConvexDashboardSalesSummary();
  const { data: revenueRecords, isLoading: loadingRevenue } =
    useConvexExternalRevenue(
      platformFilter === "all" ? undefined : platformFilter
    );

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

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
