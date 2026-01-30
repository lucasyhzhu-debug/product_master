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
  totalCost: number;
  totalMargin: number;
  marginPct?: number | null;
}

export function OrderItems({ items, totalAmount, totalCost, totalMargin, marginPct }: OrderItemsProps) {
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
                <p className="text-xs text-green-600">
                  +{formatCurrency(item.line_margin)} margin
                </p>
              </div>
            </div>
          ))}

          <Separator />

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Cost</span>
              <span>{formatCurrency(totalCost)}</span>
            </div>
            <div className="flex justify-between text-green-600 font-semibold">
              <span>Total Margin</span>
              <span>
                {formatCurrency(totalMargin)}
                {marginPct && (
                  <span className="text-sm ml-1">({marginPct.toFixed(1)}%)</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
