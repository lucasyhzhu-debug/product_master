import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  useExternalOutlets,
  useDiscoverK3MartOutlets,
  useSyncK3MartSales,
  useSyncGoBiz,
  useSyncInternalOrders,
  useBigSellerUnmappedSkus,
} from "@/hooks/convex";
import { K3MartCredentialsDialog } from "./K3MartCredentialsDialog";
import { GoBizTokenDialog } from "./GoBizTokenDialog";
import { BigSellerTokenDialog } from "./BigSellerTokenDialog";
import { GrabFoodCredentialsDialog } from "./GrabFoodCredentialsDialog";
import { IntegrationHealthCard } from "./IntegrationHealthCard";
import { BigSellerSyncPanel } from "./BigSellerSyncPanel";
import { BigSellerOrdersTable } from "./BigSellerOrdersTable";
import { PlatformSyncPanel } from "./PlatformSyncPanel";
import type { PlatformHealthStatus } from "../../../convex/platformCredentials/queries";
import type { Id } from "../../../convex/_generated/dataModel";

export function SettingsTab() {
  const { user } = useAuth();
  const [discoveringK3Mart, setDiscoveringK3Mart] = useState(false);
  const [syncingK3MartSales, setSyncingK3MartSales] = useState(false);
  const [syncingGoBiz, setSyncingGoBiz] = useState(false);
  const [syncingInternal, setSyncingInternal] = useState(false);
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [gobizDialogOpen, setGobizDialogOpen] = useState(false);
  const [bigsellerDialogOpen, setBigsellerDialogOpen] = useState(false);
  const [grabfoodDialogOpen, setGrabfoodDialogOpen] = useState(false);
  const [bigsellerExpanded, setBigsellerExpanded] = useState(false);
  const [k3martExpanded, setK3martExpanded] = useState(false);
  const [gobizExpanded, setGobizExpanded] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(false);

  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";
  const canViewHealth = isAdmin || isManager;

  // Registry-driven health status for all 6 platforms (Plan 01 query)
  const healthData = useQuery(
    api.platformCredentials.queries.getHealthStatusAll,
    canViewHealth && user?.token ? { token: user.token } : "skip"
  );

  // Fetch data
  const { data: outlets, isLoading: loadingOutlets } = useExternalOutlets();

  // Mutations
  const toggleOutletActive = useMutation(
    api.externalData.mutations.toggleOutletActive
  );
  const discoverK3MartOutlets = useDiscoverK3MartOutlets();
  const syncK3MartSales = useSyncK3MartSales();
  const syncGoBiz = useSyncGoBiz();
  const syncInternal = useSyncInternalOrders();

  // Handle sync actions
  const handleDiscoverK3MartOutlets = async () => {
    setDiscoveringK3Mart(true);
    try {
      const result = await discoverK3MartOutlets({ triggeredBy: "settings" });
      if (result.success) {
        toast.success(`Discovered ${result.outletsFound} outlets with our products (scanned ${result.outletsScanned})`);
      } else {
        toast.error(`Discovery failed: ${result.errors?.join(", ") || "Unknown error"}`);
      }
    } catch (error) {
      console.error("K3 Mart discovery failed:", error);
      toast.error(
        error instanceof Error ? error.message : "K3 Mart discovery failed"
      );
    } finally {
      setDiscoveringK3Mart(false);
    }
  };

  const handleSyncK3MartSales = async (params?: { fromDate?: string; toDate?: string }) => {
    setSyncingK3MartSales(true);
    try {
      const result = await syncK3MartSales({
        triggeredBy: "settings",
        fromDate: params?.fromDate,
        toDate: params?.toDate,
      });
      if (result.success) {
        toast.success(`Synced ${result.newTransactions} new transactions (${result.skippedDuplicates} duplicates skipped)`);
      } else {
        toast.error(`Sales sync failed: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("K3 Mart sales sync failed:", error);
      toast.error(
        error instanceof Error ? error.message : "K3 Mart sales sync failed"
      );
    } finally {
      setSyncingK3MartSales(false);
    }
  };

  const handleSyncGoBiz = async (params?: { fromDate?: string; toDate?: string }) => {
    setSyncingGoBiz(true);
    try {
      const syncArgs: { triggeredBy: string; daysBack?: number } = { triggeredBy: "settings" };
      if (params?.fromDate) {
        syncArgs.daysBack = Math.ceil(
          (Date.now() - new Date(params.fromDate).getTime()) / (24 * 60 * 60 * 1000)
        );
      }
      await syncGoBiz(syncArgs);
      toast.success("GoBiz sync completed");
    } catch (error) {
      console.error("GoBiz sync failed:", error);
      toast.error(
        error instanceof Error ? error.message : "GoBiz sync failed"
      );
    } finally {
      setSyncingGoBiz(false);
    }
  };

  const handleSyncInternal = async () => {
    setSyncingInternal(true);
    try {
      const result = await syncInternal({ triggeredBy: "settings" });
      if (result.success) {
        toast.success(`Synced ${result.newTransactions} new orders (${result.skippedDuplicates} duplicates skipped)`);
      } else {
        toast.error(`Internal sync failed: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Internal sync failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Internal sync failed"
      );
    } finally {
      setSyncingInternal(false);
    }
  };

  // Handle toggle outlet active
  const handleToggleOutlet = async (outletId: Id<"externalOutlets">, currentlyActive: boolean) => {
    if (!user?.token) {
      toast.error("Authentication required");
      return;
    }

    try {
      await toggleOutletActive({ token: user.token, outletId, isActive: !currentlyActive });
      toast.success("Outlet status updated");
    } catch (error) {
      console.error("Toggle outlet failed:", error);
      toast.error("Failed to update outlet status");
    }
  };

  // Registry-driven action dispatcher based on authStrategy
  const handleAction = (_platformId: string, authStrategy: string) => {
    switch (authStrategy) {
      case "password_grant":
        setGobizDialogOpen(true);
        break;
      case "paste_token":
        setBigsellerDialogOpen(true);
        break;
      case "pos_login":
        setCredDialogOpen(true);
        break;
      case "client_credentials":
        setGrabfoodDialogOpen(true);
        break;
      // session_auth has no dialog
    }
  };

  // BigSeller-specific state
  const { data: unmappedSkus } = useBigSellerUnmappedSkus();
  const unmappedSkuCount = unmappedSkus?.length ?? 0;

  // Find BigSeller reconnect steps from health data (passed to BigSellerTokenDialog)
  const bigsellerHealth = (healthData as PlatformHealthStatus[] | undefined)?.find(
    (h) => h.platformId === "bigseller"
  );
  const bigsellerTokenExpired = bigsellerHealth?.status === "red" || bigsellerHealth?.status === "disconnected";

  return (
    <div className="space-y-6">
      {/* Integration Health Dashboard — registry-driven, 6 platforms */}
      {canViewHealth && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Platform Health</h3>
          {healthData === undefined ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border overflow-hidden">
              {(healthData as PlatformHealthStatus[]).map((health) => {
                const expandablePlatforms = ["bigseller", "k3mart", "gobiz", "internal"];
                const isExpandable = expandablePlatforms.includes(health.platformId);
                const expandedMap: Record<string, boolean> = {
                  bigseller: bigsellerExpanded,
                  k3mart: k3martExpanded,
                  gobiz: gobizExpanded,
                  internal: internalExpanded,
                };
                const toggleMap: Record<string, () => void> = {
                  bigseller: () => setBigsellerExpanded(!bigsellerExpanded),
                  k3mart: () => setK3martExpanded(!k3martExpanded),
                  gobiz: () => setGobizExpanded(!gobizExpanded),
                  internal: () => setInternalExpanded(!internalExpanded),
                };
                const isCurrentExpanded = expandedMap[health.platformId] ?? false;

                return (
                <div key={health.platformId}>
                  <div className="flex items-center">
                    <div className="flex-1">
                      <IntegrationHealthCard
                        health={health}
                        onAction={() => handleAction(health.platformId, health.authStrategy)}
                        isAdmin={isAdmin}
                      />
                    </div>
                    {/* Expand toggle for expandable platforms */}
                    {isExpandable && (
                      <div className="flex items-center gap-1.5 pr-2">
                        {/* BigSeller: unmapped SKU badge */}
                        {health.platformId === "bigseller" && unmappedSkuCount > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600 dark:text-amber-400"
                          >
                            {unmappedSkuCount} unmapped
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={toggleMap[health.platformId]}
                          aria-label={isCurrentExpanded ? `Collapse ${health.platformName}` : `Expand ${health.platformName}`}
                        >
                          {isCurrentExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* BigSeller expanded section */}
                  {health.platformId === "bigseller" && bigsellerExpanded && (
                    <div className="border-t px-4 py-3 space-y-4 bg-muted/20">
                      <BigSellerSyncPanel
                        tokenExpired={bigsellerTokenExpired}
                        onOpenTokenDialog={() => setBigsellerDialogOpen(true)}
                      />
                      <div className="border-t pt-3">
                        <h4 className="text-xs font-medium text-muted-foreground mb-2">
                          Synced Orders
                        </h4>
                        <BigSellerOrdersTable />
                      </div>
                    </div>
                  )}

                  {/* K3Mart expanded section */}
                  {health.platformId === "k3mart" && k3martExpanded && (
                    <div className="border-t px-4 py-3 space-y-4 bg-muted/20">
                      <PlatformSyncPanel
                        platformId="k3mart"
                        showDateRange={true}
                        onSync={(params) => handleSyncK3MartSales(params)}
                        secondaryAction={{
                          label: "Refresh Stores",
                          loadingLabel: "Discovering...",
                          onAction: handleDiscoverK3MartOutlets,
                        }}
                        isSyncing={syncingK3MartSales || discoveringK3Mart}
                      />
                    </div>
                  )}

                  {/* GoBiz expanded section */}
                  {health.platformId === "gobiz" && gobizExpanded && (
                    <div className="border-t px-4 py-3 space-y-4 bg-muted/20">
                      <PlatformSyncPanel
                        platformId="gobiz"
                        showDateRange={true}
                        onSync={(params) => handleSyncGoBiz(params)}
                        isSyncing={syncingGoBiz}
                      />
                    </div>
                  )}

                  {/* Internal expanded section */}
                  {health.platformId === "internal" && internalExpanded && (
                    <div className="border-t px-4 py-3 space-y-4 bg-muted/20">
                      <PlatformSyncPanel
                        platformId="internal"
                        showDateRange={false}
                        onSync={() => handleSyncInternal()}
                        isSyncing={syncingInternal}
                      />
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Admin-only dialogs */}
      {isAdmin && user?.token && (
        <>
          <K3MartCredentialsDialog
            open={credDialogOpen}
            onOpenChange={setCredDialogOpen}
          />
          <GoBizTokenDialog
            open={gobizDialogOpen}
            onOpenChange={setGobizDialogOpen}
            authToken={user.token}
          />
          <BigSellerTokenDialog
            open={bigsellerDialogOpen}
            onClose={() => setBigsellerDialogOpen(false)}
            authToken={user.token}
            reconnectSteps={bigsellerHealth?.reconnectSteps ?? []}
          />
          <GrabFoodCredentialsDialog
            open={grabfoodDialogOpen}
            onOpenChange={setGrabfoodDialogOpen}
          />
        </>
      )}

      {/* Outlet Management */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">
          Outlet Management ({outlets?.length || 0} outlets)
        </h3>
        {loadingOutlets || outlets === undefined ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : outlets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No outlets found. Sync data from platforms to see outlets here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium">Source</th>
                  <th className="text-left py-3 px-2 font-medium">
                    External ID
                  </th>
                  <th className="text-left py-3 px-2 font-medium">Name</th>
                  <th className="text-left py-3 px-2 font-medium">Active</th>
                  <th className="text-left py-3 px-2 font-medium">
                    Last Sync
                  </th>
                </tr>
              </thead>
              <tbody>
                {outlets.map((outlet) => (
                  <tr key={outlet._id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-2">
                      <Badge
                        variant="outline"
                        className={
                          outlet.source === "k3mart"
                            ? "border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400"
                            : outlet.source === "internal"
                            ? "border-emerald-500 dark:border-emerald-600 text-emerald-700 dark:text-emerald-400"
                            : "border-purple-500 dark:border-purple-600 text-purple-700 dark:text-purple-400"
                        }
                      >
                        {outlet.source === "k3mart"
                          ? "K3 Mart"
                          : outlet.source === "internal"
                          ? "Internal"
                          : "GoBiz"}
                      </Badge>
                    </td>
                    <td className="py-3 px-2 font-mono text-xs">
                      {outlet.externalId}
                    </td>
                    <td className="py-3 px-2">{outlet.name}</td>
                    <td className="py-3 px-2">
                      <Switch
                        checked={outlet.isActive}
                        onCheckedChange={() =>
                          handleToggleOutlet(outlet._id, outlet.isActive)
                        }
                      />
                    </td>
                    <td className="py-3 px-2 text-muted-foreground">
                      {outlet.lastSyncAt
                        ? new Date(outlet.lastSyncAt).toLocaleString("id-ID", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
