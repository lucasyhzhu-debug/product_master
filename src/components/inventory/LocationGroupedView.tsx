/**
 * LocationGroupedView — Renders finished goods inventory grouped by storage location.
 *
 * Each location card shows all products stored there,
 * with inline Move/Receive/Adjust actions per product row.
 */

import { useState, useMemo } from "react";
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
import { locationTypeLabel } from "./finishedGoodsUtils";
import { InlineTransferForm } from "./InlineTransferForm";

export type LocationGroupedViewProps = {
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

export function LocationGroupedView({
  productGroups,
  allLocations,
  onTransfer,
  onAdjust,
}: LocationGroupedViewProps) {
  const [openInline, setOpenInline] = useState<InlineTransferState | null>(null);

  // Build location -> products map
  const byLocation = useMemo(() => {
    const map = new Map<
      string,
      {
        locationId: string;
        locationName: string;
        locationType: string;
        products: Array<{
          menuProductId: string;
          menuProductName: string;
          menuProductCode: string;
          quantity: number;
          isLowStock: boolean;
          effectiveThreshold: number;
        }>;
      }
    >();

    for (const group of productGroups) {
      for (const loc of group.locations) {
        if (!map.has(loc.locationId)) {
          map.set(loc.locationId, {
            locationId: loc.locationId,
            locationName: loc.locationName,
            locationType: loc.locationType,
            products: [],
          });
        }
        map.get(loc.locationId)!.products.push({
          menuProductId: group.menuProductId,
          menuProductName: group.menuProductName,
          menuProductCode: group.menuProductCode,
          quantity: loc.quantity,
          isLowStock: loc.isLowStock,
          effectiveThreshold: loc.effectiveThreshold,
        });
      }
    }

    // Sort by location name
    return Array.from(map.values()).sort((a, b) =>
      a.locationName.localeCompare(b.locationName)
    );
  }, [productGroups]);

  const handleOpenInline = (
    menuProductId: Id<"menuProducts">,
    menuProductName: string,
    locationId: Id<"storageLocations">,
    locationName: string,
    direction: "move_to" | "receive_from",
    availableAtSource: number
  ) => {
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

  if (byLocation.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">
        No finished goods inventory tracked yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {byLocation.map((location) => {
        const totalAtLocation = location.products.reduce((s, p) => s + p.quantity, 0);
        return (
          <Card key={location.locationId}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-semibold text-sm">{location.locationName}</span>
                  <Badge variant="secondary" className="text-xs">
                    {locationTypeLabel(location.locationType)}
                  </Badge>
                </div>
                <span className="text-sm font-bold whitespace-nowrap">
                  {totalAtLocation} units
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="space-y-1">
                {location.products.map((product) => {
                  const isZero = product.quantity === 0;
                  const isInlineOpen =
                    openInline?.menuProductId === (product.menuProductId as Id<"menuProducts">) &&
                    openInline?.locationId === (location.locationId as Id<"storageLocations">);

                  return (
                    <div key={product.menuProductId}>
                      <div
                        className={cn(
                          "flex items-center justify-between gap-2 py-1.5 px-2 rounded",
                          isZero && "opacity-50 bg-muted/30",
                          !isZero && "hover:bg-muted/20"
                        )}
                      >
                        {/* Product info */}
                        <div className="flex items-center gap-2 min-w-0">
                          <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span
                            className={cn(
                              "text-sm truncate",
                              isZero && "text-muted-foreground"
                            )}
                          >
                            {product.menuProductName}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {product.menuProductCode}
                          </span>
                          {product.isLowStock && !isZero && (
                            <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                          )}
                        </div>

                        {/* Quantity + actions */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span
                            className={cn(
                              "text-sm font-semibold w-8 text-right",
                              isZero && "text-muted-foreground",
                              product.isLowStock && !isZero && "text-orange-600"
                            )}
                          >
                            {product.quantity}
                          </span>

                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-6 px-2 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10",
                              openInline?.locationId === (location.locationId as Id<"storageLocations">) &&
                                openInline?.menuProductId === (product.menuProductId as Id<"menuProducts">) &&
                                openInline?.direction === "move_to" &&
                                "bg-primary/10"
                            )}
                            disabled={isZero}
                            onClick={() =>
                              handleOpenInline(
                                product.menuProductId as Id<"menuProducts">,
                                product.menuProductName,
                                location.locationId as Id<"storageLocations">,
                                location.locationName,
                                "move_to",
                                product.quantity
                              )
                            }
                          >
                            Move
                            <ArrowRight className="h-3 w-3" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-6 px-2 text-xs gap-1 border-[var(--color-status-success)]/40 text-[var(--color-status-success)] hover:bg-[var(--color-status-success-bg)]",
                              openInline?.locationId === (location.locationId as Id<"storageLocations">) &&
                                openInline?.menuProductId === (product.menuProductId as Id<"menuProducts">) &&
                                openInline?.direction === "receive_from" &&
                                "bg-[var(--color-status-success-bg)]"
                            )}
                            onClick={() =>
                              handleOpenInline(
                                product.menuProductId as Id<"menuProducts">,
                                product.menuProductName,
                                location.locationId as Id<"storageLocations">,
                                location.locationName,
                                "receive_from",
                                product.quantity
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
                                menuProductId: product.menuProductId as Id<"menuProducts">,
                                menuProductName: product.menuProductName,
                                locationId: location.locationId as Id<"storageLocations">,
                                locationName: location.locationName,
                                currentQuantity: product.quantity,
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
