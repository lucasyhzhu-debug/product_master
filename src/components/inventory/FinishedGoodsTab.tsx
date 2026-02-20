/**
 * FinishedGoodsTab — Main tab content for finished goods inventory view.
 *
 * Layout:
 * - Low-stock alert banner (if any)
 * - Action bar (Add Stock, settings toggle)
 * - Product stock grid (2 cols desktop, 1 col mobile)
 * - Inline settings section (admin/manager only, collapsible)
 * - Full transaction log section (collapsible)
 */

import { useState, useMemo } from "react";
import {
  AlertTriangle,
  Plus,
  Settings,
  ChevronDown,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useProductInventory, useConvexStorageLocations } from "@/hooks/convex";
import { ProductStockCard } from "./ProductStockCard";
import { FGAddStockDialog } from "./FGAddStockDialog";
import { TransactionLogPanel } from "./TransactionLogPanel";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ProductStockGroup } from "@/hooks/convex";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function FinishedGoodsTab() {
  const { user, hasRole } = useAuth();
  const isManager = hasRole("manager", "admin");
  const isAdmin = hasRole("admin");

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [txLogOpen, setTxLogOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Settings form state
  const [thresholdInput, setThresholdInput] = useState<string>("");
  const [settingsDefaultLocation, setSettingsDefaultLocation] = useState<string>("");
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [alertMode, setAlertMode] = useState<"toast" | "toast_and_badge">("toast");
  const [settingsInitialized, setSettingsInitialized] = useState(false);

  const { stockOverview, lowStockAlerts, settings, updateSettings } = useProductInventory();
  const locations = useConvexStorageLocations(true);

  // Initialize settings form when settings load
  if (settings && !settingsInitialized) {
    setThresholdInput(String(settings.globalLowStockThreshold));
    setSettingsDefaultLocation(settings.defaultAddLocationId ?? "");
    setAutoAdvance(settings.autoAdvanceOnDrawdown);
    setAlertMode(settings.alertMode);
    setSettingsInitialized(true);
  }

  // Derive default location for Add Stock from settings or first active location
  const defaultAddLocationId = useMemo(() => {
    if (settings?.defaultAddLocationId) return settings.defaultAddLocationId;
    if (locations) {
      const defaultLoc = locations.find((l) => l.isDefault);
      if (defaultLoc) return defaultLoc._id;
      if (locations.length > 0) return locations[0]._id;
    }
    return undefined;
  }, [settings, locations]);

  // Group stockOverview rows by menuProductId
  const productGroups = useMemo((): ProductStockGroup[] => {
    if (!stockOverview) return [];

    const groupMap = new Map<string, ProductStockGroup>();

    for (const row of stockOverview) {
      if (!row.menuProduct) continue;

      const productIdStr = row.menuProduct._id as string;

      if (!groupMap.has(productIdStr)) {
        groupMap.set(productIdStr, {
          menuProductId: row.menuProduct._id,
          menuProductName: row.menuProduct.name,
          menuProductCode: row.menuProduct.code,
          totalQuantity: 0,
          isLowStock: false,
          locations: [],
        });
      }

      const group = groupMap.get(productIdStr)!;
      group.totalQuantity += row.quantity;

      if (row.location) {
        group.locations.push({
          locationId: row.location._id,
          locationName: row.location.name,
          locationType: row.location.locationType,
          quantity: row.quantity,
          effectiveThreshold: row.effectiveThreshold,
          isLowStock: row.isLowStock,
          rowId: row._id,
        });
      }

      if (row.isLowStock) {
        group.isLowStock = true;
      }
    }

    // Sort: low stock first, then by name
    return [...groupMap.values()].sort((a, b) => {
      if (a.isLowStock && !b.isLowStock) return -1;
      if (!a.isLowStock && b.isLowStock) return 1;
      return a.menuProductName.localeCompare(b.menuProductName);
    });
  }, [stockOverview]);

  const handleSaveSettings = async () => {
    if (!user?.token) return;

    const threshold = Number(thresholdInput);
    if (isNaN(threshold) || threshold < 1) {
      toast.error("Threshold must be a non-negative number");
      return;
    }

    setIsSavingSettings(true);
    try {
      await updateSettings({
        token: user.token,
        globalLowStockThreshold: threshold,
        defaultAddLocationId: (settingsDefaultLocation || undefined) as Id<"storageLocations"> | undefined,
        autoAdvanceOnDrawdown: autoAdvance,
        alertMode,
      });
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Loading state
  if (stockOverview === undefined || lowStockAlerts === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Low-stock alert banner */}
      {lowStockAlerts.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-red-800">
              {lowStockAlerts.length} product{lowStockAlerts.length !== 1 ? "s" : ""} low on stock
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lowStockAlerts.map((alert) => (
              <span
                key={alert._id}
                className="text-xs bg-red-100 text-red-700 rounded px-2 py-0.5 font-medium"
              >
                {alert.menuProductName ?? "Unknown"} ({alert.quantity} left)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button
          onClick={() => setAddDialogOpen(true)}
          className="shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Stock
        </Button>

        <div className="flex gap-2">
          {isManager && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={cn(settingsOpen && "bg-muted")}
            >
              <Settings className="h-4 w-4 mr-1.5" />
              Settings
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 ml-1 transition-transform",
                  settingsOpen && "rotate-180"
                )}
              />
            </Button>
          )}
        </div>
      </div>

      {/* Settings Panel (collapsible, manager/admin only) */}
      {settingsOpen && isManager && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Finished Goods Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Global low-stock threshold */}
              <div className="space-y-2">
                <Label htmlFor="fg-threshold" className="text-sm">
                  Global Low-Stock Threshold
                </Label>
                <Input
                  id="fg-threshold"
                  type="number"
                  min="0"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  placeholder="5"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Alert when stock at any location falls at or below this number
                </p>
              </div>

              {/* Default add-stock location */}
              <div className="space-y-2">
                <Label htmlFor="fg-default-loc" className="text-sm">
                  Default Add-Stock Location
                </Label>
                <Select
                  value={settingsDefaultLocation}
                  onValueChange={(v) => setSettingsDefaultLocation(v)}
                >
                  <SelectTrigger id="fg-default-loc">
                    <SelectValue placeholder="Select location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(locations ?? []).map((loc) => (
                      <SelectItem key={loc._id} value={loc._id}>
                        {loc.name}
                        {loc.isDefault && " (default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isAdmin && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                {/* Auto-advance on drawdown */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">Auto-advance on Drawdown</Label>
                    <p className="text-xs text-muted-foreground">
                      When ON, fulfilling an order from inventory automatically moves it to "Awaiting Delivery" — no manual status change needed.
                    </p>
                  </div>
                  <Switch
                    checked={autoAdvance}
                    onCheckedChange={setAutoAdvance}
                  />
                </div>

                {/* Alert mode */}
                <div className="space-y-2">
                  <Label className="text-sm">Alert Mode</Label>
                  <Select
                    value={alertMode}
                    onValueChange={(v) => setAlertMode(v as "toast" | "toast_and_badge")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="toast">Toast only</SelectItem>
                      <SelectItem value="toast_and_badge">Toast + Badge</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    How to notify when stock runs low: "Toast only" shows a pop-up; "Toast + Badge" also shows a red indicator on the Finished Goods tab.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
              >
                {isSavingSettings ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product Stock Grid */}
      {productGroups.length === 0 ? (
        <div className="py-16 text-center">
          <div className="bg-muted/50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-base font-medium mb-1">No finished goods tracked yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Run the seed migration from the Convex dashboard, then add stock to get started.
          </p>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Stock
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {productGroups.map((group) => (
            <ProductStockCard
              key={group.menuProductId}
              group={group}
              locations={locations ?? []}
              defaultLocationId={defaultAddLocationId}
            />
          ))}
        </div>
      )}

      {/* Transaction History (collapsible full log) */}
      <div className="border rounded-lg">
        <button
          type="button"
          className="w-full flex items-center justify-between p-4 text-sm font-medium hover:bg-muted/30 transition-colors rounded-lg"
          onClick={() => setTxLogOpen(!txLogOpen)}
        >
          <span>Recent Transactions</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              txLogOpen && "rotate-180"
            )}
          />
        </button>
        {txLogOpen && (
          <div className="px-4 pb-4 border-t pt-3">
            <TransactionLogPanel />
          </div>
        )}
      </div>

      {/* Add Stock Dialog (global — no preselected product) */}
      <FGAddStockDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        locations={locations ?? []}
        defaultLocationId={defaultAddLocationId}
      />
    </div>
  );
}
