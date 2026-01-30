import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout';
import { LoadingCards, ConfirmDialog } from '@/components/shared';
import {
  OrderHeader,
  OrderItems,
  OrderWhatsAppPanel,
  OrderStatusPanel,
  ShippingDialog,
  CancellationDialog,
  ConfirmationDialog,
} from '@/components/orders';

import { useOrder, useUpdateOrderStatus, useUpdateOrderPayment, useDeleteOrder, useUpdateOrderShipping } from '@/hooks';
import type { OrderStatus } from '@/lib/types';

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
          <OrderHeader order={order} />
          <OrderItems
            items={order.items}
            totalAmount={order.total_amount}
            totalCost={order.total_cost}
            totalMargin={order.total_margin}
            marginPct={order.margin_pct}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <OrderWhatsAppPanel
            status={order.status}
            receiptText={receiptText}
            shippingText={shippingText}
            pickupText={pickupText}
            copied={copied}
            onReceiptChange={setReceiptText}
            onShippingChange={setShippingText}
            onPickupChange={setPickupText}
            onCopy={handleCopyWhatsApp}
          />

          <Card>
            <CardContent className="pt-6">
              <Button variant="outline" className="w-full" onClick={openShippingDialog}>
                Update Shipping
              </Button>
            </CardContent>
          </Card>

          <OrderStatusPanel
            currentStatus={order.status}
            currentPaymentStatus={order.payment_status}
            currentPaymentMethod={order.payment_method}
            onStatusChange={handleStatusChange}
            onPaymentStatusChange={handlePaymentChange}
            onPaymentMethodChange={handlePaymentMethodChange}
          />

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

      <CancellationDialog
        open={showCancelDialog}
        reason={cancellationReason}
        onOpenChange={setShowCancelDialog}
        onReasonChange={setCancellationReason}
        onConfirm={confirmCancellation}
      />

      <ShippingDialog
        open={showShippingDialog}
        shippingAgency={shippingAgency}
        shippingNumber={shippingNumber}
        onOpenChange={setShowShippingDialog}
        onShippingAgencyChange={setShippingAgency}
        onShippingNumberChange={setShippingNumber}
        onSave={handleUpdateShipping}
      />

      <ConfirmationDialog
        open={showConfirmDialog}
        orderStatus={order?.status}
        whatsappSent={whatsappSent}
        paymentConfirmed={paymentConfirmed}
        whatsappText={confirmationWhatsappText}
        onOpenChange={setShowConfirmDialog}
        onWhatsappSentChange={setWhatsappSent}
        onPaymentConfirmedChange={setPaymentConfirmed}
        onWhatsappTextChange={setConfirmationWhatsappText}
        onCopyWhatsapp={handleCopyConfirmationWhatsapp}
        onConfirm={handleConfirmOrder}
      />
    </div>
  );
}
