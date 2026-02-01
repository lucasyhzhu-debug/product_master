import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { OrderItem } from '@/lib/types';

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
}

export function OrderItems({ items, totalAmount, totalDiscount = 0 }: OrderItemsProps) {
  // Calculate subtotal (sum of line totals, before order-level discount)
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Items</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between items-start py-2">
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
          ))}

          <Separator />

          <div className="space-y-2">
            {totalDiscount > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-destructive">
                  <span>Discount</span>
                  <span>- {formatCurrency(totalDiscount)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-semibold text-primary">
              <span>Order Total</span>
              <span>{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
