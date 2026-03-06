/**
 * ProductGroupedView — Renders finished goods inventory grouped by product.
 *
 * Each product card shows all locations where that product has stock,
 * with inline Move/Receive/Adjust actions per location row.
 */

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Package,
  MapPin,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AdjustDialogState, InlineTransferState, GroupedProductRow } from "./finishedGoodsUtils";
import { InlineTransferForm } from "./InlineTransferForm";

export type ProductGroupedViewProps = {
  productGroups: GroupedProductRow[];
  allLocations: Array<{ _id: Id<"storageLocations">; name: string }>;
  onTransfer: (
    menuProductId: Id<"menuProducts">,
    sourceLocationId: Id<"storageLocations">,
    destinationLocationId: Id<"storageLocations">,
    quantity: number
  ) => Promise<void>;
  onAdjust: (state: AdjustDialogState) => void;
};

export function ProductGroupedView({
  productGroups,
  allLocations,
  onTransfer,
  onAdjust,
}: ProductGroupedViewProps) {
  const [openInline, setOpenInline] = useState<InlineTransferState | null>(null);

  const handleOpenInline = (
    menuProductId: Id<"menuProducts">,
    menuProductName: string,
    locationId: Id<"storageLocations">,
    locationName: string,
    direction: "move_to" | "receive_from",
    availableAtSource: number
  ) => {
    // Close if clicking same row again
    if (
      openInline?.menuProductId === menuProductId &&
      openInline?.locationId === locationId &&
      openInline?.direction === direction
    ) {
      setOpenInline(null);
      return;
    }
    setOpenInline({
      menuProductId,
      menuProductName,
      locationId,
      locationName,
      direction,
      availableAtSource,
      destLocationId: "",
      quantity: "",
      isSubmitting: false,
    });
  };

  if (productGroups.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">
        No finished goods inventory tracked yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {productGroups.map((group) => (
        <Card
          key={group.menuProductId}
          className={cn(!group.isActive && "opacity-60")}
        >
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-semibold text-sm">{group.menuProductName}</span>
                <Badge variant="outline" className="text-xs font-mono">
                  {group.menuProductCode}
                </Badge>
              </div>
              <span className="text-sm font-bold text-foreground whitespace-nowrap">
                {group.totalQuantity} total
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {group.locations.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No stock at any location</p>
            ) : (
              <div className="space-y-1">
                {group.locations.map((loc) => {
                  const isZero = loc.quantity === 0;
                  const isInlineOpen =
                    openInline?.menuProductId === (group.menuProductId as Id<"menuProducts">) &&
                    openInline?.locationId === (loc.locationId as Id<"storageLocations">);

                  return (
                    <div key={loc.locationId}>
                      <div
                        className={cn(
                          "flex items-center justify-between gap-2 py-1.5 px-2 rounded",
                          isZero && "opacity-50 bg-muted/30",
                          !isZero && "hover:bg-muted/20"
                        )}
                      >
                        {/* Location info */}
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span
                            className={cn(
                              "text-sm truncate",
                              isZero && "text-muted-foreground"
                            )}
                          >
                            {loc.locationName}
                          </span>
                          {loc.isLowStock && !isZero && (
                            <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                          )}
                        </div>

                        {/* Quantity + actions */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span
                            className={cn(
                              "text-sm font-semibold w-8 text-right",
                              isZero && "text-muted-foreground",
                              loc.isLowStock && !isZero && "text-orange-600"
                            )}
                          >
                            {loc.quantity}
                          </span>

                          {/* Move To button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-6 px-2 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10",
                              openInline?.locationId === (loc.locationId as Id<"storageLocations">) &&
                                openInline?.direction === "move_to" &&
                                "bg-primary/10"
                            )}
                            disabled={isZero}
                            onClick={() =>
                              handleOpenInline(
                                group.menuProductId as Id<"menuProducts">,
                                group.menuProductName,
                                loc.locationId as Id<"storageLocations">,
                                loc.locationName,
                                "move_to",
                                loc.quantity
                              )
                            }
                          >
                            Move
                            <ArrowRight className="h-3 w-3" />
                          </Button>

                          {/* Receive From button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-6 px-2 text-xs gap-1 border-[var(--color-status-success)]/40 text-[var(--color-status-success)] hover:bg-[var(--color-status-success-bg)]",
                              openInline?.locationId === (loc.locationId as Id<"storageLocations">) &&
                                openInline?.direction === "receive_from" &&
                                "bg-[var(--color-status-success-bg)]"
                            )}
                            onClick={() =>
                              handleOpenInline(
                                group.menuProductId as Id<"menuProducts">,
                                group.menuProductName,
                                loc.locationId as Id<"storageLocations">,
                                loc.locationName,
                                "receive_from",
                                loc.quantity
                              )
                            }
                          >
                            <ArrowLeft className="h-3 w-3" />
                            Receive
                          </Button>

                          {/* Adjust button */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs gap-1 border-amber-400/40 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                            onClick={() =>
                              onAdjust({
                                menuProductId: group.menuProductId as Id<"menuProducts">,
                                menuProductName: group.menuProductName,
                                locationId: loc.locationId as Id<"storageLocations">,
                                locationName: loc.locationName,
                                currentQuantity: loc.quantity,
                              })
                            }
                          >
                            <SlidersHorizontal className="h-3 w-3" />
                            Adjust
                          </Button>
                        </div>
                      </div>

                      {/* Inline transfer form */}
                      {isInlineOpen && openInline && (
                        <InlineTransferForm
                          state={openInline}
                          allLocations={allLocations}
                          onClose={() => setOpenInline(null)}
                          onSubmit={onTransfer}
                          productGroups={productGroups}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
