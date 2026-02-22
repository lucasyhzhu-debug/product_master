/**
 * StockTransferModal — Global Move Stock modal for multi-product transfers.
 *
 * Allows transferring one or more products from a source location to a
 * destination location in a single operation.
 *
 * Features:
 * - Source location dropdown
 * - Destination location dropdown (excludes source)
 * - Per-product quantity input with available stock validation
 * - "Add product" row for multi-product transfers
 * - Transfer All button: calls transferStock for each product sequentially
 * - Over-transfer blocked with clear message
 * - Success toast on completion, auto-close
 */

import { useState, useMemo, useCallback } from "react";
import { Plus, Trash2, ArrowRight, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

// ============================================================================
// TYPES
// ============================================================================

type StorageLocation = {
  _id: Id<"storageLocations">;
  name: string;
  locationType: string;
  isActive: boolean;
  isDefault?: boolean;
};

type ProductGroup = {
  menuProductId: string;
  menuProductName: string;
  menuProductCode: string;
  isActive: boolean;
  locations: Array<{
    locationId: string;
    quantity: number;
  }>;
  totalQuantity: number;
};

type TransferRow = {
  id: string; // local key
  menuProductId: string;
  quantity: string;
};

// ============================================================================
// COMPONENT
// ============================================================================

type StockTransferModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: StorageLocation[];
  /** Flat grouped data from getStockOverviewGrouped */
  productGroups: ProductGroup[];
};

export function StockTransferModal({
  open,
  onOpenChange,
  locations,
  productGroups,
}: StockTransferModalProps) {
  const { user } = useAuth();
  const transferStockMutation = useMutation(api.productInventory.mutations.transferStock);

  const [sourceLocationId, setSourceLocationId] = useState<string>("");
  const [destLocationId, setDestLocationId] = useState<string>("");
  const [rows, setRows] = useState<TransferRow[]>([
    { id: crypto.randomUUID(), menuProductId: "", quantity: "" },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Destination: exclude source
  const destLocations = useMemo(
    () => locations.filter((l) => l._id !== sourceLocationId),
    [locations, sourceLocationId]
  );

  // Products available at source location with their stock
  const sourceProductStock = useMemo(() => {
    if (!sourceLocationId) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const group of productGroups) {
      const locEntry = group.locations.find((l) => l.locationId === sourceLocationId);
      if (locEntry && locEntry.quantity > 0) {
        map.set(group.menuProductId, locEntry.quantity);
      }
    }
    return map;
  }, [sourceLocationId, productGroups]);

  // Products with stock at source (for dropdown options)
  const productsAtSource = useMemo(() => {
    return productGroups.filter((g) => sourceProductStock.has(g.menuProductId));
  }, [productGroups, sourceProductStock]);

  // Validate all rows
  const rowValidations = useMemo(() => {
    return rows.map((row) => {
      if (!row.menuProductId) return { valid: false, error: "Select a product" };
      const available = sourceProductStock.get(row.menuProductId) ?? 0;
      const qty = Number(row.quantity);
      if (isNaN(qty) || qty <= 0) return { valid: false, error: "Enter quantity > 0" };
      if (qty > available) return { valid: false, error: `Max: ${available}` };
      return { valid: true, error: null, available };
    });
  }, [rows, sourceProductStock]);

  const canSubmit =
    !!sourceLocationId &&
    !!destLocationId &&
    sourceLocationId !== destLocationId &&
    rows.length > 0 &&
    rows.every((_, i) => rowValidations[i]?.valid);

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), menuProductId: "", quantity: "" },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleRowChange = (id: string, field: keyof Omit<TransferRow, "id">, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleClose = useCallback(() => {
    if (!isSubmitting) {
      setSourceLocationId("");
      setDestLocationId("");
      setRows([{ id: crypto.randomUUID(), menuProductId: "", quantity: "" }]);
      onOpenChange(false);
    }
  }, [isSubmitting, onOpenChange]);

  const handleTransferAll = async () => {
    if (!canSubmit || !user?.token) return;

    setIsSubmitting(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const row of rows) {
        try {
          await transferStockMutation({
            token: user.token,
            menuProductId: row.menuProductId as Id<"menuProducts">,
            sourceLocationId: sourceLocationId as Id<"storageLocations">,
            destinationLocationId: destLocationId as Id<"storageLocations">,
            quantity: Number(row.quantity),
          });
          successCount++;
        } catch (err) {
          failCount++;
          const productName =
            productGroups.find((g) => g.menuProductId === row.menuProductId)?.menuProductName ??
            row.menuProductId;
          toast.error(`Failed to transfer ${productName}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }

      if (successCount > 0) {
        const srcName = locations.find((l) => l._id === sourceLocationId)?.name ?? "source";
        const dstName = locations.find((l) => l._id === destLocationId)?.name ?? "destination";
        toast.success(
          `Transferred ${successCount} product${successCount !== 1 ? "s" : ""} from ${srcName} to ${dstName}`
        );
      }

      if (failCount === 0) {
        handleClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset destination when source changes
  const handleSourceChange = (value: string) => {
    setSourceLocationId(value);
    if (destLocationId === value) {
      setDestLocationId("");
    }
    // Clear product selections that have no stock at new source
    setRows((prev) =>
      prev.map((r) => {
        const group = productGroups.find((g) => g.menuProductId === r.menuProductId);
        if (!group) return r;
        const hasStock = group.locations.some((l) => l.locationId === value && l.quantity > 0);
        return hasStock ? r : { ...r, menuProductId: "", quantity: "" };
      })
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Move Stock
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Source / Destination */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">From Location</Label>
              <Select value={sourceLocationId} onValueChange={handleSourceChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc._id} value={loc._id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">To Location</Label>
              <Select
                value={destLocationId}
                onValueChange={setDestLocationId}
                disabled={!sourceLocationId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination..." />
                </SelectTrigger>
                <SelectContent>
                  {destLocations.map((loc) => (
                    <SelectItem key={loc._id} value={loc._id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Product rows */}
          <div className="space-y-2">
            <Label className="text-sm">Products to Transfer</Label>

            {!sourceLocationId && (
              <p className="text-xs text-muted-foreground">
                Select a source location to see available products.
              </p>
            )}

            {sourceLocationId && productsAtSource.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No products with stock at this location.
              </p>
            )}

            {rows.map((row, index) => {
              const validation = rowValidations[index];
              const available = sourceProductStock.get(row.menuProductId) ?? 0;
              const parsedQty = Number(row.quantity);
              const isOverTransfer = row.quantity !== "" && parsedQty > available && available > 0;

              return (
                <div key={row.id} className="flex items-start gap-2">
                  {/* Product select */}
                  <div className="flex-1 min-w-0">
                    <Select
                      value={row.menuProductId}
                      onValueChange={(v) => handleRowChange(row.id, "menuProductId", v)}
                      disabled={!sourceLocationId || productsAtSource.length === 0}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select product..." />
                      </SelectTrigger>
                      <SelectContent>
                        {productsAtSource.map((g) => (
                          <SelectItem key={g.menuProductId} value={g.menuProductId}>
                            <span className="flex items-center gap-2">
                              <Package className="h-3.5 w-3.5 text-muted-foreground" />
                              {g.menuProductName}
                              <span className="text-xs text-muted-foreground font-mono ml-auto">
                                {sourceProductStock.get(g.menuProductId) ?? 0} avail
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quantity input */}
                  <div className="w-24 flex-shrink-0">
                    <Input
                      type="number"
                      min={1}
                      max={available}
                      value={row.quantity}
                      onChange={(e) => handleRowChange(row.id, "quantity", e.target.value)}
                      placeholder="Qty"
                      className={cn(
                        "h-9 font-mono text-sm",
                        isOverTransfer && "border-red-400"
                      )}
                      disabled={!row.menuProductId}
                    />
                    {row.menuProductId && available > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5 text-right">
                        max {available}
                      </p>
                    )}
                    {isOverTransfer && (
                      <p className="text-xs text-red-600 mt-0.5 text-right">
                        {validation?.error}
                      </p>
                    )}
                  </div>

                  {/* Remove row */}
                  {rows.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveRow(row.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}

            {/* Add product row */}
            {sourceLocationId && productsAtSource.length > rows.length && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddRow}
                className="text-xs h-7 px-2"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add another product
              </Button>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleTransferAll} disabled={!canSubmit || isSubmitting}>
            {isSubmitting
              ? "Transferring..."
              : `Transfer ${rows.length > 1 ? `${rows.length} Products` : "Stock"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
