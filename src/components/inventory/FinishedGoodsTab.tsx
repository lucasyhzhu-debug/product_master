/**
 * FinishedGoodsTab — Main tab content for finished goods inventory view.
 *
 * Layout:
 * - Hero section (grand totals, location-type breakdown, alert count)
 * - Low-stock alert banner (if any)
 * - Action bar (Add Stock, Move Stock, grouping toggle, settings)
 * - Data section: product-grouped or location-grouped view with inline transfer actions
 * - Settings panel (manager/admin only, collapsible)
 * - Full transaction log section (collapsible)
 *
 * Grouping modes:
 * - Product-grouped (default): one card per menuProduct, sub-list of locations
 * - Location-grouped: one section per storageLocation, list products inside
 * - Platform-grouped: summary by platform bucket (Internal/GoFood/K3Mart)
 *
 * Sub-components extracted to sibling files:
 * - InlineTransferForm, ProductGroupedView, LocationGroupedView, PlatformGroupedView
 * - FinishedGoodsSettings
 * - Types and helpers in finishedGoodsUtils.ts
 */

import { useState, useMemo } from "react";
import {
  AlertTriangle,
  Plus,
  Settings,
  ChevronDown,
  ShoppingBag,
  ArrowLeftRight,
  Package,
  MapPin,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProductInventory,
  useProductInventoryGrouped,
  useStorageLocations,
} from "@/hooks/convex";
import { ProductStockCard } from "./ProductStockCard";
import { FGAddStockDialog } from "./FGAddStockDialog";
import { FGAdjustDialog } from "./FGAdjustDialog";
import { TransactionLogPanel } from "./TransactionLogPanel";
import { FinishedGoodsHero } from "./FinishedGoodsHero";
import { StockTransferModal } from "./StockTransferModal";
import { ProductGroupedView } from "./ProductGroupedView";
import { LocationGroupedView } from "./LocationGroupedView";
import { PlatformGroupedView } from "./PlatformGroupedView";
import { FinishedGoodsSettings } from "./FinishedGoodsSettings";
import type { GroupingMode, AdjustDialogState } from "./finishedGoodsUtils";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ProductStockGroup } from "@/hooks/convex";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";

// ============================================================================
// MAIN TAB
// ============================================================================

export function FinishedGoodsTab() {
  const { user, hasRole } = useAuth();
  const isManager = hasRole("manager", "admin");
  const isAdmin = hasRole("admin");

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [moveStockOpen, setMoveStockOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [txLogOpen, setTxLogOpen] = useState(false);
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("product");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [adjustDialogState, setAdjustDialogState] = useState<AdjustDialogState | null>(null);

  // Settings form state
  const [thresholdInput, setThresholdInput] = useState<string>("");
  const [settingsDefaultLocation, setSettingsDefaultLocation] = useState<string>("");
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [alertMode, setAlertMode] = useState<"toast" | "toast_and_badge">("toast");
  const [settingsInitialized, setSettingsInitialized] = useState(false);

  const { stockOverview, lowStockAlerts, settings, updateSettings } = useProductInventory();
  const groupedOverview = useProductInventoryGrouped();
  const locations = useStorageLocations(true);
  const transferStockMutation = useMutation(api.productInventory.mutations.transferStock);
  const updateLocationTypeMut = useSessionMutation(api.storageLocations.mutations.update);

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

  // Group stockOverview rows by menuProductId (for ProductStockCard grid — existing behavior)
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

  // Handle transfer stock action (called by inline forms)
  const handleTransfer = async (
    menuProductId: Id<"menuProducts">,
    sourceLocationId: Id<"storageLocations">,
    destinationLocationId: Id<"storageLocations">,
    quantity: number
  ) => {
    if (!user?.token) {
      toast.error("Not authenticated");
      return;
    }
    try {
      await transferStockMutation({
        token: user.token,
        menuProductId,
        sourceLocationId,
        destinationLocationId,
        quantity,
      });
      toast.success(`Transferred ${quantity} unit${quantity !== 1 ? "s" : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer failed");
      throw error;
    }
  };

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

  const handleUpdateLocationType = async (locId: string, newType: string) => {
    await updateLocationTypeMut({
      id: locId as Id<"storageLocations">,
      locationType: newType as "office" | "kitchen" | "depot" | "venue",
    });
  };

  // Loading state
  if (stockOverview === undefined || lowStockAlerts === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-12 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    );
  }

  // Simplified locations list for transfer forms
  const locationsForTransfer = (locations ?? []).map((l) => ({
    _id: l._id,
    name: l.name,
  }));

  return (
    <div className="space-y-4">
      {/* Hero section — grand totals, location-type breakdown, alert count */}
      {groupedOverview !== undefined && (
        <FinishedGoodsHero
          productGroups={groupedOverview}
          globalLowStockThreshold={settings?.globalLowStockThreshold}
        />
      )}

      {/* Low-stock alert banner */}
      {lowStockAlerts.length > 0 && (
        <div className="rounded-lg bg-[var(--color-status-error-bg)] border border-[var(--color-status-error)]/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-[var(--color-status-error)] flex-shrink-0" />
            <span className="text-sm font-semibold text-[var(--color-status-error)]">
              {lowStockAlerts.length} product{lowStockAlerts.length !== 1 ? "s" : ""} low on stock
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lowStockAlerts.map((alert) => (
              <span
                key={alert._id}
                className="text-xs bg-[var(--color-status-error)]/10 text-[var(--color-status-error)] rounded px-2 py-0.5 font-medium"
              >
                {alert.menuProductName ?? "Unknown"} ({alert.quantity} left)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left: primary actions */}
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddDialogOpen(true)} className="shadow-sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Stock
          </Button>

          {isManager && (
            <Button
              variant="outline"
              onClick={() => setMoveStockOpen(true)}
            >
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              Move Stock
            </Button>
          )}
        </div>

        {/* Right: grouping toggle + settings */}
        <div className="flex items-center gap-2">
          {/* Grouping toggle */}
          {productGroups.length > 0 && (
            <div className="flex items-center border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setGroupingMode("product")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
                  groupingMode === "product"
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <Package className="h-3.5 w-3.5" />
                By Product
              </button>
              <button
                type="button"
                onClick={() => setGroupingMode("location")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 border-l",
                  groupingMode === "location"
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <MapPin className="h-3.5 w-3.5" />
                By Location
              </button>
              <button
                type="button"
                onClick={() => setGroupingMode("platform")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 border-l",
                  groupingMode === "platform"
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <Layers className="h-3.5 w-3.5" />
                By Platform
              </button>
            </div>
          )}

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
        <FinishedGoodsSettings
          thresholdInput={thresholdInput}
          onThresholdChange={setThresholdInput}
          settingsDefaultLocation={settingsDefaultLocation}
          onDefaultLocationChange={setSettingsDefaultLocation}
          autoAdvance={autoAdvance}
          onAutoAdvanceChange={setAutoAdvance}
          alertMode={alertMode}
          onAlertModeChange={setAlertMode}
          locations={locations ?? []}
          onUpdateLocationType={handleUpdateLocationType}
          onSave={handleSaveSettings}
          isSaving={isSavingSettings}
          isAdmin={isAdmin}
        />
      )}

      {/* Data section: grouped view with inline transfer actions */}
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
      ) : groupingMode === "platform" ? (
        groupedOverview ? (
          <PlatformGroupedView productGroups={groupedOverview} />
        ) : (
          <Skeleton className="h-32 w-full" />
        )
      ) : groupingMode === "product" ? (
        groupedOverview ? (
          <ProductGroupedView
            productGroups={groupedOverview}
            allLocations={locationsForTransfer}
            onTransfer={handleTransfer}
            onAdjust={setAdjustDialogState}
            token={user?.token ?? ""}
          />
        ) : (
          /* Fallback: original ProductStockCard grid while groupedOverview loads */
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
        )
      ) : (
        groupedOverview ? (
          <LocationGroupedView
            productGroups={groupedOverview}
            allLocations={locationsForTransfer}
            onTransfer={handleTransfer}
            onAdjust={setAdjustDialogState}
          />
        ) : (
          <Skeleton className="h-32 w-full" />
        )
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

      {/* Global Move Stock Modal */}
      <StockTransferModal
        open={moveStockOpen}
        onOpenChange={setMoveStockOpen}
        locations={locations ?? []}
        productGroups={groupedOverview ?? []}
      />

      {/* Adjust Stock Dialog */}
      {adjustDialogState && (
        <FGAdjustDialog
          menuProductId={adjustDialogState.menuProductId}
          menuProductName={adjustDialogState.menuProductName}
          locationId={adjustDialogState.locationId}
          locationName={adjustDialogState.locationName}
          currentQuantity={adjustDialogState.currentQuantity}
          open={adjustDialogState !== null}
          onClose={() => setAdjustDialogState(null)}
        />
      )}
    </div>
  );
}
