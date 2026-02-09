import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  SummaryCards,
  ChannelCard,
  ChannelDetailPanel,
} from "@/components/restock";
import {
  useConvexRestockOverview,
  useConvexChannelSellThrough,
  useConvexDiscoverK3MartOutlets,
  useConvexSyncK3MartSales,
  useConvexSyncGoBiz,
  useConvexSyncInternalOrders,
  useProtectedMutation,
} from "@/hooks/convex";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type SelectedChannel = {
  channel: "k3mart" | "gobiz" | "internal";
  outletId?: Id<"externalOutlets">;
  outletName?: string;
} | null;

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return "Never";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RestockPlanner() {
  const { user } = useAuth();
  const { data: overview, isLoading } = useConvexRestockOverview();
  const [selected, setSelected] = useState<SelectedChannel>(null);
  const [syncing, setSyncing] = useState(false);

  // Detail query - only active when a channel is selected
  const { data: detailData, isLoading: detailLoading } = useConvexChannelSellThrough(
    selected?.channel,
    selected?.outletId
  );

  // Protected mutations (auto-inject token)
  const saveTarget = useProtectedMutation(api.restock.mutations.saveRestockTarget);
  const updateManualStockMut = useProtectedMutation(api.restock.mutations.updateManualStock);

  // Sync actions (take triggeredBy, not token)
  const discoverK3Mart = useConvexDiscoverK3MartOutlets();
  const syncK3Mart = useConvexSyncK3MartSales();
  const syncGoBiz = useConvexSyncGoBiz();
  const syncInternal = useConvexSyncInternalOrders();

  const handleSyncAll = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    try {
      await Promise.allSettled([
        discoverK3Mart({ triggeredBy: user.name }),
        syncK3Mart({ triggeredBy: user.name }),
        syncGoBiz({ triggeredBy: user.name }),
        syncInternal({ triggeredBy: user.name }),
      ]);
      toast.success("All channels synced");
    } catch {
      toast.error("Some syncs failed");
    } finally {
      setSyncing(false);
    }
  }, [user, discoverK3Mart, syncK3Mart, syncGoBiz, syncInternal]);

  const handleSaveTarget = useCallback(
    async (
      productKey: string,
      menuProductId: string | undefined,
      weekdayTarget: number,
      weekendTarget: number
    ) => {
      if (!selected) return;
      await saveTarget({
        channel: selected.channel,
        outletId: selected.outletId,
        productKey,
        menuProductId: menuProductId as Id<"menuProducts"> | undefined,
        weekdayTarget,
        weekendTarget,
      });
    },
    [selected, saveTarget]
  );

  const handleUpdateStock = useCallback(
    async (productKey: string, quantity: number) => {
      if (!selected) return;
      await updateManualStockMut({
        channel: selected.channel,
        productKey,
        quantity,
      });
    },
    [selected, updateManualStockMut]
  );

  if (isLoading) {
    return (
      <div className="container py-6 space-y-6">
        <PageHeader title="Restock Planner" description="Plan daily dispatch quantities by channel" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="container py-6">
        <PageHeader title="Restock Planner" description="Plan daily dispatch quantities by channel" />
        <p className="text-muted-foreground">No data available.</p>
      </div>
    );
  }

  // Separate K3 Mart outlets from GoBiz/Internal
  const k3martChannels = overview.channels.filter(
    (c): c is typeof c & { type: "k3mart"; outletId: Id<"externalOutlets">; outletName: string } =>
      c.type === "k3mart"
  );
  const gobizChannel = overview.channels.find((c) => c.type === "gobiz");
  const internalChannel = overview.channels.find((c) => c.type === "internal");

  // Compute total daily demand across all channels
  const totalDailyDemand = overview.channels.reduce((sum, c) => sum + c.totalDailyDemand, 0);

  return (
    <div className="container py-6 space-y-6">
      <PageHeader
        title="Restock Planner"
        description="Plan daily dispatch quantities by channel"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Last sync: {formatRelativeTime(overview.summary.lastSyncAt)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncAll}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            Sync All
          </Button>
        </div>
      </PageHeader>

      <SummaryCards
        activeChannels={overview.summary.activeChannels}
        lowStockAlerts={overview.summary.lowStockAlerts}
        totalDailyDemand={totalDailyDemand}
      />

      {/* K3 Mart Section */}
      {k3martChannels.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">K3 Mart Outlets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {k3martChannels.map((c) => (
              <ChannelCard
                key={c.outletId}
                type="k3mart"
                outletName={c.outletName}
                lastSnapshotAt={c.lastSnapshotAt}
                products={c.products}
                criticalCount={c.criticalCount}
                warningCount={c.warningCount}
                totalDailyDemand={c.totalDailyDemand}
                onClick={() =>
                  setSelected(
                    selected?.outletId === c.outletId
                      ? null
                      : { channel: "k3mart", outletId: c.outletId, outletName: c.outletName }
                  )
                }
                isSelected={selected?.outletId === c.outletId}
              />
            ))}
          </div>
        </section>
      )}

      {/* GoBiz Section */}
      {gobizChannel && gobizChannel.products.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">GoBiz (GoFood)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ChannelCard
              type="gobiz"
              products={gobizChannel.products}
              totalDailyDemand={gobizChannel.totalDailyDemand}
              onClick={() =>
                setSelected(
                  selected?.channel === "gobiz" && !selected.outletId
                    ? null
                    : { channel: "gobiz" }
                )
              }
              isSelected={selected?.channel === "gobiz" && !selected.outletId}
            />
          </div>
        </section>
      )}

      {/* Internal Section */}
      {internalChannel && internalChannel.products.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Internal Orders</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ChannelCard
              type="internal"
              products={internalChannel.products}
              totalDailyDemand={internalChannel.totalDailyDemand}
              onClick={() =>
                setSelected(
                  selected?.channel === "internal" && !selected.outletId
                    ? null
                    : { channel: "internal" }
                )
              }
              isSelected={selected?.channel === "internal" && !selected.outletId}
            />
          </div>
        </section>
      )}

      {/* Detail Panel */}
      {selected && (
        <ChannelDetailPanel
          channel={selected.channel}
          outletName={selected.outletName}
          products={detailData?.products}
          isLoading={detailLoading}
          onClose={() => setSelected(null)}
          onSaveTarget={handleSaveTarget}
          onUpdateStock={selected.channel !== "k3mart" ? handleUpdateStock : undefined}
        />
      )}
    </div>
  );
}
