/**
 * ComponentRow - Expandable row showing component with batch details
 *
 * Clean light design with prominent receive button and %used progress bar.
 * %used = available / (existing inventory at last restock).
 * 100% means stock is full (available == lastRestockTotalStock).
 */

import { useState } from "react";
import { ChevronDown, AlertTriangle, MapPin, MoreVertical, Archive, RotateCcw, Truck, Plus, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatCurrency, CONSUMPTION_STAGE_LABELS } from "@/lib/utils";
import { BatchCard } from "./BatchCard";
import { TransferStockDialog } from "./TransferStockDialog";
import { ReceiveStockDialog } from "./ReceiveStockDialog";
import { EditComponentDialog } from "./EditComponentDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useConvexComponentBatches, useConvexUpdateComponentType, useConvexDeleteComponentType } from "@/hooks/convex";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ComponentType } from "@/hooks/convex";

interface ComponentRowProps {
  component: ComponentType;
  stockByLocation: Array<{
    locationId: Id<"storageLocations">;
    locationName: string;
    totalStock: number;
    totalReserved: number;
    available: number;
    weightedUnitCostIdr: number;
    latestSupplierName?: string;
    latestPurchaseUrl?: string;
    latestUnitCostIdr?: number;
    lastRestockTotalStock?: number;
  }>;
  totalAvailable: number;
  totalReserved: number;
  isLowStock: boolean;
  locations: Array<{
    _id: Id<"storageLocations">;
    name: string;
  }>;
  isLegacy?: boolean;
}

export function ComponentRow({
  component,
  stockByLocation,
  totalAvailable,
  totalReserved,
  isLowStock,
  locations,
  isLegacy,
}: ComponentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedLocationForBatches, setSelectedLocationForBatches] = useState<
    Id<"storageLocations"> | null
  >(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [transferFromLocation, setTransferFromLocation] = useState<{
    id: Id<"storageLocations">;
    name: string;
    available: number;
  } | null>(null);

  // Get batches for selected location
  const batches = useConvexComponentBatches(
    expanded && selectedLocationForBatches ? component._id : undefined,
    selectedLocationForBatches ?? undefined,
    false
  );

  const updateComponentType = useConvexUpdateComponentType();
  const deleteComponentType = useConvexDeleteComponentType();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteComponentType({ id: component._id });
      toast.success(`${component.name} deleted`);
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete component");
    } finally {
      setIsDeleting(false);
    }
  };

  const isCritical =
    isLowStock &&
    component.reorderPoint &&
    totalAvailable <= component.reorderPoint * 0.25;

  // Default to first location with stock
  const defaultLocation = stockByLocation[0]?.locationId;
  if (expanded && !selectedLocationForBatches && defaultLocation) {
    setSelectedLocationForBatches(defaultLocation);
  }

  // Calculate %used from lastRestockTotalStock
  // Sum lastRestockTotalStock across all locations for the aggregate bar
  const totalLastRestock = stockByLocation.reduce(
    (sum, loc) => sum + (loc.lastRestockTotalStock ?? 0), 0
  );
  const hasUsedBar = totalLastRestock > 0 && !isLegacy;
  // %remaining: how much of the last restock volume is still available
  const percentRemaining = hasUsedBar
    ? Math.min(100, Math.round((totalAvailable / totalLastRestock) * 100))
    : null;

  const handleArchiveToggle = async () => {
    const newActive = !component.isActive;
    try {
      await updateComponentType({
        id: component._id,
        isActive: newActive,
      });
      toast.success(
        newActive
          ? `${component.name} restored to active inventory`
          : `${component.name} moved to legacy inventory`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update component");
    }
  };

  const openTransferDialog = (stock: typeof stockByLocation[0]) => {
    setTransferFromLocation({
      id: stock.locationId,
      name: stock.locationName,
      available: stock.available,
    });
    setTransferDialogOpen(true);
  };

  // Bar color based on percentage remaining
  // 50%+ green, 30-49% orange, below 30% red
  const getBarColor = (pct: number) => {
    if (pct < 30) return "bg-red-500";
    if (pct < 50) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <div
      className={cn(
        "rounded-lg border transition-all",
        expanded && "shadow-sm",
        isLegacy
          ? "border-border/50 bg-muted/20"
          : isCritical
            ? "border-red-300 bg-red-50/50"
            : isLowStock
              ? "border-amber-300 bg-amber-50/30"
              : "border-border hover:border-border/80 hover:shadow-sm"
      )}
    >
      {/* Collapsed Row */}
      <div>
        <div className="flex items-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-1 px-4 py-3 flex items-center gap-4 hover:bg-muted/30 transition-colors rounded-l-lg"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0",
                expanded && "rotate-180"
              )}
            />

            {/* Component Name & Category */}
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "font-medium truncate",
                  isLegacy ? "text-muted-foreground line-through" : "text-foreground"
                )}>
                  {component.name}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0"
                >
                  {CONSUMPTION_STAGE_LABELS[(component as Record<string, unknown>).consumptionStage as string] ?? component.category.replace("_", " ")}
                </Badge>
                {isLegacy && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Legacy
                  </Badge>
                )}
                {isLowStock && !isLegacy && (
                  <AlertTriangle
                    className={cn(
                      "h-3.5 w-3.5",
                      isCritical ? "text-red-500" : "text-amber-500"
                    )}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {component.unit} &middot; {formatCurrency(component.unitCostIdr)}/unit
                {component.reorderPoint ? ` \u00B7 Reorder at ${component.reorderPoint}` : ""}
              </p>
            </div>

            {/* Stock counts */}
            <div className="flex items-center gap-4 tabular-nums text-sm flex-shrink-0">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Avail</div>
                <div
                  className={cn(
                    "text-lg font-bold leading-none",
                    isLegacy
                      ? "text-muted-foreground"
                      : isCritical
                        ? "text-red-600"
                        : isLowStock
                          ? "text-amber-600"
                          : "text-emerald-600"
                  )}
                >
                  {totalAvailable}
                </div>
              </div>
              {totalReserved > 0 && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Rsv</div>
                  <div className="text-lg font-bold leading-none text-amber-600">
                    {totalReserved}
                  </div>
                </div>
              )}
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
                <div className="text-lg font-bold leading-none text-foreground">
                  {totalAvailable + totalReserved}
                </div>
              </div>
            </div>
          </button>

          {/* Receive Button + Kebab */}
          <div className="pr-3 flex items-center gap-1.5">
          {locations.length > 0 && !isLegacy && (
            <Button
              size="sm"
              onClick={() => setReceiveDialogOpen(true)}
              className="h-8 px-3 text-xs bg-[#E07856] hover:bg-[#D66A4A] text-white"
              title={`Receive ${component.name}`}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Receive
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              {component.isActive !== false ? (
                <DropdownMenuItem onClick={handleArchiveToggle}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive to Legacy
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={handleArchiveToggle}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore to Active
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

        {/* %Remaining Bar - full width below the row */}
        {hasUsedBar && percentRemaining !== null && (
          <div className="px-4 pb-3 pt-0">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2.5 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", getBarColor(percentRemaining))}
                  style={{ width: `${percentRemaining}%` }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                {percentRemaining}% &middot; {totalAvailable}/{totalLastRestock}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Transfer Stock Dialog */}
      {transferFromLocation && (
        <TransferStockDialog
          open={transferDialogOpen}
          onOpenChange={setTransferDialogOpen}
          componentTypeId={component._id}
          componentName={component.name}
          fromLocationId={transferFromLocation.id}
          fromLocationName={transferFromLocation.name}
          maxQuantity={transferFromLocation.available}
          locations={locations}
        />
      )}

      {/* Per-Component Receive Stock Dialog */}
      <ReceiveStockDialog
        open={receiveDialogOpen}
        onOpenChange={setReceiveDialogOpen}
        locations={locations}
        preselectedComponentId={component._id}
      />

      {/* Edit Dialog */}
      <EditComponentDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        component={component}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Component"
        description={`Are you sure you want to delete "${component.name}"? This cannot be undone. Components with inventory or BOM links cannot be deleted.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        variant="destructive"
        loading={isDeleting}
      />

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t p-4 space-y-4">
          {/* Supplier info */}
          {(() => {
            const supplierName = stockByLocation.find(s => s.latestSupplierName)?.latestSupplierName;
            const avgCosts = stockByLocation.filter(s => s.weightedUnitCostIdr > 0);
            const weightedAvgCost = avgCosts.length > 0
              ? avgCosts.reduce((sum, s) => sum + s.weightedUnitCostIdr * s.totalStock, 0) /
                avgCosts.reduce((sum, s) => sum + s.totalStock, 0)
              : null;
            if (!supplierName && !weightedAvgCost) return null;
            return (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
                {supplierName && <><Truck className="h-3.5 w-3.5" /><span>{supplierName}</span></>}
                {supplierName && weightedAvgCost ? <span>&middot;</span> : null}
                {weightedAvgCost ? <span>Avg {formatCurrency(weightedAvgCost)}/unit</span> : null}
              </div>
            );
          })()}

          {/* Location Breakdown */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Stock by Location
            </h4>
            <div className="grid gap-2 lg:grid-cols-3">
              {stockByLocation.map((stock) => (
                <div key={stock.locationId} className="flex items-center gap-1">
                  <Button
                    variant={
                      selectedLocationForBatches === stock.locationId
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => setSelectedLocationForBatches(stock.locationId)}
                    className="flex-1 justify-start text-sm"
                  >
                    <span className="flex-1 text-left truncate">
                      {stock.locationName}
                    </span>
                    <span className="text-emerald-600 font-bold">
                      {stock.available}
                    </span>
                    {stock.totalReserved > 0 && (
                      <span className="text-amber-600 text-xs">
                        +{stock.totalReserved}
                      </span>
                    )}
                  </Button>
                  {stock.available > 0 && locations.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openTransferDialog(stock)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-[#E07856]"
                      title="Transfer from this location"
                    >
                      <Truck className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Batch Details */}
          {selectedLocationForBatches && batches !== undefined && (
            <div>
              <h4 className="text-sm font-medium mb-2">
                Batches (FIFO Order)
              </h4>
              {batches === null || batches.batches.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No active batches at this location
                </div>
              ) : (
                <div className="space-y-2">
                  {batches.batches.map((batch, index) => (
                    <BatchCard
                      key={batch._id}
                      batch={batch}
                      isFifoNext={index === 0}
                      componentName={component.name}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
