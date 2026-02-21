/**
 * InventoryAvailabilityPanel
 *
 * Shows per-item stock availability at the selected location before
 * the staff confirms a drawdown from finished goods inventory.
 *
 * Phase 17.1 Plan 04
 */
import { useQuery } from 'convex/react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Skeleton } from '@/components/ui/skeleton';

// ============================================
// Types
// ============================================

interface InventoryAvailabilityPanelProps {
  orderId: Id<"orders">;
  locationId: Id<"storageLocations"> | null;
}

// ============================================
// Component
// ============================================

export function InventoryAvailabilityPanel({
  orderId,
  locationId,
}: InventoryAvailabilityPanelProps) {
  const availability = useQuery(
    api.productInventory.queries.getStockForOrder,
    locationId ? { orderId, locationId } : "skip"
  );

  // No location selected yet
  if (!locationId) {
    return (
      <p className="text-sm text-muted-foreground italic py-2">
        Select a location to check availability.
      </p>
    );
  }

  // Loading skeleton
  if (availability === undefined) {
    return (
      <div className="space-y-2 py-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  if (availability.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-2">
        No fulfillable items found on this order.
      </p>
    );
  }

  const shortItems = availability.filter((item) => !item.isSufficient);
  const allAvailable = shortItems.length === 0;

  return (
    <div className="space-y-3">
      {/* Per-item table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Product</th>
              <th className="text-center px-3 py-2 font-medium w-20">Needed</th>
              <th className="text-center px-3 py-2 font-medium w-24">Available</th>
              <th className="text-center px-3 py-2 font-medium w-28">Status</th>
            </tr>
          </thead>
          <tbody>
            {availability.map((item) => (
              <tr
                key={item.orderItemId}
                className={item.isSufficient ? '' : 'bg-red-50 dark:bg-red-950/30'}
              >
                <td className="px-3 py-2">{item.productName}</td>
                <td className="px-3 py-2 text-center">{item.quantityNeeded}</td>
                <td className="px-3 py-2 text-center">{item.quantityAvailable}</td>
                <td className="px-3 py-2 text-center">
                  {item.isSufficient ? (
                    <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 text-xs font-medium">
                      <XCircle className="h-3.5 w-3.5" />
                      Short {item.quantityNeeded - item.quantityAvailable}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      {allAvailable ? (
        <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          All items available
        </p>
      ) : (
        <p className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-1.5">
          <XCircle className="h-4 w-4" />
          {shortItems.length} item{shortItems.length !== 1 ? 's' : ''} short — cannot fulfill
        </p>
      )}
    </div>
  );
}
