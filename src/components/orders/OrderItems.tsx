import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';
import type { OrderItem } from '@/lib/types';

// gap#2: money may be stripped (undefined) for non-managers on subscription
// orders — render an em-dash placeholder instead of crashing on undefined/NaN.
function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface OrderItemsProps {
  items: OrderItem[];
  // gap#2: totalAmount may be undefined when stripped server-side.
  totalAmount: number | undefined;
  totalDiscount?: number;
  voucherCode?: string | null;
  voucherDiscountValue?: number | null;
  finalTotal?: number | null;
  // Delivery fee props
  deliveryFee?: number | null;
  orderId?: Id<"orders">;
  canEditDeliveryFee?: boolean;
}

export function OrderItems({
  items,
  totalAmount,
  totalDiscount = 0,
  voucherCode,
  voucherDiscountValue,
  finalTotal,
  deliveryFee,
  orderId,
  canEditDeliveryFee,
}: OrderItemsProps) {
  const [editingFee, setEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const updateDeliveryFee = useMutation(api.orders.mutations.index.updateDeliveryFee);

  // gap#2: when money is stripped (subscription order, non-manager) line_total /
  // totalAmount arrive undefined — surface "—" instead of NaN totals.
  const moneyHidden = totalAmount == null;

  // Calculate subtotal (sum of line totals, before order-level discount)
  const subtotal = moneyHidden
    ? undefined
    : items.reduce((sum, item) => sum + (item.line_total ?? 0), 0);

  const hasManualDiscount = totalDiscount > 0;
  const hasVoucher = voucherCode && voucherDiscountValue && voucherDiscountValue > 0;
  const hasAnyDiscount = hasManualDiscount || hasVoucher;
  const hasDeliveryFee = deliveryFee && deliveryFee > 0;
  const showDeliveryFeeRow = canEditDeliveryFee || hasDeliveryFee;

  // Use finalTotal from backend if available, otherwise calculate
  const deliveryFeeAmount = deliveryFee ?? 0;
  const displayTotal = moneyHidden
    ? undefined
    : (finalTotal ?? ((totalAmount ?? 0) - (voucherDiscountValue ?? 0) + deliveryFeeAmount));

  const handleSaveFee = async () => {
    if (!orderId) return;
    try {
      const fee = parseFloat(feeInput) || 0;
      await updateDeliveryFee({ orderId, deliveryFee: fee });
      setEditingFee(false);
    } catch {
      toast.error("Failed to save delivery fee");
    }
  };

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

                {/* Delivery Fee row */}
                {showDeliveryFeeRow && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">🚚 Delivery Fee</span>
                    <div className="flex items-center gap-1">
                      {editingFee ? (
                        <>
                          <Input
                            type="number"
                            className="h-6 w-28 text-xs text-right"
                            value={feeInput}
                            onChange={(e) => setFeeInput(e.target.value)}
                            placeholder="0"
                            min={0}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleSaveFee();
                              if (e.key === 'Escape') setEditingFee(false);
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => void handleSaveFee()}
                          >Save</Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => setEditingFee(false)}
                          >Cancel</Button>
                        </>
                      ) : (
                        <>
                          <span>
                            {hasDeliveryFee ? formatCurrency(deliveryFee) : "—"}
                          </span>
                          {canEditDeliveryFee && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setFeeInput(deliveryFee ? String(deliveryFee) : "");
                                setEditingFee(true);
                              }}
                            >Edit</Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                <Separator />
                <div className="flex justify-between font-semibold text-primary">
                  <span>Final Total</span>
                  <span>{formatCurrency(displayTotal)}</span>
                </div>
              </>
            ) : (
              <>
                {/* Delivery Fee row (no-discount path) */}
                {showDeliveryFeeRow && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">🚚 Delivery Fee</span>
                    <div className="flex items-center gap-1">
                      {editingFee ? (
                        <>
                          <Input
                            type="number"
                            className="h-6 w-28 text-xs text-right"
                            value={feeInput}
                            onChange={(e) => setFeeInput(e.target.value)}
                            placeholder="0"
                            min={0}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleSaveFee();
                              if (e.key === 'Escape') setEditingFee(false);
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => void handleSaveFee()}
                          >Save</Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => setEditingFee(false)}
                          >Cancel</Button>
                        </>
                      ) : (
                        <>
                          <span>
                            {hasDeliveryFee ? formatCurrency(deliveryFee) : "—"}
                          </span>
                          {canEditDeliveryFee && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setFeeInput(deliveryFee ? String(deliveryFee) : "");
                                setEditingFee(true);
                              }}
                            >Edit</Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {(hasDeliveryFee || showDeliveryFeeRow) ? (
                  <>
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
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
