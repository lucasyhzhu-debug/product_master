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
 *
 * Per-row actions:
 * - "Move To -->" opens inline form: destination location + quantity
 * - "<-- Receive From" opens inline form: source location + quantity
 * Both call the transferStock mutation from productInventory.
 */

import { useState, useMemo } from "react";
import {
  AlertTriangle,
  Plus,
  Settings,
  ChevronDown,
  ShoppingBag,
  ArrowRight,
  ArrowLeft,
  Package,
  MapPin,
  ArrowLeftRight,
  Layers,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  useProductInventory,
  useProductInventoryGrouped,
  useConvexStorageLocations,
} from "@/hooks/convex";
import { ProductStockCard } from "./ProductStockCard";
import { FGAddStockDialog } from "./FGAddStockDialog";
import { FGAdjustDialog } from "./FGAdjustDialog";
import { TransactionLogPanel } from "./TransactionLogPanel";
import { FinishedGoodsHero } from "./FinishedGoodsHero";
import { StockTransferModal } from "./StockTransferModal";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ProductStockGroup } from "@/hooks/convex";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";

// ============================================================================
// TYPES
// ============================================================================

type GroupingMode = "product" | "location" | "platform";

type AdjustDialogState = {
  menuProductId: Id<"menuProducts">;
  menuProductName: string;
  locationId: Id<"storageLocations">;
  locationName: string;
  currentQuantity: number;
};

// ============================================================================
// PLATFORM HELPERS
// ============================================================================

function bucketLocationType(locationType: string): "internal" | "gofood" | "k3mart" | "other" {
  switch (locationType) {
    case "office":
    case "kitchen":
      return "internal";
    case "depot":
      return "gofood";
    case "venue":
      return "k3mart";
    default:
      return "other";
  }
}

function locationTypeLabel(locationType: string): string {
  switch (locationType) {
    case "office":
    case "kitchen":
      return "Internal Inventory";
    case "depot":
      return "GoFood";
    case "venue":
      return "K3Mart";
    default:
      return locationType;
  }
}

type InlineTransferState = {
  menuProductId: Id<"menuProducts">;
  menuProductName: string;
  locationId: Id<"storageLocations">;
  locationName: string;
  direction: "move_to" | "receive_from";
  availableAtSource: number;
  destLocationId: string;
  quantity: string;
  isSubmitting: boolean;
};

// The data shape from getStockOverviewGrouped
type GroupedProductRow = {
  menuProductId: string;
  menuProductName: string;
  menuProductCode: string;
  isActive: boolean;
  defaultPrice: number;
  locations: Array<{
    locationId: string;
    locationName: string;
    locationType: string;
    quantity: number;
    isLowStock: boolean;
    effectiveThreshold: number;
  }>;
  totalQuantity: number;
};

// ============================================================================
// INLINE TRANSFER FORM
// ============================================================================

type InlineTransferFormProps = {
  state: InlineTransferState;
  allLocations: Array<{ _id: Id<"storageLocations">; name: string }>;
  onClose: () => void;
  onSubmit: (
    menuProductId: Id<"menuProducts">,
    sourceLocationId: Id<"storageLocations">,
    destinationLocationId: Id<"storageLocations">,
    quantity: number
  ) => Promise<void>;
  /** All grouped products to compute available stock at source for Receive From */
  productGroups: GroupedProductRow[];
};

function InlineTransferForm({
  state,
  allLocations,
  onClose,
  onSubmit,
  productGroups,
}: InlineTransferFormProps) {
  const [destLocationId, setDestLocationId] = useState(state.destLocationId);
  const [quantity, setQuantity] = useState(state.quantity);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isMoveToMode = state.direction === "move_to";

  // Compute available at source for "Receive From" mode
  const availableAtDest = useMemo(() => {
    if (isMoveToMode) return state.availableAtSource;
    // For Receive From: available = stock of this product at the selected source location
    if (!destLocationId) return 0;
    const group = productGroups.find((g) => g.menuProductId === (state.menuProductId as string));
    if (!group) return 0;
    const locEntry = group.locations.find((l) => l.locationId === destLocationId);
    return locEntry?.quantity ?? 0;
  }, [isMoveToMode, state.availableAtSource, state.menuProductId, destLocationId, productGroups]);

  // Filter out current location from destinations
  const eligibleLocations = allLocations.filter(
    (l) => l._id !== state.locationId
  );

  const maxQty = isMoveToMode ? state.availableAtSource : availableAtDest;
  const parsedQty = Number(quantity);
  const isOverTransfer = parsedQty > maxQty;
  const isInvalid =
    !destLocationId ||
    isNaN(parsedQty) ||
    parsedQty <= 0 ||
    isOverTransfer;

  const handleSubmit = async () => {
    if (isInvalid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const sourceId = isMoveToMode
        ? state.locationId
        : (destLocationId as Id<"storageLocations">);
      const destId = isMoveToMode
        ? (destLocationId as Id<"storageLocations">)
        : state.locationId;
      await onSubmit(state.menuProductId, sourceId, destId, parsedQty);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-2 p-3 bg-muted/40 border rounded-md space-y-3">
      <p className="text-xs font-medium text-muted-foreground">
        {isMoveToMode
          ? `Move stock from "${state.locationName}" to another location`
          : `Receive stock into "${state.locationName}" from another location`}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {/* Destination / Source location */}
        <div className="space-y-1">
          <Label className="text-xs">
            {isMoveToMode ? "Destination" : "Source Location"}
          </Label>
          <Select value={destLocationId} onValueChange={setDestLocationId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select location..." />
            </SelectTrigger>
            <SelectContent>
              {eligibleLocations.map((loc) => (
                <SelectItem key={loc._id} value={loc._id} className="text-xs">
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quantity */}
        <div className="space-y-1">
          <Label className="text-xs">
            Quantity{" "}
            <span className="text-muted-foreground font-normal">
              (available: {maxQty})
            </span>
          </Label>
          <Input
            type="number"
            min={1}
            max={maxQty}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className={cn("h-8 text-xs font-mono", isOverTransfer && "border-red-400")}
          />
          {isOverTransfer && (
            <p className="text-xs text-red-600">
              Max available: {maxQty}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isInvalid || isSubmitting}
          className="h-7 text-xs"
        >
          {isSubmitting ? "Transferring..." : "Transfer"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// PRODUCT-GROUPED VIEW
// ============================================================================

type ProductGroupedViewProps = {
  productGroups: GroupedProductRow[];
  allLocations: Array<{ _id: Id<"storageLocations">; name: string }>;
  onTransfer: (
    menuProductId: Id<"menuProducts">,
    sourceLocationId: Id<"storageLocations">,
    destinationLocationId: Id<"storageLocations">,
    quantity: number
  ) => Promise<void>;
  onAdjust: (state: AdjustDialogState) => void;
  token: string;
};

function ProductGroupedView({
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

// ============================================================================
// LOCATION-GROUPED VIEW
// ============================================================================

type LocationGroupedViewProps = {
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

function LocationGroupedView({
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

// ============================================================================
// PLATFORM-GROUPED VIEW
// ============================================================================

type PlatformGroupedViewProps = {
  productGroups: GroupedProductRow[];
};

function PlatformGroupedView({ productGroups }: PlatformGroupedViewProps) {
  // Build platform bucket -> products map
  const buckets = useMemo(() => {
    const map = new Map<
      "internal" | "gofood" | "k3mart",
      Array<{
        menuProductId: string;
        menuProductName: string;
        menuProductCode: string;
        quantity: number;
      }>
    >([
      ["internal", []],
      ["gofood", []],
      ["k3mart", []],
    ]);

    for (const group of productGroups) {
      // Sum quantity per platform bucket for this product
      const bucketTotals = new Map<"internal" | "gofood" | "k3mart", number>([
        ["internal", 0],
        ["gofood", 0],
        ["k3mart", 0],
      ]);

      for (const loc of group.locations) {
        const bucket = bucketLocationType(loc.locationType);
        if (bucket !== "other") {
          bucketTotals.set(bucket, (bucketTotals.get(bucket) ?? 0) + loc.quantity);
        }
      }

      for (const [bucket, total] of bucketTotals) {
        if (total > 0 || group.locations.some((l) => bucketLocationType(l.locationType) === bucket)) {
          // Only add product to bucket if there are any locations of that type
          const hasLocationsOfType = group.locations.some(
            (l) => bucketLocationType(l.locationType) === bucket
          );
          if (hasLocationsOfType) {
            map.get(bucket)!.push({
              menuProductId: group.menuProductId,
              menuProductName: group.menuProductName,
              menuProductCode: group.menuProductCode,
              quantity: total,
            });
          }
        }
      }
    }

    // Sort products alphabetically within each bucket
    for (const products of map.values()) {
      products.sort((a, b) => a.menuProductName.localeCompare(b.menuProductName));
    }

    return map;
  }, [productGroups]);

  const sections: Array<{ bucket: "internal" | "gofood" | "k3mart"; label: string }> = [
    { bucket: "internal", label: "Internal Inventory" },
    { bucket: "gofood", label: "GoFood" },
    { bucket: "k3mart", label: "K3Mart" },
  ];

  const hasSections = sections.some((s) => (buckets.get(s.bucket)?.length ?? 0) > 0);

  if (!hasSections) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">
        No finished goods inventory tracked yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map(({ bucket, label }) => {
        const products = buckets.get(bucket) ?? [];
        if (products.length === 0) return null;

        const sectionTotal = products.reduce((s, p) => s + p.quantity, 0);

        return (
          <Card key={bucket}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-semibold text-sm">{label}</span>
                </div>
                <span className="text-sm font-bold whitespace-nowrap">
                  {sectionTotal} units
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="space-y-1">
                {products.map((product) => {
                  const isZero = product.quantity === 0;
                  return (
                    <div
                      key={product.menuProductId}
                      className={cn(
                        "flex items-center justify-between gap-2 py-1.5 px-2 rounded",
                        isZero && "opacity-50 bg-muted/30",
                        !isZero && "hover:bg-muted/20"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className={cn("text-sm truncate", isZero && "text-muted-foreground")}>
                          {product.menuProductName}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {product.menuProductCode}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-semibold w-8 text-right",
                          isZero && "text-muted-foreground"
                        )}
                      >
                        {product.quantity}
                      </span>
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
  const locations = useConvexStorageLocations(true);
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

            {isAdmin && (
              <div className="pt-2 border-t space-y-3">
                <div>
                  <Label className="text-sm">Location Platform Types</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tag each storage location as Internal Inventory, GoFood, or K3Mart. Controls the "By Platform" grouping and hero stat cards.
                  </p>
                </div>
                <div className="space-y-2">
                  {(locations ?? []).filter((l) => l.isActive).map((loc) => (
                    <div key={loc._id} className="flex items-center justify-between gap-3">
                      <span className="text-sm">{loc.name}</span>
                      <Select
                        value={loc.locationType}
                        onValueChange={async (newType) => {
                          try {
                            await updateLocationTypeMut({ id: loc._id, locationType: newType as "office" | "kitchen" | "depot" | "venue" });
                            toast.success(`${loc.name} tagged as ${locationTypeLabel(newType)}`);
                          } catch {
                            toast.error("Failed to update location type");
                          }
                        }}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="office">Internal Inventory (Office)</SelectItem>
                          <SelectItem value="kitchen">Internal Inventory (Kitchen)</SelectItem>
                          <SelectItem value="depot">GoFood</SelectItem>
                          <SelectItem value="venue">K3Mart</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
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
