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

import {
  useConvexOrder,
  useConvexUpdateOrderStatus,
  useConvexUpdateOrderPayment,
  useConvexDeleteOrder,
  useConvexUpdateOrderShipping,
  useConvexCancelOrder,
} from '@/hooks/convex';
import { generateTemplate } from '@/lib/whatsappTemplates';
import { useAuth } from '@/contexts/AuthContext';
import type { Id } from '../../convex/_generated/dataModel';
import type { OrderStatus } from '@/lib/types';

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Hide costs for kitchen role
  const showCosts = user?.role !== 'kitchen';

  // Convex uses string IDs directly (no parsing needed)
  const orderId = id as Id<"orders"> | undefined;

  const { data: order, isLoading } = useConvexOrder(orderId);
  const updateStatus = useConvexUpdateOrderStatus();
  const updatePayment = useConvexUpdateOrderPayment();
  const updateShipping = useConvexUpdateOrderShipping();
  const cancelOrder = useConvexCancelOrder();
  const deleteOrder = useConvexDeleteOrder();

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

  const handleCopyWhatsApp = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!order || !orderId) return;

    if (newStatus === 'Cancelled') {
      setShowCancelDialog(true);
      return;
    }

    // Confirmation dialog for Draft → AwaitingPayment (WhatsApp sent required)
    if (order.status === 'Draft' && newStatus === 'AwaitingPayment') {
      // Generate order_confirmation template for payment request
      const templateText = generateTemplate('order_confirmation', order, 'id');
      setConfirmationWhatsappText(templateText);
      setWhatsappSent(false);
      setPaymentConfirmed(false);
      setShowConfirmDialog(true);
      return;
    }

    // Confirmation dialog for AwaitingPayment → Confirmed (Payment verified required)
    if (order.status === 'AwaitingPayment' && newStatus === 'Confirmed') {
      // Generate payment_received template for confirmation
      const templateText = generateTemplate('payment_received', order, 'id');
      setConfirmationWhatsappText(templateText);
      setWhatsappSent(true);  // Already sent in previous step
      setPaymentConfirmed(false);
      setShowConfirmDialog(true);
      return;
    }

    // Legacy: Direct Draft → Confirmed (both required)
    if (order.status === 'Draft' && newStatus === 'Confirmed') {
      // Generate order_confirmation template
      const templateText = generateTemplate('order_confirmation', order, 'id');
      setConfirmationWhatsappText(templateText);
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

    await updateStatus.mutate({ orderId, status: newStatus });
  };

  const handleConfirmOrder = async () => {
    if (!order || !orderId) return;

    // Determine target status based on current flow
    let targetStatus: OrderStatus;
    if (order.status === 'Draft' && !paymentConfirmed) {
      // Draft → AwaitingPayment (only WhatsApp sent required)
      targetStatus = 'AwaitingPayment';
    } else {
      // AwaitingPayment → Confirmed OR Draft → Confirmed (both required)
      targetStatus = 'Confirmed';
    }

    try {
      await updateStatus.mutate({ orderId, status: targetStatus });
      setShowConfirmDialog(false);
      setWhatsappSent(false);
      setPaymentConfirmed(false);
    } catch {
      // Error handled by toast in hook
    }
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

  const confirmCancellation = async () => {
    if (!order || !orderId) return;
    try {
      await cancelOrder.mutate({
        orderId,
        reason: cancellationReason || undefined,
      });
      setShowCancelDialog(false);
      setCancellationReason('');
    } catch {
      // Error handled by toast in hook
    }
  };

  const handlePaymentChange = async (newPaymentStatus: string) => {
    if (!order || !orderId) return;
    // PRD-0: Cast to PaymentStatusType (validated by UI dropdown)
    await updatePayment.mutate({
      orderId,
      paymentStatus: newPaymentStatus as "Unpaid" | "Partial" | "Paid",
      paymentMethod: order.payment_method || undefined,
    });
  };

  const handlePaymentMethodChange = async (method: string) => {
    if (!order || !orderId) return;
    // PRD-0: Cast to PaymentStatusType (validated by UI dropdown)
    await updatePayment.mutate({
      orderId,
      paymentStatus: order.payment_status as "Unpaid" | "Partial" | "Paid",
      paymentMethod: method,
    });
  };

  const handleDelete = async () => {
    if (!orderId) return;
    try {
      await deleteOrder.mutate(orderId);
      navigate('/orders');
    } catch {
      // Error handled by toast in hook
    }
  };

  const handleUpdateShipping = async () => {
    if (!order || !orderId) return;
    try {
      await updateShipping.mutate({
        orderId,
        shippingAgency: shippingAgency || undefined,
        shippingNumber: shippingNumber || undefined,
      });
      // If there's a pending status, update status after shipping is saved
      if (pendingStatus) {
        await updateStatus.mutate({ orderId, status: pendingStatus });
        setPendingStatus(null);
      }
      setShowShippingDialog(false);
    } catch {
      // Error handled by toast in hook
    }
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
            showCosts={showCosts}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <OrderWhatsAppPanel
            order={order}
            copied={copied}
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
