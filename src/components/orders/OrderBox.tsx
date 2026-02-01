import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ChannelBadge } from './ChannelBadge';
import { ProductPackage } from './ProductPackage';
import type { Id } from '../../../convex/_generated/dataModel';

type PackageStatus = 'empty' | 'filling' | 'filled' | 'packed';

interface OrderItem {
  _id: Id<"orderItems">;
  productName: string;
  productVariant?: string;
  productionType?: 'original' | 'bite_sized';
  productionUnits?: number;
  quantity: number;
  packageStatus?: PackageStatus;
  ballsFilled?: number;
}

interface OrderBoxProps {
  order: {
    _id: Id<"orders">;
    orderNumber: string;
    channel?: string;
    dueDate?: number;
    items: OrderItem[];
    customer?: { name: string } | null;
  };
  onPackageStatusChange?: (itemId: Id<"orderItems">, newStatus: 'filled' | 'packed') => void;
  onComplete?: () => void;
  disabled?: boolean;
}

function formatDueTime(dueDate: number | undefined): string {
  if (!dueDate) return '-';
  const date = new Date(dueDate);
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getUrgencyState(dueDate: number | undefined): 'overdue' | 'urgent' | 'normal' {
  if (!dueDate) return 'normal';

  const now = Date.now();
  const diffMs = dueDate - now;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMs < 0) return 'overdue';
  if (diffHours <= 2) return 'urgent';
  return 'normal';
}

// Expand items into individual packages
function expandItemsToPackages(items: OrderItem[]): Array<{
  itemId: Id<"orderItems">;
  productName: string;
  ballType: 'original' | 'bite_sized';
  ballsRequired: number;
  ballsFilled: number;
  status: PackageStatus;
  packageIndex: number;
}> {
  const packages: Array<{
    itemId: Id<"orderItems">;
    productName: string;
    ballType: 'original' | 'bite_sized';
    ballsRequired: number;
    ballsFilled: number;
    status: PackageStatus;
    packageIndex: number;
  }> = [];

  for (const item of items) {
    if (!item.productionType || !item.productionUnits) continue;

    const ballsPerPackage = item.productionUnits;
    const totalBallsFilled = item.ballsFilled ?? 0;

    for (let i = 0; i < item.quantity; i++) {
      // Calculate how many balls this specific package has
      const ballsBeforeThis = i * ballsPerPackage;
      const ballsInThisPackage = Math.min(
        Math.max(0, totalBallsFilled - ballsBeforeThis),
        ballsPerPackage
      );

      // Determine status
      let status: PackageStatus = 'empty';
      if (item.packageStatus === 'packed' && ballsInThisPackage === ballsPerPackage) {
        status = 'packed';
      } else if (ballsInThisPackage === ballsPerPackage) {
        status = 'filled';
      } else if (ballsInThisPackage > 0) {
        status = 'filling';
      }

      // Use item's packageStatus if it's explicitly set and this is the first package
      // This is a simplification - in reality we'd track per-package status
      if (i === 0 && item.packageStatus) {
        status = item.packageStatus;
      }

      const displayName = item.productVariant
        ? `${item.productVariant}`
        : item.productName;

      packages.push({
        itemId: item._id,
        productName: displayName,
        ballType: item.productionType,
        ballsRequired: ballsPerPackage,
        ballsFilled: ballsInThisPackage,
        status,
        packageIndex: i,
      });
    }
  }

  return packages;
}

export function OrderBox({
  order,
  onPackageStatusChange,
  onComplete,
  disabled = false,
}: OrderBoxProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const urgency = getUrgencyState(order.dueDate);

  // Calculate totals
  const packages = expandItemsToPackages(order.items);

  const originalPackages = packages.filter((p) => p.ballType === 'original');
  const biteSizedPackages = packages.filter((p) => p.ballType === 'bite_sized');

  const originalFilled = originalPackages.reduce((sum, p) => sum + p.ballsFilled, 0);
  const originalNeeded = originalPackages.reduce((sum, p) => sum + p.ballsRequired, 0);
  const biteSizedFilled = biteSizedPackages.reduce((sum, p) => sum + p.ballsFilled, 0);
  const biteSizedNeeded = biteSizedPackages.reduce((sum, p) => sum + p.ballsRequired, 0);

  const allPackagesPacked = packages.every((p) => p.status === 'packed');
  const canComplete = allPackagesPacked && !disabled;

  // Hold-to-complete logic
  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }
    setIsHolding(false);
    setHoldProgress(0);
  }, []);

  const startHold = useCallback(() => {
    if (!canComplete) return;

    setIsHolding(true);
    setHoldProgress(0);

    progressRef.current = setInterval(() => {
      setHoldProgress((prev) => Math.min(prev + 10, 100));
    }, 100);

    holdTimerRef.current = setTimeout(() => {
      onComplete?.();
      cancelHold();
    }, 1000);
  }, [canComplete, onComplete, cancelHold]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  const handlePackageClick = (pkg: typeof packages[0]) => {
    if (disabled || !onPackageStatusChange) return;

    if (pkg.status === 'filled') {
      onPackageStatusChange(pkg.itemId, 'packed');
    } else if (pkg.status === 'packed') {
      onPackageStatusChange(pkg.itemId, 'filled');
    }
  };

  // Card border styles based on urgency
  const cardClassName = cn(
    'relative overflow-hidden transition-all',
    {
      'border-red-500 animate-pulse shadow-red-200 dark:shadow-red-900/30 shadow-lg':
        urgency === 'overdue',
      'border-amber-500 animate-pulse shadow-amber-200 dark:shadow-amber-900/30 shadow-md':
        urgency === 'urgent',
    }
  );

  return (
    <Card className={cardClassName}>
      {/* Header */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <ChannelBadge channel={order.channel} size="sm" />
            <span className="font-mono font-semibold text-lg">
              #{order.orderNumber}
            </span>
            {order.customer?.name && (
              <>
                <span className="text-muted-foreground">-</span>
                <span className="truncate">{order.customer.name}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {urgency === 'urgent' && (
              <Badge className="bg-amber-500 text-white animate-pulse">URGENT</Badge>
            )}
            {urgency === 'overdue' && (
              <Badge className="bg-red-500 text-white animate-pulse">OVERDUE</Badge>
            )}
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              DUE: {formatDueTime(order.dueDate)}
            </span>
          </div>
        </div>
      </CardHeader>

      <Separator />

      {/* Summary + Action */}
      <div className="px-4 py-3 bg-muted/30">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Totals */}
          <div className="flex items-center gap-4 text-sm">
            {originalNeeded > 0 && (
              <span className={cn(originalFilled >= originalNeeded && 'text-green-600 font-medium')}>
                Original {originalFilled}/{originalNeeded}
                {originalFilled >= originalNeeded && ' ✓'}
              </span>
            )}
            {biteSizedNeeded > 0 && (
              <span className={cn(biteSizedFilled >= biteSizedNeeded && 'text-green-600 font-medium')}>
                Bite-sized {biteSizedFilled}/{biteSizedNeeded}
                {biteSizedFilled >= biteSizedNeeded && ' ✓'}
              </span>
            )}
          </div>

          {/* Status / Complete button */}
          {allPackagesPacked ? (
            <div
              className={cn(
                'relative h-9 min-w-[200px] rounded-md overflow-hidden select-none',
                canComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
              )}
              onMouseDown={startHold}
              onMouseUp={cancelHold}
              onMouseLeave={cancelHold}
              onTouchStart={startHold}
              onTouchEnd={cancelHold}
              onTouchCancel={cancelHold}
            >
              <div className="absolute inset-0 bg-green-100 dark:bg-green-950" />
              <div
                className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-100"
                style={{ width: `${holdProgress}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-sm font-medium">
                {isHolding ? (
                  <span className="text-white mix-blend-difference">
                    {holdProgress < 100 ? 'Hold...' : 'Completing!'}
                  </span>
                ) : (
                  <span className="text-green-700 dark:text-green-300">
                    ✓ ALL PACKED - Hold 1s to confirm
                  </span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              Awaiting balls...
            </span>
          )}
        </div>
      </div>

      <Separator />

      {/* Package Grid */}
      <CardContent className="py-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {packages.map((pkg) => (
            <ProductPackage
              key={`${pkg.itemId}-${pkg.packageIndex}`}
              productName={pkg.productName}
              ballType={pkg.ballType}
              ballsRequired={pkg.ballsRequired}
              ballsFilled={pkg.ballsFilled}
              status={pkg.status}
              onPack={() => handlePackageClick({ ...pkg, status: 'filled' })}
              onUnpack={() => handlePackageClick({ ...pkg, status: 'packed' })}
              disabled={disabled}
            />
          ))}
        </div>

        {packages.length === 0 && (
          <div className="text-center text-muted-foreground py-4">
            No production items in this order
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OrderBox;
