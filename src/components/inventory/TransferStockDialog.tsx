/**
 * TransferStockDialog - Move inventory between warehouse locations
 *
 * Uses FIFO-based transfer via useConvexTransferStock hook.
 * Shows from/to locations, quantity input with max available.
 */

import { useState, useEffect } from "react";
import { ArrowRight, Package, Truck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useConvexTransferStock } from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface TransferStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  componentTypeId: Id<"componentTypes">;
  componentName: string;
  fromLocationId: Id<"storageLocations">;
  fromLocationName: string;
  maxQuantity: number;
  locations: Array<{
    _id: Id<"storageLocations">;
    name: string;
  }>;
}

export function TransferStockDialog({
  open,
  onOpenChange,
  componentTypeId,
  componentName,
  fromLocationId,
  fromLocationName,
  maxQuantity,
  locations,
}: TransferStockDialogProps) {
  const [toLocationId, setToLocationId] = useState<Id<"storageLocations"> | null>(null);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const transferStock = useConvexTransferStock();

  // Filter out source location from destination options
  const destinationLocations = locations.filter((l) => l._id !== fromLocationId);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setToLocationId(destinationLocations.length === 1 ? destinationLocations[0]._id : null);
      setQuantity("");
      setNote("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!toLocationId) {
      toast.error("Please select a destination location");
      return;
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (qty > maxQuantity) {
      toast.error(`Maximum available quantity is ${maxQuantity}`);
      return;
    }

    setIsSubmitting(true);
    try {
      await transferStock({
        componentTypeId,
        fromLocationId,
        toLocationId,
        quantity: qty,
        referenceNote: note.trim() || undefined,
        createdBy: "current-user",
      });
      toast.success(`Transferred ${qty} ${componentName} successfully`);
      onOpenChange(false);
    } catch (error) {
      console.error("Transfer failed:", error);
      toast.error(error instanceof Error ? error.message : "Transfer failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-[#E07856]" />
            Transfer Stock
          </DialogTitle>
          <DialogDescription>
            Move <span className="font-semibold text-slate-200">{componentName}</span> between locations
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* From → To Visual */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700">
            <div className="flex-1 text-center">
              <div className="text-xs text-slate-400 mb-1">From</div>
              <div className="font-mono font-semibold text-slate-200">{fromLocationName}</div>
              <div className="text-xs text-slate-500 mt-1">{maxQuantity} available</div>
            </div>
            <ArrowRight className="h-5 w-5 text-[#E07856] flex-shrink-0" />
            <div className="flex-1 text-center">
              <div className="text-xs text-slate-400 mb-1">To</div>
              {toLocationId ? (
                <div className="font-mono font-semibold text-slate-200">
                  {destinationLocations.find((l) => l._id === toLocationId)?.name}
                </div>
              ) : (
                <div className="text-sm text-slate-500">Select below</div>
              )}
            </div>
          </div>

          {/* Destination Selection */}
          {destinationLocations.length > 1 && (
            <div className="space-y-2">
              <Label>Destination Location</Label>
              <div className="flex flex-wrap gap-2">
                {destinationLocations.map((loc) => (
                  <Button
                    key={loc._id}
                    variant={toLocationId === loc._id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setToLocationId(loc._id)}
                    className={cn(
                      "font-mono",
                      toLocationId === loc._id &&
                        "bg-[#E07856] text-white border-[#E07856] hover:bg-[#D66A4A]"
                    )}
                  >
                    {loc.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="transfer-qty">
              <Package className="inline h-4 w-4 mr-1" />
              Quantity to Transfer
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="transfer-qty"
                type="number"
                min="1"
                max={maxQuantity}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={`Max ${maxQuantity}`}
                className="font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuantity(String(maxQuantity))}
                className="shrink-0 text-xs"
              >
                All
              </Button>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="transfer-note">Note (Optional)</Label>
            <Input
              id="transfer-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for transfer..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !toLocationId}
            className="bg-gradient-to-r from-[#E07856] to-[#D66A4A] hover:from-[#D66A4A] hover:to-[#C55A3A] text-white"
          >
            <Truck className="h-4 w-4 mr-2" />
            {isSubmitting ? "Transferring..." : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
