import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getDisplayStatus, getStatusColor } from '@/lib/orderConstants';
import type { OrderDetail, OrderStatus, PaymentStatus } from '@/lib/types';

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  Unpaid: 'bg-orange-500',
  Partial: 'bg-yellow-500',
  Paid: 'bg-green-500',
};

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getWaitingTimeInfo(awaitingPaymentSince: string | null): { text: string; colorClass: string } | null {
  if (!awaitingPaymentSince) return null;

  const since = new Date(awaitingPaymentSince);
  const now = new Date();
  const diffMs = now.getTime() - since.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  let text: string;
  let colorClass: string;

  if (diffHours < 24) {
    text = `Waiting ${diffHours}h`;
    colorClass = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  } else if (diffDays <= 2) {
    text = `Waiting ${diffDays}d`;
    colorClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  } else {
    text = `Waiting ${diffDays}d`;
    colorClass = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  }

  return { text, colorClass };
}

interface OrderHeaderProps {
  order: OrderDetail;
}

export function OrderHeader({ order }: OrderHeaderProps) {
  const waitInfo = order.status === 'AwaitingPayment' && order.awaiting_payment_since
    ? getWaitingTimeInfo(order.awaiting_payment_since)
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="font-mono text-2xl">{order.order_number}</CardTitle>
            <p className="text-muted-foreground mt-1">
              Created {formatDateTime(order.created_at)}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Badge className={getStatusColor(order.status)}>{getDisplayStatus(order.status)}</Badge>
            {waitInfo && (
              <Badge variant="outline" className={waitInfo.colorClass}>
                {waitInfo.text}
              </Badge>
            )}
            <Badge className={PAYMENT_COLORS[order.payment_status]}>
              {order.payment_status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Customer</p>
            <p className="font-medium">{order.customer_name}</p>
            {order.customer_phone && (
              <p className="text-sm text-muted-foreground">{order.customer_phone}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Due Date</p>
            <p className="font-medium">{formatDate(order.due_date)}</p>
          </div>
        </div>

        {(order.channel || order.sold_by) && (
          <div className="grid grid-cols-2 gap-4">
            {order.channel && (
              <div>
                <p className="text-sm text-muted-foreground">Channel</p>
                <p className="font-medium">{order.channel}</p>
              </div>
            )}
            {order.sold_by && (
              <div>
                <p className="text-sm text-muted-foreground">Sold By</p>
                <p className="font-medium">{order.sold_by}</p>
              </div>
            )}
          </div>
        )}

        {order.notes && (
          <div>
            <p className="text-sm text-muted-foreground">Notes</p>
            <p className="text-sm">{order.notes}</p>
          </div>
        )}

        <Separator />

        {/* Delivery & Shipping Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Delivery Method</p>
            <div className="font-medium flex items-center gap-2">
              {order.delivery_type}
              {order.delivery_type === 'Delivery' && order.delivery_address && (
                <span className="text-xs text-muted-foreground font-normal">
                  ({order.delivery_address})
                </span>
              )}
            </div>
          </div>
          {order.shipping_agency && (
            <div>
              <p className="text-sm text-muted-foreground">Shipping</p>
              <p className="font-medium">
                {order.shipping_agency}
                {order.shipping_number && (
                  <span className="text-muted-foreground ml-1">
                    #{order.shipping_number}
                  </span>
                )}
              </p>
            </div>
          )}
          {(order.contact_wa || order.contact_ig) && (
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground mb-1">Contact</p>
              <div className="flex gap-4 text-sm">
                {order.contact_wa && (
                  <span className="flex items-center gap-1">
                    WA: {order.contact_wa}
                  </span>
                )}
                {order.contact_ig && (
                  <span className="flex items-center gap-1">
                    IG: @{order.contact_ig.replace('@', '')}
                  </span>
                )}
              </div>
            </div>
          )}
          {order.status === 'Cancelled' && order.cancellation_reason && (
            <div className="col-span-2 bg-red-50 p-2 rounded border border-red-100 dark:bg-red-950/20 dark:border-red-900">
              <p className="text-xs text-red-600 font-semibold">Cancellation Reason</p>
              <p className="text-sm text-red-700 dark:text-red-400">
                {order.cancellation_reason}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
