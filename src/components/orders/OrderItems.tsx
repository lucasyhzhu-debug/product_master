import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Pencil, Check, Trash2, Plus, Minus, Loader2 } from 'lucide-react';
import type { OrderItem } from '@/lib/types';
import type { OrderItemInput } from '@/hooks/convex/useOrders';
import type { Id } from '../../../convex/_generated/dataModel';
import { useConvexMenuProducts } from '@/hooks/convex';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface OrderItemsProps {
  items: OrderItem[];
  totalAmount: number;
  totalDiscount?: number;
  voucherCode?: string | null;
  voucherDiscountValue?: number | null;
  finalTotal?: number | null;
  editable?: boolean;
  orderId?: Id<"orders">;
  onItemQuantityChange?: (itemId: Id<"orderItems">, quantity: number) => Promise<void>;
  onItemRemove?: (itemId: Id<"orderItems">) => Promise<void>;
  onItemAdd?: (item: OrderItemInput) => Promise<void>;
}

export function OrderItems({
  items,
  totalAmount,
  totalDiscount = 0,
  voucherCode,
  voucherDiscountValue,
  finalTotal,
  editable = false,
  onItemQuantityChange,
  onItemRemove,
  onItemAdd,
}: OrderItemsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  // Track loading state per item: itemId -> operation
  const [loadingItems, setLoadingItems] = useState<Record<string, string>>({});

  // Calculate subtotal (sum of line totals, before order-level discount)
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);

  const hasManualDiscount = totalDiscount > 0;
  const hasVoucher = voucherCode && voucherDiscountValue && voucherDiscountValue > 0;
  const hasAnyDiscount = hasManualDiscount || hasVoucher;

  // Use finalTotal from backend if available, otherwise calculate
  const displayTotal = finalTotal ?? (totalAmount - (voucherDiscountValue ?? 0));

  // item.id is typed as number but actually stores a Convex ID string
  const getItemId = (item: OrderItem): Id<"orderItems"> =>
    item.id as unknown as Id<"orderItems">;

  const handleQtyChange = async (item: OrderItem, newQty: number) => {
    if (!onItemQuantityChange || newQty < 1) return;
    const itemId = getItemId(item);
    setLoadingItems(prev => ({ ...prev, [String(item.id)]: 'qty' }));
    try {
      await onItemQuantityChange(itemId, newQty);
    } finally {
      setLoadingItems(prev => {
        const next = { ...prev };
        delete next[String(item.id)];
        return next;
      });
    }
  };

  const handleRemove = async (item: OrderItem) => {
    if (!onItemRemove) return;
    const itemId = getItemId(item);
    setLoadingItems(prev => ({ ...prev, [String(item.id)]: 'remove' }));
    try {
      await onItemRemove(itemId);
    } finally {
      setLoadingItems(prev => {
        const next = { ...prev };
        delete next[String(item.id)];
        return next;
      });
    }
  };

  const isItemLoading = (item: OrderItem) => String(item.id) in loadingItems;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Items</CardTitle>
        {editable && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setIsEditing(!isEditing);
              if (isEditing) setShowAddItem(false);
            }}
          >
            {isEditing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id}>
              {isEditing ? (
                <div className="space-y-2 py-2">
                  {/* Row 1: Name + trash */}
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {item.quantity}x {item.product_name}
                      {item.product_variant && (
                        <span className="text-muted-foreground ml-1">
                          ({item.product_variant})
                        </span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(item)}
                      disabled={items.length <= 1 || isItemLoading(item)}
                    >
                      {loadingItems[String(item.id)] === 'remove' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                  {/* Row 2: Qty controls + price */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => handleQtyChange(item, item.quantity - 1)}
                        disabled={item.quantity <= 1 || isItemLoading(item)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => handleQtyChange(item, item.quantity + 1)}
                        disabled={isItemLoading(item)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="font-medium">{formatCurrency(item.line_total)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-start py-2">
                  <div className="flex-1">
                    <p className="font-medium">
                      {item.quantity}x {item.product_name}
                      {item.product_variant && (
                        <span className="text-muted-foreground ml-1">
                          ({item.product_variant})
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      @ {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(item.line_total)}</p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add Item section */}
          {isEditing && onItemAdd && (
            <div>
              {showAddItem ? (
                <AddItemForm
                  onAdd={async (item) => {
                    await onItemAdd(item);
                    setShowAddItem(false);
                  }}
                  onCancel={() => setShowAddItem(false)}
                />
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowAddItem(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              )}
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            {hasManualDiscount && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {hasManualDiscount && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>Discount</span>
                    <span>- {formatCurrency(totalDiscount)}</span>
                  </div>
                )}
              </>
            )}

            {hasAnyDiscount ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Order Total</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
                {hasVoucher && (
                  <div className="flex justify-between items-center text-sm text-destructive">
                    <span className="flex items-center gap-1.5">
                      Voucher
                      <Badge variant="outline" className="text-xs font-mono px-1.5 py-0">
                        {voucherCode}
                      </Badge>
                    </span>
                    <span>- {formatCurrency(voucherDiscountValue)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-primary">
                  <span>Final Total</span>
                  <span>{formatCurrency(displayTotal)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between font-semibold text-primary">
                <span>Order Total</span>
                <span>{formatCurrency(totalAmount)}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Add Item Form (inline)
// ============================================

interface AddItemFormProps {
  onAdd: (item: OrderItemInput) => Promise<void>;
  onCancel: () => void;
}

function AddItemForm({ onAdd, onCancel }: AddItemFormProps) {
  const { data: menuProducts, isLoading } = useConvexMenuProducts(true);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProducts = menuProducts?.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedProduct = menuProducts?.find(p => String(p.id) === selectedProductId);

  const handleAdd = async () => {
    if (!selectedProduct) return;
    setAdding(true);
    try {
      await onAdd({
        productName: selectedProduct.name,
        quantity,
        unitPrice: selectedProduct.default_price,
        unitCost: 0,
        menuProductId: selectedProduct.id as unknown as Id<"menuProducts">,
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border rounded-md bg-background"
        />
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {filteredProducts?.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setSelectedProductId(String(product.id))}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  String(product.id) === selectedProductId
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <div className="flex justify-between">
                  <span>{product.name}</span>
                  <span className="text-xs opacity-70">{formatCurrency(product.default_price)}</span>
                </div>
              </button>
            ))}
            {filteredProducts?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">No products found</p>
            )}
          </div>
        )}
      </div>

      {selectedProduct && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Qty:</span>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-8 text-center font-medium">{quantity}</span>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => setQuantity(quantity + 1)}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!selectedProduct || adding}
          className="flex-1"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Add
        </Button>
      </div>
    </div>
  );
}
