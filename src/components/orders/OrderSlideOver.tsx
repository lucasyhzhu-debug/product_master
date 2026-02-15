/**
 * OrderSlideOver - Right-side slide-over panel for order details.
 * Built on shadcn Sheet component. Shows full order details, items,
 * pricing, and status action buttons.
 *
 * Phase 14 Plan 04: Kanban board UI.
 */
import { format, isToday, isTomorrow, isPast, startOfDay } from 'date-fns';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Phone, MapPin, Copy, FileText, MessageCircle } from 'lucide-react';
import { useState } from 'react';
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
import { StatusActionButtons } from './StatusActionButtons';
import { AuditTrail } from './AuditTrail';
import { StepWhatsAppTemplate } from './StepWhatsAppTemplate';
import { formatCurrency } from '@/lib/utils';
import { getStatusColor } from '@/lib/orderConstants';
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

export function OrderSlideOver({ orderId, open, onClose }: OrderSlideOverProps) {
  const order = useQuery(
    api.orders.queries.get,
    orderId ? { id: orderId } : 'skip'
  );

  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    toast.success('Phone copied to clipboard');
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-y-auto">
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
              <div className="flex items-center gap-3">
                <SheetTitle className="font-mono">{order.orderNumber}</SheetTitle>
                <Badge className={`${getStatusColor(order.status)} text-white text-xs`}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </Badge>
                {order.expedited && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                    EXPEDITED
                  </Badge>
                )}
              </div>
              <SheetDescription>
                Created {format(new Date(order._creationTime), 'MMM d, yyyy h:mm a')}
                {order.createdBy && ` by ${order.createdBy}`}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 mt-6">
              {/* Customer info */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Customer</h4>
                <p className="text-sm font-medium">{order.customerName}</p>
                {order.customerPhone && (
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{order.customerPhone}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleCopyPhone(order.customerPhone!)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {order.deliveryAddress && (
                  <div className="flex items-start gap-2 mt-1">
                    <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
                    <span className="text-sm text-muted-foreground">{order.deliveryAddress}</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Due date */}
              {order.dueDate && (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-1">Due Date</h4>
                    <Badge
                      variant="outline"
                      className={`text-sm ${getDueDateBadgeClass(order.dueDate)}`}
                    >
                      {format(new Date(order.dueDate), 'EEEE, MMM d, yyyy')}
                    </Badge>
                  </div>
                  <Separator />
                </>
              )}

              {/* Items list */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Items</h4>
                <div className="space-y-2">
                  {order.items?.map((item: {
                    _id: string;
                    productName: string;
                    productVariant?: string;
                    quantity: number;
                    unitPrice: number;
                    lineTotal: number;
                    discountAmount?: number;
                  }) => (
                    <div key={item._id} className="flex items-start justify-between text-sm">
                      <div className="flex-1 min-w-0">
                        <p>
                          {item.quantity}x {item.productName}
                          {item.productVariant ? ` (${item.productVariant})` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @ {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                      <p className="font-medium flex-shrink-0 ml-2">
                        {formatCurrency(item.lineTotal)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Pricing summary */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(order.totalAmount)}</span>
                </div>
                {order.orderLevelDiscount && order.orderLevelDiscount > 0 && (
                  <div className="flex justify-between text-sm text-orange-600">
                    <span>
                      Discount
                      {order.orderLevelDiscountType === 'percentage'
                        ? ` (${order.orderLevelDiscount}%)`
                        : ''}
                    </span>
                    <span>
                      -{formatCurrency(
                        order.orderLevelDiscountType === 'percentage'
                          ? order.totalAmount * (order.orderLevelDiscount / 100)
                          : order.orderLevelDiscount
                      )}
                    </span>
                  </div>
                )}
                {order.voucherCode && (
                  <div className="flex justify-between text-sm text-purple-600">
                    <span>Voucher ({order.voucherCode})</span>
                    <span>-{formatCurrency(order.voucherDiscountValue ?? 0)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="text-brand">
                    {formatCurrency(
                      order.finalTotal ??
                        order.totalAmount -
                          (order.orderLevelDiscount && order.orderLevelDiscountType
                            ? order.orderLevelDiscountType === 'percentage'
                              ? order.totalAmount * (order.orderLevelDiscount / 100)
                              : order.orderLevelDiscount
                            : 0) -
                          (order.voucherDiscountValue ?? 0)
                    )}
                  </span>
                </div>
              </div>

              <Separator />

              {/* Notes */}
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

              {/* WhatsApp template (AwaitingPayment -- payment request) */}
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

              {/* Status action buttons */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Actions</h4>
                <StatusActionButtons
                  orderId={orderId!}
                  status={order.status}
                  onStatusChange={() => {
                    // Show WhatsApp modal when order moves to AwaitingPayment (Submit)
                    if (order.status === 'Draft') {
                      setShowWhatsAppModal(true);
                    }
                  }}
                />
              </div>

              <Separator />

              {/* Audit trail */}
              {orderId && <AuditTrail orderId={orderId} />}
            </div>
          </>
        )}

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
                  Copy the payment request template and send it to {order.customerName} via WhatsApp.
                </DialogDescription>
              </DialogHeader>
              <StepWhatsAppTemplate
                orderId={orderId}
                templateType="payment_request"
                customerPhone={order.customerPhone}
              />
            </DialogContent>
          </Dialog>
        )}
      </SheetContent>
    </Sheet>
  );
}
