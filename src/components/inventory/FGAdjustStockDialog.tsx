/**
 * FGAdjustStockDialog — Manager-only dialog for finished goods stock corrections.
 *
 * Supports adding or removing stock with a required reason field.
 * Allows negative stock with manager override annotation.
 */

import { useState, useEffect } from "react";
import { Settings2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useProductInventory } from "@/hooks/convex";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface FGAdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedProductId?: Id<"menuProducts">;
  preselectedProductName?: string;
  locations: Array<{ _id: Id<"storageLocations">; name: string; isDefault?: boolean }>;
  defaultLocationId?: Id<"storageLocations">;
}

export function FGAdjustStockDialog({
  open,
  onOpenChange,
  preselectedProductId,
  preselectedProductName,
  locations,
  defaultLocationId,
}: FGAdjustStockDialogProps) {
  const { user } = useAuth();
  const { adjustStock } = useProductInventory();

  const menuProducts = useQuery(api.menuProducts.queries.list, {});

  const stockOverview = useQuery(
    api.productInventory.queries.getStockOverview,
    {}
  );

  const currentStock = selectedProductId && selectedLocationId
    ? (stockOverview?.find(
        (row) =>
          row.menuProduct?._id === selectedProductId &&
          row.location?._id === selectedLocationId
      )?.quantity ?? null)
    : null;

  const [selectedProductId, setSelectedProductId] = useState<string>(
    preselectedProductId ?? ""
  );
  const [adjustType, setAdjustType] = useState<"add" | "remove">("remove");
  const [quantity, setQuantity] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    defaultLocationId ?? ""
  );
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedProductId(preselectedProductId ?? "");
      setAdjustType("remove");
      setQuantity("");
      setReason("");

      if (defaultLocationId) {
        setSelectedLocationId(defaultLocationId);
      } else {
        const defaultLoc = locations.find((l) => l.isDefault) ?? locations[0];
        setSelectedLocationId(defaultLoc?._id ?? "");
      }
    }
  }, [open, preselectedProductId, defaultLocationId, locations]);

  const handleSubmit = async () => {
    if (!selectedProductId) {
      toast.error("Please select a product");
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (!selectedLocationId) {
      toast.error("Please select a location");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    if (!user?.token) {
      toast.error("Not authenticated");
      return;
    }

    // Sign: positive for add, negative for remove
    const signedQuantity = adjustType === "add" ? Number(quantity) : -Number(quantity);

    setIsSubmitting(true);
    try {
      await adjustStock({
        token: user.token,
        menuProductId: selectedProductId as Id<"menuProducts">,
        locationId: selectedLocationId as Id<"storageLocations">,
        quantity: signedQuantity,
        reason: reason.trim(),
      });

      const productName =
        preselectedProductName ??
        menuProducts?.find((p) => p._id === selectedProductId)?.name ??
        "product";
      const locationName =
        locations.find((l) => l._id === selectedLocationId)?.name ?? "location";

      toast.success(
        `${adjustType === "add" ? "Added" : "Removed"} ${quantity} x ${productName} at ${locationName}`
      );
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to adjust stock:", error);
      toast.error(error instanceof Error ? error.message : "Failed to adjust stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeProducts = menuProducts?.filter(
    (p) => p.isActive !== false && p.posSlot != null
  ) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Adjust Stock
          </DialogTitle>
          <DialogDescription>
            Manager adjustment — add or remove stock with a reason (spoilage, correction, transfer)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Product Selector */}
          {preselectedProductId && preselectedProductName ? (
            <div className="rounded-lg bg-muted/50 border p-3">
              <p className="text-xs text-muted-foreground">Product</p>
              <p className="font-semibold">{preselectedProductName}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="fga-product">Product</Label>
              <Select
                value={selectedProductId}
                onValueChange={(v) => setSelectedProductId(v)}
              >
                <SelectTrigger id="fga-product">
                  <SelectValue placeholder="Select a product..." />
                </SelectTrigger>
                <SelectContent>
                  {activeProducts.map((product) => (
                    <SelectItem key={product._id} value={product._id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Location Selector */}
          <div className="space-y-2">
            <Label>Location</Label>
            <div className="flex gap-2 flex-wrap">
              {locations.map((loc) => (
                <Button
                  key={loc._id}
                  type="button"
                  variant={selectedLocationId === loc._id ? "default" : "outline"}
                  className={cn("flex-1 min-w-[80px]")}
                  onClick={() => setSelectedLocationId(loc._id)}
                >
                  {loc.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Current stock display */}
          {currentStock !== null && (
            <p className="text-sm text-muted-foreground">
              Current stock at this location:{" "}
              <span className="font-semibold text-foreground">{currentStock}</span> units
            </p>
          )}

          {/* Adjust Type Toggle */}
          <div className="space-y-2">
            <Label>Adjustment Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={adjustType === "add" ? "default" : "outline"}
                className={cn(
                  "flex-1",
                  adjustType === "add" && "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                )}
                onClick={() => setAdjustType("add")}
              >
                + Add
              </Button>
              <Button
                type="button"
                variant={adjustType === "remove" ? "default" : "outline"}
                className={cn(
                  "flex-1",
                  adjustType === "remove" && "bg-red-600 hover:bg-red-700 text-white border-red-600"
                )}
                onClick={() => setAdjustType("remove")}
              >
                - Remove
              </Button>
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="fga-quantity">Quantity (always positive)</Label>
            <Input
              id="fga-quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 5"
              className="font-mono"
            />
          </div>

          {/* Reason (required) */}
          <div className="space-y-2">
            <Label htmlFor="fga-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="fga-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Spoilage, Transfer to Goldfinch, Count correction"
              rows={2}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Required for audit trail. Manager override allows negative stock.
            </p>
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
            disabled={
              isSubmitting ||
              !selectedProductId ||
              !quantity ||
              !selectedLocationId ||
              !reason.trim()
            }
            variant={adjustType === "remove" ? "destructive" : "default"}
          >
            <Settings2 className="h-4 w-4 mr-2" />
            {isSubmitting
              ? "Adjusting..."
              : `${adjustType === "add" ? "Add" : "Remove"} ${quantity || "?"} units`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
