/**
 * FGAddStockDialog — Simple dialog for adding finished goods stock.
 *
 * Retail staff friendly: pick product, quantity, location. Done.
 * Labels use plain language ("How many boxes?") not technical jargon.
 */

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
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

interface FGAddStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedProductId?: Id<"menuProducts">;
  preselectedProductName?: string;
  locations: Array<{ _id: Id<"storageLocations">; name: string; isDefault?: boolean }>;
  defaultLocationId?: Id<"storageLocations">;
}

export function FGAddStockDialog({
  open,
  onOpenChange,
  preselectedProductId,
  preselectedProductName,
  locations,
  defaultLocationId,
}: FGAddStockDialogProps) {
  const { user } = useAuth();
  const { addStock } = useProductInventory();

  const menuProducts = useQuery(api.menuProducts.queries.list, {});

  const [selectedProductId, setSelectedProductId] = useState<string>(
    preselectedProductId ?? ""
  );
  const [quantity, setQuantity] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    defaultLocationId ?? ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedProductId(preselectedProductId ?? "");
      setQuantity("");

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
    if (!user?.token) {
      toast.error("Not authenticated");
      return;
    }

    setIsSubmitting(true);
    try {
      await addStock({
        token: user.token,
        menuProductId: selectedProductId as Id<"menuProducts">,
        locationId: selectedLocationId as Id<"storageLocations">,
        quantity: Number(quantity),
      });

      const productName =
        preselectedProductName ??
        menuProducts?.find((p) => p._id === selectedProductId)?.name ??
        "product";
      const locationName =
        locations.find((l) => l._id === selectedLocationId)?.name ?? "location";

      toast.success(`Added ${quantity} x ${productName} to ${locationName}`);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to add stock:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeProducts = menuProducts?.filter((p) => p.isActive !== false) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Stock
          </DialogTitle>
          <DialogDescription>
            Add finished goods to inventory
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {preselectedProductId && preselectedProductName ? (
            <div className="rounded-lg bg-muted/50 border p-3">
              <p className="text-xs text-muted-foreground">Product</p>
              <p className="font-semibold">{preselectedProductName}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="fg-product">Product</Label>
              <Select
                value={selectedProductId}
                onValueChange={(v) => setSelectedProductId(v)}
              >
                <SelectTrigger id="fg-product">
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

          <div className="space-y-2">
            <Label htmlFor="fg-quantity">How many boxes?</Label>
            <Input
              id="fg-quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 10"
              className="text-lg font-mono h-12"
              autoFocus={!!preselectedProductId}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fg-location">Add to location</Label>
            <Select
              value={selectedLocationId}
              onValueChange={(v) => setSelectedLocationId(v)}
            >
              <SelectTrigger id="fg-location">
                <SelectValue placeholder="Select location..." />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc._id} value={loc._id}>
                    {loc.name}
                    {loc.isDefault && " (default)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            disabled={isSubmitting || !selectedProductId || !quantity || !selectedLocationId}
          >
            <Plus className="h-4 w-4 mr-2" />
            {isSubmitting ? "Adding..." : "Add Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
