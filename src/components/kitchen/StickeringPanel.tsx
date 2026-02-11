import { useState } from 'react';
import { Info, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { FlipNumber, FlowChevrons } from './FlipNumber';
import { GoFoodStickerCard } from './GoFoodStickerCard';
import { K3MartStockCard } from './K3MartStockCard';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface GoFoodDepotInfo {
  menuProductId: string;
  depotStock: number;
  soldToday: number;
  shippedToday: number;
  stickerDeficit: number;
  stickersAtGoldfinch: number;
  freshness: 'fresh' | 'day_old' | 'aging';
}

interface K3MartStockItem {
  menuProductId: string;
  productName: string;
  consignmentTarget: number;
  totalOutletStock: number;
  totalSoldToday: number;
  gapToTarget: number;
  outletBreakdown: Array<{ outletName: string; stock: number; soldToday: number }>;
}

interface StickeringPanelProps {
  productionCounts: Array<{
    menuProductId: string;
    menuProductName: string;
    posSlot?: number;
    productType?: string;
    boxed: number;
    stickered: number;
    packed: number;
    availableForStickering: number;
    availableForPacking: number;
  }> | undefined;
  neededFromOrders?: Record<string, number>;
  goFoodDepotData?: GoFoodDepotInfo[];
  lastSyncAt?: number;
  k3MartData?: K3MartStockItem[];
  k3MartLastSyncAt?: number;
  onStickerProducts: (menuProductId: string, quantity: number, event?: React.MouseEvent) => Promise<void>;
  onSyncNow?: () => void;
  onSyncK3Mart?: () => void;
  disabled?: boolean;
}

export function StickeringPanel({ productionCounts, neededFromOrders, goFoodDepotData, lastSyncAt, k3MartData, k3MartLastSyncAt, onStickerProducts, onSyncNow, onSyncK3Mart, disabled = false }: StickeringPanelProps) {
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // Loading state
  if (productionCounts === undefined) {
    return (
      <div className="px-4 py-4 space-y-4 bg-[#F8F6F3]">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  // Only food POS products, sorted by POS slot order
  const visibleProducts = productionCounts
    .filter(p => p.posSlot != null)
    .sort((a, b) => (a.posSlot ?? 0) - (b.posSlot ?? 0));

  // Empty state
  if (visibleProducts.length === 0) {
    return (
      <div className="px-4 py-8 bg-[#F8F6F3] min-h-[200px] flex items-center justify-center">
        <p className="text-gray-500 text-center">No products need stickering.</p>
      </div>
    );
  }

  // Build GoFood depot lookup
  const goFoodMap = new Map(
    goFoodDepotData?.map((d) => [d.menuProductId, d]) ?? []
  );

  // Build K3 Mart lookup
  const k3MartMap = new Map(
    k3MartData?.map((d) => [d.menuProductId, d]) ?? []
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="px-3 py-3 space-y-3 bg-[#F8F6F3]">
        {/* GoFood sticker cards (read-only) rendered above manual cards */}
        {visibleProducts.map((product) => {
          const gf = goFoodMap.get(product.menuProductId);
          if (!gf) return null;
          return (
            <GoFoodStickerCard
              key={`gf-${product.menuProductId}`}
              productName={product.menuProductName}
              depotStock={gf.depotStock}
              soldToday={gf.soldToday}
              shippedToday={gf.shippedToday}
              stickerDeficit={gf.stickerDeficit}
              stickersAtGoldfinch={gf.stickersAtGoldfinch}
              freshness={gf.freshness}
              lastSyncAt={lastSyncAt}
              onSyncNow={onSyncNow}
            />
          );
        })}

        {/* K3 Mart stock cards (read-only) */}
        {visibleProducts.map((product) => {
          const k3 = k3MartMap.get(product.menuProductId);
          if (!k3 || k3.consignmentTarget === 0) return null;
          return (
            <K3MartStockCard
              key={`k3-${product.menuProductId}`}
              productName={product.menuProductName}
              consignmentTarget={k3.consignmentTarget}
              totalOutletStock={k3.totalOutletStock}
              totalSoldToday={k3.totalSoldToday}
              gapToTarget={k3.gapToTarget}
              outletBreakdown={k3.outletBreakdown}
              lastSyncAt={k3MartLastSyncAt}
              onSyncStock={onSyncK3Mart}
            />
          );
        })}

        {/* Manual sticker cards */}
        {visibleProducts.map((product) => (
          <ProductCard
            key={product.menuProductId}
            product={product}
            needed={neededFromOrders?.[product.menuProductId] ?? 0}
            inputValue={inputValues[product.menuProductId] || ''}
            onInputChange={(val) =>
              setInputValues(prev => ({ ...prev, [product.menuProductId]: val }))
            }
            onStickerProducts={onStickerProducts}
            disabled={disabled}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}

interface ProductCardProps {
  product: {
    menuProductId: string;
    menuProductName: string;
    boxed: number;
    stickered: number;
    packed: number;
    availableForStickering: number;
    availableForPacking: number;
  };
  needed: number;
  inputValue: string;
  onInputChange: (val: string) => void;
  onStickerProducts: (menuProductId: string, quantity: number, event?: React.MouseEvent) => Promise<void>;
  disabled?: boolean;
}

function ProductCard({ product, needed, inputValue, onInputChange, onStickerProducts, disabled = false }: ProductCardProps) {
  const handleAction = async (negate: boolean, event?: React.MouseEvent) => {
    const val = parseInt(inputValue, 10);
    if (!isNaN(val) && val !== 0) {
      const qty = negate ? -Math.abs(val) : Math.abs(val);
      await onStickerProducts(product.menuProductId, qty, event);
      onInputChange('');
    }
  };

  const canSticker = product.availableForStickering > 0 && !disabled;
  const canUndo = product.stickered > 0 && !disabled;
  const parsedVal = parseInt(inputValue, 10);
  const hasValidInput = !isNaN(parsedVal) && parsedVal !== 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E8E2DB] border-l-4 border-l-[#6B4C3B] overflow-hidden">
      {/* Header */}
      <div className="bg-[#F7F0EB] px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">{product.menuProductName}</h3>
            <div className="flex items-center gap-3 mt-0.5 text-xs">
              <span className={product.availableForStickering > 0 ? 'text-[#4A3428] font-medium' : 'text-gray-500'}>
                Ready: {product.availableForStickering}
              </span>
              {needed > 0 && (
                <span className="text-gray-500">Need: <span className="font-bold text-amber-700">{needed}</span></span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0 ml-2">
            <div className="text-2xl font-bold text-[#1A202C] flex items-center justify-end">
              <FlipNumber value={product.stickered} size="md" />
            </div>
            <div className="text-[10px] text-gray-500">Stickered</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Row 1: Input + Undo + Sticker buttons */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative flex-1">
                <input
                  type="number"
                  value={inputValue}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canSticker) handleAction(false); }}
                  placeholder="Qty"
                  disabled={disabled}
                  className={cn(
                    'w-full h-11 rounded-lg border-2 border-gray-200 px-3 text-center text-base font-bold',
                    'focus:border-[#6B4C3B] focus:outline-none focus:ring-1 focus:ring-[#6B4C3B]',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
                  )}
                />
                <Info className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[200px] text-center">
              <p>Enter quantity, then tap Sticker or Undo</p>
            </TooltipContent>
          </Tooltip>
          <button
            onClick={(e) => handleAction(true, e)}
            disabled={!canUndo || !hasValidInput}
            className={cn(
              'h-11 px-3 rounded-lg font-bold text-sm shrink-0',
              'bg-amber-500 hover:bg-amber-600 text-white',
              'touch-manipulation active:scale-95 transition-transform duration-100',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              'flex items-center gap-1'
            )}
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => handleAction(false, e)}
            disabled={!canSticker || !hasValidInput}
            className={cn(
              'h-11 px-4 rounded-lg font-bold text-sm shrink-0',
              'bg-[#6B4C3B] hover:bg-[#5B3C2B] text-white',
              'touch-manipulation active:scale-95 transition-transform duration-100',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center'
            )}
          >
            Sticker
            {canSticker && hasValidInput && (
              <FlowChevrons color="rgba(255,255,255,0.8)" />
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
