import { Clock, Package } from 'lucide-react';
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
      quantity: number;
      filled: number;
      ballsPerPackage: number;
    }>;
    totalBallsNeeded: number;
    totalBallsFilled: number;
    totalPackages: number;
    totalPackagesFilled: number;
    confirmedAt: number;
  };
  orderStatus?: string;
  onFillPackage: (itemId: Id<'orderItems'>) => void;
  onUnfillPackage: (itemId: Id<'orderItems'>) => void;
  onMarkBoxed?: () => void;
  disabled?: boolean;
}

export function BoxingOrderCard({ order, orderStatus, onFillPackage, onUnfillPackage, onMarkBoxed, disabled = false }: BoxingOrderCardProps) {
  const minutesAgo = Math.floor((Date.now() - order.confirmedAt) / 60000);
  const isUrgent = minutesAgo > 30;
  const isComplete = order.totalPackagesFilled === order.totalPackages;
  const progressPercent = (order.totalPackagesFilled / order.totalPackages) * 100;

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden border-2 bg-card transition-all',
        isComplete
          ? 'border-[var(--color-kitchen-success)] shadow-md'
          : isUrgent
            ? 'border-l-4 border-l-[var(--color-kitchen-critical)] border-border'
            : 'border-border'
      )}
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-base font-bold text-foreground">
            {order.orderNumber}
          </span>
          {isUrgent && (
            <div className="flex items-center gap-1 text-xs font-medium text-[var(--color-kitchen-critical)]">
              <Clock className="h-3.5 w-3.5" />
              <span>{minutesAgo}m</span>
            </div>
          )}
        </div>
        {isComplete && (
          <span className="text-xs font-bold text-[var(--color-kitchen-success)] uppercase px-2 py-0.5 bg-[var(--color-kitchen-success-bg)] rounded">
            Complete
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-muted relative overflow-hidden">
        <div
          className="h-full bg-[var(--color-kitchen-success)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Customer & Stats */}
      <div className="px-3.5 py-2.5 border-b border-border">
        <p className="text-sm font-medium text-foreground truncate">{order.customerName}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-medium">
          <span>
            {order.totalPackagesFilled}/{order.totalPackages} packages
          </span>
          <span className="text-muted-foreground">•</span>
          <span>
            {order.totalBallsFilled}/{order.totalBallsNeeded} balls
          </span>
        </div>
      </div>

      {/* Items with Counter Buttons */}
      <div className="p-3 space-y-3 bg-muted/50">
        {order.items.map((item) => (
          <PackageCounter
            key={item._id}
            productName={item.productName}
            total={item.quantity}
            filled={item.filled}
            ballsPerPackage={item.ballsPerPackage}
            onIncrement={() => onFillPackage(item._id)}
            onDecrement={() => onUnfillPackage(item._id)}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Mark as Boxed button - shown when all packages filled and order is in Packaging status */}
      {isComplete && orderStatus === 'Packaging' && onMarkBoxed && (
        <div className="p-3 bg-[var(--color-kitchen-success-bg)] border-t border-[var(--color-kitchen-success)]/20">
          <button
            onClick={onMarkBoxed}
            disabled={disabled}
            className="w-full bg-[var(--color-kitchen-success)] hover:opacity-90 active:opacity-80 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            <Package className="h-3.5 w-3.5 inline mr-1.5" />
            Mark as Boxed
          </button>
        </div>
      )}
    </div>
  );
}
