import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  useConvexExternalOutlets,
  useConvexExternalSyncLogs,
  useConvexDiscoverK3MartOutlets,
  useConvexSyncK3MartSales,
  useConvexSyncGoBiz,
  useConvexSyncInternalOrders,
} from "@/hooks/convex";
import { ConnectionGuide } from "./ConnectionGuide";
import { PLATFORMS } from "../../../convex/integrations/registry";
import type { Id } from "../../../convex/_generated/dataModel";

export function SettingsTab() {
  const { user } = useAuth();
  const [discoveringK3Mart, setDiscoveringK3Mart] = useState(false);
  const [syncingK3MartSales, setSyncingK3MartSales] = useState(false);
  const [syncingGoBiz, setSyncingGoBiz] = useState(false);
  const [syncingInternal, setSyncingInternal] = useState(false);

  // Fetch data
  const { data: outlets, isLoading: loadingOutlets } =
    useConvexExternalOutlets();
  const { data: syncLogs, isLoading: loadingSyncLogs } =
    useConvexExternalSyncLogs(undefined, 50);

  // Mutations
  const toggleOutletActive = useMutation(
    api.externalData.mutations.toggleOutletActive
  );
  const discoverK3MartOutlets = useConvexDiscoverK3MartOutlets();
  const syncK3MartSales = useConvexSyncK3MartSales();
  const syncGoBiz = useConvexSyncGoBiz();
  const syncInternal = useConvexSyncInternalOrders();

  // Get latest sync logs per platform
  const k3MartLogs = (syncLogs || []).filter(
    (log) => log.source === "k3mart"
  );
  const gobizLogs = (syncLogs || []).filter(
    (log) => log.source === "gobiz"
  );
  const internalLogs = (syncLogs || []).filter(
    (log) => log.source === "internal"
  );
  const latestK3MartLog = k3MartLogs[0];
  const latestGoBizLog = gobizLogs[0];
  const latestInternalLog = internalLogs[0];

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
      {/* Platform Connections */}
      <Accordion type="single" collapsible defaultValue="platform-connections">
        <AccordionItem value="platform-connections">
          <AccordionTrigger>Platform Connections</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              {/* K3 Mart — Primary: Sync Sales (fast), Secondary: Refresh Stores (slow) */}
              <ConnectionGuide
                platformName={PLATFORMS.k3mart.name}
                description={PLATFORMS.k3mart.description}
                tokenLifespan={PLATFORMS.k3mart.tokenLifespan}
                reconnectSteps={PLATFORMS.k3mart.reconnectSteps}
                lastSyncAt={latestK3MartLog?.timestamp}
                lastSyncStatus={
                  latestK3MartLog?.status === "success"
                    ? "success"
                    : latestK3MartLog?.status === "error"
                    ? "error"
                    : null
                }
                lastSyncError={latestK3MartLog?.errorMessage}
                isSyncing={syncingK3MartSales}
                onSync={handleSyncK3MartSales}
                onSecondarySync={handleDiscoverK3MartOutlets}
                secondarySyncLabel="Refresh Stores"
                isSecondarySyncing={discoveringK3Mart}
              />

              {/* GoBiz */}
              <ConnectionGuide
                platformName={PLATFORMS.gobiz.name}
                description={PLATFORMS.gobiz.description}
                tokenLifespan={PLATFORMS.gobiz.tokenLifespan}
                reconnectSteps={PLATFORMS.gobiz.reconnectSteps}
                lastSyncAt={latestGoBizLog?.timestamp}
                lastSyncStatus={
                  latestGoBizLog?.status === "success"
                    ? "success"
                    : latestGoBizLog?.status === "error"
                    ? "error"
                    : null
                }
                lastSyncError={latestGoBizLog?.errorMessage}
                isSyncing={syncingGoBiz}
                onSync={handleSyncGoBiz}
              />

              {/* Internal Orders */}
              <ConnectionGuide
                platformName={PLATFORMS.internal.name}
                description={PLATFORMS.internal.description}
                tokenLifespan={PLATFORMS.internal.tokenLifespan}
                reconnectSteps={PLATFORMS.internal.reconnectSteps}
                lastSyncAt={latestInternalLog?.timestamp}
                lastSyncStatus={
                  latestInternalLog?.status === "success"
                    ? "success"
                    : latestInternalLog?.status === "error"
                    ? "error"
                    : null
                }
                lastSyncError={latestInternalLog?.errorMessage}
                isSyncing={syncingInternal}
                onSync={handleSyncInternal}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Outlet Management */}
        <AccordionItem value="outlet-management">
          <AccordionTrigger>
            Outlet Management ({outlets?.length || 0} outlets)
          </AccordionTrigger>
          <AccordionContent>
            {loadingOutlets || outlets === undefined ? (
              <div className="space-y-3 pt-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : outlets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No outlets found. Sync data from platforms to see outlets here.
              </div>
            ) : (
              <div className="overflow-x-auto pt-2">
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
                                  ? "border-blue-500 text-blue-700"
                                  : outlet.source === "internal"
                                  ? "border-emerald-500 text-emerald-700"
                                  : "border-purple-500 text-purple-700"
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
          </AccordionContent>
        </AccordionItem>

        {/* Sync History */}
        <AccordionItem value="sync-history">
          <AccordionTrigger>
            Sync History ({syncLogs?.length || 0} entries)
          </AccordionTrigger>
          <AccordionContent>
            {loadingSyncLogs || syncLogs === undefined ? (
              <div className="space-y-3 pt-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : syncLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No sync history yet. Trigger a sync to see logs here.
              </div>
            ) : (
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium">Time</th>
                      <th className="text-left py-3 px-2 font-medium">
                        Platform
                      </th>
                      <th className="text-left py-3 px-2 font-medium">Status</th>
                      <th className="text-right py-3 px-2 font-medium">
                        Products
                      </th>
                      <th className="text-right py-3 px-2 font-medium">
                        Duration
                      </th>
                      <th className="text-left py-3 px-2 font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncLogs.map((log) => {
                      const durationStr = log.durationMs
                        ? log.durationMs < 1000
                          ? `${log.durationMs}ms`
                          : `${(log.durationMs / 1000).toFixed(1)}s`
                        : "\u2014";

                      return (
                        <tr key={log._id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-2">
                            {new Date(log.timestamp).toLocaleString("id-ID", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-3 px-2">
                            <Badge
                              variant="outline"
                              className={
                                log.source === "k3mart"
                                  ? "border-blue-500 text-blue-700"
                                  : log.source === "internal"
                                  ? "border-emerald-500 text-emerald-700"
                                  : "border-purple-500 text-purple-700"
                              }
                            >
                              {log.source === "k3mart" ? "K3 Mart" : log.source === "internal" ? "Internal" : "GoBiz"}
                            </Badge>
                          </td>
                          <td className="py-3 px-2">
                            {log.status === "success" ? (
                              <Badge
                                variant="outline"
                                className="border-green-500 text-green-700"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Success
                              </Badge>
                            ) : log.status === "error" ? (
                              <Badge
                                variant="outline"
                                className="border-red-500 text-red-700"
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Error
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-gray-700">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Started
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right">
                            {log.productsCount || "\u2014"}
                          </td>
                          <td className="py-3 px-2 text-right">{durationStr}</td>
                          <td className="py-3 px-2 text-red-600 text-xs">
                            {log.errorMessage || "\u2014"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
