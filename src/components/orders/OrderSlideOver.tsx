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
import { useQuery, useMutation } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  Phone, MapPin, Copy, FileText, MessageCircle,
  ShieldAlert, Pencil, XCircle, Truck, Loader2,
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
import { AuditTrail } from './AuditTrail';
import { StepWhatsAppTemplate } from './StepWhatsAppTemplate';
import { ShippingAgencyButtons } from './ShippingAgencyButtons';
import { ConfirmDialog } from '@/components/shared';
import { FulfillFromInventoryButton } from '@/components/inventory/FulfillFromInventoryButton';
import { OrderItems } from './OrderItems';
import { getStatusColor } from '@/lib/orderConstants';
import { useAuth } from '@/contexts/AuthContext';
import { useConvexDeleteOrder, useConvexUpdateOrderShipping } from '@/hooks/convex';
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
// Urgency Helpers
// ============================================

function getDueDateBadgeClass(dueDate: number | undefined): string {
  if (!dueDate) return '';
  const due = startOfDay(new Date(dueDate));
  if (isPast(due) && !isToday(due)) return 'bg-red-100 text-red-700 font-bold border-red-300';
  if (isToday(due)) return 'bg-red-50 text-red-600 border-red-200';
  if (isTomorrow(due)) return 'bg-amber-50 text-amber-600 border-amber-200';
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

  const order = useQuery(
    api.orders.queries.get,
    orderId ? { id: orderId } : 'skip'
  );

  const forceCompleteMutation = useMutation(api.orders.mutations.statusUpdates.forceComplete);
  const deleteOrder = useConvexDeleteOrder();
  const updateShipping = useConvexUpdateOrderShipping();

  const cancelOrderMut = useMutation(api.orders.mutations.index.cancel);

  // Modal / dialog state
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showForceCompleteDialog, setShowForceCompleteDialog] = useState(false);
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
      setShowWhatsAppModal(true);
    }
  }, [autoShowWhatsApp, order]);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    toast.success('Phone copied to clipboard');
  };

  const handleForceComplete = async () => {
    if (!orderId) return;
    try {
      await forceCompleteMutation({
        orderId,
        token: user?.token ?? '',
        reason: forceCompleteReason || undefined,
      });
      toast.success('Order force-completed successfully');
      setShowForceCompleteDialog(false);
      setForceCompleteReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to force-complete order');
    }
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
                  <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                    EXPEDITED
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
                <p className="text-sm font-medium">
                  {order.customerName ?? (order as any).customer_name}
                </p>
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
                  order.orderLevelDiscount && order.orderLevelDiscountType
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

              {/* Edit Order Items (Draft / AwaitingPayment) */}
              {['Draft', 'AwaitingPayment'].includes(order.status) && orderId && (
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

              {/* ── WhatsApp (AwaitingPayment) ────────────── */}
              {order.status === 'AwaitingPayment' && (
                <>
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-green-700 border-green-300 hover:bg-green-50"
                      onClick={() => setShowWhatsAppModal(true)}
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Send Payment Request via WhatsApp
                    </Button>
                  </div>
                  <Separator />
                </>
              )}

              {/* ── Use Available Inventory (PaymentReceived) */}
              {orderId && (
                <FulfillFromInventoryButton
                  orderId={orderId}
                  orderStatus={order.status}
                  token={user?.token ?? ''}
                />
              )}

              {/* ── Actions ──────────────────────────────── */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Actions</h4>
                <div className="space-y-2">
                  <StatusActionButtons
                    orderId={orderId!}
                    status={order.status}
                    hideCancelButton
                    onStatusChange={() => {
                      if (order.status === 'Draft') {
                        setShowWhatsAppModal(true);
                      }
                    }}
                  />

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

              {/* Delete Draft */}
              {order.status === 'Draft' && (
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

        {/* WhatsApp Payment Request Modal */}
        {orderId && order && (
          <Dialog open={showWhatsAppModal} onOpenChange={setShowWhatsAppModal}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-green-600" />
                  Send Payment Request
                </DialogTitle>
                <DialogDescription>
                  Copy the payment request template and send it to {order.customerName ?? (order as any).customer_name} via WhatsApp.
                </DialogDescription>
              </DialogHeader>
              <StepWhatsAppTemplate
                orderId={orderId}
                templateType="payment_request"
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

      </SheetContent>
    </Sheet>
  );
}
