import { useState, useEffect } from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { GoFoodPackingCard } from './GoFoodPackingCard';
import { K3MartPackingCard } from './K3MartPackingCard';

interface PackingProductItem {
  _id: string;
  productName: string;
  productVariant?: string;
  quantity: number;
  menuProductId?: string;
  packageStatus: string;
  isPacked: boolean;
  canPack: boolean;
  availableForPacking: number;
}

interface PackingMaterial {
  componentTypeId: string;
  componentName: string;
  quantityNeeded: number;
}

interface PackingOrder {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  status: string;
  deliveryType?: string;
  dueDate?: number;
  productItems: PackingProductItem[];
  packagingMaterials: PackingMaterial[];
  allProductsPacked: boolean;
  canMarkReady: boolean;
}

interface GoFoodPackingData {
  orderNumber: string;
  date: string;
  items: Array<{
    menuProductId: string;
    productName: string;
    targetQty: number;
    existingAtDepot: number;
    toShipToday: number;
    shippedToday: number;
    freshness: 'fresh' | 'day_old' | 'aging';
    boxedCount: number;
  }>;
  stickerTransfers: Array<{
    componentTypeId: string;
    componentName: string;
    quantity: number;
    officeStock: number;
  }>;
  depotCurrentStock: Array<{
    productName: string;
    boxes: number;
    stickers: number;
    freshness: 'fresh' | 'day_old' | 'aging';
  }>;
  shippedAt?: number;
}

interface K3MartPackingData {
  date: string;
  items: Array<{
    menuProductId: string;
    productName: string;
    consignmentTarget: number;
    boxed: number;
    stickered: number;
    isReady: boolean;
  }>;
}

interface PackingPanelProps {
  packingOrders: PackingOrder[] | undefined;
  goFoodPackingData?: GoFoodPackingData | null;
  k3MartPackingData?: K3MartPackingData | null;
  onTogglePack: (orderId: string, orderItemId: string, event?: React.MouseEvent) => Promise<void>;
  onMarkOrderReady: (orderId: string, event?: React.MouseEvent) => Promise<void>;
  onShipToGoldfinch?: (items: Array<{
    menuProductId: string;
    quantity: number;
    stickerTransfers: Array<{ componentTypeId: string; quantity: number }>;
  }>) => Promise<void>;
  disabled?: boolean;
}

export function PackingPanel({
  packingOrders,
  goFoodPackingData,
  k3MartPackingData,
  onTogglePack,
  onMarkOrderReady,
  onShipToGoldfinch,
  disabled = false,
}: PackingPanelProps) {
  // Loading state
  if (packingOrders === undefined) {
    return (
      <div className="px-4 py-4 space-y-4 bg-[var(--color-kitchen-page-bg)]">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg overflow-hidden border-l-4 border-l-[var(--color-station-packing)] bg-card">
            <div className="px-4 py-3 bg-[var(--color-station-packing-light)]">
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="px-4 py-4 space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (packingOrders.length === 0) {
    return (
      <div className="px-4 py-12 text-center bg-[var(--color-kitchen-page-bg)]">
        <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-base font-medium">
          All orders packed! Kitchen is clear.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4 bg-[var(--color-kitchen-page-bg)]">
      {/* GoFood packing card at top */}
      {goFoodPackingData && onShipToGoldfinch && (
        <GoFoodPackingCard
          orderNumber={goFoodPackingData.orderNumber}
          date={goFoodPackingData.date}
          items={goFoodPackingData.items}
          stickerTransfers={goFoodPackingData.stickerTransfers}
          depotCurrentStock={goFoodPackingData.depotCurrentStock}
          shippedAt={goFoodPackingData.shippedAt}
          onShipToGoldfinch={onShipToGoldfinch}
          disabled={disabled}
        />
      )}

      {/* K3 Mart packing summary */}
      {k3MartPackingData && (
        <K3MartPackingCard
          date={k3MartPackingData.date}
          items={k3MartPackingData.items}
        />
      )}

      {/* Regular order packing cards */}
      {packingOrders.map((order) => (
        <PackingOrderCard
          key={order._id}
          order={order}
          onTogglePack={onTogglePack}
          onMarkOrderReady={onMarkOrderReady}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

interface PackingOrderCardProps {
  order: PackingOrder;
  onTogglePack: (orderId: string, orderItemId: string, event?: React.MouseEvent) => Promise<void>;
  onMarkOrderReady: (orderId: string, event?: React.MouseEvent) => Promise<void>;
  disabled?: boolean;
}

function PackingOrderCard({
  order,
  onTogglePack,
  onMarkOrderReady,
  disabled = false,
}: PackingOrderCardProps) {
  const [confirmingReady, setConfirmingReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset confirmation after 3 seconds
  useEffect(() => {
    if (confirmingReady) {
      const timer = setTimeout(() => {
        setConfirmingReady(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmingReady]);

  const handleTogglePack = async (orderItemId: string, event?: React.MouseEvent) => {
    if (disabled || isProcessing) return;
    setIsProcessing(true);
    try {
      await onTogglePack(order._id, orderItemId, event);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkReady = async (event?: React.MouseEvent) => {
    if (disabled || isProcessing || !order.canMarkReady) return;

    if (!confirmingReady) {
      setConfirmingReady(true);
      return;
    }

    setIsProcessing(true);
    try {
      await onMarkOrderReady(order._id, event);
      setConfirmingReady(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="rounded-lg overflow-hidden border-l-4 border-l-[var(--color-station-packing)] bg-card shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 bg-[var(--color-station-packing-light)] border-b border-border">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-mono text-lg font-bold text-[var(--color-station-packing)]">
            #{order.orderNumber}
          </span>
          {order.deliveryType && (
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                order.deliveryType.toLowerCase() === 'pickup'
                  ? 'bg-[var(--color-status-info-bg)] text-[var(--color-status-info)] border border-[var(--color-status-info)]/20'
                  : 'bg-[var(--color-station-packing-light)] text-[var(--color-station-packing-accent)] border border-[var(--color-station-packing-medium)]'
              )}
            >
              {order.deliveryType.toLowerCase() === 'pickup' ? 'Pickup' : 'Delivery'}
            </span>
          )}
        </div>
        <p className="text-base font-medium text-foreground/80">{order.customerName}</p>
      </div>

      {/* Products Section */}
      <div className="px-4 py-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Products
        </h3>
        <div className="space-y-1">
          {order.productItems.map((item) => (
            <button
              key={item._id}
              onClick={(e) => handleTogglePack(item._id, e)}
              disabled={disabled || isProcessing || !item.canPack}
              className={cn(
                'w-full min-h-[56px] px-3 py-2 rounded-lg flex items-center gap-3 text-left transition-colors touch-manipulation',
                item.isPacked
                  ? 'bg-[var(--color-station-packing-light)]'
                  : 'hover:bg-muted/50 active:bg-muted',
                (disabled || isProcessing || !item.canPack) && 'cursor-not-allowed'
              )}
            >
              {/* Checkbox */}
              <div
                className={cn(
                  'flex-shrink-0 w-6 h-6 rounded-full transition-all flex items-center justify-center',
                  item.isPacked
                    ? 'bg-[var(--color-station-packing)]'
                    : 'border-2 border-border'
                )}
              >
                {item.isPacked && (
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              {/* Product name and quantity */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-base font-medium',
                    item.isPacked && 'line-through text-muted-foreground'
                  )}
                >
                  {item.productName}
                  {item.productVariant && (
                    <span className="text-sm text-muted-foreground ml-1">
                      ({item.productVariant})
                    </span>
                  )}
                  <span className="ml-1.5">×{item.quantity}</span>
                </p>
              </div>

              {/* Availability badge */}
              <span
                className={cn(
                  'flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold',
                  item.canPack
                    ? 'bg-[var(--color-kitchen-success-bg)] text-[var(--color-kitchen-success)]'
                    : 'bg-[var(--color-kitchen-critical-bg)] text-[var(--color-kitchen-critical)]'
                )}
              >
                {item.canPack
                  ? `${item.availableForPacking} available`
                  : 'Unavailable'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Packaging Materials Section */}
      {order.packagingMaterials.length > 0 && (
        <div className="px-4 py-2 border-t border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Packaging
          </h3>
          <div className="space-y-1">
            {order.packagingMaterials.map((material) => (
              <div
                key={material.componentTypeId}
                className="w-full min-h-[56px] px-3 py-2 rounded-lg flex items-center gap-3"
              >
                {/* Non-interactive checkbox */}
                <div className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-border" />

                {/* Material name and quantity */}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-foreground/80">
                    {material.componentName}
                    <span className="ml-1.5">×{material.quantityNeeded}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Deducted on ORDER READY
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer - ORDER READY button */}
      <div className="px-4 py-3 bg-[var(--color-station-packing-light)] border-t border-border">
        <button
          onClick={(e) => handleMarkReady(e)}
          disabled={disabled || isProcessing || !order.canMarkReady}
          className={cn(
            'w-full min-h-[56px] rounded-xl font-bold text-lg transition-colors touch-manipulation',
            confirmingReady
              ? 'bg-[var(--color-station-packing-accent)] text-white'
              : order.canMarkReady
                ? 'bg-[var(--color-station-packing)] hover:bg-[var(--color-station-packing-accent)] text-white'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {confirmingReady ? (
            'Confirm?'
          ) : (
            <>
              <Package className="inline h-5 w-5 mr-2 mb-0.5" />
              ORDER READY
            </>
          )}
        </button>
      </div>
    </div>
  );
}
