import { useState } from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { FlipNumber, FlowChevrons } from './FlipNumber';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ProductionCount {
  menuProductId: string;
  menuProductName: string;
  menuProductCode?: string;
  posSlot?: number;
  productType?: string;
  boxed: number;
  stickered: number;
  packed: number;
  availableForStickering: number;
  availableForPacking: number;
}

interface BoxingPanelProps {
  productionCounts: Array<ProductionCount> | undefined;
  trayInventory: {
    originalBallCount: number;
    biteSizedBallCount: number;
  } | undefined;
  neededFromOrders?: Record<string, number>;
  productTargetTotals?: Record<string, number>;
  k3MartStockMap?: Map<string, number>;
  onBoxProducts: (menuProductId: string, quantity: number, event?: React.MouseEvent) => Promise<void>;
  disabled?: boolean;
}

export function BoxingPanel({
  productionCounts,
  trayInventory,
  neededFromOrders,
  productTargetTotals,
  k3MartStockMap,
  onBoxProducts,
  disabled = false,
}: BoxingPanelProps) {
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // Loading state
  if (productionCounts === undefined) {
    return (
      <div className="bg-[var(--color-kitchen-page-bg)] px-4 py-4 space-y-4 min-h-screen">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  // Filter to food POS products only (posSlot set), sort by posSlot
  const sortedProducts = [...productionCounts]
    .filter((p) => p.posSlot != null)
    .sort((a, b) => (a.posSlot ?? 0) - (b.posSlot ?? 0));

  // Empty state
  if (sortedProducts.length === 0) {
    return (
      <div className="bg-[var(--color-kitchen-page-bg)] px-4 py-4 min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-[var(--color-kitchen-success)] mx-auto" />
          <p className="text-lg font-medium text-muted-foreground">
            All products boxed! Great work.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (menuProductId: string, event?: React.MouseEvent) => {
    const val = parseInt(inputValues[menuProductId] || '', 10);
    if (!isNaN(val) && val !== 0) {
      await onBoxProducts(menuProductId, val, event);
      setInputValues(prev => ({ ...prev, [menuProductId]: '' }));
    }
  };

  const getAvailableBalls = (productName: string): number => {
    if (!trayInventory) return 0;
    const isBiteSized = productName.toLowerCase().includes('bite');
    return isBiteSized
      ? trayInventory.biteSizedBallCount
      : trayInventory.originalBallCount;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="bg-[var(--color-kitchen-page-bg)] px-3 py-3 space-y-3 min-h-screen">
        {sortedProducts.map((product) => {
          const availableBalls = getAvailableBalls(product.menuProductName);
          const awaitingSticker = product.availableForStickering;
          const needed = neededFromOrders?.[product.menuProductId] ?? 0;
          const targetTotal = productTargetTotals?.[product.menuProductId] ?? 0;
          const outletStock = k3MartStockMap?.get(product.menuProductId);
          const inputVal = inputValues[product.menuProductId] || '';

          return (
            <div
              key={product.menuProductId}
              className="bg-card rounded-xl shadow-sm border border-border border-l-4 overflow-hidden"
              style={{ borderLeftColor: 'var(--color-station-boxing)' }}
            >
              {/* Header */}
              <div className="bg-[var(--color-station-boxing-light)] px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground truncate">
                      {product.menuProductName}
                    </h3>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>Balls: <span className="font-bold text-foreground/80">{availableBalls}</span></span>
                      {needed > 0 && (
                        <span>Need: <span className="font-bold text-[var(--color-kitchen-warning)]">{needed}</span></span>
                      )}
                      {targetTotal > 0 && (
                        <span>Target: <span className="font-bold text-[var(--color-status-info)]">{targetTotal}</span></span>
                      )}
                      {outletStock != null && outletStock > 0 && (
                        <span>K3 Stock: <span className="font-bold" style={{ color: 'var(--color-k3mart)' }}>{outletStock}</span></span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="text-2xl font-bold text-foreground flex items-center justify-end">
                      <FlipNumber value={awaitingSticker} size="md" />
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-tight">Awaiting<br />Sticker</div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="px-3 py-2.5 space-y-2">
                {/* Row 1: Input + Box button */}
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={inputVal}
                          onChange={(e) =>
                            setInputValues(prev => ({ ...prev, [product.menuProductId]: e.target.value }))
                          }
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(product.menuProductId); }}
                          placeholder="Qty to add"
                          disabled={disabled}
                          className={cn(
                            'w-full h-11 rounded-lg border-2 border-border px-3 text-center text-base font-bold',
                            'focus:border-[var(--color-station-boxing)] focus:outline-none focus:ring-1 focus:ring-[var(--color-station-boxing)]',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
                          )}
                        />
                        <Info className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px] text-center">
                      <p>Use negative numbers to revert (e.g. -5)</p>
                    </TooltipContent>
                  </Tooltip>
                  <button
                    onClick={(e) => handleSubmit(product.menuProductId, e)}
                    disabled={disabled || !inputVal || parseInt(inputVal, 10) === 0 || isNaN(parseInt(inputVal, 10))}
                    className={cn(
                      'h-11 px-5 rounded-lg font-bold text-base shrink-0',
                      'bg-[var(--color-station-boxing)] hover:bg-[var(--color-station-boxing-accent)] text-white',
                      'touch-manipulation active:scale-95 transition-transform duration-100',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'flex items-center'
                    )}
                  >
                    Box
                    {inputVal && !isNaN(parseInt(inputVal, 10)) && parseInt(inputVal, 10) !== 0 && (
                      <FlowChevrons color="rgba(255,255,255,0.8)" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
