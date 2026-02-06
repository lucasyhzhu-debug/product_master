/**
 * ComponentRow - Expandable row showing component with batch details
 */

import { useState } from "react";
import { ChevronDown, Package, AlertTriangle, MapPin, MoreVertical, Archive, RotateCcw, Truck, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatCurrency } from "@/lib/utils";
import { BatchCard } from "./BatchCard";
import { TransferStockDialog } from "./TransferStockDialog";
import { ReceiveStockDialog } from "./ReceiveStockDialog";
import { useConvexComponentBatches, useConvexUpdateComponentType } from "@/hooks/convex";
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

  const isCritical =
    isLowStock &&
    component.reorderPoint &&
    totalAvailable <= component.reorderPoint * 0.25;

  // Default to first location with stock
  const defaultLocation = stockByLocation[0]?.locationId;
  if (expanded && !selectedLocationForBatches && defaultLocation) {
    setSelectedLocationForBatches(defaultLocation);
  }

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

  return (
    <Card
      className={cn(
        "border-slate-700 transition-all",
        expanded && "bg-slate-800/80",
        isLegacy
          ? "border-slate-700/50 bg-slate-800/30"
          : isCritical
            ? "border-red-800/50 bg-red-900/10"
            : isLowStock
              ? "border-amber-800/50 bg-amber-900/10"
              : "bg-slate-800/50"
      )}
    >
      {/* Collapsed Row */}
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 px-4 py-3 flex items-center gap-4 hover:bg-slate-700/30 transition-colors"
        >
          <ChevronDown
            className={cn(
              "h-5 w-5 text-slate-400 transition-transform flex-shrink-0",
              expanded && "rotate-180"
            )}
          />

          {/* Component Name & Category */}
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <span className={cn(
                "font-semibold truncate",
                isLegacy ? "text-slate-400 line-through" : "text-slate-100"
              )}>
                {component.name}
              </span>
              <Badge
                variant="outline"
                className="text-xs bg-slate-700/50 text-slate-300 border-slate-600"
              >
                {component.category.replace("_", " ")}
              </Badge>
              {isLegacy && (
                <Badge variant="outline" className="text-xs bg-slate-700/30 text-slate-500 border-slate-600">
                  Legacy
                </Badge>
              )}
              {isLowStock && !isLegacy && (
                <AlertTriangle
                  className={cn(
                    "h-4 w-4",
                    isCritical ? "text-red-400" : "text-amber-400"
                  )}
                />
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {component.unit} • {formatCurrency(component.unitCostIdr)}/unit
              {component.reorderPoint && ` • Reorder at ${component.reorderPoint}`}
            </p>
            {/* Supplier info from latest stock */}
            {(() => {
              const supplierName = stockByLocation.find(s => s.latestSupplierName)?.latestSupplierName;
              const avgCosts = stockByLocation.filter(s => s.weightedUnitCostIdr > 0);
              const weightedAvgCost = avgCosts.length > 0
                ? avgCosts.reduce((sum, s) => sum + s.weightedUnitCostIdr * s.totalStock, 0) /
                  avgCosts.reduce((sum, s) => sum + s.totalStock, 0)
                : null;
              if (!supplierName && !weightedAvgCost) return null;
              return (
                <p className="text-xs text-slate-500 mt-0.5">
                  {supplierName && <><Truck className="inline h-3 w-3 mr-0.5" />{supplierName}</>}
                  {supplierName && weightedAvgCost ? " • " : ""}
                  {weightedAvgCost ? `Avg ${formatCurrency(weightedAvgCost)}/unit` : ""}
                </p>
              );
            })()}
          </div>

          {/* Stock Summary with Thermometer Bar */}
          <div className="flex items-center gap-4 font-mono text-sm">
            {/* Thermometer bar (always visible when reorder point set, not legacy) */}
            {!isLegacy && component.reorderPoint && component.reorderPoint > 0 ? (
              <div className="w-28 flex-shrink-0">
                {(() => {
                  const reorderPoint = component.reorderPoint!;
                  const scale = Math.max(reorderPoint * 2, 1);
                  const fillPercent = Math.min(100, (totalAvailable / scale) * 100);
                  const reorderPercent = Math.round((totalAvailable / reorderPoint) * 100);
                  // Color: red (<25%), amber (25-75%), emerald (75-150%), blue (>150%)
                  const barColor = reorderPercent < 25
                    ? "bg-red-500"
                    : reorderPercent < 75
                      ? "bg-amber-500"
                      : reorderPercent < 150
                        ? "bg-emerald-500"
                        : "bg-blue-500";
                  return (
                    <>
                      <div className="relative h-4 rounded-full bg-slate-700 border border-slate-600 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", barColor)}
                          style={{ width: `${fillPercent}%` }}
                        />
                        {/* Reorder point marker at 50% width */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-white/40"
                          style={{ left: "50%" }}
                        />
                      </div>
                      <div className="text-xs text-slate-400 text-center mt-0.5">
                        {reorderPercent}%
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : !isLegacy ? (
              <div className="w-28 flex-shrink-0 text-center text-xs text-slate-500">
                {totalAvailable} {component.unit}
              </div>
            ) : null}

            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-slate-400 text-xs">Available</div>
                <div
                  className={cn(
                    "text-lg font-bold",
                    isLegacy
                      ? "text-slate-500"
                      : isCritical
                        ? "text-red-400"
                        : isLowStock
                          ? "text-amber-400"
                          : "text-emerald-400"
                  )}
                >
                  {totalAvailable}
                </div>
              </div>
              {totalReserved > 0 && (
                <div className="text-right">
                  <div className="text-slate-400 text-xs">Reserved</div>
                  <div className="text-lg font-bold text-amber-400">
                    {totalReserved}
                  </div>
                </div>
              )}
              <div className="text-right">
                <div className="text-slate-400 text-xs">Total</div>
                <div className="text-lg font-bold text-slate-200">
                  {totalAvailable + totalReserved}
                </div>
              </div>
            </div>
          </div>
        </button>

        {/* Receive + Kebab Menu */}
        <div className="pr-3 flex items-center gap-1">
          {locations.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReceiveDialogOpen(true)}
              className="h-8 px-2 text-xs text-slate-400 hover:text-emerald-400"
              title="Receive stock for this component"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Receive
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4 text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-slate-700 p-4 space-y-4">
          {/* Location Breakdown */}
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
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
                    className="flex-1 justify-start font-mono"
                  >
                    <span className="flex-1 text-left truncate">
                      {stock.locationName}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {stock.available}
                    </span>
                    {stock.totalReserved > 0 && (
                      <span className="text-amber-400 text-xs">
                        +{stock.totalReserved}
                      </span>
                    )}
                  </Button>
                  {stock.available > 0 && locations.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openTransferDialog(stock)}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-[#E07856]"
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
              <h4 className="text-sm font-semibold text-slate-300 mb-2">
                Batches (FIFO Order)
              </h4>
              {batches === null || batches.batches.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-4">
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
    </Card>
  );
}
