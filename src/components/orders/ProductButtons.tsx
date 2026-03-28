import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';

export interface ProductButtonProduct {
  _id: string;
  code: string;
  name: string;
  grams?: number;
  defaultPrice: number;
  unitCost?: number;
  posSlot?: number;
}

interface ProductButtonsProps {
  products: ProductButtonProduct[];
  onAddProduct: (
    product: ProductButtonProduct,
    quantity: number
  ) => void;
  /** Optional label shown above the grid */
  label?: string;
  /** Number of grid columns (default 2) */
  columns?: 2 | 3;
}

export function ProductButtons({ products, onAddProduct, label, columns = 2 }: ProductButtonsProps) {
  const [quantityDialogOpen, setQuantityDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<
    ProductButtonProduct | null
  >(null);
  const [quantity, setQuantity] = useState('1');

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const touchStartY = useRef<number>(0);
  const touchStartX = useRef<number>(0);
  const isScrolling = useRef(false);
  const SCROLL_THRESHOLD = 10;

  const handlePressStart = (product: ProductButtonProduct) => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setSelectedProduct(product);
      setQuantity('1');
      setQuantityDialogOpen(true);
    }, 500);
  };

  const handlePressEnd = (product: ProductButtonProduct) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // Only trigger tap action if it wasn't a long press
    if (!isLongPress.current) {
      onAddProduct(product, 1);
    }
  };

  const handlePressCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    isLongPress.current = false;
  };

  const handleTouchStart = (product: ProductButtonProduct, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isScrolling.current = false;
    handlePressStart(product);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isScrolling.current) return;
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartX.current);
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
      isScrolling.current = true;
      handlePressCancel();
    }
  };

  const handleTouchEnd = (product: ProductButtonProduct) => {
    if (isScrolling.current) {
      isScrolling.current = false;
      handlePressCancel();
      return;
    }
    handlePressEnd(product);
  };

  const handleTouchCancel = () => {
    isScrolling.current = false;
    handlePressCancel();
  };

  const handleQuantitySubmit = () => {
    if (!selectedProduct) return;

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) return;

    onAddProduct(selectedProduct, qty);
    setQuantityDialogOpen(false);
    setSelectedProduct(null);
    setQuantity('1');
  };

  return (
    <>
      {label && (
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      )}
      <div className={`grid gap-4 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {products.map((product) => (
          <button
            key={product._id}
            className="flex flex-col items-start p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left active:scale-95 min-h-[56px]"
            onMouseDown={() => handlePressStart(product)}
            onMouseUp={() => handlePressEnd(product)}
            onMouseLeave={handlePressCancel}
            onTouchStart={(e) => handleTouchStart(product, e)}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => handleTouchEnd(product)}
            onTouchCancel={handleTouchCancel}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="font-semibold">{product.name}</span>
            {product.grams != null && product.grams > 0 && (
              <span className="text-sm text-muted-foreground">
                {product.grams}g
              </span>
            )}
            <span className="text-sm font-medium">
              {formatCurrency(product.defaultPrice)}
            </span>
          </button>
        ))}
      </div>

      <Dialog open={quantityDialogOpen} onOpenChange={setQuantityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedProduct ? `Add ${selectedProduct.name}` : 'Add Product'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleQuantitySubmit();
                  }
                }}
                autoFocus
              />
            </div>

            {selectedProduct && (
              <div className="text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>Price per unit:</span>
                  <span className="font-medium">
                    {formatCurrency(selectedProduct.defaultPrice)}
                  </span>
                </div>
                {parseInt(quantity, 10) > 1 && !isNaN(parseInt(quantity, 10)) && (
                  <div className="flex justify-between mt-1">
                    <span>Total:</span>
                    <span className="font-medium">
                      {formatCurrency(
                        selectedProduct.defaultPrice * parseInt(quantity, 10)
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setQuantityDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleQuantitySubmit}>Add to Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
