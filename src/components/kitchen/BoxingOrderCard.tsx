import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PackageCounter } from './PackageCounter';
import type { Id } from '../../../convex/_generated/dataModel';

interface BoxingOrderCardProps {
  order: {
    _id: Id<'orders'>;
    orderNumber: string;
    customerName: string;
    items: Array<{
      _id: Id<'orderItems'>;
      productName: string;
      quantity: number; // Total packages for this product
      filled: number; // How many filled so far
      ballsPerPackage: number;
      boxType: string;
    }>;
    totalBallsNeeded: number;
    totalBallsFilled: number;
    totalPackages: number;
    totalPackagesFilled: number;
    confirmedAt: number;
  };
  onFillPackage: (itemId: Id<'orderItems'>) => void;
  onUnfillPackage: (itemId: Id<'orderItems'>) => void;
  disabled?: boolean;
}

export function BoxingOrderCard({ order, onFillPackage, onUnfillPackage, disabled = false }: BoxingOrderCardProps) {
  const minutesAgo = Math.floor((Date.now() - order.confirmedAt) / 60000);
  const isUrgent = minutesAgo > 30;
  const isComplete = order.totalPackagesFilled === order.totalPackages;
  const progressPercent = (order.totalPackagesFilled / order.totalPackages) * 100;

  return (
    <motion.div
      layout
      className={cn(
        'rounded-xl overflow-hidden border-2 transition-all',
        isComplete
          ? 'bg-emerald-900/30 border-emerald-600'
          : isUrgent
            ? 'bg-slate-700/50 border-l-4 border-l-red-500 border-slate-600'
            : 'bg-slate-700/50 border-slate-600'
      )}
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between bg-slate-800/50">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-white">
            {order.orderNumber}
          </span>
          {isUrgent && (
            <div className="flex items-center gap-1 text-xs text-red-400">
              <Clock className="h-3 w-3" />
              <span>{minutesAgo}m ago</span>
            </div>
          )}
        </div>
        {isComplete && (
          <span className="text-xs font-semibold text-emerald-400 uppercase">
            Complete
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-slate-900/50 relative overflow-hidden">
        <motion.div
          className="h-full bg-emerald-500"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Customer */}
      <div className="px-3 py-2 border-b border-slate-600/50">
        <p className="text-sm text-slate-300 truncate">{order.customerName}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
          <span>
            {order.totalPackagesFilled}/{order.totalPackages} packages
          </span>
          <span>•</span>
          <span>
            {order.totalBallsFilled}/{order.totalBallsNeeded} balls
          </span>
        </div>
      </div>

      {/* Items with Counter Buttons */}
      <div className="p-2 space-y-2">
        {order.items.map((item) => (
          <PackageCounter
            key={item._id}
            productName={item.productName}
            total={item.quantity}
            filled={item.filled}
            ballsPerPackage={item.ballsPerPackage}
            boxType={item.boxType}
            onIncrement={() => onFillPackage(item._id)}
            onDecrement={() => onUnfillPackage(item._id)}
            disabled={disabled}
          />
        ))}
      </div>
    </motion.div>
  );
}
