/**
 * GrabFoodManager - Admin/Manager page for GrabFood POS integration.
 *
 * Features:
 * - Page-level outlet selector (filters all tabs)
 * - Orders tab: sync history, revenue table, custom date range
 * - Store Status tab: live status badge, pause/unpause, countdown timer
 * - Menu tab: item availability toggles, batch publish
 * - Settings tab: MerchantID management (add/edit outlets), OAuth credentials
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router";
import {
  Store,
  RefreshCw,
  Clock,
  Loader2,
  Plus,
  Pencil,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

// UI components
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Layout
import { PageHeader } from "@/components/layout/PageHeader";

// Hooks
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGrabFoodOrders,
  useGrabFoodOrderStats,
  useGrabFoodActions,
  useGrabFoodOutlets,
} from "@/hooks/convex/useGrabFood";
import { useProtectedMutation } from "@/hooks/convex/useProtectedMutation";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { GrabFoodCredentialsDialog } from "@/components/salesAnalytics/GrabFoodCredentialsDialog";

// ============================================
// HELPERS
// ============================================

function formatCurrencyIDR(amount: number | null | undefined): string {
  if (amount == null) return "Rp 0";
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatDateTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString("en-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function formatRelativeTime(ts?: number | null): string {
  if (!ts) return "Never";
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleDateString("en-ID", { timeZone: "Asia/Jakarta" });
}

// ============================================
// MAIN COMPONENT
// ============================================

export function GrabFoodManager() {
  useDocumentTitle("GrabFood Manager");

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab =
    tabParam === "store"
      ? "store"
      : tabParam === "menu"
        ? "menu"
        : tabParam === "settings"
          ? "settings"
          : "orders";

  const handleTabChange = (value: string) => {
    setSearchParams(value === "orders" ? {} : { tab: value }, { replace: true });
  };

  // ---- Outlets ----
  const { outlets, isLoading: loadingOutlets } = useGrabFoodOutlets();
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");

  // Auto-select first outlet
  useEffect(() => {
    if (outlets && outlets.length > 0 && !selectedOutletId) {
      setSelectedOutletId(outlets[0]._id);
    }
  }, [outlets, selectedOutletId]);

  const selectedOutlet = outlets?.find((o) => o._id === selectedOutletId);
  const merchantID = selectedOutlet?.externalId ?? "";

  // ---- Orders data ----
  const outletIdTyped = selectedOutletId
    ? (selectedOutletId as Id<"externalOutlets">)
    : undefined;
  const { orders, isLoading: loadingOrders } = useGrabFoodOrders(outletIdTyped);
  const { stats } = useGrabFoodOrderStats(outletIdTyped);

  return (
    <div className="space-y-6">
      <PageHeader
        title="GrabFood Manager"
        description="Manage orders, store status, and menu for GrabFood outlets"
      />

      {/* Outlet selector */}
      <div className="flex items-center gap-4">
        <Label className="text-sm font-medium whitespace-nowrap">Outlet:</Label>
        {loadingOutlets ? (
          <Skeleton className="h-10 w-[240px]" />
        ) : outlets && outlets.length > 0 ? (
          <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select outlet" />
            </SelectTrigger>
            <SelectContent>
              {outlets.map((outlet) => (
                <SelectItem key={outlet._id} value={outlet._id}>
                  {outlet.name} ({outlet.externalId})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">
            No outlets configured. Go to the Settings tab to add one.
          </p>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="store">Store Status</TabsTrigger>
          <TabsTrigger value="menu">Menu</TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-1" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <OrdersTab
            merchantID={merchantID}
            outletId={outletIdTyped}
            orders={orders}
            isLoading={loadingOrders}
            stats={stats}
            isAdmin={isAdmin}
          />
        </TabsContent>

        <TabsContent value="store" className="mt-4">
          <StoreStatusTab merchantID={merchantID} outletName={selectedOutlet?.name} />
        </TabsContent>

        <TabsContent value="menu" className="mt-4">
          <MenuTab merchantID={merchantID} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab outlets={outlets ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================
// ORDERS TAB
// ============================================

interface OrdersTabProps {
  merchantID: string;
  outletId?: Id<"externalOutlets">;
  orders: any[] | undefined;
  isLoading: boolean;
  stats: { totalOrders: number; lastSyncedAt: number | null } | undefined;
  isAdmin: boolean;
}

function OrdersTab({ merchantID, outletId, orders, isLoading, stats, isAdmin }: OrdersTabProps) {
  const actions = useGrabFoodActions();
  const [syncing, setSyncing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const handleSync = async () => {
    if (!merchantID) {
      toast.error("No outlet selected. Select an outlet or add one in Settings.");
      return;
    }

    setSyncing(true);
    try {
      const result = await actions.syncOrders(
        merchantID,
        outletId,
        fromDate || undefined,
        toDate || undefined
      );

      if (result.success) {
        toast.success(`Synced ${result.ordersCount} orders`);
      } else {
        toast.error(result.error ?? "Sync failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const paginatedOrders = useMemo(() => {
    if (!orders) return [];
    return orders.slice(page * pageSize, (page + 1) * pageSize);
  }, [orders, page]);

  const totalPages = orders ? Math.ceil(orders.length / pageSize) : 0;

  return (
    <div className="space-y-4">
      {/* Sync controls */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Button onClick={handleSync} disabled={syncing || !merchantID} className="min-h-[44px]">
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Syncing...
                    </>
                  ) : (
                    "Sync Order History"
                  )}
                </Button>
              )}
              <span className="text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5 inline mr-1" />
                Last synced: {formatRelativeTime(stats?.lastSyncedAt)}
              </span>
              {stats && (
                <Badge variant="secondary">{stats.totalOrders} orders</Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDatePicker(!showDatePicker)}
            >
              Custom Date
              {showDatePicker ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              )}
            </Button>
          </div>

          {showDatePicker && (
            <div className="flex items-end gap-3 mt-3 pt-3 border-t">
              <div>
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                }}
              >
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date/Time</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Promo</TableHead>
                <TableHead className="text-right">Net Revenue</TableHead>
                <TableHead>Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No orders found. Click "Sync Order History" to fetch from GrabFood.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedOrders.map((order: any) => {
                  const price = order.price ?? {};
                  const subtotal: number = price.subtotal ?? 0;
                  const promoTotal =
                    (price.grabFundPromo ?? 0) +
                    (price.merchantFundPromo ?? 0) +
                    (price.basketPromo ?? 0);
                  const netRevenue = subtotal - promoTotal;
                  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
                  const firstItem =
                    itemCount > 0 ? order.items[0]?.name ?? "Item" : "-";

                  return (
                    <TableRow key={order._id}>
                      <TableCell className="font-mono text-sm">
                        {order.shortOrderNumber || order.orderID?.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTime(order.orderTime)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {itemCount > 0
                          ? `${firstItem}${itemCount > 1 ? ` +${itemCount - 1}` : ""}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCurrencyIDR(subtotal)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-orange-600">
                        {promoTotal > 0 ? `-${formatCurrencyIDR(promoTotal)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrencyIDR(netRevenue)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {price.paymentType ?? order.paymentType ?? "-"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// STORE STATUS TAB
// ============================================

interface StoreStatusTabProps {
  merchantID: string;
  outletName?: string;
}

function StoreStatusTab({ merchantID, outletName }: StoreStatusTabProps) {
  const actions = useGrabFoodActions();
  const [loading, setLoading] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [storeData, setStoreData] = useState<any>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [pauseUntil, setPauseUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState("");

  const fetchStatus = useCallback(async () => {
    if (!merchantID) return;
    setLoading(true);
    try {
      const result = await actions.getStoreStatus(merchantID);
      if (result.success) {
        setStoreData(result.storeStatus);
        setLastChecked(Date.now());
      } else {
        toast.error(result.error ?? "Failed to fetch store status");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }, [merchantID, actions]);

  // Fetch on mount or merchantID change
  useEffect(() => {
    if (merchantID) {
      fetchStatus();
    }
  }, [merchantID]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer for paused state
  useEffect(() => {
    if (!pauseUntil) {
      setCountdown("");
      return;
    }

    const update = () => {
      const remaining = pauseUntil - Date.now();
      if (remaining <= 0) {
        setCountdown("Resuming...");
        setPauseUntil(null);
        return;
      }
      const mins = Math.ceil(remaining / 60_000);
      setCountdown(`Resumes in ${mins}m`);
    };

    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [pauseUntil]);

  const handlePause = async (duration: number) => {
    if (!merchantID) return;
    setPausing(true);
    try {
      const result = await actions.pauseStore(merchantID, duration);
      if (result.success) {
        toast.success(result.message);
        setPauseUntil(Date.now() + duration * 60_000);
        await fetchStatus();
      } else {
        toast.error(result.error ?? "Failed to pause store");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to pause store");
    } finally {
      setPausing(false);
    }
  };

  const handleUnpause = async () => {
    if (!merchantID) return;
    setPausing(true);
    try {
      const result = await actions.unpauseStore(merchantID);
      if (result.success) {
        toast.success(result.message);
        setPauseUntil(null);
        await fetchStatus();
      } else {
        toast.error(result.error ?? "Failed to unpause store");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unpause store");
    } finally {
      setPausing(false);
    }
  };

  // Derive status from store data — use closeReason from API to detect paused state
  const isOpen = storeData?.isOpen === true;
  const apiPaused = storeData?.closeReason === "mex_paused" || storeData?.closeReason === "ops_paused";
  const isPaused = apiPaused || (pauseUntil !== null && pauseUntil > Date.now());
  const statusLabel = isPaused ? "PAUSED" : isOpen ? "OPEN" : "CLOSED";
  const statusVariant = isPaused
    ? "outline"
    : isOpen
      ? "default"
      : "destructive";
  const statusColor = isPaused
    ? "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300"
    : "";

  if (!merchantID) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select an outlet to view store status.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                {outletName ?? "Store"}
              </CardTitle>
              <CardDescription className="mt-1">
                MerchantID: {merchantID}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1">Refresh Status</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {storeData === null && !loading ? (
            <p className="text-muted-foreground text-sm">
              Click Refresh Status to check the store.
            </p>
          ) : loading && storeData === null ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="space-y-4">
              {/* Status badge */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Status:</span>
                <Badge
                  variant={statusVariant as any}
                  className={statusColor}
                >
                  {statusLabel}
                </Badge>
                {isPaused && countdown && (
                  <span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
                    {countdown}
                  </span>
                )}
              </div>

              {/* Last checked */}
              {lastChecked && (
                <p className="text-xs text-muted-foreground">
                  Last checked: {formatRelativeTime(lastChecked)}
                </p>
              )}

              {/* Pause / Unpause controls */}
              <div className="flex gap-2 pt-2">
                {isOpen && !isPaused && (
                  <>
                    <span className="text-sm self-center mr-1">Pause for:</span>
                    {[30, 60, 120].map((mins) => (
                      <Button
                        key={mins}
                        variant="outline"
                        size="sm"
                        disabled={pausing}
                        onClick={() => handlePause(mins)}
                      >
                        {pausing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          `${mins} min`
                        )}
                      </Button>
                    ))}
                  </>
                )}
                {isPaused && (
                  <Button
                    variant="default"
                    size="sm"
                    disabled={pausing}
                    onClick={handleUnpause}
                  >
                    {pausing ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Unpausing...
                      </>
                    ) : (
                      "Unpause Store"
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// MENU TAB
// ============================================

interface MenuTabProps {
  merchantID: string;
  isAdmin: boolean;
}

interface MenuItem {
  id: string;
  name: string;
  price?: number;
  availableStatus: "AVAILABLE" | "UNAVAILABLE";
}

function MenuTab({ merchantID, isAdmin }: MenuTabProps) {
  const actions = useGrabFoodActions();
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, "AVAILABLE" | "UNAVAILABLE">
  >(new Map());

  const fetchMenu = useCallback(async () => {
    if (!merchantID) return;
    setLoading(true);
    try {
      const result = await actions.getMenuItems(merchantID);
      if (result.success && result.menu) {
        // Parse menu response — categories > items structure
        const items: MenuItem[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const menu = result.menu as any;

        if (menu.categories && Array.isArray(menu.categories)) {
          for (const cat of menu.categories) {
            if (cat.items && Array.isArray(cat.items)) {
              for (const item of cat.items) {
                items.push({
                  id: item.id ?? item.itemID ?? "",
                  name: item.name ?? "Unknown",
                  price: item.price ?? item.sellingPrice ?? undefined,
                  availableStatus: item.availableStatus ?? "AVAILABLE",
                });
              }
            }
          }
        }

        setMenuItems(items);
        setPendingChanges(new Map());
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const error = (result as any).error ?? "Failed to fetch menu";
        toast.error(error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch menu");
    } finally {
      setLoading(false);
    }
  }, [merchantID, actions]);

  // Fetch on mount / merchantID change
  useEffect(() => {
    if (merchantID) {
      fetchMenu();
    }
  }, [merchantID]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = (item: MenuItem) => {
    const newStatus =
      (pendingChanges.get(item.id) ?? item.availableStatus) === "AVAILABLE"
        ? "UNAVAILABLE"
        : "AVAILABLE";

    // If toggling back to original, remove from pending
    if (newStatus === item.availableStatus) {
      const next = new Map(pendingChanges);
      next.delete(item.id);
      setPendingChanges(next);
    } else {
      setPendingChanges(new Map(pendingChanges).set(item.id, newStatus));
    }
  };

  const handlePublish = async () => {
    if (pendingChanges.size === 0 || !merchantID) return;
    setPublishing(true);
    try {
      const items = Array.from(pendingChanges.entries()).map(([id, status]) => ({
        id,
        availableStatus: status,
      }));
      const result = await actions.batchUpdateAvailability(merchantID, items);
      if (result.success) {
        toast.success(`Published ${result.itemsUpdated} menu changes`);
        setPendingChanges(new Map());
        // Refresh menu to get updated state
        await fetchMenu();
      } else {
        toast.error(result.error ?? "Failed to publish changes");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  const getEffectiveStatus = (item: MenuItem) =>
    pendingChanges.get(item.id) ?? item.availableStatus;

  if (!merchantID) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select an outlet to view menu items.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh + publish */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchMenu}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1" />
          )}
          Refresh Menu
        </Button>
        {pendingChanges.size > 0 && (
          <Button
            onClick={handlePublish}
            disabled={publishing}
            className="min-h-[44px]"
          >
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Publishing...
              </>
            ) : (
              <>
                Publish Changes
                <Badge variant="secondary" className="ml-2">
                  {pendingChanges.size}
                </Badge>
              </>
            )}
          </Button>
        )}
      </div>

      {/* Menu items list */}
      <Card>
        <CardContent className="p-0">
          {loading && menuItems.length === 0 ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : menuItems.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No menu items found. Click Refresh Menu to fetch from GrabFood.
            </div>
          ) : (
            <div className="divide-y">
              {menuItems.map((item) => {
                const effectiveStatus = getEffectiveStatus(item);
                const isAvailable = effectiveStatus === "AVAILABLE";
                const hasChange = pendingChanges.has(item.id);

                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-4 py-3 ${
                      hasChange ? "bg-blue-50 dark:bg-blue-950/20" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono">
                          {item.id}
                        </span>
                        {item.price != null && (
                          <span className="text-xs text-muted-foreground">
                            {formatCurrencyIDR(item.price)}
                          </span>
                        )}
                        {hasChange && (
                          <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                            changed
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span className="text-xs text-muted-foreground">
                        {isAvailable ? "Available" : "Unavailable"}
                      </span>
                      <Switch
                        checked={isAvailable}
                        onCheckedChange={() => handleToggle(item)}
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// SETTINGS TAB
// ============================================

interface SettingsTabProps {
  outlets: Array<{
    _id: string;
    name: string;
    externalId: string;
    isActive: boolean;
    source: string;
  }>;
}

function SettingsTab({ outlets }: SettingsTabProps) {
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [outletDialogOpen, setOutletDialogOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<{
    name: string;
    merchantId: string;
  } | null>(null);

  return (
    <div className="space-y-6">
      {/* OAuth Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">OAuth Credentials</CardTitle>
          <CardDescription>
            GrabFood Partner API client credentials (OAuth2 client_credentials grant)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setCredDialogOpen(true)}>
            Configure Credentials
          </Button>
        </CardContent>
      </Card>

      {/* Outlet / MerchantID Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">GrabFood Outlets</CardTitle>
              <CardDescription>
                Manage outlet names and MerchantIDs. Each outlet corresponds to a
                store registered in GrabFood Merchant Portal.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditingOutlet(null);
                setOutletDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Outlet
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {outlets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No outlets configured. Click "Add Outlet" to register a GrabFood outlet
              with its MerchantID.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet Name</TableHead>
                  <TableHead>MerchantID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outlets.map((outlet) => (
                  <TableRow key={outlet._id}>
                    <TableCell className="font-medium">{outlet.name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {outlet.externalId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={outlet.isActive ? "default" : "secondary"}>
                        {outlet.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingOutlet({
                            name: outlet.name,
                            merchantId: outlet.externalId,
                          });
                          setOutletDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <GrabFoodCredentialsDialog
        open={credDialogOpen}
        onOpenChange={setCredDialogOpen}
      />
      <OutletDialog
        open={outletDialogOpen}
        onOpenChange={setOutletDialogOpen}
        editingOutlet={editingOutlet}
      />
    </div>
  );
}

// ============================================
// OUTLET DIALOG
// ============================================

interface OutletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingOutlet: { name: string; merchantId: string } | null;
}

function OutletDialog({ open, onOpenChange, editingOutlet }: OutletDialogProps) {
  const [name, setName] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [saving, setSaving] = useState(false);

  const upsertOutlet = useProtectedMutation(
    api.externalData.mutations.upsertOutlet
  );

  // Populate fields when editing
  useEffect(() => {
    if (open) {
      setName(editingOutlet?.name ?? "");
      setMerchantId(editingOutlet?.merchantId ?? "");
    }
  }, [open, editingOutlet]);

  const handleSave = async () => {
    if (!name.trim() || !merchantId.trim()) {
      toast.error("Outlet name and MerchantID are required");
      return;
    }

    setSaving(true);
    try {
      await upsertOutlet({
        source: "grabfood" as any,
        externalId: merchantId.trim(),
        name: name.trim(),
        isActive: true,
      });
      toast.success(
        editingOutlet ? "Outlet updated" : "Outlet added"
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save outlet"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingOutlet ? "Edit Outlet" : "Add GrabFood Outlet"}
          </DialogTitle>
          <DialogDescription>
            {editingOutlet
              ? "Update the outlet name or MerchantID."
              : "Register a new GrabFood outlet. The MerchantID can be found in the GrabFood Merchant Portal."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="outlet-name">Outlet Name</Label>
            <Input
              id="outlet-name"
              placeholder="e.g. Crystal, Goldfinch, Tamtem"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="outlet-merchant-id">MerchantID</Label>
            <Input
              id="outlet-merchant-id"
              placeholder="e.g. GFSBPOS-254-353"
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              disabled={saving}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Find this in GrabFood Merchant Portal or from live order webhooks.
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !merchantId.trim()}
            className="w-full min-h-[44px]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Saving...
              </>
            ) : editingOutlet ? (
              "Update Outlet"
            ) : (
              "Add Outlet"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
