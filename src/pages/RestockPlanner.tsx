import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  Store,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Save,
  RotateCcw,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  useRestockOverview,
  useChannelSellThrough,
  useSyncK3MartStock,
  useSyncK3MartSales,
  useSyncGoBiz,
  useSyncInternalOrders,
  useProtectedMutation,
} from "@/hooks/convex";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { GoFoodRestockSection } from "@/components/restockPlanner/GoFoodRestockSection";

// ─── Helpers ───

function formatRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "Never";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isTomorrow(): "weekday" | "weekend" {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = tomorrow.getDay();
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

// ─── Types ───

type OverviewProduct = {
  productKey: string;
  productName: string;
  currentStock?: number;
  dailyRate: number;
  daysRemaining?: number;
  status?: "critical" | "warning" | "ok";
};

type DetailProduct = {
  productKey: string;
  productName: string;
  menuProductId?: string;
  currentStock?: number;
  weekdayDailyRate: number;
  weekendDailyRate: number;
  overallDailyRate: number;
  daysRemaining?: number;
  status?: "critical" | "warning" | "ok";
  suggestedWeekday: number;
  suggestedWeekend: number;
  targetWeekday?: number;
  targetWeekend?: number;
  trendDirection: "up" | "down" | "flat";
  last7dSales: number;
  prev7dSales: number;
};

type ChannelType = "k3mart" | "gobiz" | "internal";

// ─── Main Page ───

export function RestockPlanner() {
  const { user } = useAuth();
  const { data: overview, isLoading, refresh: refreshOverview } = useRestockOverview();
  const [syncing, setSyncing] = useState(false);

  // Sync actions
  const syncK3MartStock = useSyncK3MartStock();
  const syncK3Mart = useSyncK3MartSales();
  const syncGoBiz = useSyncGoBiz();
  const syncInternal = useSyncInternalOrders();

  // Protected mutations
  const saveTarget = useProtectedMutation(api.restock.mutations.saveRestockTarget);
  const updateManualStockMut = useProtectedMutation(api.restock.mutations.updateManualStock);

  const handleSyncAll = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const results = await Promise.allSettled([
        syncK3MartStock({ triggeredBy: user.name }),
        syncK3Mart({ triggeredBy: user.name }),
        syncGoBiz({ triggeredBy: user.name }),
        syncInternal({ triggeredBy: user.name }),
      ]);
      const labels = ["K3 Stock", "K3 Sales", "GoBiz", "Internal"];
      const failed = results
        .map((r, i) => (r.status === "rejected" ? labels[i] : null))
        .filter(Boolean);
      if (failed.length > 0) {
        toast.error(`Sync failed: ${failed.join(", ")}`);
      } else {
        toast.success("All channels synced");
      }
      // Refresh overview after sync completes
      await refreshOverview();
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [user, syncK3MartStock, syncK3Mart, syncGoBiz, syncInternal, refreshOverview]);

  const handleSaveTarget = useCallback(
    async (
      channel: ChannelType,
      outletId: Id<"externalOutlets"> | undefined,
      productKey: string,
      menuProductId: string | undefined,
      weekdayTarget: number,
      weekendTarget: number
    ) => {
      await saveTarget({
        channel,
        outletId,
        productKey,
        menuProductId: menuProductId as Id<"menuProducts"> | undefined,
        weekdayTarget,
        weekendTarget,
      });
    },
    [saveTarget]
  );

  const handleUpdateStock = useCallback(
    async (channel: ChannelType, productKey: string, quantity: number) => {
      await updateManualStockMut({ channel, productKey, quantity });
    },
    [updateManualStockMut]
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Restock Planner" description="Dispatch planning by channel" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="space-y-6">
        <PageHeader title="Restock Planner" description="Dispatch planning by channel" />
        <p className="text-muted-foreground">No data available.</p>
      </div>
    );
  }

  // Separate channels
  const k3martChannels = overview.channels.filter(
    (c): c is typeof c & { type: "k3mart"; outletId: Id<"externalOutlets">; outletName: string } =>
      c.type === "k3mart"
  );
  const gobizChannel = overview.channels.find((c) => c.type === "gobiz");
  const internalChannel = overview.channels.find((c) => c.type === "internal");
  const totalDailyDemand = overview.channels.reduce((sum, c) => sum + c.totalDailyDemand, 0);
  const tomorrowType = isTomorrow();

  return (
    <div className="space-y-6">
      <PageHeader title="Restock Planner" description="Dispatch planning by channel">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Synced {formatRelativeTime(overview.summary.lastSyncAt)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncAll}
            disabled={syncing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-1.5", syncing && "animate-spin")} />
            Sync All
          </Button>
        </div>
      </PageHeader>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <Store className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Outlets</p>
            <p className="text-lg font-bold leading-tight">{overview.summary.activeChannels}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <AlertTriangle className={cn(
            "h-4 w-4 shrink-0",
            overview.summary.lowStockAlerts > 0 ? "text-amber-500" : "text-muted-foreground"
          )} />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Low Stock</p>
            <p className="text-lg font-bold leading-tight">{overview.summary.lowStockAlerts}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Daily Demand</p>
            <p className="text-lg font-bold leading-tight">{Math.round(totalDailyDemand)}</p>
          </div>
        </div>
      </div>

      {/* Tomorrow indicator */}
      <div className="text-xs text-muted-foreground px-1">
        Tomorrow is a <span className="font-medium text-foreground">{tomorrowType === "weekend" ? "weekend" : "weekday"}</span> — restock targets below reflect {tomorrowType} quantities.
      </div>

      {/* K3 Mart Channel */}
      {k3martChannels.length > 0 && (
        <ChannelSection
          title="K3 Mart"
          icon={<Store className="h-4 w-4" />}
          color="purple"
        >
          {k3martChannels.map((outlet) => (
            <OutletBlock
              key={outlet.outletId}
              channel="k3mart"
              outletId={outlet.outletId}
              outletName={outlet.outletName}
              lastSyncAt={outlet.lastSnapshotAt}
              overviewProducts={outlet.products}
              criticalCount={outlet.criticalCount}
              warningCount={outlet.warningCount}
              totalDailyDemand={outlet.totalDailyDemand}
              tomorrowType={tomorrowType}
              onSaveTarget={handleSaveTarget}
            />
          ))}
        </ChannelSection>
      )}

      {/* GoBiz Channel */}
      {gobizChannel && gobizChannel.products.length > 0 && (
        <ChannelSection
          title="GoBiz (GoFood)"
          icon={<ShoppingBag className="h-4 w-4" />}
          color="emerald"
        >
          <OutletBlock
            channel="gobiz"
            outletName="GoFood Delivery"
            overviewProducts={gobizChannel.products}
            totalDailyDemand={gobizChannel.totalDailyDemand}
            tomorrowType={tomorrowType}
            onSaveTarget={handleSaveTarget}
            onUpdateStock={handleUpdateStock}
          />
        </ChannelSection>
      )}

      {/* Internal Channel */}
      {internalChannel && internalChannel.products.length > 0 && (
        <ChannelSection
          title="Internal Orders"
          icon={<Truck className="h-4 w-4" />}
          color="blue"
        >
          <OutletBlock
            channel="internal"
            outletName="Direct Orders"
            overviewProducts={internalChannel.products}
            totalDailyDemand={internalChannel.totalDailyDemand}
            tomorrowType={tomorrowType}
            onSaveTarget={handleSaveTarget}
            onUpdateStock={handleUpdateStock}
          />
        </ChannelSection>
      )}

      {/* GoFood Depot Restock */}
      <GoFoodRestockSection />
    </div>
  );
}

// ─── Channel Section (grouping header) ───

function ChannelSection({
  title,
  icon,
  color,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  color: "purple" | "emerald" | "blue";
  children: React.ReactNode;
}) {
  const colorMap = {
    purple: "border-purple-500/30 bg-purple-500/5 text-purple-700 dark:text-purple-400",
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    blue: "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-400",
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn("text-xs gap-1", colorMap[color])}>
          {icon}
          {title}
        </Badge>
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </section>
  );
}

// ─── Outlet Block (inline product table) ───

function OutletBlock({
  channel,
  outletId,
  outletName,
  lastSyncAt,
  overviewProducts,
  criticalCount,
  warningCount,
  totalDailyDemand,
  tomorrowType,
  onSaveTarget,
  onUpdateStock,
}: {
  channel: ChannelType;
  outletId?: Id<"externalOutlets">;
  outletName: string;
  lastSyncAt?: number;
  overviewProducts: OverviewProduct[];
  criticalCount?: number;
  warningCount?: number;
  totalDailyDemand: number;
  tomorrowType: "weekday" | "weekend";
  onSaveTarget: (
    channel: ChannelType,
    outletId: Id<"externalOutlets"> | undefined,
    productKey: string,
    menuProductId: string | undefined,
    weekdayTarget: number,
    weekendTarget: number
  ) => Promise<void>;
  onUpdateStock?: (channel: ChannelType, productKey: string, quantity: number) => Promise<void>;
}) {
  // Fetch detail data for this specific outlet
  const { data: detailData, isLoading } = useChannelSellThrough(channel, outletId);
  const isK3Mart = channel === "k3mart";

  return (
    <div className="rounded-lg border bg-card">
      {/* Outlet header bar — sticky below fixed app header (56px) */}
      <div className="sticky top-14 z-20 flex items-center justify-between px-4 py-2.5 border-b bg-muted/80 backdrop-blur-sm rounded-t-lg">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-sm font-semibold truncate">{outletName}</h3>
          {isK3Mart && (criticalCount ?? 0) > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
              {criticalCount} critical
            </Badge>
          )}
          {isK3Mart && (warningCount ?? 0) > 0 && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-amber-500/50 text-amber-600 dark:text-amber-400">
              {warningCount} low
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          <span>{Math.round(totalDailyDemand)} units/day</span>
          {lastSyncAt !== undefined && (
            <span>Synced {formatRelativeTime(lastSyncAt)}</span>
          )}
        </div>
      </div>

      {/* Product table */}
      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: Math.min(overviewProducts.length || 3, 5) }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : !detailData?.products || detailData.products.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No product data available
        </div>
      ) : (
        <div>
          <table className="w-full text-sm">
            <thead className="sticky top-[97px] z-10 bg-card shadow-[0_1px_0_0_var(--color-border)]">
              <tr className="text-[11px] text-muted-foreground uppercase tracking-wider">
                <th className="py-2 px-4 text-left font-medium">Product</th>
                {isK3Mart && (
                  <th className="py-2 px-3 text-right font-medium">Stock</th>
                )}
                {!isK3Mart && onUpdateStock && (
                  <th className="py-2 px-3 text-right font-medium">Stock</th>
                )}
                <th className="py-2 px-3 text-right font-medium">Avg/day</th>
                <th className="py-2 px-3 text-right font-medium">Weekday</th>
                <th className="py-2 px-3 text-right font-medium">Weekend</th>
                <th className="py-2 px-3 text-center font-medium">Trend</th>
                {isK3Mart && (
                  <th className="py-2 px-3 text-center font-medium">Status</th>
                )}
                <th className="py-2 px-3 text-right font-medium">
                  Prep Tomorrow
                </th>
                <th className="py-2 px-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {detailData.products.map((p) => (
                <ProductRow
                  key={p.productKey}
                  product={p}
                  channel={channel}
                  outletId={outletId}
                  isK3Mart={isK3Mart}
                  tomorrowType={tomorrowType}
                  showManualStock={!isK3Mart && !!onUpdateStock}
                  onSaveTarget={onSaveTarget}
                  onUpdateStock={onUpdateStock}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Product Row ───

function ProductRow({
  product: p,
  channel,
  outletId,
  isK3Mart,
  tomorrowType,
  showManualStock,
  onSaveTarget,
  onUpdateStock,
}: {
  product: DetailProduct;
  channel: ChannelType;
  outletId?: Id<"externalOutlets">;
  isK3Mart: boolean;
  tomorrowType: "weekday" | "weekend";
  showManualStock: boolean;
  onSaveTarget: (
    channel: ChannelType,
    outletId: Id<"externalOutlets"> | undefined,
    productKey: string,
    menuProductId: string | undefined,
    weekdayTarget: number,
    weekendTarget: number
  ) => Promise<void>;
  onUpdateStock?: (channel: ChannelType, productKey: string, quantity: number) => Promise<void>;
}) {
  // Determine the target for tomorrow
  const currentTarget = tomorrowType === "weekday"
    ? (p.targetWeekday ?? p.suggestedWeekday)
    : (p.targetWeekend ?? p.suggestedWeekend);
  const hasOverride = tomorrowType === "weekday"
    ? p.targetWeekday !== undefined
    : p.targetWeekend !== undefined;

  const [targetVal, setTargetVal] = useState<string>(
    hasOverride ? String(currentTarget) : ""
  );
  const [saving, setSaving] = useState(false);
  const [editingStock, setEditingStock] = useState(false);
  const [stockVal, setStockVal] = useState("");

  const suggestedVal = tomorrowType === "weekday" ? p.suggestedWeekday : p.suggestedWeekend;
  const isDirty = targetVal !== "" && Number(targetVal) !== currentTarget;

  async function handleSave() {
    const val = targetVal !== "" ? Number(targetVal) : suggestedVal;
    if (isNaN(val) || val < 0) {
      toast.error("Enter a valid number");
      return;
    }
    setSaving(true);
    try {
      // Save both weekday and weekend: use entered value for tomorrow's type, keep existing for the other
      const wd = tomorrowType === "weekday" ? val : (p.targetWeekday ?? p.suggestedWeekday);
      const we = tomorrowType === "weekend" ? val : (p.targetWeekend ?? p.suggestedWeekend);
      await onSaveTarget(channel, outletId, p.productKey, p.menuProductId, wd, we);
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveStock() {
    if (!onUpdateStock) return;
    const qty = Number(stockVal);
    if (isNaN(qty) || qty < 0) {
      toast.error("Invalid quantity");
      return;
    }
    try {
      await onUpdateStock(channel, p.productKey, qty);
      toast.success("Stock updated");
      setEditingStock(false);
    } catch {
      toast.error("Failed to update");
    }
  }

  const TrendIcon = p.trendDirection === "up" ? TrendingUp
    : p.trendDirection === "down" ? TrendingDown : Minus;
  const trendColor = p.trendDirection === "up"
    ? "text-green-600 dark:text-green-400"
    : p.trendDirection === "down"
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";

  const statusColor = p.status === "critical"
    ? "bg-red-500/10 text-red-700 dark:text-red-400"
    : p.status === "warning"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : "bg-green-500/10 text-green-700 dark:text-green-400";

  const rowBg = p.status === "critical"
    ? "bg-red-500/[0.03]"
    : p.status === "warning"
      ? "bg-amber-500/[0.03]"
      : "";

  return (
    <tr className={cn("hover:bg-muted/50 transition-colors", rowBg)}>
      {/* Product name */}
      <td className="py-2 px-4">
        <span className="font-medium truncate block max-w-[200px]" title={p.productName}>
          {p.productName}
        </span>
      </td>

      {/* Stock (K3 Mart - from API) */}
      {isK3Mart && (
        <td className="py-2 px-3 text-right font-mono text-xs">
          {p.currentStock ?? "-"}
        </td>
      )}

      {/* Stock (Manual - editable) */}
      {showManualStock && (
        <td className="py-2 px-3 text-right">
          {editingStock ? (
            <div className="flex items-center justify-end gap-1">
              <Input
                type="number"
                min={0}
                value={stockVal}
                onChange={(e) => setStockVal(e.target.value)}
                className="w-16 h-6 text-xs text-right"
                placeholder={String(p.currentStock ?? 0)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveStock();
                  if (e.key === "Escape") setEditingStock(false);
                }}
              />
            </div>
          ) : (
            <button
              className="font-mono text-xs hover:underline cursor-pointer text-muted-foreground"
              onClick={() => {
                setEditingStock(true);
                setStockVal(p.currentStock !== undefined ? String(p.currentStock) : "");
              }}
              title="Click to edit stock"
            >
              {p.currentStock ?? "—"}
            </button>
          )}
        </td>
      )}

      {/* Average daily */}
      <td className="py-2 px-3 text-right font-mono text-xs">
        {p.overallDailyRate.toFixed(1)}
      </td>

      {/* Weekday avg */}
      <td className="py-2 px-3 text-right font-mono text-xs">
        {p.weekdayDailyRate.toFixed(1)}
      </td>

      {/* Weekend avg */}
      <td className="py-2 px-3 text-right font-mono text-xs">
        {p.weekendDailyRate.toFixed(1)}
      </td>

      {/* Trend */}
      <td className="py-2 px-3 text-center">
        <TrendIcon className={cn("h-3.5 w-3.5 mx-auto", trendColor)} />
      </td>

      {/* Status (K3 Mart only) */}
      {isK3Mart && (
        <td className="py-2 px-3 text-center">
          {p.status ? (
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", statusColor)}>
              {p.daysRemaining !== undefined ? `${p.daysRemaining}d` : p.status}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </td>
      )}

      {/* Prep Tomorrow (editable target) */}
      <td className="py-2 px-3">
        <div className="flex items-center justify-end gap-1">
          <Input
            type="number"
            min={0}
            value={targetVal}
            onChange={(e) => setTargetVal(e.target.value)}
            placeholder={String(suggestedVal)}
            className={cn(
              "w-16 h-7 text-right text-sm",
              hasOverride && targetVal !== "" && "font-bold"
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
        </div>
      </td>

      {/* Actions */}
      <td className="py-2 px-3">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleSave}
            disabled={saving || !isDirty}
            title="Save target"
          >
            <Save className="h-3 w-3" />
          </Button>
          {hasOverride && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => setTargetVal("")}
              title="Reset to suggested"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
