/**
 * ReceiveStockDialog - Quick stock receiving with top 3 low stock components
 */

import { useState, useEffect } from "react";
import { Package, Plus, DollarSign, Truck, Calendar } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useConvexReceiveStock, useConvexInventoryTrackedComponents } from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ComponentType, StorageLocation } from "@/hooks/convex";
import { formatCurrency, cn } from "@/lib/utils";

interface ReceiveStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: StorageLocation[];
  lowStockComponents: ComponentType[];
}

export function ReceiveStockDialog({
  open,
  onOpenChange,
  locations,
  lowStockComponents,
}: ReceiveStockDialogProps) {
  // Form state
  const [selectedComponentId, setSelectedComponentId] = useState<
    Id<"componentTypes"> | null
  >(null);
  const [selectedLocationId, setSelectedLocationId] = useState<
    Id<"storageLocations"> | null
  >(null);
  const [quantity, setQuantity] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierBrand, setSupplierBrand] = useState("");
  const [purchaseReference, setPurchaseReference] = useState("");
  const [purchaseUrl, setPurchaseUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const allComponents = useConvexInventoryTrackedComponents(true);
  const receiveStock = useConvexReceiveStock();

  // Set default location (first location or default location)
  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      const defaultLoc = locations.find((l) => l.isDefault) || locations[0];
      setSelectedLocationId(defaultLoc._id);
    }
  }, [locations, selectedLocationId]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedComponentId(null);
      setQuantity("");
      setTotalCost("");
      setSupplierName("");
      setSupplierBrand("");
      setPurchaseReference("");
      setPurchaseUrl("");
    }
  }, [open]);

  const unitCost =
    quantity && totalCost
      ? Number(totalCost) / Number(quantity)
      : null;

  const handleSubmit = async () => {
    // Validation
    if (!selectedComponentId) {
      toast.error("Please select a component");
      return;
    }
    if (!selectedLocationId) {
      toast.error("Please select a location");
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (!totalCost || Number(totalCost) <= 0) {
      toast.error("Total cost must be greater than 0");
      return;
    }
    if (!supplierName.trim()) {
      toast.error("Supplier name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await receiveStock({
        componentTypeId: selectedComponentId,
        locationId: selectedLocationId,
        purchaseDate: Date.now(),
        supplierName: supplierName.trim(),
        supplierBrand: supplierBrand.trim() || undefined,
        purchaseReference: purchaseReference.trim() || undefined,
        purchaseUrl: purchaseUrl.trim() || undefined,
        quantityPurchased: Number(quantity),
        totalCostIdr: Number(totalCost),
        createdBy: "current-user", // TODO: Replace with actual user
      });

      toast.success("Stock received successfully");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to receive stock:", error);
      toast.error("Failed to receive stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Receive Stock
          </DialogTitle>
          <DialogDescription>
            Add new inventory batch with supplier information
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Component Selection - Top 3 Low Stock + Dropdown */}
          <div className="space-y-2">
            <Label>Component</Label>
            <div className="flex flex-wrap gap-2 mb-3">
              {lowStockComponents.slice(0, 3).map((comp) => (
                <Button
                  key={comp._id}
                  variant={
                    selectedComponentId === comp._id ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedComponentId(comp._id)}
                  className={cn(
                    "font-mono",
                    selectedComponentId === comp._id && "bg-emerald-600"
                  )}
                >
                  <Badge
                    variant="outline"
                    className="mr-2 bg-red-500/20 text-red-300 border-red-600"
                  >
                    LOW
                  </Badge>
                  {comp.name}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Reset to force Select to show
                  setSelectedComponentId(null);
                }}
              >
                Other...
              </Button>
            </div>

            {/* Dropdown for all components */}
            {selectedComponentId === null && allComponents && (
              <Select
                value={selectedComponentId ?? ""}
                onValueChange={(value) =>
                  setSelectedComponentId(value as Id<"componentTypes">)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a component" />
                </SelectTrigger>
                <SelectContent>
                  {allComponents.map((comp) => (
                    <SelectItem key={comp._id} value={comp._id}>
                      {comp.name} ({comp.category.replace("_", " ")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Location Selection - Button Group */}
          <div className="space-y-2">
            <Label>Location</Label>
            <div className="flex flex-wrap gap-2">
              {locations.map((loc) => (
                <Button
                  key={loc._id}
                  variant={
                    selectedLocationId === loc._id ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedLocationId(loc._id)}
                  className="font-mono"
                >
                  {loc.name}
                  {loc.isDefault && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      Default
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-700 pt-4" />

          {/* Quantity & Cost */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quantity">
                <Package className="inline h-4 w-4 mr-1" />
                Quantity Received
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="100"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalCost">
                <DollarSign className="inline h-4 w-4 mr-1" />
                Total Cost (IDR)
              </Label>
              <Input
                id="totalCost"
                type="number"
                min="0"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                placeholder="50000"
                className="font-mono"
              />
            </div>
          </div>

          {/* Unit Cost Display */}
          {unitCost !== null && (
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Unit Cost:</span>
                <span className="text-lg font-mono font-bold text-emerald-400">
                  {formatCurrency(unitCost)}
                </span>
              </div>
            </div>
          )}

          <div className="border-t border-slate-700 pt-4" />

          {/* Supplier Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supplierName">
                <Truck className="inline h-4 w-4 mr-1" />
                Supplier Name *
              </Label>
              <Input
                id="supplierName"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Tokopedia - BoxMaster"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplierBrand">Brand (Optional)</Label>
              <Input
                id="supplierBrand"
                value={supplierBrand}
                onChange={(e) => setSupplierBrand(e.target.value)}
                placeholder="Generic Kraft"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchaseReference">
                <Calendar className="inline h-4 w-4 mr-1" />
                PO/Invoice # (Optional)
              </Label>
              <Input
                id="purchaseReference"
                value={purchaseReference}
                onChange={(e) => setPurchaseReference(e.target.value)}
                placeholder="INV-2024-0205"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchaseUrl">Reorder URL (Optional)</Label>
              <Input
                id="purchaseUrl"
                type="url"
                value={purchaseUrl}
                onChange={(e) => setPurchaseUrl(e.target.value)}
                placeholder="https://tokopedia.com/..."
              />
            </div>
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
          <Button onClick={handleSubmit} disabled={isSubmitting} size="lg">
            <Plus className="h-4 w-4 mr-2" />
            {isSubmitting ? "Receiving..." : "Receive Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
