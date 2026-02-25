import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  useExternalOutlets,
  useDiscoverK3MartOutlets,
  useSyncK3MartSales,
  useSyncGoBiz,
  useSyncInternalOrders,
} from "@/hooks/convex";
import { K3MartCredentialsDialog } from "./K3MartCredentialsDialog";
import { GoBizTokenDialog } from "./GoBizTokenDialog";
import { BigSellerTokenDialog } from "./BigSellerTokenDialog";
import { IntegrationHealthCard } from "./IntegrationHealthCard";
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

  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";
  const canViewHealth = isAdmin || isManager;

  // Registry-driven health status for all 6 platforms (Plan 01 query)
  const healthData = useQuery(
    api.platformCredentials.getHealthStatusAll,
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

  const handleSyncK3MartSales = async () => {
    setSyncingK3MartSales(true);
    try {
      const result = await syncK3MartSales({ triggeredBy: "settings" });
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

  const handleSyncGoBiz = async () => {
    setSyncingGoBiz(true);
    try {
      await syncGoBiz({ triggeredBy: "settings" });
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
  const handleAction = (platformId: string, authStrategy: string) => {
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
      // client_credentials and session_auth have no dialog
    }
  };

  // Find BigSeller reconnect steps from health data (passed to BigSellerTokenDialog)
  const bigsellerHealth = healthData?.find((h) => h.platformId === "bigseller");

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
              {healthData.map((health) => (
                <IntegrationHealthCard
                  key={health.platformId}
                  health={health}
                  onAction={() => handleAction(health.platformId, health.authStrategy)}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sync actions section (K3Mart, GoBiz, Internal) */}
      {canViewHealth && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Sync Actions</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSyncK3MartSales}
              disabled={syncingK3MartSales || discoveringK3Mart}
              className="text-xs px-3 py-1.5 rounded border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {syncingK3MartSales ? "Syncing K3 Mart..." : "Sync K3 Mart Sales"}
            </button>
            <button
              onClick={handleDiscoverK3MartOutlets}
              disabled={discoveringK3Mart || syncingK3MartSales}
              className="text-xs px-3 py-1.5 rounded border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {discoveringK3Mart ? "Discovering..." : "Refresh K3 Mart Stores"}
            </button>
            <button
              onClick={handleSyncGoBiz}
              disabled={syncingGoBiz}
              className="text-xs px-3 py-1.5 rounded border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {syncingGoBiz ? "Syncing GoBiz..." : "Sync GoBiz Journals"}
            </button>
            <button
              onClick={handleSyncInternal}
              disabled={syncingInternal}
              className="text-xs px-3 py-1.5 rounded border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {syncingInternal ? "Syncing..." : "Sync Internal Orders"}
            </button>
          </div>
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
