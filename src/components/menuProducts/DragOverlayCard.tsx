import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { PosProduct, AvailableProduct, PackagingPosProduct } from '@/hooks/convex/useMenuProducts';

interface DragOverlayCardProps {
  product: PosProduct | AvailableProduct | PackagingPosProduct;
}

export function DragOverlayCard({ product }: DragOverlayCardProps) {
  const isFood = !product.productType || product.productType === 'food';
  const grams = 'grams' in product ? product.grams : 0;

  return (
    <Card className="w-64 shadow-lg rotate-[2deg] opacity-90 border-primary/30">
      <CardContent className="pt-4 pb-3 px-4">
        <p className="font-semibold text-sm truncate">{product.name}</p>
        <div className="flex items-center gap-2 mt-1">
          {isFood && grams > 0 && (
            <span className="text-xs text-muted-foreground">{grams}g</span>
          )}
          <span className="text-xs font-medium">
            {formatCurrency(product.defaultPrice)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
