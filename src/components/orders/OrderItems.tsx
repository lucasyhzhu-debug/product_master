import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  voucherCode?: string | null;
  voucherDiscountValue?: number | null;
  finalTotal?: number | null;
}

export function OrderItems({
  items,
  totalAmount,
  totalDiscount = 0,
  voucherCode,
  voucherDiscountValue,
  finalTotal,
}: OrderItemsProps) {
  // Calculate subtotal (sum of line totals, before order-level discount)
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);

  const hasManualDiscount = totalDiscount > 0;
  const hasVoucher = voucherCode && voucherDiscountValue && voucherDiscountValue > 0;
  const hasAnyDiscount = hasManualDiscount || hasVoucher;

  // Use finalTotal from backend if available, otherwise calculate
  const displayTotal = finalTotal ?? (totalAmount - (voucherDiscountValue ?? 0));

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
