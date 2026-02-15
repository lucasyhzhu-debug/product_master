import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Truck, Package, CheckCircle2, XCircle, ChefHat, Pencil, AlertTriangle } from 'lucide-react';
import { useState, useMemo } from 'react';
import { ConvexError } from 'convex/values';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout';
import { LoadingCards, ConfirmDialog, HoldButton } from '@/components/shared';
import {
  OrderItems,
  OrderStatusAccordion,
  StepWhatsAppTemplate,
  PaymentMethodButtons,
  ShippingAgencyButtons,
  ChannelButtons,
  ProductionProgress,
  EnhancedCancellationDialog,
} from '@/components/orders';
import type { OrderStep, StepStatus } from '@/components/orders/OrderStatusAccordion';
import type { CancellationImpact } from '@/components/orders/EnhancedCancellationDialog';
import type { ProductionUnit } from '@/components/orders/ProductionProgress';

import {
  useConvexOrder,
  useConvexUpdateOrderStatus,
  useConvexUpdateOrderPayment,
  useConvexDeleteOrder,
  useConvexUpdateOrderShipping,
  useConvexUpdateOrderDetails,
  useConvexCancelOrder,
} from '@/hooks/convex';
import { useAuth } from '@/contexts/AuthContext';
import type { Id } from '../../convex/_generated/dataModel';
import { getStatusColor } from '@/lib/orderConstants';
import type { OrderStatus, CancellationCategory } from '@/lib/types';

// ============================================
// Status Flow Configuration
// ============================================

const STATUS_ORDER: Record<OrderStatus, number> = {
  'Draft': 0,
  'AwaitingPayment': 1,
  'PaymentReceived': 2,
  'BeingPrepared': 3,
  'AwaitingDelivery': 4,
  'Complete': 5,
  'Cancelled': -1,
};

function getStepStatus(stepStatus: OrderStatus, currentStatus: OrderStatus): StepStatus {
  if (currentStatus === 'Cancelled') {
    return 'pending';
  }
  const stepOrder = STATUS_ORDER[stepStatus];
  const currentOrder = STATUS_ORDER[currentStatus];

  if (stepOrder < currentOrder) return 'completed';
  if (stepOrder === currentOrder) return 'current';
  return 'pending';
}

// ============================================
// Main Component
// ============================================

export function OrderDetail() {
  useDocumentTitle('Order Details');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orderId = id as Id<"orders"> | undefined;

  const { data: order, isLoading } = useConvexOrder(orderId);
  const updateStatus = useConvexUpdateOrderStatus();
  const updatePayment = useConvexUpdateOrderPayment();
  const updateShipping = useConvexUpdateOrderShipping();
  const updateDetails = useConvexUpdateOrderDetails();
  const cancelOrder = useConvexCancelOrder();
  const deleteOrder = useConvexDeleteOrder();

  const { hasRole, user } = useAuth();

  // Local state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [stockShortageMessage, setStockShortageMessage] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // Shipping input state
  const [shippingAgency, setShippingAgency] = useState('');
  const [shippingNumber, setShippingNumber] = useState('');

  // Production records for the production step
  const productionRecords = useQuery(
    api.orders.queries.getOrderProductionRecords,
    orderId ? { orderId } : "skip"
  );

  // Order events for audit trail
  const orderEvents = useQuery(api.orders.queries.getOrderEvents, orderId ? { orderId } : "skip");
  const overrideEvents = useMemo(() => {
    if (!orderEvents) return [];
    return orderEvents.filter(e => e.eventType === 'stock_override');
  }, [orderEvents]);

  // ============================================
  // Handlers
  // ============================================

  const handleStatusChange = async (
    newStatus: "Draft" | "AwaitingPayment" | "PaymentReceived" | "BeingPrepared" | "AwaitingDelivery" | "Complete" | "Cancelled",
    skipStockCheck?: boolean,
    overrideReasonArg?: string,
    overrideByArg?: string
  ) => {
    if (!order || !orderId) return;

    if (newStatus === 'Cancelled') {
      setShowCancelDialog(true);
      return;
    }

    try {
      await updateStatus.mutate({ orderId, status: newStatus, skipStockCheck, overrideReason: overrideReasonArg, overrideBy: overrideByArg });
      setStockShortageMessage(null);
    } catch (error) {
      // Show override dialog for stock shortage errors
      if (error instanceof ConvexError && typeof error.data === 'string' && error.data.includes('Insufficient packaging stock')) {
        setStockShortageMessage(error.data);
        return;
      }
    }
  };

  const handlePaymentMethodChange = async (method: string) => {
    if (!order || !orderId) return;
    await updatePayment.mutate({
      orderId,
      paymentStatus: order.payment_status as "Unpaid" | "Partial" | "Paid",
      paymentMethod: method,
    });
  };

  const handlePaymentStatusChange = async (status: "Unpaid" | "Partial" | "Paid") => {
    if (!order || !orderId) return;
    await updatePayment.mutate({
      orderId,
      paymentStatus: status,
      paymentMethod: order.payment_method || undefined,
    });
  };

  const handleChannelChange = async (channel: "whatsapp" | "instagram" | "shopee" | "tiktok" | "tokopedia" | "grabfood" | "k3mart_gf" | "legato_tamtem" | "legato_goldfinch" | "bazaar" | "other") => {
    if (!orderId) return;
    await updateDetails.mutate({
      orderId,
      channel,
    });
  };

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

  // ============================================
  // Build Accordion Steps
  // ============================================

  const accordionSteps = useMemo((): OrderStep[] => {
    if (!order) return [];

    const isDelivery = order.delivery_type === 'Delivery';
    const steps: OrderStep[] = [];

    // Step 1: Order Created (Draft)
    steps.push({
      id: 'draft',
      title: 'Order Created',
      description: 'Draft order ready for payment request',
      status: getStepStatus('Draft', order.status as OrderStatus),
      completedAt: order.status !== 'Draft' ? new Date(order.created_at) : undefined,
      content: getStepStatus('Draft', order.status as OrderStatus) !== 'pending' ? (
        <div className="space-y-4">
          <StepWhatsAppTemplate
            orderId={orderId!}
            templateType="payment_request"
            customerPhone={order.customer_phone}
          />
          {order.status === 'Draft' && (
            <Button
              onClick={() => handleStatusChange('AwaitingPayment')}
              className="w-full"
            >
              Confirmation invoice sent to customer for payment
            </Button>
          )}
        </div>
      ) : null,
    });

    // Step 2: Payment
    steps.push({
      id: 'payment',
      title: 'Payment',
      description: order.payment_status === 'Paid' ? 'Payment received' : 'Awaiting payment',
      status: getStepStatus('AwaitingPayment', order.status as OrderStatus),
      content: getStepStatus('AwaitingPayment', order.status as OrderStatus) !== 'pending' ? (
        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground">Payment Method</Label>
            <PaymentMethodButtons
              value={order.payment_method}
              onChange={handlePaymentMethodChange}
            />
          </div>
          {order.status === 'AwaitingPayment' && (
            <Button
              onClick={() => {
                handlePaymentStatusChange('Paid');
                handleStatusChange('PaymentReceived');
              }}
              className="w-full"
              disabled={!order.payment_method}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm Payment Received
            </Button>
          )}
        </div>
      ) : null,
    });

    // Step 3: Payment Received / Production
    steps.push({
      id: 'production',
      title: 'Production',
      description: order.status === 'BeingPrepared' ? 'Kitchen is preparing' : 'Ready for kitchen',
      status: getStepStatus('PaymentReceived', order.status as OrderStatus),
      content: ['PaymentReceived', 'BeingPrepared'].includes(order.status) ? (
        <div className="space-y-4">
          <ProductionProgress
            units={mapProductionRecords(productionRecords)}
            compact
          />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Production status is updated automatically from Kitchen View.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/kitchen">
                <ChefHat className="h-4 w-4 mr-2" />
                Go to Kitchen
              </Link>
            </Button>
          </div>
        </div>
      ) : null,
    });

    // Step 4: Awaiting Delivery
    steps.push({
      id: 'delivery',
      title: isDelivery ? 'Shipping' : 'Ready for Pickup',
      description: isDelivery
        ? (order.shipping_agency ? `Via ${order.shipping_agency}` : 'Enter shipping details')
        : (order.pickup_location || 'Customer pickup'),
      status: getStepStatus('AwaitingDelivery', order.status as OrderStatus),
      content: getStepStatus('AwaitingDelivery', order.status as OrderStatus) !== 'pending' ? (
        <div className="space-y-4">
          {isDelivery && ['BeingPrepared', 'AwaitingDelivery'].includes(order.status) && (
            <>
              <div>
                <Label className="text-sm text-muted-foreground">Shipping Agency</Label>
                <ShippingAgencyButtons
                  value={shippingAgency || order.shipping_agency}
                  onChange={(agency) => {
                    setShippingAgency(agency);
                  }}
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
          {order.status === 'AwaitingDelivery' && (
            <>
              <Separator />
              <StepWhatsAppTemplate
                orderId={orderId!}
                templateType={isDelivery ? "shipping" : "pickup_ready"}
                customerPhone={order.customer_phone}
              />
              <Button
                onClick={() => handleStatusChange('Complete')}
                className="w-full"
              >
                {isDelivery ? 'Mark as Shipped' : (
                  <>
                    <Package className="h-4 w-4 mr-2" />
                    Mark as Picked Up
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      ) : null,
    });

    // Step 5: Complete
    steps.push({
      id: 'complete',
      title: 'Complete',
      description: isDelivery ? 'Order delivered to customer' : 'Customer collected order',
      status: getStepStatus('Complete', order.status as OrderStatus),
      content: order.status === 'Complete' ? (
        <div className="space-y-4">
          <StepWhatsAppTemplate
            orderId={orderId!}
            templateType="delivery_complete"
            customerPhone={order.customer_phone}
          />
        </div>
      ) : null,
    });

    return steps;
  }, [order, orderId, shippingAgency, shippingNumber]);

  // ============================================
  // Cancellation Impact
  // ============================================

  const cancellationImpact = useMemo((): CancellationImpact => {
    if (!order) {
      return {
        itemCount: 0,
        productionUnitsAffected: 0,
        hasProductionStarted: false,
        totalAmount: 0,
      };
    }

    const hasProductionStarted = ['InProduction', 'Packaging', 'WaitingShipment', 'WaitingPickup'].includes(order.status);

    return {
      itemCount: order.items.length,
      productionUnitsAffected: order.items.reduce((sum, item) => {
        // Estimate production units from items
        return sum + (item.quantity || 0);
      }, 0),
      hasProductionStarted,
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

      {/* PRD-7: Flipped Layout - Accordion Left, Info Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Accordion Stepper (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          <OrderStatusAccordion
            steps={accordionSteps}
            currentStatus={order.status as OrderStatus}
          />
        </div>

        {/* Right: Order Info (1/3) */}
        <div className="lg:col-span-1 space-y-6">
          {/* Order Header - Compact version */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="font-mono text-xl">{order.order_number}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {order.customer_name}
                  </p>
                </div>
                <Badge className={getStatusColor(order.status)}>
                  {order.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.customer_phone && (
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm">{order.customer_phone}</p>
                </div>
              )}
              {order.due_date && (
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="text-sm font-medium">
                    {new Date(order.due_date).toLocaleDateString('id-ID', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
              )}
              {order.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{order.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stock Override Audit Trail */}
          {overrideEvents.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  Stock Override
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {overrideEvents.map((evt) => {
                  const meta = evt.metadata ? JSON.parse(evt.metadata) : {};
                  return (
                    <div key={evt._id} className="text-sm space-y-1">
                      <p className="text-amber-800 dark:text-amber-300">
                        Overridden by <span className="font-medium">{meta.overrideBy ?? evt.triggeredBy}</span>
                      </p>
                      {evt.reason && (
                        <p className="text-amber-700 dark:text-amber-400 italic">&quot;{evt.reason}&quot;</p>
                      )}
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        {new Date(evt.timestamp).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Channel Selector */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sales Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <ChannelButtons
                value={order.channel}
                onChange={handleChannelChange}
              />
            </CardContent>
          </Card>

          {/* Order Items */}
          <OrderItems
            items={order.items}
            totalAmount={order.total_amount}
            totalDiscount={order.total_discount}
            voucherCode={order.voucher_code}
            voucherDiscountValue={order.voucher_discount_value}
            finalTotal={order.final_total}
          />

          {/* Edit Order Items Button */}
          {['Draft', 'AwaitingPayment'].includes(order.status) && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate(`/orders?edit=${orderId}`)}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit Order Items
            </Button>
          )}

          {/* Delivery Info (for delivery orders) */}
          {order.delivery_type === 'Delivery' && (
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
                {order.shipping_agency && (
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

          {/* Delete Draft Order */}
          {order.status === 'Draft' && (
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

          {/* Cancel Order - small button with hold-to-activate */}
          {!['Cancelled', 'CompleteShipped', 'PickedUp'].includes(order.status) && (
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

      {/* Stock shortage override dialog */}
      <Dialog
        open={!!stockShortageMessage}
        onOpenChange={(open) => {
          if (!open) {
            setStockShortageMessage(null);
            setOverrideReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Insufficient Packaging Stock
            </DialogTitle>
            <DialogDescription>
              Order cannot be fully packaged. {stockShortageMessage?.split('\n').filter(line => line.includes('need ')).length ?? 0} packaging item(s) have insufficient stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {stockShortageMessage?.split('\n').filter(line => line.includes('need ')).map((line, i) => {
              const match = line.match(/^(.+): need (\d+), have (\d+) \(short (\d+)\)/);
              if (match) {
                const [, name, needed, available, shortage] = match;
                return (
                  <div key={i} className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 text-sm">
                    <Package className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-amber-900 dark:text-amber-200">
                      <span className="font-medium">{name}</span>
                      <span className="text-amber-700 dark:text-amber-400 ml-1">
                        need {needed}, have {available} (short <span className="font-semibold text-red-600 dark:text-red-400">{shortage}</span>)
                      </span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 text-sm">
                  <Package className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <span className="text-amber-900 dark:text-amber-200">{line}</span>
                </div>
              );
            })}
            {hasRole('order_staff', 'manager', 'admin') ? (
              <div className="space-y-2 pt-2">
                <Label htmlFor="override-reason" className="text-sm font-medium">
                  Reason for override *
                </Label>
                <Textarea
                  id="override-reason"
                  placeholder="Why are you proceeding despite insufficient stock?"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Contact a manager to override or add stock first.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setStockShortageMessage(null); setOverrideReason(''); }}>
              Cancel
            </Button>
            {hasRole('order_staff', 'manager', 'admin') && (
              <Button
                variant="default"
                className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
                disabled={overrideReason.trim().length < 5}
                onClick={() => {
                  const reason = overrideReason.trim();
                  const by = user?.name ?? 'unknown';
                  setStockShortageMessage(null);
                  setOverrideReason('');
                  handleStatusChange('PaymentReceived', true, reason, by);
                }}
              >
                Override & Confirm
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function mapProductionRecords(
  records: Array<{
    productionUnitCode: string;
    productionUnitName: string;
    productName: string;
    unitsRequired: number;
    unitsCompleted: number;
    unitsRemaining: number;
  }> | undefined
): ProductionUnit[] {
  if (!records || records.length === 0) return [];
  return records.map((r) => ({
    code: r.productionUnitCode,
    name: `${r.productionUnitName} (${r.productName})`,
    unitsRequired: r.unitsRequired,
    unitsCompleted: r.unitsCompleted,
    unitsRemaining: r.unitsRemaining,
  }));
}

