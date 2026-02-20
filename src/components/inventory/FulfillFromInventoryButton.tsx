/**
 * FulfillFromInventoryButton
 *
 * Encapsulates the entire "Use Available Inventory" drawdown flow:
 * - Only visible when order status is PaymentReceived
 * - Location selector + per-item availability check
 * - Atomic drawdown via fulfillFromInventory mutation
 * - Advances order to AwaitingDelivery on success
 *
 * Phase 17.1 Plan 04
 */
import { useState } from 'react';
import { Package, Loader2, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InventoryAvailabilityPanel } from './InventoryAvailabilityPanel';

// ============================================
// Types
// ============================================

interface ShortageItem {
  productName: string;
  needed: number;
  available: number;
}

interface FulfillFromInventoryButtonProps {
  orderId: Id<"orders">;
  orderStatus: string;
  token: string;
}

// ============================================
// Component
// ============================================

export function FulfillFromInventoryButton({
  orderId,
  orderStatus,
  token,
}: FulfillFromInventoryButtonProps) {
  // Only render for PaymentReceived orders
  if (orderStatus !== 'PaymentReceived') {
    return null;
  }

  return <FulfillFromInventoryPanel orderId={orderId} token={token} />;
}

/**
 * Inner panel component — separated so we can conditionally
 * render the panel only when status matches (avoids hook ordering issues).
 */
function FulfillFromInventoryPanel({
  orderId,
  token,
}: {
  orderId: Id<"orders">;
  token: string;
}) {
  const [showPanel, setShowPanel] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<Id<"storageLocations"> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stockShortages, setStockShortages] = useState<ShortageItem[] | null>(null);

  // Load storage locations for location selector
  const storageLocations = useQuery(api.storageLocations.queries.list, { activeOnly: true });

  // Load settings to determine default location
  const settings = useQuery(api.productInventory.queries.getSettings);

  // Load availability for the selected location
  const availability = useQuery(
    api.productInventory.queries.getStockForOrder,
    selectedLocationId && showPanel ? { orderId, locationId: selectedLocationId } : "skip"
  );

  // Fulfill mutation
  const fulfillFromInventory = useMutation(api.productInventory.mutations.fulfillFromInventory);

  // Check if all items are available (enable Confirm button)
  const allAvailable = availability !== undefined &&
    availability.length > 0 &&
    availability.every((item) => item.isSufficient);

  const handleOpen = () => {
    // Default to settings.defaultAddLocationId, or first active location
    if (!selectedLocationId) {
      const defaultId = settings?.defaultAddLocationId;
      if (defaultId) {
        setSelectedLocationId(defaultId);
      } else if (storageLocations && storageLocations.length > 0) {
        setSelectedLocationId(storageLocations[0]._id);
      }
    }
    setStockShortages(null);
    setShowPanel(true);
  };

  const handleCancel = () => {
    setShowPanel(false);
    setStockShortages(null);
  };

  const handleConfirm = async () => {
    if (!selectedLocationId) return;
    setIsSubmitting(true);
    setStockShortages(null);
    try {
      await fulfillFromInventory({ orderId, locationId: selectedLocationId, token });
      toast.success('Order fulfilled from inventory! Status: Awaiting Delivery');
      setShowPanel(false);
    } catch (error: unknown) {
      if (error instanceof ConvexError) {
        // Check for insufficient_stock structured error
        const data = error.data as { type?: string; shortages?: ShortageItem[] };
        if (data?.type === 'insufficient_stock' && data.shortages) {
          setStockShortages(data.shortages);
          return;
        }
      }
      // Generic error
      const msg = error instanceof Error ? error.message : 'Failed to fulfill from inventory';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-blue-700 dark:text-blue-400">
          <Package className="h-4 w-4" />
          Use Available Inventory
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!showPanel ? (
          /* Initial state: show trigger button */
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Skip kitchen production and fulfill this order directly from finished goods stock.
            </p>
            <Button
              variant="outline"
              className="w-full border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30"
              onClick={handleOpen}
            >
              <Package className="h-4 w-4 mr-2" />
              Use Available Inventory
            </Button>
          </div>
        ) : (
          /* Panel state: location selector + availability + actions */
          <div className="space-y-4">
            {/* Location selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Select Location
              </label>
              <Select
                value={selectedLocationId ?? ''}
                onValueChange={(val) => {
                  setSelectedLocationId(val as Id<"storageLocations">);
                  setStockShortages(null);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a location..." />
                </SelectTrigger>
                <SelectContent>
                  {storageLocations?.map((loc) => (
                    <SelectItem key={loc._id} value={loc._id}>
                      {loc.name}
                      {loc.locationType && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({loc.locationType})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Availability panel */}
            <InventoryAvailabilityPanel
              orderId={orderId}
              locationId={selectedLocationId}
            />

            {/* Insufficient stock error (from mutation) */}
            {stockShortages && stockShortages.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">Insufficient stock at this location:</p>
                  <ul className="space-y-0.5 text-sm">
                    {stockShortages.map((s, i) => (
                      <li key={i}>
                        <span className="font-medium">{s.productName}</span>
                        {': '}need {s.needed}, have {s.available}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleConfirm}
                disabled={!selectedLocationId || !allAvailable || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Package className="h-4 w-4 mr-2" />
                )}
                Confirm Fulfillment
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
