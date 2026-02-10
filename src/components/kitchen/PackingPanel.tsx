import { useState, useEffect } from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

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

interface PackingPanelProps {
  packingOrders: PackingOrder[] | undefined;
  onTogglePack: (orderId: string, orderItemId: string) => Promise<void>;
  onMarkOrderReady: (orderId: string) => Promise<void>;
  disabled?: boolean;
}

export function PackingPanel({
  packingOrders,
  onTogglePack,
  onMarkOrderReady,
  disabled = false,
}: PackingPanelProps) {
  // Loading state
  if (packingOrders === undefined) {
    return (
      <div className="px-4 py-4 space-y-4 bg-[#F8F6F3]">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg overflow-hidden border-l-4 border-l-[#E07856] bg-white">
            <div className="px-4 py-3 bg-[#FEF2EE]">
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
      <div className="px-4 py-12 text-center bg-[#F8F6F3]">
        <Package className="h-12 w-12 mx-auto text-gray-400 mb-3" />
        <p className="text-gray-600 text-base font-medium">
          All orders packed! Kitchen is clear.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4 bg-[#F8F6F3]">
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
  onTogglePack: (orderId: string, orderItemId: string) => Promise<void>;
  onMarkOrderReady: (orderId: string) => Promise<void>;
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

  const handleTogglePack = async (orderItemId: string) => {
    if (disabled || isProcessing) return;
    setIsProcessing(true);
    try {
      await onTogglePack(order._id, orderItemId);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkReady = async () => {
    if (disabled || isProcessing || !order.canMarkReady) return;

    if (!confirmingReady) {
      setConfirmingReady(true);
      return;
    }

    setIsProcessing(true);
    try {
      await onMarkOrderReady(order._id);
      setConfirmingReady(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="rounded-lg overflow-hidden border-l-4 border-l-[#E07856] bg-white shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 bg-[#FEF2EE] border-b border-[#E8E2DB]">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-mono text-lg font-bold text-[#E07856]">
            #{order.orderNumber}
          </span>
          {order.deliveryType && (
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                order.deliveryType.toLowerCase() === 'pickup'
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'bg-[#FEF2EE] text-[#C55A3A] border border-[#F5D5C8]'
              )}
            >
              {order.deliveryType.toLowerCase() === 'pickup' ? 'Pickup' : 'Delivery'}
            </span>
          )}
        </div>
        <p className="text-base font-medium text-gray-700">{order.customerName}</p>
      </div>

      {/* Products Section */}
      <div className="px-4 py-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Products
        </h3>
        <div className="space-y-1">
          {order.productItems.map((item) => (
            <button
              key={item._id}
              onClick={() => handleTogglePack(item._id)}
              disabled={disabled || isProcessing || !item.canPack}
              className={cn(
                'w-full min-h-[56px] px-3 py-2 rounded-lg flex items-center gap-3 text-left transition-colors touch-manipulation',
                item.isPacked
                  ? 'bg-[#FEF2EE]'
                  : 'hover:bg-gray-50 active:bg-gray-100',
                (disabled || isProcessing || !item.canPack) && 'cursor-not-allowed'
              )}
            >
              {/* Checkbox */}
              <div
                className={cn(
                  'flex-shrink-0 w-6 h-6 rounded-full transition-all flex items-center justify-center',
                  item.isPacked
                    ? 'bg-[#E07856]'
                    : 'border-2 border-gray-300'
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
                    item.isPacked && 'line-through text-gray-400'
                  )}
                >
                  {item.productName}
                  {item.productVariant && (
                    <span className="text-sm text-gray-500 ml-1">
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
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
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
        <div className="px-4 py-2 border-t border-[#E8E2DB]">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Packaging
          </h3>
          <div className="space-y-1">
            {order.packagingMaterials.map((material) => (
              <div
                key={material.componentTypeId}
                className="w-full min-h-[56px] px-3 py-2 rounded-lg flex items-center gap-3"
              >
                {/* Non-interactive checkbox */}
                <div className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-gray-300" />

                {/* Material name and quantity */}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-gray-700">
                    {material.componentName}
                    <span className="ml-1.5">×{material.quantityNeeded}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Deducted on ORDER READY
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer - ORDER READY button */}
      <div className="px-4 py-3 bg-[#FEF2EE] border-t border-[#E8E2DB]">
        <button
          onClick={handleMarkReady}
          disabled={disabled || isProcessing || !order.canMarkReady}
          className={cn(
            'w-full min-h-[56px] rounded-xl font-bold text-lg transition-colors touch-manipulation',
            confirmingReady
              ? 'bg-[#C55A3A] text-white'
              : order.canMarkReady
                ? 'bg-[#E07856] hover:bg-[#D66A4A] text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
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
