import { Truck, CheckCircle } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';

interface ReadyToShipCardProps {
  order: {
    _id: Id<'orders'>;
    orderNumber: string;
    customerName: string;
    totalPackages: number;
    deliveryType?: string;
  };
  onMarkShipped: () => void;
  disabled?: boolean;
}

export function ReadyToShipCard({ order, onMarkShipped, disabled = false }: ReadyToShipCardProps) {
  const isPickup = order.deliveryType?.toLowerCase().includes('pickup');

  return (
    <div className="rounded-lg overflow-hidden border-2 border-[var(--color-kitchen-success)] bg-card shadow-sm">
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between bg-[var(--color-kitchen-success-bg)] border-b border-[var(--color-kitchen-success)]/20">
        <span className="font-mono text-base font-bold text-foreground">{order.orderNumber}</span>
        <CheckCircle className="h-4 w-4 text-[var(--color-kitchen-success)]" />
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-2.5">
        <p className="text-sm font-medium text-foreground truncate">{order.customerName}</p>

        <div className="text-xs text-muted-foreground font-medium">
          <div className="flex items-center gap-2">
            <span>{order.totalPackages} package{order.totalPackages > 1 ? 's' : ''}</span>
            {order.deliveryType && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-[var(--color-kitchen-success)] font-semibold">{order.deliveryType}</span>
              </>
            )}
          </div>
        </div>

        {/* Mark Shipped/Picked Up Button */}
        <button
          onClick={onMarkShipped}
          disabled={disabled}
          className="w-full mt-2 bg-[var(--color-kitchen-success)] hover:opacity-90 active:opacity-80 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
        >
          {isPickup ? (
            <>
              <CheckCircle className="h-3.5 w-3.5 inline mr-1.5" />
              Mark Picked Up
            </>
          ) : (
            <>
              <Truck className="h-3.5 w-3.5 inline mr-1.5" />
              Mark Shipped
            </>
          )}
        </button>
      </div>
    </div>
  );
}
