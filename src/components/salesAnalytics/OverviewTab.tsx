import { useState, useEffect, useMemo, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronDown,
  ChevronRight,
  Percent,
  RefreshCw,
  ExternalLink,
  TagIcon,
  Truck,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { SalesChart } from "./SalesChart";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  useExternalRevenue,
  useDashboardSalesSummaryByPeriod,
  useRevenueItems,
  useOrderDetailsByOrderNumber,
  useSyncK3MartSales,
  useSyncGoBiz,
  useSyncInternalOrders,
  useRevenueByOutlet,
  type PeriodPreset,
} from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";

type PlatformFilter = "all" | "k3mart" | "gobiz" | "internal";
type ConfidenceLevel = "exact" | "inferred" | "manual";
type MatchConfidence = "exact" | "price_only" | "name_only" | "none";

const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "past24hours", label: "Past 24h" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "thisWeek", label: "This Week" },
  { value: "last7days", label: "Last 7 Days" },
  { value: "last30days", label: "Last 30 Days" },
  { value: "thisMonth", label: "This Month" },
  { value: "allTime", label: "All Time" },
];

const DEFAULT_PERIOD: PeriodPreset = "last7days";
const PERIOD_STORAGE_KEY = "frollie:salesPeriod";
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Convert UTC epoch ms to a WIB date string (YYYY-MM-DD) */
function utcToWibDateStr(utcMs: number): string {
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().split("T")[0];
}

/** Convert WIB date string to UTC epoch ms at WIB midnight */
function wibDateStrToUtcMs(dateStr: string): number {
  return new Date(dateStr).getTime() - WIB_OFFSET_MS;
}

// ─── Small helper components ───

function GrowthIndicator({ current, previous, invertColor }: { current: number; previous: number; invertColor?: boolean }) {
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

function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  switch (confidence) {
    case "exact":
      return (
        <Badge variant="default" className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800">
          Exact
        </Badge>
      );
    case "inferred":
      return (
        <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800">
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
        <Badge variant="outline" className="border-green-500 dark:border-green-600 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30">
          Matched
        </Badge>
      );
    case "price_only":
      return (
        <Badge variant="outline" className="border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
          Price Match
        </Badge>
      );
    case "name_only":
      return (
        <Badge variant="outline" className="border-yellow-500 dark:border-yellow-600 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30">
          Name Match
        </Badge>
      );
    case "none":
      return (
        <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground bg-muted/50">
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
      <Badge variant="outline" className="border-purple-500 dark:border-purple-600 text-purple-700 dark:text-purple-400">
        K3 Mart
      </Badge>
    );
  }
  if (platform === "internal") {
    return (
      <Badge variant="outline" className="border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400">
        Local
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-red-500 dark:border-red-600 text-red-700 dark:text-red-400">
      GoBiz
    </Badge>
  );
}

// ─── Expanded row components ───

function ExpandedRevenueItems({ revenueId }: { revenueId: Id<"externalRevenue"> }) {
  const { data: items, isLoading } = useRevenueItems(revenueId);

  if (isLoading) {
    return (
      <tr>
        <td colSpan={10} className="py-3 px-2">
          <Skeleton className="h-16 w-full" />
        </td>
      </tr>
    );
  }

  if (!items || items.length === 0) {
    return (
      <tr>
        <td colSpan={10} className="py-3 px-6 text-sm text-muted-foreground">
          No item details available.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={10} className="p-0">
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

function ExpandedInternalOrder({ orderNumber }: { orderNumber: string }) {
  const { data: order, isLoading } = useOrderDetailsByOrderNumber(orderNumber);

  if (isLoading) {
    return (
      <tr>
        <td colSpan={10} className="py-3 px-2">
          <Skeleton className="h-16 w-full" />
        </td>
      </tr>
    );
  }

  if (!order) {
    return (
      <tr>
        <td colSpan={10} className="py-3 px-6 text-sm text-muted-foreground">
          Order not found.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={10} className="p-0">
        <div className="bg-muted/30 px-6 py-3 space-y-3">
          {/* Order header */}
          <div className="flex items-center gap-4 text-xs">
            <span className="font-medium">{order.customerName}</span>
            {order.channel && (
              <Badge variant="outline" className="text-xs">{order.channel}</Badge>
            )}
            <Badge variant="secondary" className="text-xs">{order.status}</Badge>
            <span className="text-muted-foreground">{order.deliveryType}</span>
          </div>

          {/* Items table */}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-medium">Product</th>
                <th className="text-right py-2 px-2 font-medium">Qty</th>
                <th className="text-right py-2 px-2 font-medium">Unit Price</th>
                <th className="text-right py-2 px-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, i) => (
                <tr key={i} className="border-b border-muted">
                  <td className="py-2 px-2">
                    {item.productName}
                    {item.productVariant && (
                      <span className="text-muted-foreground ml-1">({item.productVariant})</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">{item.quantity}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 px-2 text-right font-medium">{formatCurrency(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Discount/voucher info + link */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3 text-muted-foreground">
              {(order.orderLevelDiscount ?? 0) > 0 && (
                <span>
                  Discount: {order.orderLevelDiscountType === "percentage"
                    ? `${order.orderLevelDiscount}%`
                    : formatCurrency(order.orderLevelDiscount ?? 0)}
                </span>
              )}
              {order.voucherCode && (
                <span>
                  Voucher: {order.voucherCode}
                  {order.voucherDiscountValue ? ` (-${formatCurrency(order.voucherDiscountValue)})` : ""}
                </span>
              )}
            </div>
            <Link
              to={`/orders/${order.orderId}`}
              className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              View Full Order
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── K3 Mart store group header ───

type RevenueRecord = {
  _id: string;
  periodStart: number;
  transactionDate?: number;
  source: "k3mart" | "gobiz" | "internal";
  productName?: string;
  quantitySold?: number;
  revenueGross?: number;
  revenueNet?: number;
  confidence: ConfidenceLevel;
  gobizOrderNumber?: string;
  externalTransactionId?: string;
  customerStoreName?: string;
};

function StoreGroupHeader({
  storeName,
  records,
  isExpanded,
  onToggle,
}: {
  storeName: string;
  records: RevenueRecord[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const totalGross = records.reduce((sum, r) => sum + (r.revenueGross ?? 0), 0);
  const txnCount = records.length;

  return (
    <tr
      className="border-b bg-muted/20 cursor-pointer hover:bg-muted/40"
      onClick={onToggle}
    >
      <td className="py-2 px-1">
        {isExpanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </td>
      <td colSpan={6} className="py-2 px-2 font-medium text-sm">
        {storeName}
        <span className="text-xs text-muted-foreground ml-2">
          ({txnCount} transaction{txnCount !== 1 ? "s" : ""})
        </span>
      </td>
      <td className="py-2 px-2 text-right font-medium text-sm">
        {formatCurrency(totalGross)}
      </td>
      <td colSpan={2}></td>
    </tr>
  );
}

// ─── Channel Summary (driver tree) ───

type ChannelMetrics = {
  gross: number;
  net: number;
  transactions: number;
};

type PeriodData = {
  totalGross: number;
  totalNet: number;
  totalTransactions: number;
  totalCommission?: number;
  totalDiscounts?: number;
  totalDeliveryFees?: number;
  platformGross?: number;
  internalGross?: number;
  channels?: {
    k3mart: ChannelMetrics;
    gobiz: ChannelMetrics;
    internal: ChannelMetrics;
  };
  periodLabel?: string;
  comparisonLabel?: string;
};

function ChannelSummary({
  currentPeriod,
  previousPeriod,
  totalActiveOutlets,
  totalOutlets,
  outletsByChannel,
}: {
  currentPeriod: PeriodData;
  previousPeriod: PeriodData;
  totalActiveOutlets: number;
  totalOutlets: number;
  outletsByChannel: { k3mart: number; gobiz: number; internal: number };
}) {
  const channels = currentPeriod.channels;
  const prevChannels = previousPeriod.channels;

  // Build the 4 segments: All, K3 Mart, GoBiz, Internal
  const segments: {
    key: string;
    label: string;
    outlets: number;
    colorClass: string;
    dotClass: string;
    current: ChannelMetrics;
    previous: ChannelMetrics;
  }[] = [
    {
      key: "all",
      label: "All Channels",
      outlets: totalActiveOutlets,
      colorClass: "border-t-foreground",
      dotClass: "bg-foreground",
      current: {
        gross: currentPeriod.totalGross,
        net: currentPeriod.totalNet,
        transactions: currentPeriod.totalTransactions,
      },
      previous: {
        gross: previousPeriod.totalGross,
        net: previousPeriod.totalNet,
        transactions: previousPeriod.totalTransactions,
      },
    },
    {
      key: "k3mart",
      label: "K3 Mart",
      outlets: outletsByChannel.k3mart,
      colorClass: "border-t-purple-500",
      dotClass: "bg-purple-500",
      current: channels?.k3mart ?? { gross: 0, net: 0, transactions: 0 },
      previous: prevChannels?.k3mart ?? { gross: 0, net: 0, transactions: 0 },
    },
    {
      key: "gobiz",
      label: "GoBiz",
      outlets: outletsByChannel.gobiz,
      colorClass: "border-t-red-500",
      dotClass: "bg-red-500",
      current: channels?.gobiz ?? { gross: 0, net: 0, transactions: 0 },
      previous: prevChannels?.gobiz ?? { gross: 0, net: 0, transactions: 0 },
    },
    {
      key: "internal",
      label: "Local / Direct",
      outlets: outletsByChannel.internal,
      colorClass: "border-t-blue-500",
      dotClass: "bg-blue-500",
      current: channels?.internal ?? { gross: 0, net: 0, transactions: 0 },
      previous: prevChannels?.internal ?? { gross: 0, net: 0, transactions: 0 },
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Channel Breakdown</CardTitle>
          <span className="text-xs text-muted-foreground">
            {totalActiveOutlets} active outlet{totalActiveOutlets !== 1 ? "s" : ""} / {totalOutlets} total
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {segments.map((seg) => {
            const aov = seg.current.transactions > 0
              ? seg.current.gross / seg.current.transactions
              : 0;
            const prevAov = seg.previous.transactions > 0
              ? seg.previous.gross / seg.previous.transactions
              : 0;
            const shareOfGross = currentPeriod.totalGross > 0
              ? (seg.current.gross / currentPeriod.totalGross) * 100
              : 0;

            return (
              <div
                key={seg.key}
                className={cn(
                  "border-t-2 rounded-md bg-muted/30 p-3 space-y-2.5",
                  seg.colorClass
                )}
              >
                {/* Channel label */}
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", seg.dotClass)} />
                  <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                    {seg.label}
                    {seg.outlets > 1 && (
                      <span className="font-normal ml-0.5">({seg.outlets})</span>
                    )}
                  </span>
                  {seg.key !== "all" && shareOfGross > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {shareOfGross.toFixed(0)}%
                    </span>
                  )}
                </div>

                {/* Gross Sales */}
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold tabular-nums">
                      {formatCurrency(seg.current.gross)}
                    </span>
                    <GrowthIndicator current={seg.current.gross} previous={seg.previous.gross} />
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gross</p>
                </div>

                {/* Connector line */}
                <div className="border-l border-dashed border-muted-foreground/30 ml-1 pl-2.5 space-y-2">
                  {/* Net Sales */}
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(seg.current.net)}
                        {seg.current.gross > 0 && (
                          <span className="text-sm font-normal text-muted-foreground ml-1">
                            ({((seg.current.net / seg.current.gross) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                      <GrowthIndicator current={seg.current.net} previous={seg.previous.net} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Net</p>
                  </div>

                  {/* Transactions */}
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold tabular-nums">
                        {seg.current.transactions}
                      </span>
                      <GrowthIndicator current={seg.current.transactions} previous={seg.previous.transactions} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Transactions</p>
                  </div>

                  {/* AOV */}
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(aov)}
                      </span>
                      <GrowthIndicator current={aov} previous={prevAov} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">AOV</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Platform Hierarchy (Platform -> Outlet drill-down) ───

function PlatformHierarchy({ preset }: { preset: PeriodPreset }) {
  const { data, isLoading, refresh: refreshByOutlet } = useRevenueByOutlet(preset);
  void refreshByOutlet; // available for sync handlers if needed
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Platform &amp; Outlet Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return null;
  }

  const platformColors: Record<string, { border: string; dot: string; bg: string }> = {
    gobiz: { border: "border-l-red-500", dot: "bg-red-500", bg: "hover:bg-red-50 dark:hover:bg-red-950/20" },
    k3mart: { border: "border-l-purple-500", dot: "bg-purple-500", bg: "hover:bg-purple-50 dark:hover:bg-purple-950/20" },
    internal: { border: "border-l-blue-500", dot: "bg-blue-500", bg: "hover:bg-blue-50 dark:hover:bg-blue-950/20" },
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Platform &amp; Outlet Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {data.map((platform) => {
          const colors = platformColors[platform.platform] ?? platformColors.internal;
          const isExpanded = expandedPlatform === platform.platform;
          const hasOutlets = platform.outlets.length > 1 || (platform.outlets.length === 1 && platform.outlets[0].outletId !== null);

          return (
            <div key={platform.platform} className={cn("border-l-4 rounded-r-md", colors.border)}>
              <div
                className={cn(
                  "flex items-center justify-between py-3 px-4 rounded-r-md cursor-pointer transition-colors",
                  colors.bg
                )}
                onClick={() => setExpandedPlatform(isExpanded ? null : platform.platform)}
              >
                <div className="flex items-center gap-2">
                  {hasOutlets ? (
                    isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className={cn("h-2 w-2 rounded-full", colors.dot)} />
                  <span className="font-medium text-sm">{platform.platformName}</span>
                  <span className="text-xs text-muted-foreground">
                    ({platform.totals.transactions} txn{platform.totals.transactions !== 1 ? "s" : ""})
                  </span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <span className="font-semibold tabular-nums">{formatCurrency(platform.totals.gross)}</span>
                    <span className="text-xs text-muted-foreground ml-1">gross</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold tabular-nums">{formatCurrency(platform.totals.net)}</span>
                    <span className="text-xs text-muted-foreground ml-1">net</span>
                  </div>
                </div>
              </div>
              {isExpanded && hasOutlets && (
                <div className="pb-2 px-4 space-y-0.5">
                  {platform.outlets
                    .sort((a, b) => b.gross - a.gross)
                    .map((outlet, idx) => (
                    <div
                      key={outlet.outletId ?? `direct-${idx}`}
                      className="flex items-center justify-between py-2 px-4 text-sm rounded-md hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{outlet.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({outlet.transactions} txn{outlet.transactions !== 1 ? "s" : ""})
                        </span>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <span className="tabular-nums">{formatCurrency(outlet.gross)}</span>
                        </div>
                        <div className="text-right text-muted-foreground">
                          <span className="tabular-nums">{formatCurrency(outlet.net)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Revenue Table ───

function RevenueTable({
  records,
  dateFrom,
  dateTo,
  platformFilter,
}: {
  records: RevenueRecord[];
  dateFrom: string;
  dateTo: string;
  platformFilter: PlatformFilter;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedStores, setCollapsedStores] = useState<Set<string>>(new Set());

  const filtered = records
    .filter((r) => {
      // Convert WIB date strings to UTC boundaries for filtering
      if (dateFrom && r.periodStart < wibDateStrToUtcMs(dateFrom)) return false;
      if (dateTo && r.periodStart >= wibDateStrToUtcMs(dateTo) + 24 * 60 * 60 * 1000) return false;
      return true;
    })
    .sort((a, b) => {
      // Sort by transaction time descending (newest first)
      const tsA = a.transactionDate ?? a.periodStart;
      const tsB = b.transactionDate ?? b.periodStart;
      return tsB - tsA;
    });

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No records match the selected date range.</p>
      </div>
    );
  }

  // K3 Mart store grouping
  const useStoreGrouping = platformFilter === "k3mart";

  const storeGroups = useStoreGrouping
    ? (() => {
        const groups = new Map<string, RevenueRecord[]>();
        for (const r of filtered) {
          const key = r.customerStoreName || "Unknown Store";
          const existing = groups.get(key);
          if (existing) {
            existing.push(r);
          } else {
            groups.set(key, [r]);
          }
        }
        return groups;
      })()
    : null;

  const toggleStore = (storeName: string) => {
    setCollapsedStores((prev) => {
      const next = new Set(prev);
      if (next.has(storeName)) {
        next.delete(storeName);
      } else {
        next.add(storeName);
      }
      return next;
    });
  };

  function renderRow(record: RevenueRecord) {
    const isExpandableGobiz = record.source === "gobiz" && !!record.gobizOrderNumber;
    const isExpandableInternal = record.source === "internal" && !!record.externalTransactionId;
    const isExpandable = isExpandableGobiz || isExpandableInternal;
    const isExpanded = expandedId === record._id;

    return (
      <Fragment key={record._id}>
        <tr
          className={cn("border-b hover:bg-muted/50", isExpandable && "cursor-pointer")}
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
          <td className="py-3 px-2 text-muted-foreground text-xs tabular-nums">
            {(() => {
              const ts = record.transactionDate ?? record.periodStart;
              const wib = new Date(ts + WIB_OFFSET_MS);
              const h = wib.getUTCHours().toString().padStart(2, "0");
              const m = wib.getUTCMinutes().toString().padStart(2, "0");
              return `${h}:${m}`;
            })()}
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
        {isExpanded && isExpandableGobiz && (
          <ExpandedRevenueItems
            key={`${record._id}-items`}
            revenueId={record._id as Id<"externalRevenue">}
          />
        )}
        {isExpanded && isExpandableInternal && (
          <ExpandedInternalOrder
            key={`${record._id}-order`}
            orderNumber={record.externalTransactionId!}
          />
        )}
      </Fragment>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="w-8 py-3 px-1"></th>
            <th className="text-left py-3 px-2 font-medium">Date</th>
            <th className="text-left py-3 px-2 font-medium">Time</th>
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
          {storeGroups
            ? Array.from(storeGroups.entries()).map(([storeName, storeRecords]) => {
                const isStoreExpanded = !collapsedStores.has(storeName);
                return (
                  <>{/* Store group */}
                    <StoreGroupHeader
                      key={`group-${storeName}`}
                      storeName={storeName}
                      records={storeRecords}
                      isExpanded={isStoreExpanded}
                      onToggle={() => toggleStore(storeName)}
                    />
                    {isStoreExpanded && storeRecords.map((record) => renderRow(record))}
                  </>
                );
              })
            : filtered.map((record) => renderRow(record))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main OverviewTab ───

export function OverviewTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

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
      platformFilter === "all" ? undefined : platformFilter,
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
  const totalActiveOutlets =
    summary.platforms.k3mart.activeOutlets + summary.platforms.gobiz.activeOutlets;
  const totalOutlets =
    summary.platforms.k3mart.outletCount + summary.platforms.gobiz.outletCount;


  return (
    <div className="space-y-6">
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">
                {formatCurrency(currentPeriod.totalGross)}
              </div>
              <GrowthIndicator current={currentPeriod.totalGross} previous={previousPeriod.totalGross} />
            </div>
            <p className="text-xs text-muted-foreground">
              {currentPeriod.periodLabel} {currentPeriod.comparisonLabel}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">
                {formatCurrency(currentPeriod.totalNet)}
              </div>
              <GrowthIndicator current={currentPeriod.totalNet} previous={previousPeriod.totalNet} />
            </div>
            <p className="text-xs text-muted-foreground">
              {currentPeriod.periodLabel} {currentPeriod.comparisonLabel}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commissions Paid</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                -{formatCurrency(currentPeriod.totalCommission ?? 0)}
              </div>
              <GrowthIndicator
                current={currentPeriod.totalCommission ?? 0}
                previous={previousPeriod.totalCommission ?? 0}
                invertColor
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {(currentPeriod.platformGross ?? 0) > 0
                ? `${(((currentPeriod.totalCommission ?? 0) / currentPeriod.platformGross!) * 100).toFixed(1)}% of platform sales`
                : currentPeriod.periodLabel}
            </p>
            {((currentPeriod.totalAdBurn ?? 0) > 0 || (currentPeriod.totalPromoBurn ?? 0) > 0) && (
              <div className="space-y-0.5 mt-1">
                {(currentPeriod.totalAdBurn ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Ad burn: {formatCurrency(currentPeriod.totalAdBurn ?? 0)}
                  </p>
                )}
                {(currentPeriod.totalPromoBurn ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Promo burn: {formatCurrency(currentPeriod.totalPromoBurn ?? 0)}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Discounts Given</CardTitle>
            <TagIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                -{formatCurrency(currentPeriod.totalDiscounts ?? 0)}
              </div>
              <GrowthIndicator
                current={currentPeriod.totalDiscounts ?? 0}
                previous={previousPeriod.totalDiscounts ?? 0}
                invertColor
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {(currentPeriod.internalGross ?? 0) > 0
                ? `${(((currentPeriod.totalDiscounts ?? 0) / currentPeriod.internalGross!) * 100).toFixed(1)}% of local sales`
                : currentPeriod.periodLabel}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivery Fees</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-muted-foreground">
                {formatCurrency(currentPeriod.totalDeliveryFees ?? 0)}
              </div>
              <GrowthIndicator
                current={currentPeriod.totalDeliveryFees ?? 0}
                previous={previousPeriod.totalDeliveryFees ?? 0}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Pass-through. Not included in Net Sales.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Channel Summary (driver tree) */}
      <ChannelSummary
        currentPeriod={currentPeriod}
        previousPeriod={previousPeriod}
        totalActiveOutlets={totalActiveOutlets}
        totalOutlets={totalOutlets}
        outletsByChannel={{
          k3mart: summary.platforms.k3mart.activeOutlets,
          gobiz: summary.platforms.gobiz.activeOutlets,
          internal: 0,
        }}
      />

      {/* Revenue Chart */}
      <SalesChart preset={selectedPeriod} defaultExpanded={true} />

      {/* Platform -> Outlet Hierarchy */}
      <PlatformHierarchy preset={selectedPeriod} />

      {/* Revenue Table */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle>Sales Details</CardTitle>
            <div className="flex gap-2">
              <Badge
                variant={platformFilter === "all" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setPlatformFilter("all")}
              >
                All
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "cursor-pointer border-purple-500 dark:border-purple-600 text-purple-700 dark:text-purple-400",
                  platformFilter === "k3mart" && "bg-purple-500 text-white dark:bg-purple-600"
                )}
                onClick={() => setPlatformFilter("k3mart")}
              >
                K3 Mart
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "cursor-pointer border-red-500 dark:border-red-600 text-red-700 dark:text-red-400",
                  platformFilter === "gobiz" && "bg-red-500 text-white dark:bg-red-600"
                )}
                onClick={() => setPlatformFilter("gobiz")}
              >
                GoBiz
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "cursor-pointer border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400",
                  platformFilter === "internal" && "bg-blue-500 text-white dark:bg-blue-600"
                )}
                onClick={() => setPlatformFilter("internal")}
              >
                Local
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
              platformFilter={platformFilter}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
