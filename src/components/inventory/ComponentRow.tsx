/**
 * ComponentRow - Expandable row showing component with batch details
 */

import { useState } from "react";
import { ChevronDown, Package, AlertTriangle, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { BatchCard } from "./BatchCard";
import { useConvexComponentBatches } from "@/hooks/convex";
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
  }>;
  totalAvailable: number;
  totalReserved: number;
  isLowStock: boolean;
  locations: Array<{
    _id: Id<"storageLocations">;
    name: string;
  }>;
}

export function ComponentRow({
  component,
  stockByLocation,
  totalAvailable,
  totalReserved,
  isLowStock,
  locations: _locations,
}: ComponentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedLocationForBatches, setSelectedLocationForBatches] = useState<
    Id<"storageLocations"> | null
  >(null);

  // Get batches for selected location
  const batches = useConvexComponentBatches(
    expanded && selectedLocationForBatches ? component._id : undefined,
    selectedLocationForBatches ?? undefined,
    false
  );

  const isCritical =
    isLowStock &&
    component.reorderPoint &&
    totalAvailable <= component.reorderPoint * 0.25;

  // Default to first location with stock
  const defaultLocation = stockByLocation[0]?.locationId;
  if (expanded && !selectedLocationForBatches && defaultLocation) {
    setSelectedLocationForBatches(defaultLocation);
  }

  return (
    <Card
      className={cn(
        "border-slate-700 transition-all",
        expanded && "bg-slate-800/80",
        isCritical
          ? "border-red-800/50 bg-red-900/10"
          : isLowStock
          ? "border-amber-800/50 bg-amber-900/10"
          : "bg-slate-800/50"
      )}
    >
      {/* Collapsed Row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-slate-700/30 transition-colors"
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
            <span className="font-semibold text-slate-100 truncate">
              {component.name}
            </span>
            <Badge
              variant="outline"
              className="text-xs bg-slate-700/50 text-slate-300 border-slate-600"
            >
              {component.category.replace("_", " ")}
            </Badge>
            {isLowStock && (
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
        </div>

        {/* Stock Summary with Progress Bar */}
        <div className="flex items-center gap-4 font-mono text-sm">
          {/* Progress bar (only when reorder point is set) */}
          {component.reorderPoint && component.reorderPoint > 0 && (
            <div className="hidden sm:block w-24">
              <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isCritical
                      ? "bg-red-500"
                      : isLowStock
                        ? "bg-amber-500"
                        : totalAvailable > component.reorderPoint * 2
                          ? "bg-emerald-500"
                          : "bg-emerald-500"
                  )}
                  style={{
                    width: `${Math.min(100, (totalAvailable / (component.reorderPoint * 2)) * 100)}%`,
                  }}
                />
              </div>
              <div className="text-xs text-slate-500 text-center mt-0.5">
                {Math.round((totalAvailable / component.reorderPoint) * 100)}%
              </div>
            </div>
          )}

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-slate-400 text-xs">Available</div>
              <div
                className={cn(
                  "text-lg font-bold",
                  isCritical
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
                <Button
                  key={stock.locationId}
                  variant={
                    selectedLocationForBatches === stock.locationId
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedLocationForBatches(stock.locationId)}
                  className="justify-start font-mono"
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
