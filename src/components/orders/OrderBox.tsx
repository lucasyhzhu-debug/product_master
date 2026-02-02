import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHoldToActivate } from '@/hooks/useHoldToActivate';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
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
  packedPackageIndices?: number[]; // Per-package tracking
}

interface OrderBoxProps {
  order: {
    _id: Id<"orders">;
    orderNumber: string;
    channel?: string;
    status?: string;
    dueDate?: number;
    items: OrderItem[];
    customer?: { name: string } | null;
  };
  onPackageStatusChange?: (itemId: Id<"orderItems">, newStatus: 'filled' | 'packed', packageIndex: number) => void;
  onComplete?: () => void;
  onRevert?: () => void;
  isCompleted?: boolean;
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
    const packedIndices = item.packedPackageIndices ?? [];

    for (let i = 0; i < item.quantity; i++) {
      // Calculate how many balls this specific package has
      const ballsBeforeThis = i * ballsPerPackage;
      const ballsInThisPackage = Math.min(
        Math.max(0, totalBallsFilled - ballsBeforeThis),
        ballsPerPackage
      );

      // Check if this specific package is packed (using per-package tracking)
      const isThisPackagePacked = packedIndices.includes(i);
      const isThisPackageFilled = ballsInThisPackage >= ballsPerPackage;

      // Determine status using per-package tracking
      let status: PackageStatus = 'empty';
      if (isThisPackagePacked && isThisPackageFilled) {
        status = 'packed';
      } else if (isThisPackageFilled) {
        status = 'filled';
      } else if (ballsInThisPackage > 0) {
        status = 'filling';
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

// Group packages by product name for display with row headers
function groupPackagesByProduct(packages: ReturnType<typeof expandItemsToPackages>) {
  const groups = new Map<string, typeof packages>();

  for (const pkg of packages) {
    const key = pkg.productName;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pkg);
  }

  return Array.from(groups.entries());
}

// Statuses that mean the order has left the kitchen (completed in kitchen context)
const COMPLETED_STATUSES = ['WaitingShipment', 'WaitingPickup', 'CompleteShipped', 'PickedUp'];

export function OrderBox({
  order,
  onPackageStatusChange,
  onComplete,
  onRevert,
  isCompleted: isCompletedProp,
  disabled = false,
}: OrderBoxProps) {
  // Determine if order is "completed" (left the kitchen) from status, or use prop as override
  const isCompleted = isCompletedProp ?? COMPLETED_STATUSES.includes(order.status ?? '');

  const urgency = getUrgencyState(order.dueDate);

  // Navigation and auth for order ID link
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canViewOrderDetails = hasPermission('canAccessOrders');

  const handleOrderIdClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (canViewOrderDetails) {
      // Extract numeric ID from order._id
      const numericId = order._id.toString().split(':')[1] || order._id;
      navigate(`/orders/${numericId}`);
    }
  };

  // Calculate totals
  const packages = expandItemsToPackages(order.items);

  const originalPackages = packages.filter((p) => p.ballType === 'original');
  const biteSizedPackages = packages.filter((p) => p.ballType === 'bite_sized');

  const originalFilled = originalPackages.reduce((sum, p) => sum + p.ballsFilled, 0);
  const originalNeeded = originalPackages.reduce((sum, p) => sum + p.ballsRequired, 0);
  const biteSizedFilled = biteSizedPackages.reduce((sum, p) => sum + p.ballsFilled, 0);
  const biteSizedNeeded = biteSizedPackages.reduce((sum, p) => sum + p.ballsRequired, 0);

  const allBallsFilled = packages.every((p) => p.ballsFilled >= p.ballsRequired);
  const allPackagesPacked = packages.every((p) => p.status === 'packed');
  const canComplete = allPackagesPacked && !disabled;

  // Hold-to-complete hook for complete button
  const {
    isHolding: isHoldingComplete,
    progress: completeProgress,
    handlers: completeHandlers,
  } = useHoldToActivate({
    duration: 1000,
    onComplete: () => onComplete?.(),
    disabled: !canComplete,
  });

  // Hold-to-activate hook for undo button
  const {
    isHolding: isHoldingUndo,
    progress: undoProgress,
    handlers: undoHandlers,
  } = useHoldToActivate({
    duration: 1000,
    onComplete: () => onRevert?.(),
    disabled: disabled || !isCompleted,
  });

  const handlePackageClick = (pkg: typeof packages[0]) => {
    if (disabled || !onPackageStatusChange) return;

    if (pkg.status === 'filled') {
      onPackageStatusChange(pkg.itemId, 'packed', pkg.packageIndex);
    } else if (pkg.status === 'packed') {
      onPackageStatusChange(pkg.itemId, 'filled', pkg.packageIndex);
    }
  };

  const isDraft = order.status === 'Draft';

  // Card border styles based on completion status, urgency, and draft status
  const cardClassName = cn(
    'relative overflow-hidden transition-all',
    {
      // Completed orders get green styling
      'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800':
        isCompleted,
      // Draft orders get grey styling
      'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 opacity-75':
        isDraft && !isCompleted,
      // Urgency styling (only for non-draft, non-completed)
      'border-red-500 animate-pulse shadow-red-200 dark:shadow-red-900/30 shadow-lg':
        urgency === 'overdue' && !isDraft && !isCompleted,
      'border-amber-500 animate-pulse shadow-amber-200 dark:shadow-amber-900/30 shadow-md':
        urgency === 'urgent' && !isDraft && !isCompleted,
    }
  );

  return (
    <Card className={cardClassName}>
      {/* Header - mobile responsive */}
      <CardHeader className="pb-2 px-3 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {/* Order info - mobile: stack badge/number above customer */}
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <ChannelBadge channel={order.channel} size="sm" />
            {canViewOrderDetails ? (
              <button
                onClick={handleOrderIdClick}
                className="font-mono font-semibold text-base sm:text-lg hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded-sm px-1 -ml-1"
              >
                #{order.orderNumber}
              </button>
            ) : (
              <span className="font-mono font-semibold text-base sm:text-lg">
                #{order.orderNumber}
              </span>
            )}
            {order.customer?.name && (
              <>
                <span className="text-muted-foreground hidden sm:inline">-</span>
                <span className="truncate text-sm sm:text-base w-full sm:w-auto">{order.customer.name}</span>
              </>
            )}
          </div>
          {/* Status badges & due time */}
          <div className="flex items-center gap-2 shrink-0">
            {isDraft && (
              <Badge className="bg-gray-500 text-white text-xs">DRAFT</Badge>
            )}
            {urgency === 'urgent' && !isDraft && (
              <Badge className="bg-amber-500 text-white animate-pulse text-xs">URGENT</Badge>
            )}
            {urgency === 'overdue' && !isDraft && (
              <Badge className="bg-red-500 text-white animate-pulse text-xs">OVERDUE</Badge>
            )}
            <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
              DUE: {formatDueTime(order.dueDate)}
            </span>
          </div>
        </div>
      </CardHeader>

      <Separator />

      {/* Summary + Action - mobile responsive */}
      <div className="px-3 sm:px-4 py-3 bg-muted/30">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          {/* Totals */}
          <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm">
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

          {/* Status text based on order status */}
          <span className="text-xs sm:text-sm text-muted-foreground">
            {order.status === 'Packaging' ? 'Packaging' :
             order.status === 'InProduction' ? 'In Production' :
             order.status === 'Confirmed' ? 'Confirmed' :
             order.status === 'Draft' ? 'Draft' :
             allBallsFilled ? 'Ready to Pack' : 'Awaiting balls...'}
          </span>
        </div>
      </div>

      <Separator />

      {/* Package Grid - grouped by product with row headers */}
      <CardContent className="py-3 sm:py-4 px-3 sm:px-6 space-y-4">
        {groupPackagesByProduct(packages).map(([productName, productPackages]) => (
          <div key={productName}>
            {/* Product row header */}
            <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <span>{productName}</span>
              <span className="text-xs">({productPackages.length})</span>
            </div>
            {/* Packages grid for this product */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {productPackages.map((pkg) => (
                <ProductPackage
                  key={`${pkg.itemId}-${pkg.packageIndex}`}
                  productName=""
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
          </div>
        ))}

        {packages.length === 0 && (
          <div className="text-center text-muted-foreground py-4">
            No production items in this order
          </div>
        )}

        {/* Undo Complete Button - shows for completed orders */}
        {isCompleted && onRevert && (
          <div className="pt-4 border-t mt-4">
            <div
              className={cn(
                'relative h-14 w-full rounded-lg overflow-hidden select-none border-2 border-amber-500',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              )}
              {...undoHandlers}
            >
              <div className="absolute inset-0 bg-amber-50 dark:bg-amber-950/20" />
              <div
                className="absolute inset-y-0 left-0 bg-amber-500 transition-all duration-100"
                style={{ width: `${undoProgress}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-base font-bold">
                {isHoldingUndo ? (
                  <span className="text-white mix-blend-difference">
                    Hold... {Math.round(undoProgress)}%
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <Undo2 className="h-5 w-5" />
                    Undo Complete
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Complete Order Button - shows when all packages are packed and not completed */}
        {!isCompleted && allPackagesPacked && (
          <div className="pt-4 border-t mt-4">
            <div
              className={cn(
                'relative h-14 w-full rounded-lg overflow-hidden select-none',
                canComplete ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
              )}
              {...completeHandlers}
            >
              <div className="absolute inset-0 bg-green-100 dark:bg-green-950" />
              <div
                className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-100"
                style={{ width: `${completeProgress}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-base font-bold">
                {isHoldingComplete ? (
                  <span className="text-white mix-blend-difference">
                    Hold... {Math.round(completeProgress)}%
                  </span>
                ) : (
                  <span className="text-green-700 dark:text-green-300">
                    ✓ COMPLETE ORDER (Hold 1s)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OrderBox;
