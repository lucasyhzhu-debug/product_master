/**
 * InlineTransferForm — Inline stock transfer form used within
 * ProductGroupedView and LocationGroupedView.
 *
 * Supports two modes:
 * - "move_to": Transfer stock FROM current location TO another
 * - "receive_from": Receive stock INTO current location FROM another
 */

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import type { InlineTransferState, GroupedProductRow } from "./finishedGoodsUtils";

export type InlineTransferFormProps = {
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

export function InlineTransferForm({
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
