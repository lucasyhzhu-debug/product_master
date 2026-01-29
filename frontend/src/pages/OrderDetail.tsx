import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, MessageSquare } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/layout';
import { LoadingCards, ConfirmDialog } from '@/components/shared';

import { useOrder, useUpdateOrderStatus, useUpdateOrderPayment, useDeleteOrder } from '@/hooks';
import type { OrderStatus, PaymentStatus } from '@/lib/types';

const STATUS_COLORS: Record<OrderStatus, string> = {
  Draft: 'bg-gray-500',
  Confirmed: 'bg-blue-500',
  Completed: 'bg-green-500',
  Cancelled: 'bg-red-500',
};

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  Unpaid: 'bg-orange-500',
  Partial: 'bg-yellow-500',
  Paid: 'bg-green-500',
};

const STATUS_OPTIONS: OrderStatus[] = ['Draft', 'Confirmed', 'Completed', 'Cancelled'];
const PAYMENT_OPTIONS: PaymentStatus[] = ['Unpaid', 'Partial', 'Paid'];
const PAYMENT_METHODS = ['BCA', 'QRIS', 'Cash', 'Other'];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

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

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orderId = parseInt(id || '0', 10);

  const { data: order, isLoading } = useOrder(orderId);
  const updateStatus = useUpdateOrderStatus();
  const updatePayment = useUpdateOrderPayment();
  const deleteOrder = useDeleteOrder();

  const [copied, setCopied] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleCopyWhatsApp = async () => {
    if (!order?.whatsapp_text) return;

    try {
      await navigator.clipboard.writeText(order.whatsapp_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (!order) return;
    updateStatus.mutate({ id: order.id, status: newStatus });
  };

  const handlePaymentChange = (newPaymentStatus: string) => {
    if (!order) return;
    updatePayment.mutate({
      id: order.id,
      payment_status: newPaymentStatus,
      payment_method: order.payment_method || undefined,
    });
  };

  const handlePaymentMethodChange = (method: string) => {
    if (!order) return;
    updatePayment.mutate({
      id: order.id,
      payment_status: order.payment_status,
      payment_method: method,
    });
  };

  const handleDelete = () => {
    deleteOrder.mutate(orderId, {
      onSuccess: () => navigate('/orders'),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Order" />
        <LoadingCards count={2} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <PageHeader title="Order Not Found" />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Order not found
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${order.order_number}`}
        action={
          <Button variant="outline" onClick={() => navigate('/orders')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Header */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="font-mono text-2xl">{order.order_number}</CardTitle>
                  <p className="text-muted-foreground mt-1">
                    Created {formatDateTime(order.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge className={STATUS_COLORS[order.status]}>{order.status}</Badge>
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
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.items.map((item) => (
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
                    <span className="font-medium">{formatCurrency(order.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Cost</span>
                    <span>{formatCurrency(order.total_cost)}</span>
                  </div>
                  <div className="flex justify-between text-green-600 font-semibold">
                    <span>Total Margin</span>
                    <span>
                      {formatCurrency(order.total_margin)}
                      {order.margin_pct && (
                        <span className="text-sm ml-1">({order.margin_pct.toFixed(1)}%)</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* WhatsApp Copy */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                WhatsApp Receipt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap mb-4 max-h-64 overflow-auto">
                {order.whatsapp_text}
              </pre>
              <Button className="w-full" onClick={handleCopyWhatsApp}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy for WhatsApp
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Status Management */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Update Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Order Status</label>
                <Select value={order.status} onValueChange={handleStatusChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Payment Status</label>
                <Select value={order.payment_status} onValueChange={handlePaymentChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Payment Method</label>
                <Select
                  value={order.payment_method || ''}
                  onValueChange={handlePaymentMethodChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Delete */}
          {order.status === 'Draft' && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  Delete Order
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Order?"
        description={`This will permanently delete order ${order.order_number}. This action cannot be undone.`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
