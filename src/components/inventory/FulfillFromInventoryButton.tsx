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
import { useState, useEffect } from 'react';
import { Package, Loader2, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [selectedLocationId, setSelectedLocationId] = useState<Id<"storageLocations"> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stockShortages, setStockShortages] = useState<ShortageItem[] | null>(null);

  // Load storage locations for location selector
  const storageLocations = useQuery(api.storageLocations.queries.list, { activeOnly: true });

  // Load settings to determine default location
  const settings = useQuery(api.productInventory.queries.getSettings);

  // Auto-select default location once locations are loaded
  useEffect(() => {
    if (selectedLocationId) return; // already selected
    if (!storageLocations || storageLocations.length === 0) return;
    const office = storageLocations.find((l) =>
      l.name.toLowerCase().includes('office')
    );
    const settingsDefault = settings?.defaultAddLocationId
      ? storageLocations.find((l) => l._id === settings.defaultAddLocationId)
      : null;
    setSelectedLocationId((office ?? settingsDefault ?? storageLocations[0])._id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageLocations]);

  // Load availability for the selected location (always active — panel is always visible)
  const availability = useQuery(
    api.productInventory.queries.getStockForOrder,
    selectedLocationId ? { orderId, locationId: selectedLocationId } : "skip"
  );

  // Fulfill mutation
  const fulfillFromInventory = useMutation(api.productInventory.mutations.fulfillFromInventory);

  // Check if all items are available (enable Confirm button)
  const allAvailable = availability !== undefined &&
    availability.length > 0 &&
    availability.every((item) => item.isSufficient);

  const handleConfirm = async () => {
    if (!selectedLocationId) return;
    setIsSubmitting(true);
    setStockShortages(null);
    try {
      const result = await fulfillFromInventory({ orderId, locationId: selectedLocationId, token });

      if (result?.deductions && result.deductions.length > 0) {
        const lines = result.deductions.map(
          (d: { productName: string; used: number; remaining: number }) =>
            `${d.productName}: ${d.used} used, ${d.remaining} remaining`
        );
        toast.success('Order fulfilled from inventory!', {
          description: lines.join('\n'),
          duration: 6000,
        });
      } else {
        toast.success('Order fulfilled from inventory! Status: Awaiting Delivery');
      }
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
        <p className="text-xs text-muted-foreground">
          Skip kitchen production and fulfill this order directly from finished goods stock.
        </p>

        {/* Location toggle buttons */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Location
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {storageLocations?.map((loc) => (
              <Button
                key={loc._id}
                variant={selectedLocationId === loc._id ? 'default' : 'outline'}
                size="sm"
                className={selectedLocationId === loc._id
                  ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                  : 'text-muted-foreground'}
                onClick={() => {
                  setSelectedLocationId(loc._id);
                  setStockShortages(null);
                }}
              >
                {loc.name}
              </Button>
            ))}
          </div>
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

        {/* Confirm button */}
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
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
      </CardContent>
    </Card>
  );
}
