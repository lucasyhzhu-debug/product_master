/**
 * ProductStockCard — Card component showing a menu product's stock
 * with per-location breakdown, low-stock indicators, and action buttons.
 */

import { useState } from "react";
import { AlertTriangle, Plus, Settings2, History, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { FGAddStockDialog } from "./FGAddStockDialog";
import { FGAdjustStockDialog } from "./FGAdjustStockDialog";
import { TransactionLogPanel } from "./TransactionLogPanel";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ProductStockGroup } from "@/hooks/convex";

interface ProductStockCardProps {
  group: ProductStockGroup;
  locations: Array<{ _id: Id<"storageLocations">; name: string; isDefault?: boolean }>;
  defaultLocationId?: Id<"storageLocations">;
}

export function ProductStockCard({
  group,
  locations,
  defaultLocationId,
}: ProductStockCardProps) {
  const { hasRole } = useAuth();
  const isManager = hasRole("manager", "admin");

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const isNegativeStock = group.totalQuantity < 0;

  return (
    <Card
      className={cn(
        "transition-all",
        isNegativeStock
          ? "border-red-400 bg-red-50/60"
          : group.isLowStock
            ? "border-amber-300 bg-amber-50/30"
            : "border-border"
      )}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground truncate">
                {group.menuProductName}
              </h3>
              {(isNegativeStock || group.isLowStock) && (
                <AlertTriangle
                  className={cn(
                    "h-4 w-4 flex-shrink-0",
                    isNegativeStock ? "text-red-500" : "text-amber-500"
                  )}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{group.menuProductCode}</p>
          </div>

          {/* Total Stock Badge */}
          <Badge
            className={cn(
              "text-base font-bold px-3 py-1 flex-shrink-0",
              isNegativeStock
                ? "bg-red-100 text-red-700 border-red-300"
                : group.isLowStock
                  ? "bg-amber-100 text-amber-700 border-amber-300"
                  : "bg-emerald-100 text-emerald-700 border-emerald-300"
            )}
            variant="outline"
          >
            {group.totalQuantity}
          </Badge>
        </div>

        {/* Per-Location Rows */}
        {group.locations.length > 0 && (
          <div className="space-y-1.5">
            {group.locations.map((loc) => (
              <div
                key={loc.locationId}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground text-xs">
                  {loc.locationName}
                </span>
                <span
                  className={cn(
                    "font-medium tabular-nums text-xs",
                    loc.quantity < 0
                      ? "text-red-600"
                      : loc.isLowStock
                        ? "text-amber-600"
                        : "text-foreground"
                  )}
                >
                  {loc.quantity}
                  {loc.isLowStock && loc.quantity >= 0 && (
                    <span className="ml-1 text-amber-500">(low)</span>
                  )}
                  {loc.quantity < 0 && (
                    <span className="ml-1 text-red-500">(neg)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Negative stock warning */}
        {isNegativeStock && (
          <p className="text-xs text-red-600 font-medium">
            Negative stock — inventory needs correction
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 pt-1 border-t flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs flex-1"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Stock
          </Button>

          {isManager && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs flex-1"
              onClick={() => setAdjustDialogOpen(true)}
            >
              <Settings2 className="h-3 w-3 mr-1" />
              Adjust
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 text-xs",
              historyOpen && "bg-muted"
            )}
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <History className="h-3 w-3 mr-1" />
            History
            <ChevronDown
              className={cn(
                "h-3 w-3 ml-1 transition-transform",
                historyOpen && "rotate-180"
              )}
            />
          </Button>
        </div>

        {/* Transaction History (collapsible) */}
        {historyOpen && (
          <div className="border-t pt-3">
            <TransactionLogPanel menuProductId={group.menuProductId} />
          </div>
        )}
      </CardContent>

      {/* Add Stock Dialog */}
      <FGAddStockDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        preselectedProductId={group.menuProductId}
        preselectedProductName={group.menuProductName}
        locations={locations}
        defaultLocationId={defaultLocationId}
      />

      {/* Adjust Stock Dialog */}
      {isManager && (
        <FGAdjustStockDialog
          open={adjustDialogOpen}
          onOpenChange={setAdjustDialogOpen}
          preselectedProductId={group.menuProductId}
          preselectedProductName={group.menuProductName}
          locations={locations}
          defaultLocationId={defaultLocationId}
        />
      )}
    </Card>
  );
}
