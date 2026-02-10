import { useState } from 'react';
import { CheckCircle2, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface ProductionCount {
  menuProductId: string;
  menuProductName: string;
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
  onBoxProducts: (menuProductId: string, quantity: number) => Promise<void>;
  disabled?: boolean;
}

export function BoxingPanel({
  productionCounts,
  trayInventory,
  onBoxProducts,
  disabled = false,
}: BoxingPanelProps) {
  const [undoStates, setUndoStates] = useState<Record<string, boolean>>({});

  // Loading state
  if (productionCounts === undefined) {
    return (
      <div className="bg-[#F8F6F3] px-4 py-4 space-y-4 min-h-screen">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  // Sort products alphabetically
  const sortedProducts = [...productionCounts].sort((a, b) =>
    a.menuProductName.localeCompare(b.menuProductName)
  );

  // Empty state
  if (sortedProducts.length === 0) {
    return (
      <div className="bg-[#F8F6F3] px-4 py-4 min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
          <p className="text-lg font-medium text-muted-foreground">
            All products boxed! Great work.
          </p>
        </div>
      </div>
    );
  }

  const handleBoxClick = async (menuProductId: string, quantity: number) => {
    // Handle undo confirmation flow
    if (quantity === -1) {
      const isInUndoMode = undoStates[menuProductId];

      if (!isInUndoMode) {
        // First click: enter undo mode
        setUndoStates(prev => ({ ...prev, [menuProductId]: true }));

        // Auto-exit undo mode after 3 seconds
        setTimeout(() => {
          setUndoStates(prev => {
            const newStates = { ...prev };
            delete newStates[menuProductId];
            return newStates;
          });
        }, 3000);
        return;
      }

      // Second click within 3s: actually perform undo
      setUndoStates(prev => {
        const newStates = { ...prev };
        delete newStates[menuProductId];
        return newStates;
      });
    }

    await onBoxProducts(menuProductId, quantity);
  };

  const getAvailableBalls = (productName: string): number => {
    if (!trayInventory) return 0;

    // Determine which ball type based on product name
    // This is a simple heuristic - adjust based on actual business logic
    const isBiteSized = productName.toLowerCase().includes('bite');

    return isBiteSized
      ? trayInventory.biteSizedBallCount
      : trayInventory.originalBallCount;
  };

  return (
    <div className="bg-[#F8F6F3] px-4 py-4 space-y-4 min-h-screen">
      {sortedProducts.map((product) => {
        const isUndoMode = undoStates[product.menuProductId];
        const canUndo = product.boxed > 0;
        const availableBalls = getAvailableBalls(product.menuProductName);

        return (
          <div
            key={product.menuProductId}
            className="bg-white rounded-xl shadow-sm border border-[#E8E2DB] border-l-4 overflow-hidden"
            style={{ borderLeftColor: '#C4845C' }}
          >
            {/* Header */}
            <div className="bg-[#FDF5EF] px-4 py-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {product.menuProductName}
              </h3>
              <div className="text-3xl font-bold tabular-nums text-[#1A202C]">
                {product.boxed}
              </div>
            </div>

            {/* Content */}
            <div className="bg-white px-4 py-3 space-y-3">
              {/* Increment buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Plus buttons */}
                <button
                  onClick={() => handleBoxClick(product.menuProductId, 1)}
                  disabled={disabled}
                  className={cn(
                    'min-h-[56px] min-w-[56px] rounded-xl font-bold text-lg',
                    'bg-[#C4845C] hover:bg-[#B4744C] text-white',
                    'touch-manipulation active:scale-95 transition-transform duration-100',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  +1
                </button>
                <button
                  onClick={() => handleBoxClick(product.menuProductId, 3)}
                  disabled={disabled}
                  className={cn(
                    'min-h-[56px] min-w-[56px] rounded-xl font-bold text-lg',
                    'bg-[#C4845C] hover:bg-[#B4744C] text-white',
                    'touch-manipulation active:scale-95 transition-transform duration-100',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  +3
                </button>
                <button
                  onClick={() => handleBoxClick(product.menuProductId, 5)}
                  disabled={disabled}
                  className={cn(
                    'min-h-[56px] min-w-[56px] rounded-xl font-bold text-lg',
                    'bg-[#C4845C] hover:bg-[#B4744C] text-white',
                    'touch-manipulation active:scale-95 transition-transform duration-100',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  +5
                </button>
                <button
                  onClick={() => handleBoxClick(product.menuProductId, 10)}
                  disabled={disabled}
                  className={cn(
                    'min-h-[56px] min-w-[56px] rounded-xl font-bold text-lg',
                    'bg-[#C4845C] hover:bg-[#B4744C] text-white',
                    'touch-manipulation active:scale-95 transition-transform duration-100',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  +10
                </button>

                {/* Minus/Undo button */}
                <button
                  onClick={() => handleBoxClick(product.menuProductId, -1)}
                  disabled={disabled || !canUndo}
                  className={cn(
                    'min-h-[56px] min-w-[56px] rounded-xl font-bold text-lg',
                    'border-2 border-gray-300 bg-white text-gray-700',
                    'hover:bg-gray-50',
                    'touch-manipulation active:scale-95 transition-transform duration-100',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                    'flex items-center justify-center'
                  )}
                >
                  {isUndoMode ? (
                    <span className="text-sm">Undo?</span>
                  ) : (
                    <Minus className="h-5 w-5" />
                  )}
                </button>
              </div>

              {/* Available balls info */}
              <div className="text-sm text-gray-600 font-medium">
                Available balls: <span className="font-bold">{availableBalls}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
