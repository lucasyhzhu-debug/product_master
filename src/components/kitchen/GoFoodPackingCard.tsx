/**
 * GoFoodPackingCard - Ship-to-depot card for the Pack panel.
 *
 * Shows GoFood targets, depot stock, products to ship, stickers to transfer,
 * and a "SHIP TO GOLDFINCH" button with double-tap confirm.
 */

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GoFoodPackingItem {
  menuProductId: string;
  productName: string;
  targetQty: number;
  existingAtDepot: number;
  toShipToday: number;
  shippedToday: number;
  freshness: 'fresh' | 'day_old' | 'aging';
  boxedCount: number; // From productionCounts
}

interface StickerTransferItem {
  componentTypeId: string;
  componentName: string;
  quantity: number;
  officeStock: number;
}

interface DepotStockItem {
  productName: string;
  boxes: number;
  stickers: number;
  freshness: 'fresh' | 'day_old' | 'aging';
}

interface GoFoodPackingCardProps {
  orderNumber: string;
  date: string;
  items: GoFoodPackingItem[];
  stickerTransfers: StickerTransferItem[];
  depotCurrentStock: DepotStockItem[];
  shippedAt?: number; // If already shipped today
  onShipToGoldfinch: (
    selectedItems: Array<{
      menuProductId: string;
      quantity: number;
      stickerTransfers: Array<{ componentTypeId: string; quantity: number }>;
    }>
  ) => Promise<void>;
  disabled?: boolean;
}

export function GoFoodPackingCard({
  orderNumber,
  items,
  stickerTransfers,
  depotCurrentStock,
  shippedAt,
  onShipToGoldfinch,
  disabled = false,
}: GoFoodPackingCardProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [showCurrentStock, setShowCurrentStock] = useState(false);
  const [confirmingShip, setConfirmingShip] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset confirmation after 3 seconds
  useEffect(() => {
    if (confirmingShip) {
      const timer = setTimeout(() => setConfirmingShip(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmingShip]);

  const toggleItem = (menuProductId: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(menuProductId)) next.delete(menuProductId);
      else next.add(menuProductId);
      return next;
    });
  };

  const handleShip = async () => {
    if (disabled || isProcessing || checkedItems.size === 0) return;

    if (!confirmingShip) {
      setConfirmingShip(true);
      return;
    }

    setIsProcessing(true);
    try {
      const selectedItems = items
        .filter((item) => checkedItems.has(item.menuProductId))
        .map((item) => {
          // Find matching sticker transfers for this product
          const productStickers = stickerTransfers
            .filter((s) => s.quantity > 0)
            .map((s) => ({
              componentTypeId: s.componentTypeId,
              quantity: Math.ceil(
                (s.quantity * item.toShipToday) /
                  items.reduce((sum, i) => sum + i.toShipToday, 1)
              ),
            }));

          return {
            menuProductId: item.menuProductId,
            quantity: item.toShipToday,
            stickerTransfers: productStickers,
          };
        });

      await onShipToGoldfinch(selectedItems);
      setConfirmingShip(false);
      setCheckedItems(new Set());
    } finally {
      setIsProcessing(false);
    }
  };

  const freshnessLabel = (f: 'fresh' | 'day_old' | 'aging') =>
    f === 'fresh' ? '' : f === 'day_old' ? '(1d old)' : '(2d+ old)';

  const freshnessColor = (f: 'fresh' | 'day_old' | 'aging') =>
    f === 'fresh' ? 'text-green-600' : f === 'day_old' ? 'text-yellow-600' : 'text-red-600';

  const alreadyShipped = !!shippedAt;

  return (
    <div className="rounded-lg overflow-hidden border-l-4 bg-card shadow-sm"
      style={{ borderLeftColor: 'var(--color-gofood)' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#E8E2DB]"
        style={{ backgroundColor: 'var(--color-gofood-light)' }}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-mono text-lg font-bold" style={{ color: 'var(--color-gofood)' }}>
            #{orderNumber}
          </span>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: 'var(--color-gofood-badge)' }}
          >
            GoFood
          </span>
        </div>
        <p className="text-base font-medium text-gray-700">GoFood Depot</p>
        <p className="text-xs text-gray-500">Ship to Goldfinch</p>
      </div>

      {/* Products to Ship */}
      <div className="px-4 py-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Products to Ship
        </h3>
        <div className="space-y-1">
          {items.map((item) => {
            const isChecked = checkedItems.has(item.menuProductId);
            const canCheck = item.toShipToday > 0 && item.boxedCount >= item.toShipToday;

            return (
              <button
                key={item.menuProductId}
                onClick={() => canCheck && !disabled && !alreadyShipped && toggleItem(item.menuProductId)}
                disabled={disabled || !canCheck || alreadyShipped}
                className={cn(
                  'w-full min-h-[56px] px-3 py-2 rounded-lg flex items-center gap-3 text-left transition-colors touch-manipulation',
                  isChecked ? 'bg-[var(--color-gofood-light)]' : 'hover:bg-gray-50 active:bg-gray-100',
                  (disabled || !canCheck || alreadyShipped) && 'cursor-not-allowed opacity-60'
                )}
              >
                {/* Checkbox */}
                <div
                  className={cn(
                    'flex-shrink-0 w-6 h-6 rounded-full transition-all flex items-center justify-center',
                    isChecked ? '' : 'border-2 border-gray-300'
                  )}
                  style={isChecked ? { backgroundColor: 'var(--color-gofood)' } : undefined}
                >
                  {isChecked && (
                    <svg className="w-4 h-4 text-white" fill="none" strokeLinecap="round"
                      strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Product info */}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-gray-900">
                    {item.productName}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Target: {item.targetQty}
                    <span className="mx-1">|</span>
                    At depot: {item.existingAtDepot}
                    {item.existingAtDepot > 0 && (
                      <span className={cn('ml-1', freshnessColor(item.freshness))}>
                        {freshnessLabel(item.freshness)}
                      </span>
                    )}
                    <span className="mx-1">|</span>
                    To ship: <span className="font-bold">{item.toShipToday}</span>
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stickers to Transfer */}
      {stickerTransfers.length > 0 && checkedItems.size > 0 && (
        <div className="px-4 py-2 border-t border-[#E8E2DB]">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Stickers to Transfer
          </h3>
          <div className="space-y-1">
            {stickerTransfers.map((s) => (
              <div key={s.componentTypeId} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span className="text-gray-700">{s.componentName}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold tabular-nums">x{s.quantity}</span>
                  <span className="text-[10px] text-gray-400">[Office: {s.officeStock}]</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible: Goldfinch Current Stock */}
      {depotCurrentStock.length > 0 && (
        <div className="border-t border-[#E8E2DB]">
          <button
            onClick={() => setShowCurrentStock(!showCurrentStock)}
            className="w-full px-4 py-2 flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider hover:bg-gray-50"
          >
            Goldfinch Current Stock
            {showCurrentStock ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {showCurrentStock && (
            <div className="px-4 pb-2 space-y-1">
              {depotCurrentStock.map((item) => (
                <div key={item.productName} className="flex items-center justify-between text-sm px-3 py-1">
                  <span className="text-gray-700">{item.productName}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span>{item.boxes} boxes</span>
                    <span>{item.stickers} stickers</span>
                    {item.freshness !== 'fresh' && (
                      <span className={freshnessColor(item.freshness)}>
                        {freshnessLabel(item.freshness)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer - SHIP TO GOLDFINCH button */}
      <div className="px-4 py-3 border-t border-[#E8E2DB]"
        style={{ backgroundColor: 'var(--color-gofood-light)' }}>
        {alreadyShipped ? (
          <div className="w-full min-h-[56px] rounded-xl font-bold text-lg flex items-center justify-center gap-2 bg-gray-200 text-gray-500">
            <Truck className="h-5 w-5" />
            Shipped at{' '}
            {new Date(shippedAt!).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </div>
        ) : (
          <button
            onClick={handleShip}
            disabled={disabled || isProcessing || checkedItems.size === 0}
            className={cn(
              'w-full min-h-[56px] rounded-xl font-bold text-lg transition-colors touch-manipulation flex items-center justify-center gap-2',
              confirmingShip
                ? 'text-white'
                : checkedItems.size > 0
                  ? 'text-white hover:opacity-90'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
            style={
              checkedItems.size > 0
                ? {
                    backgroundColor: confirmingShip
                      ? 'var(--color-gofood-accent)'
                      : 'var(--color-gofood)',
                  }
                : undefined
            }
          >
            {confirmingShip ? (
              'Confirm?'
            ) : (
              <>
                <Truck className="h-5 w-5" />
                SHIP TO GOLDFINCH
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
