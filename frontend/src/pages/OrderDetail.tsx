import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, MessageSquare, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

import { useOrder, useUpdateOrderStatus, useUpdateOrderPayment, useDeleteOrder, useUpdateOrderShipping } from '@/hooks';
import type { OrderStatus, PaymentStatus } from '@/lib/types';

const STATUS_COLORS: Record<OrderStatus, string> = {
  Draft: 'bg-gray-500',
  AwaitingPayment: 'bg-amber-500',
  Confirmed: 'bg-blue-500',
  ProductionComplete: 'bg-purple-500',
  Packaging: 'bg-indigo-500',
  WaitingShipment: 'bg-yellow-500',
  CompleteShipped: 'bg-green-500',
  WaitingPickup: 'bg-orange-500',
  PickedUp: 'bg-green-500',
  Cancelled: 'bg-red-500',
};

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  Unpaid: 'bg-orange-500',
  Partial: 'bg-yellow-500',
  Paid: 'bg-green-500',
};

const STATUS_OPTIONS: OrderStatus[] = ['Draft', 'AwaitingPayment', 'Confirmed', 'ProductionComplete', 'Packaging', 'WaitingShipment', 'CompleteShipped', 'WaitingPickup', 'PickedUp', 'Cancelled'];
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

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orderId = parseInt(id || '0', 10);

  const { data: order, isLoading } = useOrder(orderId);
  const updateStatus = useUpdateOrderStatus();
  const updatePayment = useUpdateOrderPayment();
  const updateShipping = useUpdateOrderShipping();
  const deleteOrder = useDeleteOrder();

  const [copied, setCopied] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Shipping Dialog
  const [showShippingDialog, setShowShippingDialog] = useState(false);
  const [shippingAgency, setShippingAgency] = useState('');
  const [shippingNumber, setShippingNumber] = useState('');

  // Cancellation Dialog
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  // Confirmation Dialog (Draft → Confirmed)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [confirmationWhatsappText, setConfirmationWhatsappText] = useState('');

  // Pending status for shipping dialog flow
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  // WhatsApp States
  const [receiptText, setReceiptText] = useState('');
  const [shippingText, setShippingText] = useState('');
  const [pickupText, setPickupText] = useState('');

  // Update WA text when order loads
  if (order && !receiptText && order.whatsapp_text) setReceiptText(order.whatsapp_text);
  if (order && !shippingText && order.shipping_text) setShippingText(order.shipping_text);
  if (order && !pickupText && order.pickup_text) setPickupText(order.pickup_text);

  const handleCopyWhatsApp = async (text: string | undefined) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (!order) return;

    if (newStatus === 'Cancelled') {
      setShowCancelDialog(true);
      return;
    }

    // Confirmation dialog for Draft → AwaitingPayment (WhatsApp sent required)
    if (order.status === 'Draft' && newStatus === 'AwaitingPayment') {
      setConfirmationWhatsappText(order.payment_request_text || order.whatsapp_text);
      setWhatsappSent(false);
      setPaymentConfirmed(false);
      setShowConfirmDialog(true);
      return;
    }

    // Confirmation dialog for AwaitingPayment → Confirmed (Payment verified required)
    if (order.status === 'AwaitingPayment' && newStatus === 'Confirmed') {
      setWhatsappSent(true);  // Already sent in previous step
      setPaymentConfirmed(false);
      setShowConfirmDialog(true);
      return;
    }

    // Legacy: Direct Draft → Confirmed (both required)
    if (order.status === 'Draft' && newStatus === 'Confirmed') {
      setConfirmationWhatsappText(order.payment_request_text || order.whatsapp_text);
      setWhatsappSent(false);
      setPaymentConfirmed(false);
      setShowConfirmDialog(true);
      return;
    }

    // Auto-trigger shipping dialog for WaitingShipment
    if (newStatus === 'WaitingShipment') {
      setPendingStatus(newStatus);
      setShippingAgency(order.shipping_agency || '');
      setShippingNumber(order.shipping_number || '');
      setShowShippingDialog(true);
      return;
    }

    updateStatus.mutate({ id: order.id, status: newStatus });
  };

  const handleConfirmOrder = () => {
    if (!order) return;

    // Determine target status based on current flow
    let targetStatus: OrderStatus;
    if (order.status === 'Draft' && !paymentConfirmed) {
      // Draft → AwaitingPayment (only WhatsApp sent required)
      targetStatus = 'AwaitingPayment';
    } else {
      // AwaitingPayment → Confirmed OR Draft → Confirmed (both required)
      targetStatus = 'Confirmed';
    }

    updateStatus.mutate(
      { id: order.id, status: targetStatus },
      {
        onSuccess: () => {
          setShowConfirmDialog(false);
          setWhatsappSent(false);
          setPaymentConfirmed(false);
        }
      }
    );
  };

  const handleCopyConfirmationWhatsapp = async () => {
    try {
      await navigator.clipboard.writeText(confirmationWhatsappText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const confirmCancellation = () => {
    if (!order) return;
    updateStatus.mutate(
      {
        id: order.id,
        status: 'Cancelled',
        cancellation_reason: cancellationReason
      },
      {
        onSuccess: () => {
          setShowCancelDialog(false);
          setCancellationReason('');
        }
      }
    );
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

  const handleUpdateShipping = () => {
    if (!order) return;
    updateShipping.mutate(
      {
        id: order.id,
        shipping_agency: shippingAgency || null,
        shipping_number: shippingNumber || null,
      },
      {
        onSuccess: () => {
          // If there's a pending status, update status after shipping is saved
          if (pendingStatus) {
            updateStatus.mutate({ id: order.id, status: pendingStatus });
            setPendingStatus(null);
          }
          setShowShippingDialog(false);
        },
      }
    );
  };

  const openShippingDialog = () => {
    if (!order) return;
    setShippingAgency(order.shipping_agency || '');
    setShippingNumber(order.shipping_number || '');
    setShowShippingDialog(true);
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
                <div className="flex gap-2 items-center">
                  <Badge className={STATUS_COLORS[order.status]}>{order.status}</Badge>
                  {order.status === 'AwaitingPayment' && order.awaiting_payment_since && (
                    (() => {
                      const waitInfo = getWaitingTimeInfo(order.awaiting_payment_since);
                      return waitInfo ? (
                        <Badge variant="outline" className={waitInfo.colorClass}>
                          {waitInfo.text}
                        </Badge>
                      ) : null;
                    })()
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
                WhatsApp Messages
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Receipt */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Order Receipt</Label>
                <Textarea
                  value={receiptText}
                  onChange={(e) => setReceiptText(e.target.value)}
                  className="min-h-[100px] text-xs font-mono"
                />
                <Button
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={() => handleCopyWhatsApp(receiptText)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Receipt
                </Button>
              </div>

              {/* Shipping Info */}
              {(order.status === 'WaitingShipment' || order.status === 'CompleteShipped') && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Shipping / Courier Info</Label>
                  <Textarea
                    value={shippingText}
                    onChange={(e) => setShippingText(e.target.value)}
                    className="min-h-[100px] text-xs font-mono"
                  />
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleCopyWhatsApp(shippingText)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Info
                  </Button>
                </div>
              )}

              {/* Pickup Ready */}
              {order.status === 'WaitingPickup' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Pickup Ready</Label>
                  <Textarea
                    value={pickupText}
                    onChange={(e) => setPickupText(e.target.value)}
                    className="min-h-[100px] text-xs font-mono"
                  />
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleCopyWhatsApp(pickupText)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Pickup Info
                  </Button>
                </div>
              )}

              {copied && (
                <div className="flex items-center justify-center text-sm text-green-600 animate-in fade-in slide-in-from-bottom-2">
                  <Check className="h-4 w-4 mr-1" />
                  Copied to clipboard!
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipping Update */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shipping Info</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={openShippingDialog}>
                Update Shipping
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

      {/* Cancellation Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription>
              Please provide a reason for cancelling this order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason</Label>
            <Textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="e.g. Customer request, Out of stock..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancellation}
              disabled={!cancellationReason.trim()}
            >
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shipping Dialog */}
      <Dialog open={showShippingDialog} onOpenChange={setShowShippingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Shipping Info</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Agency / Courier</Label>
              <Select onValueChange={(val) => setShippingAgency(val)}>
                <SelectTrigger>
                  <SelectValue placeholder={shippingAgency || "Select courier"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Gojek">Gojek</SelectItem>
                  <SelectItem value="GrabSend">GrabSend</SelectItem>
                  <SelectItem value="JNE">JNE</SelectItem>
                  <SelectItem value="J&T">J&T</SelectItem>
                  <SelectItem value="SiCepat">SiCepat</SelectItem>
                  <SelectItem value="AnterAja">AnterAja</SelectItem>
                  <SelectItem value="Paxel">Paxel</SelectItem>
                  <SelectItem value="Lalamove">Lalamove</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {(!['Gojek', 'GrabSend', 'JNE', 'J&T', 'SiCepat', 'AnterAja', 'Paxel', 'Lalamove'].includes(shippingAgency) || shippingAgency === 'Other') && (
                <Input
                  className="mt-2"
                  value={shippingAgency === 'Other' ? '' : shippingAgency}
                  onChange={(e) => setShippingAgency(e.target.value)}
                  placeholder="Enter courier name"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Tracking / Reference Number</Label>
              <Input
                value={shippingNumber}
                onChange={(e) => setShippingNumber(e.target.value)}
                placeholder="Receipt number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShippingDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateShipping}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog - Dynamic based on flow */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-500" />
              {order?.status === 'AwaitingPayment' ? 'Confirm Payment' : 'Send Order to Customer'}
            </DialogTitle>
            <DialogDescription>
              {order?.status === 'AwaitingPayment'
                ? 'Verify payment before starting production.'
                : 'Send the order details and wait for customer confirmation.'}
            </DialogDescription>
          </DialogHeader>

          {/* Visual Stepper - Only show for Draft status */}
          {order?.status === 'Draft' && (
            <div className="flex items-center justify-between mb-6 px-4">
              {/* Step 1: WhatsApp */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  whatsappSent
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {whatsappSent ? <Check className="h-5 w-5" /> : "1"}
                </div>
                <span className="text-xs mt-1 text-muted-foreground">Send WA</span>
              </div>

              {/* Connector Line */}
              <div className={`flex-1 h-0.5 mx-2 ${
                whatsappSent ? "bg-green-500" : "bg-muted"
              }`} />

              {/* Step 2: Payment */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  paymentConfirmed
                    ? "bg-green-500 text-white"
                    : whatsappSent
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {paymentConfirmed ? <Check className="h-5 w-5" /> : "2"}
                </div>
                <span className="text-xs mt-1 text-muted-foreground">Payment</span>
              </div>
            </div>
          )}

          <div className="space-y-4 py-2">
            {/* WhatsApp Message Preview - Only show for Draft → AwaitingPayment */}
            {order?.status === 'Draft' && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">WhatsApp Message to Send</Label>
                  <Textarea
                    value={confirmationWhatsappText}
                    onChange={(e) => setConfirmationWhatsappText(e.target.value)}
                    className="min-h-[180px] text-xs font-mono"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={handleCopyConfirmationWhatsapp}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Message
                  </Button>
                </div>
                <Separator />
              </>
            )}

            {/* Checkboxes */}
            <div className="space-y-4">
              {/* WhatsApp checkbox - Only for Draft status */}
              {order?.status === 'Draft' && (
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="whatsapp-sent"
                    checked={whatsappSent}
                    onCheckedChange={(checked) => setWhatsappSent(checked === true)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="whatsapp-sent"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      I have sent this message to the customer
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Make sure the customer receives the order details and payment info
                    </p>
                  </div>
                </div>
              )}

              {/* Payment checkbox - For AwaitingPayment → Confirmed or Direct confirmation */}
              {(order?.status === 'AwaitingPayment' || (order?.status === 'Draft' && whatsappSent)) && (
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="payment-confirmed"
                    checked={paymentConfirmed}
                    onCheckedChange={(checked) => setPaymentConfirmed(checked === true)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="payment-confirmed"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Payment has been confirmed
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Customer has paid or confirmed payment arrangement
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOrder}
              disabled={
                order?.status === 'Draft'
                  ? !whatsappSent  // Draft: just need WhatsApp sent to move to AwaitingPayment
                  : !paymentConfirmed  // AwaitingPayment: just need payment confirmed
              }
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {order?.status === 'AwaitingPayment' ? 'Confirm Payment' : 'Send to Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
