/**
 * OrderSlideOver - Right-side slide-over panel for order details.
 * Built on shadcn Sheet component. Feature-complete replacement for
 * the full /orders/:id page when the full page is inaccessible.
 *
 * Phase 14 Plan 04: Kanban board UI.
 * Phase 17.1: Added FulfillFromInventoryButton, Force Complete, resizable width,
 *             Edit/Delete/Shipping/Cancel parity with full OrderDetail page.
 */
import { format, isToday, isTomorrow, isPast, startOfDay } from 'date-fns';
import { useMutation } from 'convex/react';
import { useSessionQuery } from 'convex-helpers/react/sessions';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  Phone, MapPin, Copy, FileText, MessageCircle,
  ShieldAlert, Pencil, XCircle, Truck, Loader2, QrCode, Lock, ExternalLink,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { StatusActionButtons } from './StatusActionButtons';
import { QrisChargeDialog } from './QrisChargeDialog';
import { useQrisConfig, useActiveQrisPayment } from '@/hooks/convex/useQris';
import { AuditTrail } from './AuditTrail';
import { StepWhatsAppTemplate } from './StepWhatsAppTemplate';
import type { WhatsAppTemplateType } from './StepWhatsAppTemplate';
import { ShippingAgencyButtons } from './ShippingAgencyButtons';
import { ConfirmDialog } from '@/components/shared';
import { FulfillFromInventoryButton } from '@/components/inventory/FulfillFromInventoryButton';
import { OrderItems } from './OrderItems';
import { getStatusColor } from '@/lib/orderConstants';
import { useAuth } from '@/contexts/AuthContext';
import { useDeleteOrder, useUpdateOrderShipping, useForceComplete } from '@/hooks/convex';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// ============================================
// Types
// ============================================

interface OrderSlideOverProps {
  orderId: Id<"orders"> | null;
  open: boolean;
  onClose: () => void;
  autoShowWhatsApp?: boolean; // Deprecated: kept for backward compatibility
}

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
// WhatsApp template display names for the modal title
// ============================================

const WHATSAPP_TEMPLATE_TITLES: Record<WhatsAppTemplateType, string> = {
  payment_request: 'Payment Request',
  production_started: 'Production Started',
  delivery_complete: 'Delivery Complete',
  receipt: 'Order Receipt',
  shipping: 'Shipping Confirmation',
  pickup_ready: 'Ready for Pickup',
};

// ============================================
// Urgency Helpers
// ============================================

function getDueDateBadgeClass(dueDate: number | undefined): string {
  if (!dueDate) return '';
  const due = startOfDay(new Date(dueDate));
  if (isPast(due) && !isToday(due)) return 'bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] font-bold border-[var(--color-status-error)]/30';
  if (isToday(due)) return 'bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] border-[var(--color-status-error)]/30';
  if (isTomorrow(due)) return 'bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] border-[var(--color-status-warning)]/30';
  return '';
}

// ============================================
// Loading State
// ============================================

function SlideOverSkeleton() {
  return (
    <div className="space-y-4 pt-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-32" />
      <Separator />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 w-56" />
      <Separator />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
      <Separator />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

// ============================================
// Component
// ============================================

export function OrderSlideOver({ orderId, open, onClose, autoShowWhatsApp }: OrderSlideOverProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  // gap#2: `get` is now a protectedQuery (kitchen/order_staff/manager/admin) that
  // strips confidential subscription pricing server-side for non-managers — supply
  // the session via useSessionQuery.
  const order = useSessionQuery(
    api.orders.queries.get,
    orderId ? { id: orderId } : 'skip'
  );

  // Pitfall #20: subscription orders render read-only on the kanban. Detect via the
  // raw query (subscriptionId is on the order doc). MIRROR in OrderDetail.tsx.
  const isSubscriptionOrder = Boolean(order?.subscriptionId);

  const forceComplete = useForceComplete();
  const deleteOrder = useDeleteOrder();
  const updateShipping = useUpdateOrderShipping();

  const cancelOrderMut = useMutation(api.orders.mutations.index.cancel);

  // Modal / dialog state — tracks which WhatsApp template to show (null = closed)
  const [activeWhatsAppTemplate, setActiveWhatsAppTemplate] = useState<WhatsAppTemplateType | null>(null);
  const [showForceCompleteDialog, setShowForceCompleteDialog] = useState(false);
  const [showQrisDialog, setShowQrisDialog] = useState(false);
  // Read unconditionally at the top (hooks-order, pitfall #9); button is conditionally rendered.
  const qrisConfig = useQrisConfig();
  // needsReview indicator must live in BOTH order surfaces (pitfall #20) — mirrors OrderDetail.tsx.
  const activeQris = useActiveQrisPayment(orderId ?? undefined);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [forceCompleteReason, setForceCompleteReason] = useState('');
  const [isCancelLoading, setIsCancelLoading] = useState(false);

  // Shipping state
  const [shippingAgency, setShippingAgency] = useState('');
  const [shippingNumber, setShippingNumber] = useState('');

  // Resizable panel width
  const [panelWidth, setPanelWidth] = useState(540);
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Sync shipping state when order loads
  useEffect(() => {
    if (order) {
      setShippingAgency((order as any).shippingAgency ?? (order as any).shipping_agency ?? '');
      setShippingNumber((order as any).shippingNumber ?? (order as any).shipping_number ?? '');
    }
  }, [order]);

  // Auto-show WhatsApp modal when order loads and autoShowWhatsApp is set
  useEffect(() => {
    if (autoShowWhatsApp && order && order.status === 'AwaitingPayment') {
      setActiveWhatsAppTemplate('payment_request');
    }
  }, [autoShowWhatsApp, order]);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    toast.success('Phone copied to clipboard');
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

  const handleDelete = async () => {
    if (!orderId) return;
    await deleteOrder.mutate(orderId);
    onClose();
  };

  const handleCancel = async () => {
    if (!orderId) return;
    setIsCancelLoading(true);
    try {
      await cancelOrderMut({ orderId });
      toast.success('Order cancelled');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel order');
    } finally {
      setIsCancelLoading(false);
    }
  };

  const handleShippingUpdate = async () => {
    if (!orderId) return;
    await updateShipping.mutate({
      orderId,
      shippingAgency: shippingAgency || undefined,
      shippingNumber: shippingNumber || undefined,
    });
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = panelWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = resizeStartX.current - ev.clientX;
      const newWidth = Math.max(380, Math.min(1000, resizeStartWidth.current + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Field access — support both camelCase (new) and snake_case (legacy) field names
  const getField = (obj: any, camel: string, snake: string) => obj?.[camel] ?? obj?.[snake];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="overflow-y-auto p-6"
        style={{ width: `${panelWidth}px`, maxWidth: '95vw' }}
      >
        {/* Drag-to-resize handle on left edge */}
        <div
          className="absolute left-0 top-0 w-3 h-full cursor-col-resize hover:bg-blue-400/30 active:bg-blue-500/40 transition-colors z-10 flex items-center justify-center group"
          onMouseDown={handleResizeStart}
          title="Drag to resize panel"
        >
          <div className="w-1 h-12 rounded-full bg-border group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors" />
        </div>

        {!order ? (
          <>
            <SheetHeader>
              <SheetTitle>Order Details</SheetTitle>
              <SheetDescription>Loading order information...</SheetDescription>
            </SheetHeader>
            <SlideOverSkeleton />
          </>
        ) : (
          <>
            {/* Header: Order # + Status */}
            <SheetHeader>
              <div className="flex items-center gap-3 flex-wrap">
                <SheetTitle className="font-mono">
                  {order.orderNumber ?? (order as any).order_number}
                </SheetTitle>
                <Badge className={`${getStatusColor(order.status as import('@/lib/types').OrderStatus)} text-white text-xs`}>
                  {STATUS_LABELS[order.status as import('@/lib/types').OrderStatus] ?? order.status}
                </Badge>
                {order.expedited && (
                  <Badge className="bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] border-[var(--color-status-warning)]/30 text-xs">
                    EXPEDITED
                  </Badge>
                )}
                {/* Pitfall #20: subscription orders are read-only on the kanban —
                    locked badge. MIRROR in OrderDetail.tsx. */}
                {isSubscriptionOrder && (
                  <Badge className="bg-violet-100 text-violet-700 border-violet-300 text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Subscription
                  </Badge>
                )}
                {/* QRIS needsReview indicator (D-02) — mirror of OrderDetail.tsx (pitfall #20).
                    Indicator only; the reason is surfaced via title (slide-over has no Tooltip). */}
                {activeQris?.needsReview && (
                  <Badge
                    title={activeQris.reviewReason ?? undefined}
                    className="border-[var(--color-status-warning)] bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] text-xs"
                  >
                    Needs review
                  </Badge>
                )}
              </div>
              <SheetDescription>
                Created {format(new Date(order._creationTime), 'MMM d, yyyy h:mm a')}
                {(order as any).creatorName
                  ? ` by ${(order as any).creatorName}`
                  : (order.createdBy ?? (order as any).created_by)
                    ? ` by ${order.createdBy ?? (order as any).created_by}`
                    : ''}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 mt-6">

              {/* ── Customer ─────────────────────────────── */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Customer</h4>
                {order.customerId ? (
                  <Link
                    to={`/crm/customers/${order.customerId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {order.customerName ?? (order as any).customer_name}
                  </Link>
                ) : (
                  <p className="text-sm font-medium">
                    {order.customerName ?? (order as any).customer_name}
                  </p>
                )}
                {getField(order, 'customerPhone', 'customer_phone') && (
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {getField(order, 'customerPhone', 'customer_phone')}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleCopyPhone(getField(order, 'customerPhone', 'customer_phone'))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {getField(order, 'deliveryAddress', 'delivery_address') && (
                  <div className="flex items-start gap-2 mt-1">
                    <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
                    <span className="text-sm text-muted-foreground">
                      {getField(order, 'deliveryAddress', 'delivery_address')}
                    </span>
                  </div>
                )}
              </div>

              <Separator />

              {/* ── Due Date ─────────────────────────────── */}
              {(order.dueDate ?? (order as any).due_date) && (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-1">Due Date</h4>
                    <Badge
                      variant="outline"
                      className={`text-sm ${getDueDateBadgeClass(order.dueDate ?? (order as any).due_date)}`}
                    >
                      {format(new Date(order.dueDate ?? (order as any).due_date), 'EEEE, MMM d, yyyy')}
                    </Badge>
                  </div>
                  <Separator />
                </>
              )}

              {/* ── Items + Pricing ──────────────────────── */}
              <OrderItems
                items={(order.items ?? []).map((item: any) => ({
                  id: item._id,
                  product_name: item.productName,
                  product_variant: item.productVariant ?? null,
                  quantity: item.quantity,
                  unit_price: item.unitPrice,
                  unit_cost: item.unitCost ?? 0,
                  discount_amount: item.discountAmount ?? 0,
                  line_total: item.lineTotal,
                  line_cost: item.lineCost ?? 0,
                  line_margin: item.lineMargin ?? 0,
                  created_at: item.createdAt ?? '',
                }))}
                totalAmount={order.totalAmount}
                totalDiscount={
                  // IMP-6: totalAmount may be stripped (undefined) — avoid NaN in
                  // the percentage branch; OrderItems renders "—" for the total.
                  order.orderLevelDiscount && order.orderLevelDiscountType && order.totalAmount !== undefined
                    ? order.orderLevelDiscountType === 'percentage'
                      ? order.totalAmount * (order.orderLevelDiscount / 100)
                      : order.orderLevelDiscount
                    : 0
                }
                voucherCode={order.voucherCode}
                voucherDiscountValue={order.voucherDiscountValue}
                finalTotal={order.finalTotal}
                deliveryFee={order.deliveryFee}
                orderId={orderId ?? undefined}
                canEditDeliveryFee={!['Cancelled', 'Complete'].includes(order.status)}
              />

              {/* Edit Order Items (Draft / AwaitingPayment) — hidden for subscription orders (Pitfall #20). */}
              {!isSubscriptionOrder && ['Draft', 'AwaitingPayment'].includes(order.status) && orderId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onClose();
                    navigate(`/orders/new?draft=${orderId}`);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Order Items
                </Button>
              )}

              <Separator />

              {/* ── Notes ────────────────────────────────── */}
              {order.notes && (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-1 flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Notes
                    </h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
                  </div>
                  <Separator />
                </>
              )}

              {/* ── Shipping Info (delivery orders) ──────── */}
              {getField(order, 'deliveryType', 'delivery_type') === 'Delivery' && (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                      <Truck className="h-3.5 w-3.5" /> Shipping Info
                    </h4>
                    <div className="space-y-3">
                      {getField(order, 'deliveryAddress', 'delivery_address') && (
                        <div>
                          <p className="text-xs text-muted-foreground">Address</p>
                          <p className="text-sm">{getField(order, 'deliveryAddress', 'delivery_address')}</p>
                        </div>
                      )}
                      {['BeingPrepared', 'AwaitingDelivery'].includes(order.status) && (
                        <>
                          <div>
                            <Label className="text-xs text-muted-foreground">Shipping Agency</Label>
                            <ShippingAgencyButtons
                              value={shippingAgency || getField(order, 'shippingAgency', 'shipping_agency')}
                              onChange={setShippingAgency}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Tracking Number</Label>
                            <Input
                              placeholder="Enter tracking number"
                              value={shippingNumber || getField(order, 'shippingNumber', 'shipping_number') || ''}
                              onChange={(e) => setShippingNumber(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                          <Button onClick={handleShippingUpdate} variant="outline" size="sm" className="w-full">
                            <Truck className="h-4 w-4 mr-2" />
                            Save Shipping Info
                          </Button>
                        </>
                      )}
                      {order.status === 'Complete' && getField(order, 'shippingAgency', 'shipping_agency') && (
                        <p className="text-sm">
                          {getField(order, 'shippingAgency', 'shipping_agency')}
                          {getField(order, 'shippingNumber', 'shipping_number') && (
                            <span className="text-muted-foreground ml-1">
                              #{getField(order, 'shippingNumber', 'shipping_number')}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* ── WhatsApp Actions ──────────────────────── */}
              {/* Suppressed for subscription orders (read-only, no customer-messaging — Pitfall #20). MIRROR in OrderDetail.tsx. */}
              {!isSubscriptionOrder && (() => {
                const status = order.status;
                const deliveryType = getField(order, 'deliveryType', 'delivery_type');
                const buttons: Array<{ templateType: WhatsAppTemplateType; label: string }> = [];

                // payment_request — when awaiting payment
                if (status === 'AwaitingPayment') {
                  buttons.push({ templateType: 'payment_request', label: 'Payment Request' });
                }

                // receipt — available on any active order (not Draft, not Cancelled)
                if (!['Draft', 'Cancelled'].includes(status)) {
                  buttons.push({ templateType: 'receipt', label: 'Order Receipt' });
                }

                // production_started — when production is underway
                if (status === 'BeingPrepared') {
                  buttons.push({ templateType: 'production_started', label: 'Production Started' });
                }

                // shipping — delivery orders at AwaitingDelivery stage
                if (status === 'AwaitingDelivery' && deliveryType === 'Delivery') {
                  buttons.push({ templateType: 'shipping', label: 'Shipping Confirmation' });
                }

                // pickup_ready — pickup orders at AwaitingDelivery stage
                if (status === 'AwaitingDelivery' && deliveryType !== 'Delivery') {
                  buttons.push({ templateType: 'pickup_ready', label: 'Pickup Ready' });
                }

                // delivery_complete — once order is complete
                if (status === 'Complete') {
                  buttons.push({ templateType: 'delivery_complete', label: 'Delivery Complete' });
                }

                if (buttons.length === 0) return null;

                return (
                  <>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                        WhatsApp
                      </h4>
                      {buttons.map(({ templateType, label }) => (
                        <Button
                          key={templateType}
                          variant="outline"
                          size="sm"
                          className="w-full text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => setActiveWhatsAppTemplate(templateType)}
                        >
                          <MessageCircle className="h-4 w-4 mr-2" />
                          {label}
                        </Button>
                      ))}
                    </div>
                    <Separator />
                  </>
                );
              })()}

              {/* ── Use Available Inventory (PaymentReceived) */}
              {/* Suppressed for subscription orders (read-only — Pitfall #20). MIRROR in OrderDetail.tsx. */}
              {!isSubscriptionOrder && orderId && (
                <FulfillFromInventoryButton
                  orderId={orderId}
                  orderStatus={order.status}
                  token={user?.token ?? ''}
                />
              )}

              {/* ── Actions ──────────────────────────────── */}
              {isSubscriptionOrder ? (
                /* Pitfall #20: subscription orders are managed in the scheduler, NOT
                   editable from the kanban. Staff still see the order for production
                   but cannot edit/transition/cancel/delete it here. MIRROR in OrderDetail.tsx. */
                <div className="rounded-md border border-violet-200 bg-violet-50 p-3 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1 text-violet-700">
                    <Lock className="h-3.5 w-3.5" />
                    Subscription order (read-only)
                  </h4>
                  <p className="text-xs text-violet-700/80">
                    This order is managed from the subscription scheduler. Edit, status,
                    and cancel actions are disabled here.
                  </p>
                  {order.subscriptionId && order.customerId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-violet-700 border-violet-300 hover:bg-violet-100"
                      onClick={() => {
                        onClose();
                        navigate(
                          `/crm/customers/${order.customerId}/subscriptions/${order.subscriptionId}/week`,
                        );
                      }}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in scheduler
                    </Button>
                  )}
                </div>
              ) : (
              <div>
                <h4 className="text-sm font-semibold mb-2">Actions</h4>
                <div className="space-y-2">
                  <StatusActionButtons
                    orderId={orderId!}
                    status={order.status}
                    hideCancelButton
                    onStatusChange={() => {
                      if (order.status === 'Draft') {
                        setActiveWhatsAppTemplate('payment_request');
                      }
                    }}
                  />

                  {/* Charge via QRIS (Phase 84) — visible ONLY when the order is
                      AwaitingPayment AND the QRIS_ENABLED flag is on. The create
                      action re-checks flag + role + state server-side (D-01). */}
                  {orderId && order.status === 'AwaitingPayment' && qrisConfig?.enabled === true && (
                    <Button
                      className="w-full min-h-[44px] sm:min-h-[36px] text-base sm:text-sm"
                      onClick={() => setShowQrisDialog(true)}
                    >
                      <QrCode className="h-4 w-4 mr-2" />
                      Charge via QRIS
                    </Button>
                  )}

                  {/* Force Complete — manager/admin only */}
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

                  {/* Cancel Order — single compact row */}
                  {!['Cancelled', 'Complete'].includes(order.status) && (
                    <div className="pt-1 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={handleCancel}
                        disabled={isCancelLoading}
                      >
                        {isCancelLoading
                          ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          : <XCircle className="h-3 w-3 mr-1" />}
                        Cancel Order
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Delete Draft — hidden for subscription orders (Pitfall #20). */}
              {!isSubscriptionOrder && order.status === 'Draft' && (
                <div className="border border-destructive rounded-md p-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    Delete Draft Order
                  </Button>
                </div>
              )}

              <Separator />

              {/* ── Audit Trail ──────────────────────────── */}
              {orderId && <AuditTrail orderId={orderId} />}

            </div>
          </>
        )}

        {/* ── Modals & Dialogs ─────────────────────────────────── */}

        {/* WhatsApp Message Modal — generic, serves all template types */}
        {orderId && order && activeWhatsAppTemplate && (
          <Dialog
            open={activeWhatsAppTemplate !== null}
            onOpenChange={(v) => { if (!v) setActiveWhatsAppTemplate(null); }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-green-600" />
                  {WHATSAPP_TEMPLATE_TITLES[activeWhatsAppTemplate]}
                </DialogTitle>
                <DialogDescription>
                  Generate and send a WhatsApp message to {order.customerName ?? (order as any).customer_name}.
                </DialogDescription>
              </DialogHeader>
              <StepWhatsAppTemplate
                orderId={orderId}
                templateType={activeWhatsAppTemplate}
                customerPhone={getField(order, 'customerPhone', 'customer_phone')}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* Force Complete Dialog */}
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

        {/* Delete Draft Dialog */}
        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          title="Delete Order?"
          description={`This will permanently delete order ${order?.orderNumber ?? (order as any)?.order_number}. This action cannot be undone.`}
          onConfirm={handleDelete}
          confirmLabel="Delete"
          variant="destructive"
        />

        {/* Charge via QRIS dialog (Phase 84) */}
        {orderId && (
          <QrisChargeDialog
            open={showQrisDialog}
            orderId={orderId}
            onOpenChange={setShowQrisDialog}
          />
        )}

      </SheetContent>
    </Sheet>
  );
}
