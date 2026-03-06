import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/utils";
import { useOrderDetailsByOrderNumber } from "@/hooks/convex";

export function InternalOrderDetails({ orderNumber }: { orderNumber: string }) {
  const { data: order, isLoading } = useOrderDetailsByOrderNumber(orderNumber);

  if (isLoading) {
    return (
      <tr>
        <td colSpan={10} className="py-3 px-2">
          <Skeleton className="h-16 w-full" />
        </td>
      </tr>
    );
  }

  if (!order) {
    return (
      <tr>
        <td colSpan={10} className="py-3 px-6 text-sm text-muted-foreground">
          Order not found.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={10} className="p-0">
        <div className="bg-muted/30 px-6 py-3 space-y-3">
          {/* Order header */}
          <div className="flex items-center gap-4 text-xs">
            <span className="font-medium">{order.customerName}</span>
            {order.channel && (
              <Badge variant="outline" className="text-xs">{order.channel}</Badge>
            )}
            <Badge variant="secondary" className="text-xs">{order.status}</Badge>
            <span className="text-muted-foreground">{order.deliveryType}</span>
          </div>

          {/* Items table */}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-medium">Product</th>
                <th className="text-right py-2 px-2 font-medium">Qty</th>
                <th className="text-right py-2 px-2 font-medium">Unit Price</th>
                <th className="text-right py-2 px-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, i) => (
                <tr key={i} className="border-b border-muted">
                  <td className="py-2 px-2">
                    {item.productName}
                    {item.productVariant && (
                      <span className="text-muted-foreground ml-1">({item.productVariant})</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">{item.quantity}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 px-2 text-right font-medium">{formatCurrency(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Discount/voucher info + link */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3 text-muted-foreground">
              {(order.orderLevelDiscount ?? 0) > 0 && (
                <span>
                  Discount: {order.orderLevelDiscountType === "percentage"
                    ? `${order.orderLevelDiscount}%`
                    : formatCurrency(order.orderLevelDiscount ?? 0)}
                </span>
              )}
              {order.voucherCode && (
                <span>
                  Voucher: {order.voucherCode}
                  {order.voucherDiscountValue ? ` (-${formatCurrency(order.voucherDiscountValue)})` : ""}
                </span>
              )}
            </div>
            <Link
              to={`/orders/${order.orderId}`}
              className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              View Full Order
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </td>
    </tr>
  );
}
