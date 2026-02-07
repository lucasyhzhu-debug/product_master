import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, ShoppingCart, Store } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  useConvexExternalRevenue,
  useConvexDashboardSalesSummary,
} from "@/hooks/convex";

type PlatformFilter = "all" | "k3mart" | "gobiz";
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

function PlatformBadge({ platform }: { platform: "k3mart" | "gobiz" }) {
  if (platform === "k3mart") {
    return (
      <Badge variant="outline" className="border-blue-500 text-blue-700">
        K3 Mart
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-purple-500 text-purple-700">
      GoBiz
    </Badge>
  );
}

export function OverviewTab() {
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");

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
        <CardHeader>
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingRevenue || revenueRecords === undefined ? (
            <Skeleton className="h-64 w-full" />
          ) : revenueRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">No revenue data available</p>
              <p className="text-xs mt-1">
                Sync data from platforms to see revenue records here
              </p>
            </div>
          ) : (
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
                  {revenueRecords.map((record) => (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
