import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Truck, Package, CheckCircle2, XCircle, ChefHat } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  PackageStatusDisplay,
  EnhancedCancellationDialog,
} from '@/components/orders';
import type { OrderStep, StepStatus } from '@/components/orders/OrderStatusAccordion';
import type { CancellationImpact } from '@/components/orders/EnhancedCancellationDialog';
import type { ProductionUnit } from '@/components/orders/ProductionProgress';
import type { PackageItem } from '@/components/orders/PackageStatusDisplay';

import {
  useConvexOrder,
  useConvexUpdateOrderStatus,
  useConvexUpdateOrderPayment,
  useConvexDeleteOrder,
  useConvexUpdateOrderShipping,
  useConvexUpdateOrderDetails,
  useConvexCancelOrder,
} from '@/hooks/convex';
import type { Id } from '../../convex/_generated/dataModel';
import type { OrderStatus, CancellationCategory } from '@/lib/types';

// ============================================
// Status Flow Configuration
// ============================================

const STATUS_ORDER: Record<OrderStatus, number> = {
  'Draft': 0,
  'AwaitingPayment': 1,
  'Confirmed': 2,
  'InProduction': 3,
  'ProductionComplete': 4, // Deprecated
  'Packaging': 4,
  'WaitingShipment': 5,
  'WaitingPickup': 5,
  'CompleteShipped': 6,
  'PickedUp': 6,
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

  // Local state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Shipping input state
  const [shippingAgency, setShippingAgency] = useState('');
  const [shippingNumber, setShippingNumber] = useState('');

  // ============================================
  // Handlers
  // ============================================

  const handleStatusChange = async (newStatus: string) => {
    if (!order || !orderId) return;

    if (newStatus === 'Cancelled') {
      setShowCancelDialog(true);
      return;
    }

    await updateStatus.mutate({ orderId, status: newStatus });
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

  const handleChannelChange = async (channel: string) => {
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
      content: order.status === 'Draft' ? (
        <div className="space-y-4">
          <StepWhatsAppTemplate
            orderId={orderId!}
            templateType="payment_request"
            customerPhone={order.customer_phone}
          />
          <Button
            onClick={() => handleStatusChange('AwaitingPayment')}
            className="w-full"
          >
            Confirmation invoice sent to customer for payment
          </Button>
        </div>
      ) : null,
    });

    // Step 2: Payment
    steps.push({
      id: 'payment',
      title: 'Payment',
      description: order.payment_status === 'Paid' ? 'Payment received' : 'Awaiting payment',
      status: getStepStatus('AwaitingPayment', order.status as OrderStatus),
      content: ['AwaitingPayment', 'Draft'].includes(order.status) ? (
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
                handleStatusChange('Confirmed');
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

    // Step 3: Confirmed / Production
    steps.push({
      id: 'production',
      title: 'Production',
      description: order.status === 'InProduction' ? 'Kitchen is preparing' : 'Ready for kitchen',
      status: getStepStatus('Confirmed', order.status as OrderStatus),
      content: ['Confirmed', 'InProduction'].includes(order.status) ? (
        <div className="space-y-4">
          <ProductionProgress
            units={getProductionUnits(order)}
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

    // Step 4: Packaging
    steps.push({
      id: 'packaging',
      title: 'Packaging',
      description: order.status === 'Packaging' ? 'Packaging in progress' : 'Ready for packaging',
      status: getStepStatus('Packaging', order.status as OrderStatus),
      content: order.status === 'Packaging' ? (
        <div className="space-y-4">
          <PackageStatusDisplay
            items={getPackageItems(order)}
            compact
          />
          <p className="text-sm text-muted-foreground">
            Package status is updated from Kitchen View.
          </p>
        </div>
      ) : null,
    });

    // Step 5: Shipping/Pickup
    if (isDelivery) {
      steps.push({
        id: 'shipping',
        title: 'Shipping',
        description: order.shipping_agency ? `Via ${order.shipping_agency}` : 'Enter shipping details',
        status: getStepStatus('WaitingShipment', order.status as OrderStatus),
        content: ['Packaging', 'WaitingShipment'].includes(order.status) ? (
          <div className="space-y-4">
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
            {order.status === 'WaitingShipment' && (
              <>
                <Separator />
                <StepWhatsAppTemplate
                  orderId={orderId!}
                  templateType="shipping"
                  customerPhone={order.customer_phone}
                />
                <Button
                  onClick={() => handleStatusChange('CompleteShipped')}
                  className="w-full"
                >
                  Mark as Shipped
                </Button>
              </>
            )}
          </div>
        ) : null,
      });

      // Step 6: Complete (Delivery)
      steps.push({
        id: 'complete',
        title: 'Delivered',
        description: 'Order delivered to customer',
        status: getStepStatus('CompleteShipped', order.status as OrderStatus),
        content: order.status === 'CompleteShipped' ? (
          <div className="space-y-4">
            <StepWhatsAppTemplate
              orderId={orderId!}
              templateType="delivery_complete"
              customerPhone={order.customer_phone}
            />
          </div>
        ) : null,
      });
    } else {
      // Pickup flow
      steps.push({
        id: 'pickup',
        title: 'Ready for Pickup',
        description: order.pickup_location || 'Customer pickup',
        status: getStepStatus('WaitingPickup', order.status as OrderStatus),
        content: order.status === 'WaitingPickup' ? (
          <div className="space-y-4">
            <StepWhatsAppTemplate
              orderId={orderId!}
              templateType="pickup_ready"
              customerPhone={order.customer_phone}
            />
            <Button
              onClick={() => handleStatusChange('PickedUp')}
              className="w-full"
            >
              <Package className="h-4 w-4 mr-2" />
              Mark as Picked Up
            </Button>
          </div>
        ) : null,
      });

      // Step 6: Complete (Pickup)
      steps.push({
        id: 'complete',
        title: 'Picked Up',
        description: 'Customer collected order',
        status: getStepStatus('PickedUp', order.status as OrderStatus),
        content: order.status === 'PickedUp' ? (
          <div className="space-y-4">
            <StepWhatsAppTemplate
              orderId={orderId!}
              templateType="delivery_complete"
              customerPhone={order.customer_phone}
            />
          </div>
        ) : null,
      });
    }

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
                <Badge
                  className={
                    order.status === 'Cancelled' ? 'bg-red-500' :
                    order.status === 'CompleteShipped' || order.status === 'PickedUp' ? 'bg-green-500' :
                    'bg-blue-500'
                  }
                >
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
          />

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
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function getProductionUnits(order: {
  items: Array<{
    productName: string;
    quantity: number;
    productionUnits?: number;
    ballsFilled?: number;
    isCancelled?: boolean;
  }>
}): ProductionUnit[] {
  // Group by product name and calculate balls remaining
  const productMap = new Map<string, { required: number; completed: number }>();

  order.items
    .filter(item => !item.isCancelled)
    .forEach((item) => {
      const productName = item.productName;
      const ballsPerUnit = item.productionUnits || 1;
      const totalBalls = item.quantity * ballsPerUnit;
      const filledBalls = item.ballsFilled || 0;

      const existing = productMap.get(productName);
      if (existing) {
        existing.required += totalBalls;
        existing.completed += filledBalls;
      } else {
        productMap.set(productName, {
          required: totalBalls,
          completed: filledBalls,
        });
      }
    });

  // Convert to ProductionUnit array
  return Array.from(productMap.entries()).map(([name, data]) => ({
    code: name.toUpperCase().replace(/\s+/g, '_'),
    name: name,
    unitsRequired: data.required,
    unitsCompleted: data.completed,
    unitsRemaining: data.required - data.completed,
  }));
}

function getPackageItems(order: { items: Array<{ id: number; product_name: string; product_variant: string | null; quantity: number }> }): PackageItem[] {
  return order.items.map((item) => ({
    id: String(item.id),
    productName: item.product_name,
    productVariant: item.product_variant,
    quantity: item.quantity,
    status: 'empty' as const,
  }));
}
