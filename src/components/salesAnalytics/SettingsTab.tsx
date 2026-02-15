import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  useConvexExternalOutlets,
  useConvexDiscoverK3MartOutlets,
  useConvexSyncK3MartSales,
  useConvexSyncGoBiz,
  useConvexSyncInternalOrders,
  useConvexSyncHealthStatus,
  useConvexCredentialStatusEnhanced,
} from "@/hooks/convex";
import { K3MartCredentialsDialog } from "./K3MartCredentialsDialog";
import { GoBizTokenDialog } from "./GoBizTokenDialog";
import { IntegrationHealthCard } from "./IntegrationHealthCard";
import { PLATFORMS } from "../../../convex/integrations/registry";
import type { Id } from "../../../convex/_generated/dataModel";

export function SettingsTab() {
  const { user } = useAuth();
  const [discoveringK3Mart, setDiscoveringK3Mart] = useState(false);
  const [syncingK3MartSales, setSyncingK3MartSales] = useState(false);
  const [syncingGoBiz, setSyncingGoBiz] = useState(false);
  const [syncingInternal, setSyncingInternal] = useState(false);
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [gobizDialogOpen, setGobizDialogOpen] = useState(false);

  // Fetch data
  const { data: outlets, isLoading: loadingOutlets } =
    useConvexExternalOutlets();

  // Sync health status (public, no auth)
  const { data: syncHealthStatus } = useConvexSyncHealthStatus();

  // Credential status (admin-only -- skip for non-admin to avoid auth error)
  const isAdmin = user?.role === "admin";
  const isManager = user?.role === "manager";
  const canViewHealth = isAdmin || isManager;

  const { data: k3CredStatus } = useConvexCredentialStatusEnhanced(
    "k3mart",
    isAdmin ? user?.token : undefined
  );
  const { data: gobizCredStatus } = useConvexCredentialStatusEnhanced(
    "gobiz",
    isAdmin ? user?.token : undefined
  );

  // Mutations
  const toggleOutletActive = useMutation(
    api.externalData.mutations.toggleOutletActive
  );
  const discoverK3MartOutlets = useConvexDiscoverK3MartOutlets();
  const syncK3MartSales = useConvexSyncK3MartSales();
  const syncGoBiz = useConvexSyncGoBiz();
  const syncInternal = useConvexSyncInternalOrders();

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

  return (
    <div className="space-y-6">
      {/* Integration Health Dashboard */}
      {canViewHealth && (
        <div className="grid gap-6 lg:grid-cols-2">
          <IntegrationHealthCard
            platformId="k3mart"
            platformMeta={PLATFORMS.k3mart}
            syncHealth={syncHealthStatus?.k3mart}
            credentialStatus={k3CredStatus ?? undefined}
            isAdmin={isAdmin}
            onSyncNow={handleSyncK3MartSales}
            onConfigure={() => setCredDialogOpen(true)}
            isSyncing={syncingK3MartSales}
            syncLabel="Sync Sales"
            onSecondarySync={handleDiscoverK3MartOutlets}
            secondarySyncLabel="Refresh Stores"
            isSecondarySyncing={discoveringK3Mart}
          />

          <IntegrationHealthCard
            platformId="gobiz"
            platformMeta={PLATFORMS.gobiz}
            syncHealth={syncHealthStatus?.gobiz}
            credentialStatus={gobizCredStatus ?? undefined}
            isAdmin={isAdmin}
            onSyncNow={handleSyncGoBiz}
            onConfigure={() => setGobizDialogOpen(true)}
            isSyncing={syncingGoBiz}
            syncLabel="Sync Journals"
          />

          <IntegrationHealthCard
            platformId="internal"
            platformMeta={PLATFORMS.internal}
            syncHealth={syncHealthStatus?.internal}
            credentialStatus={undefined}
            isAdmin={isAdmin}
            onSyncNow={handleSyncInternal}
            isSyncing={syncingInternal}
          />
        </div>
      )}

      {/* Admin-only dialogs */}
      {isAdmin && (
        <>
          <K3MartCredentialsDialog
            open={credDialogOpen}
            onOpenChange={setCredDialogOpen}
            currentEmail={k3CredStatus?.email}
          />
          <GoBizTokenDialog
            open={gobizDialogOpen}
            onOpenChange={setGobizDialogOpen}
            hasExistingToken={gobizCredStatus?.hasToken}
            tokenExpiresIn={gobizCredStatus?.tokenExpiresIn}
            hasRefreshToken={gobizCredStatus?.hasRefreshToken}
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
                          {outlet.source === "k3mart" ? "K3 Mart" : outlet.source === "internal" ? "Internal" : "GoBiz"}
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
                          ? new Date(outlet.lastSyncAt).toLocaleString(
                              "id-ID",
                              {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )
                          : "\u2014"}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
