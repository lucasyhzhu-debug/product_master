/**
 * DepotStockTransferDialog - Dialog for transferring finished goods stock to a depot.
 *
 * Allows admin/manager to move stock from any storage location to the depot
 * (linked to the selected outlet). Validates available stock before allowing submit.
 */

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useGoFoodTransferStock } from '@/hooks/convex/useGoFoodDepot';
import type { Id } from '../../../convex/_generated/dataModel';

// ============================================================================
// TYPES
// ============================================================================

interface StockGrouped {
  menuProductId: string;
  menuProductName: string;
  menuProductCode: string;
  totalQuantity: number;
  locations: Array<{
    locationId: string;
    locationName: string;
    locationType: string;
    quantity: number;
    effectiveThreshold: number;
    isLowStock: boolean;
    rowId: string;
  }>;
}

interface StorageLocation {
  _id: Id<"storageLocations">;
  name: string;
  locationType: string;
  isActive: boolean;
  isDefault?: boolean;
}

interface DepotStockTransferDialogProps {
  open: boolean;
  onClose: () => void;
  outletId: Id<"externalOutlets">;
  menuProductId: Id<"menuProducts">;
  menuProductName: string;
  destinationLocationId?: Id<"storageLocations">;
  stockGrouped: StockGrouped[];
  storageLocations: StorageLocation[];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DepotStockTransferDialog({
  open,
  onClose,
  menuProductId,
  menuProductName,
  destinationLocationId,
  stockGrouped,
  storageLocations,
}: DepotStockTransferDialogProps) {
  const transferStock = useGoFoodTransferStock();

  const [sourceLocationId, setSourceLocationId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Find stock group for this product
  const productStockGroup = useMemo(
    () => stockGrouped.find((g) => (g.menuProductId as string) === (menuProductId as string)),
    [stockGrouped, menuProductId]
  );

  // Active storage locations (excluding destination)
  const availableSourceLocations = useMemo(() => {
    return storageLocations.filter(
      (loc) =>
        loc.isActive &&
        (destinationLocationId ? (loc._id as string) !== (destinationLocationId as string) : true)
    );
  }, [storageLocations, destinationLocationId]);

  // How much is available at the selected source
  const availableAtSource = useMemo(() => {
    if (!sourceLocationId || !productStockGroup) return 0;
    const locEntry = productStockGroup.locations.find(
      (l) => (l.locationId as string) === sourceLocationId
    );
    return locEntry?.quantity ?? 0;
  }, [sourceLocationId, productStockGroup]);

  const parsedQuantity = parseInt(quantity, 10);
  const isValidQuantity = !isNaN(parsedQuantity) && parsedQuantity > 0;
  const isOverAvailable = isValidQuantity && parsedQuantity > availableAtSource;
  const canSubmit =
    sourceLocationId &&
    isValidQuantity &&
    !isOverAvailable &&
    !!destinationLocationId;

  const handleSubmit = async () => {
    if (!canSubmit || !destinationLocationId) return;
    setSubmitting(true);
    try {
      await transferStock({
        menuProductId,
        sourceLocationId: sourceLocationId as Id<"storageLocations">,
        destinationLocationId,
        quantity: parsedQuantity,
      });
      toast.success(`Moved ${parsedQuantity} units of ${menuProductName}`);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transfer failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move Stock to Depot</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Product name */}
          <div>
            <p className="text-sm text-muted-foreground">Product</p>
            <p className="font-medium">{menuProductName}</p>
          </div>

          {/* Source location selector */}
          <div className="space-y-1.5">
            <Label htmlFor="source-location">Source Location</Label>
            <Select
              value={sourceLocationId}
              onValueChange={(val) => {
                setSourceLocationId(val);
                setQuantity('');
              }}
            >
              <SelectTrigger id="source-location">
                <SelectValue placeholder="Select source location..." />
              </SelectTrigger>
              <SelectContent>
                {availableSourceLocations.map((loc) => {
                  const locEntry = productStockGroup?.locations.find(
                    (l) => (l.locationId as string) === (loc._id as string)
                  );
                  const qty = locEntry?.quantity ?? 0;
                  return (
                    <SelectItem key={loc._id} value={loc._id as string}>
                      {loc.name}
                      <span className="ml-2 text-muted-foreground text-xs">
                        ({qty} available)
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {sourceLocationId && (
              <p className="text-xs text-muted-foreground">
                Available at source:{' '}
                <span className={`font-medium ${availableAtSource <= 0 ? 'text-red-500' : 'text-foreground'}`}>
                  {availableAtSource} units
                </span>
              </p>
            )}
          </div>

          {/* Destination info */}
          {!destinationLocationId && (
            <div className="text-sm text-amber-600 bg-amber-50 rounded p-2">
              This outlet does not have a linked storage location. Run the seed migration first.
            </div>
          )}

          {/* Quantity input */}
          <div className="space-y-1.5">
            <Label htmlFor="quantity">Quantity to Transfer</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              max={availableAtSource}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity..."
              disabled={!sourceLocationId}
              className={isOverAvailable ? 'border-red-400 focus-visible:ring-red-400' : ''}
            />
            {isOverAvailable && (
              <p className="text-xs text-red-500">
                Exceeds available stock ({availableAtSource} units)
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="gap-2"
          >
            {submitting ? 'Moving...' : 'Move Stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
