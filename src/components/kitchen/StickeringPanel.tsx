import { Skeleton } from '@/components/ui/skeleton';

interface StickeringPanelProps {
  productionCounts: Array<{
    menuProductId: string;
    menuProductName: string;
    boxed: number;
    stickered: number;
    packed: number;
    availableForStickering: number;
    availableForPacking: number;
  }> | undefined;
  onStickerProducts: (menuProductId: string, quantity: number) => Promise<void>;
  disabled?: boolean;
}

export function StickeringPanel({ productionCounts, onStickerProducts, disabled = false }: StickeringPanelProps) {
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

  // Filter products that need stickering or have stickered items
  const visibleProducts = productionCounts
    .filter(p => p.availableForStickering > 0 || p.stickered > 0)
    .sort((a, b) => a.menuProductName.localeCompare(b.menuProductName));

  // Empty state
  if (visibleProducts.length === 0) {
    return (
      <div className="px-4 py-8 bg-[#F8F6F3] min-h-[200px] flex items-center justify-center">
        <p className="text-gray-500 text-center">No products need stickering.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4 bg-[#F8F6F3]">
      {visibleProducts.map((product) => (
        <ProductCard
          key={product.menuProductId}
          product={product}
          onStickerProducts={onStickerProducts}
          disabled={disabled}
        />
      ))}
    </div>
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
  onStickerProducts: (menuProductId: string, quantity: number) => Promise<void>;
  disabled?: boolean;
}

function ProductCard({ product, onStickerProducts, disabled = false }: ProductCardProps) {
  const handleIncrement = async (amount: number) => {
    await onStickerProducts(product.menuProductId, amount);
  };

  const handleDecrement = async () => {
    await onStickerProducts(product.menuProductId, -1);
  };

  const canIncrement = product.availableForStickering > 0 && !disabled;
  const canDecrement = product.stickered > 0 && !disabled;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E8E2DB] border-l-4 border-l-[#6B4C3B] overflow-hidden">
      {/* Header */}
      <div className="bg-[#F7F0EB] px-4 py-3">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{product.menuProductName}</h3>
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums text-[#1A202C]">
              {product.stickered}
            </div>
            <div className="text-xs text-gray-500">Stickered</div>
          </div>
        </div>
        <div className="mt-1">
          <span
            className={`text-sm font-medium ${
              product.availableForStickering > 0
                ? 'text-[#4A3428]'
                : 'text-gray-500'
            }`}
          >
            Available for stickering: {product.availableForStickering}
          </span>
        </div>
      </div>

      {/* Content - Increment Buttons */}
      <div className="bg-white px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Plus buttons */}
          <button
            onClick={() => handleIncrement(1)}
            disabled={!canIncrement}
            className="min-h-[56px] min-w-[56px] rounded-xl font-bold text-lg bg-[#6B4C3B] hover:bg-[#5B3C2B] active:scale-95 transition-transform duration-100 text-white disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            +1
          </button>
          <button
            onClick={() => handleIncrement(3)}
            disabled={!canIncrement}
            className="min-h-[56px] min-w-[56px] rounded-xl font-bold text-lg bg-[#6B4C3B] hover:bg-[#5B3C2B] active:scale-95 transition-transform duration-100 text-white disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            +3
          </button>
          <button
            onClick={() => handleIncrement(5)}
            disabled={!canIncrement}
            className="min-h-[56px] min-w-[56px] rounded-xl font-bold text-lg bg-[#6B4C3B] hover:bg-[#5B3C2B] active:scale-95 transition-transform duration-100 text-white disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            +5
          </button>
          <button
            onClick={() => handleIncrement(10)}
            disabled={!canIncrement}
            className="min-h-[56px] min-w-[56px] rounded-xl font-bold text-lg bg-[#6B4C3B] hover:bg-[#5B3C2B] active:scale-95 transition-transform duration-100 text-white disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            +10
          </button>

          {/* Minus button */}
          <button
            onClick={handleDecrement}
            disabled={!canDecrement}
            className="min-h-[56px] min-w-[56px] rounded-xl font-bold text-lg border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:scale-95 transition-transform duration-100 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            -1
          </button>
        </div>
      </div>
    </div>
  );
}
