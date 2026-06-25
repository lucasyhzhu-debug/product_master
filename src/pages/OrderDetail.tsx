import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Truck, XCircle, Pencil, AlertTriangle, FileText, Phone, Copy as CopyIcon, ShieldAlert, QrCode, Lock, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { useSessionMutation } from 'convex-helpers/react/sessions';
import { toast } from 'sonner';
import { api } from '../../convex/_generated/api';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { format, isToday, isTomorrow, isPast, startOfDay } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout';
import { LoadingCards, ConfirmDialog, HoldButton } from '@/components/shared';
import {
  OrderItems,
  StepWhatsAppTemplate,
  ShippingAgencyButtons,
  EnhancedCancellationDialog,
} from '@/components/orders';
import { StatusActionButtons } from '@/components/orders/StatusActionButtons';
import { QrisChargeDialog } from '@/components/orders/QrisChargeDialog';
import { AuditTrail } from '@/components/orders/AuditTrail';
import { FulfillFromInventoryButton } from '@/components/inventory/FulfillFromInventoryButton';
import { InvoiceSidebarCard } from '@/components/invoice/InvoiceSidebarCard';
import type { CancellationImpact } from '@/components/orders/EnhancedCancellationDialog';

import {
  useOrder,
  useDeleteOrder,
  useUpdateOrderShipping,
  useCancelOrder,
  useForceComplete,
} from '@/hooks/convex';
import type { Id } from '../../convex/_generated/dataModel';
import { getStatusColor } from '@/lib/orderConstants';
import type { CancellationCategory } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useQrisConfig, useActiveQrisPayment } from '@/hooks/convex/useQris';

// ============================================
// Status Display Labels
// ============================================

const STATUS_LABELS: Record<string, string> = {
  Draft: 'Draft',
  AwaitingPayment: 'Awaiting Payment',
  PaymentReceived: 'Payment Received',
  BeingPrepared: 'Being Prepared',
  AwaitingDelivery: 'Awaiting Delivery',
  Complete: 'Complete',
  Cancelled: 'Cancelled',
};

// ============================================
// Urgency Helpers
// ============================================

function getDueDateBadgeClass(dueDate: string | null | undefined): string {
  if (!dueDate) return '';
  const due = startOfDay(new Date(dueDate));
  if (isPast(due) && !isToday(due)) return 'bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] font-bold border-[var(--color-status-error)]';
  if (isToday(due)) return 'bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] border-[var(--color-status-error-bg)]';
  if (isTomorrow(due)) return 'bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] border-[var(--color-status-warning-bg)]';
  return '';
}

// ============================================
// Main Component
// ============================================

export function OrderDetail() {
  useDocumentTitle('Order Details');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orderId = id as Id<"orders"> | undefined;

  const { data: order, isLoading } = useOrder(orderId);
  const updateShipping = useUpdateOrderShipping();
  const cancelOrder = useCancelOrder();
  const deleteOrder = useDeleteOrder();

  // Local state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Shipping input state
  const [shippingAgency, setShippingAgency] = useState('');
  const [shippingNumber, setShippingNumber] = useState('');

  // Order events for stock override display
  const orderEvents = useQuery(api.orders.queries.getOrderEvents, orderId ? { orderId } : "skip");
  const overrideEvents = useMemo(() => {
    if (!orderEvents) return [];
    return orderEvents.filter(e => e.eventType === 'stock_override');
  }, [orderEvents]);

  // Admin force-complete
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';
  const forceComplete = useForceComplete();
  const [showForceCompleteDialog, setShowForceCompleteDialog] = useState(false);
  const [forceCompleteReason, setForceCompleteReason] = useState('');

  // QRIS (Phase 84) — read the feature config + active payment row UNCONDITIONALLY
  // at the top of the component (hooks-order, pitfall #9). `undefined` = loading.
  const qrisConfig = useQrisConfig();
  const activeQris = useActiveQrisPayment(orderId);
  const [showQrisDialog, setShowQrisDialog] = useState(false);

  // Mark delivered (subscription orders only — T5)
  const markDelivered = useSessionMutation(api.subscriptions.delivery.markSubscriptionDelivered);
  const [markingDelivered, setMarkingDelivered] = useState(false);

  // ============================================
  // Handlers
  // ============================================

  const handleShippingUpdate = async () => {
    if (!orderId) return;
    await updateShipping.mutate({
      orderId,
      shippingAgency: shippingAgency || undefined,
      shippingNumber: shippingNumber || undefined,
    });
  };

  const handleCancelConfirm = async (data: { category: CancellationCategory; reason: string }) => {
    if (!orderId) return;
    try {
      await cancelOrder.mutate({
        orderId,
        reason: data.reason || data.category,
        reasonCategory: data.category,
      });
      setShowCancelDialog(false);
    } catch {
      // Error handled by toast
    }
  };

  const handleDelete = async () => {
    if (!orderId) return;
    try {
      await deleteOrder.mutate(orderId);
      navigate('/orders');
    } catch {
      // Error handled by toast
    }
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
  };

  const handleForceComplete = async () => {
    if (!orderId) return;
    await forceComplete.mutate({
      orderId,
      reason: forceCompleteReason || undefined,
    });
    setShowForceCompleteDialog(false);
    setForceCompleteReason('');
  };

  // ============================================
  // Cancellation Impact
  // ============================================

  const cancellationImpact = useMemo((): CancellationImpact => {
    if (!order) {
      return {
        itemCount: 0,
        productionUnitsAffected: 0,
        hasProductionStarted: false,
        totalAmount: undefined,
      };
    }

    const hasProductionStarted = ['BeingPrepared', 'AwaitingDelivery'].includes(order.status);

    return {
      itemCount: order.items.length,
      productionUnitsAffected: order.items.reduce((sum, item) => {
        return sum + (item.quantity || 0);
      }, 0),
      hasProductionStarted,
      // IMP-6: keep undefined when stripped so the cancel dialog shows "—" not "Rp 0".
      totalAmount: order.total_amount,
    };
  }, [order]);

  // ============================================
  // Loading / Not Found States
  // ============================================

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Order" />
        <LoadingCards count={2} />
      </div>
    );
  }

  // Pitfall #20: subscription orders render read-only here too (MIRROR of OrderSlideOver.tsx).
  const isSubscriptionOrder = Boolean(order?.subscription_id);

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

  // ============================================
  // Main Render
  // ============================================

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
        {/* Left: Order Details (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Header Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="font-mono text-xl">{order.order_number}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {order.customer_name}
                    {order.created_by && (
                      <span className="text-xs ml-2">Created by {order.created_by}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* needsReview indicator (D-02) — INDICATOR ONLY, no list/filter/resolve
                      flow (deferred to Phase 77). Sits inline next to the payment status. */}
                  {activeQris?.needsReview && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            tabIndex={0}
                            className="border-[var(--color-status-warning)] bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)]"
                          >
                            Needs review
                          </Badge>
                        </TooltipTrigger>
                        {activeQris.reviewReason && (
                          <TooltipContent>{activeQris.reviewReason}</TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <Badge className={`${getStatusColor(order.status)} text-white`}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                  {/* Pitfall #20: subscription locked badge — MIRROR of OrderSlideOver.tsx. */}
                  {isSubscriptionOrder && (
                    <Badge className="bg-violet-100 text-violet-700 border-violet-300">
                      <Lock className="h-3 w-3 mr-1" />
                      Subscription
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Customer phone */}
              {order.customer_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{order.customer_phone}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handleCopyPhone(order.customer_phone!)}
                  >
                    <CopyIcon className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* Due date */}
              {order.due_date && (
                <div>
                  <Badge
                    variant="outline"
                    className={`text-sm ${getDueDateBadgeClass(order.due_date)}`}
                  >
                    {format(new Date(order.due_date!), 'EEEE, MMM d, yyyy')}
                  </Badge>
                </div>
              )}

              {/* Notes */}
              {order.notes && (
                <div className="flex items-start gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status Actions */}
          {isSubscriptionOrder ? (
            /* Pitfall #20: subscription orders are managed in the scheduler, NOT here.
               MIRROR of OrderSlideOver.tsx read-only branch. */
            <Card className="border-violet-200 bg-violet-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1 text-violet-700">
                  <Lock className="h-3.5 w-3.5" />
                  Subscription order (read-only)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-violet-700/80">
                  This order is managed from the subscription scheduler. Edit, status,
                  and cancel actions are disabled here.
                </p>
                {/* Mark delivered — scoped action for manager/admin (T5) */}
                {isManagerOrAdmin &&
                  ['PaymentReceived', 'BeingPrepared', 'AwaitingDelivery'].includes(order.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-green-700 border-green-300 hover:bg-green-50 hover:text-green-800"
                      disabled={markingDelivered}
                      onClick={async () => {
                        setMarkingDelivered(true);
                        try {
                          await markDelivered({ orderId: orderId! });
                          toast.success('Delivery recognized — sale posted.');
                        } catch (err) {
                          toast.error(getErrorMessage(err, 'Failed to mark delivered'));
                        } finally {
                          setMarkingDelivered(false);
                        }
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {markingDelivered ? 'Recognizing…' : 'Mark delivered'}
                    </Button>
                  )}
                {order.subscription_id && order.customer_id_raw && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-violet-700 border-violet-300 hover:bg-violet-100"
                    onClick={() =>
                      navigate(
                        `/crm/customers/${order.customer_id_raw}/subscriptions/${order.subscription_id}/week`,
                      )
                    }
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in scheduler
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orderId && (
                <StatusActionButtons
                  orderId={orderId}
                  status={order.status}
                />
              )}

              {/* Charge via QRIS (Phase 84) — rendered ONLY when the order is
                  AwaitingPayment AND the QRIS_ENABLED flag is on. Button is ABSENT
                  (not disabled) otherwise — same conditional-render pattern as the
                  WhatsApp card. The create action re-checks the flag + role + state
                  server-side, so the button is not the only gate (D-01). */}
              {orderId && order.status === 'AwaitingPayment' && qrisConfig?.enabled === true && (
                <Button
                  className="w-full min-h-[44px] sm:min-h-[36px] text-base sm:text-sm"
                  onClick={() => setShowQrisDialog(true)}
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  Charge via QRIS
                </Button>
              )}

              {/* Admin: Force Complete (data fix) - manager/admin only */}
              {isManagerOrAdmin && !['Complete', 'Cancelled'].includes(order.status) && (
                <div className="pt-1 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                    onClick={() => setShowForceCompleteDialog(true)}
                  >
                    <ShieldAlert className="h-3 w-3 mr-1" />
                    Force Complete (Admin)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Stock Override Audit Trail */}
          {overrideEvents.length > 0 && (
            <Card className="border-[var(--color-status-warning-bg)] bg-[var(--color-status-warning-bg)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-[var(--color-status-warning)]">
                  <AlertTriangle className="h-4 w-4" />
                  Stock Override
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {overrideEvents.map((evt) => {
                  const meta = evt.metadata ? JSON.parse(evt.metadata) : {};
                  return (
                    <div key={evt._id} className="text-sm space-y-1">
                      <p className="text-[var(--color-status-warning)]">
                        Overridden by <span className="font-medium">{meta.overrideBy ?? evt.triggeredBy}</span>
                      </p>
                      {evt.reason && (
                        <p className="text-[var(--color-status-warning)] italic">&quot;{evt.reason}&quot;</p>
                      )}
                      <p className="text-xs text-[var(--color-status-warning)]">
                        {new Date(evt.timestamp).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* WhatsApp Templates — suppressed for subscription orders (read-only, no customer-messaging — Pitfall #20). MIRROR in OrderSlideOver.tsx. */}
          {!isSubscriptionOrder && orderId && ['AwaitingPayment', 'AwaitingDelivery', 'Complete'].includes(order.status) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">WhatsApp Template</CardTitle>
              </CardHeader>
              <CardContent>
                <StepWhatsAppTemplate
                  orderId={orderId}
                  templateType={
                    order.status === 'AwaitingPayment'
                      ? 'payment_request'
                      : order.status === 'AwaitingDelivery'
                        ? (order.delivery_type === 'Delivery' ? 'shipping' : 'pickup_ready')
                        : 'delivery_complete'
                  }
                  customerPhone={order.customer_phone}
                />
              </CardContent>
            </Card>
          )}

          {/* Shipping Info (delivery orders in AwaitingDelivery+) */}
          {order.delivery_type === 'Delivery' && ['BeingPrepared', 'AwaitingDelivery', 'Complete'].includes(order.status) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Shipping Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.delivery_address && (
                  <div>
                    <p className="text-xs text-muted-foreground">Address</p>
                    <p className="text-sm">{order.delivery_address}</p>
                  </div>
                )}
                {['BeingPrepared', 'AwaitingDelivery'].includes(order.status) && (
                  <>
                    <div>
                      <Label className="text-sm text-muted-foreground">Shipping Agency</Label>
                      <ShippingAgencyButtons
                        value={shippingAgency || order.shipping_agency}
                        onChange={(agency) => setShippingAgency(agency)}
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Tracking Number</Label>
                      <Input
                        placeholder="Enter tracking number"
                        value={shippingNumber || order.shipping_number || ''}
                        onChange={(e) => setShippingNumber(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handleShippingUpdate}
                      variant="outline"
                      className="w-full"
                    >
                      <Truck className="h-4 w-4 mr-2" />
                      Save Shipping Info
                    </Button>
                  </>
                )}
                {order.status === 'Complete' && order.shipping_agency && (
                  <div>
                    <p className="text-xs text-muted-foreground">Shipping</p>
                    <p className="text-sm">
                      {order.shipping_agency}
                      {order.shipping_number && (
                        <span className="text-muted-foreground ml-1">
                          #{order.shipping_number}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Audit Trail */}
          {orderId && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Status History</CardTitle>
              </CardHeader>
              <CardContent>
                <AuditTrail orderId={orderId} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Order Items + Actions (1/3) */}
        <div className="lg:col-span-1 space-y-6">
          {/* Fulfill from Inventory (PaymentReceived orders only) — suppressed for subscription orders (read-only — Pitfall #20). MIRROR in OrderSlideOver.tsx. */}
          {!isSubscriptionOrder && orderId && (
            <FulfillFromInventoryButton
              orderId={orderId}
              orderStatus={order.status}
              token={user?.token ?? ''}
            />
          )}

          {/* Invoice Sidebar Card (manager/admin, PaymentReceived+ orders) */}
          {isManagerOrAdmin && orderId && (
            <InvoiceSidebarCard
              orderId={orderId}
              orderStatus={order.status}
            />
          )}

          {/* Order Items */}
          <OrderItems
            items={order.items}
            totalAmount={order.total_amount}
            totalDiscount={order.total_discount}
            voucherCode={order.voucher_code}
            voucherDiscountValue={order.voucher_discount_value}
            finalTotal={order.final_total}
            deliveryFee={order.delivery_fee}
            orderId={orderId}
            canEditDeliveryFee={!['Cancelled', 'Complete'].includes(order.status)}
          />

          {/* Edit Order Items Button — hidden for subscription orders (Pitfall #20). */}
          {!isSubscriptionOrder && ['Draft', 'AwaitingPayment'].includes(order.status) && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate(`/orders/new?draft=${orderId}`)}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit Order Items
            </Button>
          )}

          {/* Delivery Info (for delivery orders) */}
          {order.delivery_type === 'Delivery' && !['BeingPrepared', 'AwaitingDelivery', 'Complete'].includes(order.status) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Delivery Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {order.delivery_address && (
                  <div>
                    <p className="text-xs text-muted-foreground">Address</p>
                    <p className="text-sm">{order.delivery_address}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Delete Draft Order — hidden for subscription orders (Pitfall #20). */}
          {!isSubscriptionOrder && order.status === 'Draft' && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  Delete Draft Order
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Cancel Order - small button with hold-to-activate. Hidden for subscription orders (Pitfall #20). */}
          {!isSubscriptionOrder && !['Cancelled', 'Complete'].includes(order.status) && (
            <div className="pt-4">
              <HoldButton
                variant="ghost"
                size="sm"
                holdDuration={1000}
                onHoldComplete={() => setShowCancelDialog(true)}
                holdingText="Hold..."
                className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
              >
                <XCircle className="h-3 w-3 mr-1" />
                Cancel Order
              </HoldButton>
            </div>
          )}

        </div>
      </div>

      {/* Dialogs */}
      {orderId && (
        <QrisChargeDialog
          open={showQrisDialog}
          orderId={orderId}
          onOpenChange={setShowQrisDialog}
        />
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Order?"
        description={`This will permanently delete order ${order.order_number}. This action cannot be undone.`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="destructive"
      />

      <EnhancedCancellationDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        orderNumber={order.order_number}
        impact={cancellationImpact}
        onConfirm={handleCancelConfirm}
      />

      <ConfirmDialog
        open={showForceCompleteDialog}
        onOpenChange={(open) => {
          setShowForceCompleteDialog(open);
          if (!open) setForceCompleteReason('');
        }}
        title="Force Complete Order?"
        description="This will mark the order as Complete and Paid without affecting inventory. Use only for data fixes."
        onConfirm={handleForceComplete}
        confirmLabel="Force Complete"
        variant="destructive"
      >
        <div className="space-y-2 pt-2">
          <Label className="text-sm">Reason (optional)</Label>
          <Textarea
            placeholder="e.g., Order already delivered but stuck in AwaitingPayment"
            value={forceCompleteReason}
            onChange={(e) => setForceCompleteReason(e.target.value)}
            rows={2}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
