import { motion } from 'framer-motion';
import { Truck, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <motion.div
      layout
      className="rounded-lg overflow-hidden border border-emerald-600 bg-emerald-900/20 hover:bg-emerald-900/30 transition-colors"
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between bg-emerald-900/40 border-b border-emerald-800/50">
        <span className="font-mono text-sm font-bold text-white">{order.orderNumber}</span>
        <CheckCircle className="h-4 w-4 text-emerald-400" />
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <p className="text-sm text-slate-300 truncate">{order.customerName}</p>

        <div className="text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>{order.totalPackages} package{order.totalPackages > 1 ? 's' : ''}</span>
            {order.deliveryType && (
              <>
                <span>•</span>
                <span className="text-emerald-400">{order.deliveryType}</span>
              </>
            )}
          </div>
        </div>

        {/* Mark Shipped/Picked Up Button */}
        <Button
          size="sm"
          onClick={onMarkShipped}
          disabled={disabled}
          className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {isPickup ? (
            <>
              <CheckCircle className="h-3 w-3 mr-1" />
              Mark Picked Up
            </>
          ) : (
            <>
              <Truck className="h-3 w-3 mr-1" />
              Mark Shipped
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
