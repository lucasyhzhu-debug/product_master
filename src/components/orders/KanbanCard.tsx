/**
 * KanbanCard - Order card for Kanban board columns.
 * Shows customer name, order number, due date with urgency coloring,
 * pricing with discounts, all line items, creator name, and expedited badge.
 *
 * Phase 14 Plan 04: Kanban board UI.
 */
import { format, isToday, isTomorrow, isPast, startOfDay } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

// ============================================
// Types
// ============================================

export interface KanbanOrderItem {
  _id: string;
  productName: string;
  productVariant?: string;
  quantity: number;
  lineTotal: number;
}

export interface KanbanOrder {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  status: string;
  dueDate?: number;
  totalAmount: number;
  totalCost: number;
  totalMargin: number;
  orderLevelDiscount?: number;
  orderLevelDiscountType?: 'amount' | 'percentage';
  voucherDiscountValue?: number;
  finalTotal?: number;
  expedited?: boolean;
  deliveryType?: string;
  deliveryAddress?: string;
  contactWa?: string;
  items: KanbanOrderItem[];
  creatorName: string;
}

interface KanbanCardProps {
  order: KanbanOrder;
  onCardClick: (orderId: string, status: string) => void;
  simplified?: boolean;
}

// ============================================
// Urgency Helpers
// ============================================

type UrgencyLevel = 'default' | 'tomorrow' | 'today' | 'overdue';

function getUrgencyLevel(dueDate: number | undefined): UrgencyLevel {
  if (!dueDate) return 'default';
  const due = startOfDay(new Date(dueDate));
  if (isPast(due) && !isToday(due)) return 'overdue';
  if (isToday(due)) return 'today';
  if (isTomorrow(due)) return 'tomorrow';
  return 'default';
}

const URGENCY_BADGE_CLASSES: Record<UrgencyLevel, string> = {
  default: '',
  tomorrow: 'bg-amber-50 text-amber-600 border-amber-200',
  today: 'bg-red-50 text-red-600 border-red-200',
  overdue: 'bg-red-100 text-red-700 font-bold border-red-300',
};

// ============================================
// Component
// ============================================

export function KanbanCard({ order, onCardClick, simplified = false }: KanbanCardProps) {
  const isCancelled = order.status === 'Cancelled';
  const urgency = isCancelled ? 'default' : getUrgencyLevel(order.dueDate);
  const isExpedited = !isCancelled && order.expedited === true;

  // Calculate discount (order-level + voucher)
  const orderDiscount = order.orderLevelDiscount && order.orderLevelDiscountType
    ? order.orderLevelDiscountType === 'percentage'
      ? order.totalAmount * (order.orderLevelDiscount / 100)
      : order.orderLevelDiscount
    : 0;
  const voucherDiscount = order.voucherDiscountValue ?? 0;
  const discount = orderDiscount + voucherDiscount;
  const discountedTotal = order.finalTotal ?? (order.totalAmount - discount);

  // Format due date
  const dueDateStr = order.dueDate
    ? format(new Date(order.dueDate), 'EEE, MMM d')
    : null;

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${
        isCancelled ? 'opacity-50 border-muted' : isExpedited ? 'border-amber-400 border-2' : ''
      }`}
      onClick={() => onCardClick(order._id, order.status)}
    >
      <CardContent className="p-3 space-y-2">
        {/* Header: Customer name + price, order by + discount */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="font-semibold text-sm truncate">{order.customerName}</p>
              {simplified && isExpedited && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] flex-shrink-0">
                  EXPEDITED
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{order.orderNumber}</span>
              {order.creatorName && <span> &middot; by {order.creatorName}</span>}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-base font-bold text-brand">
              {formatCurrency(discountedTotal)}
            </p>
            {discount > 0 && (
              <div className="flex items-center justify-end gap-1.5">
                <Badge variant="secondary" className="text-[10px] text-orange-600 px-1">
                  -{formatCurrency(discount)}
                </Badge>
                <span className="text-[11px] text-muted-foreground line-through">
                  {formatCurrency(order.totalAmount)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Due date + status badges — hidden in simplified mode */}
        {!simplified && (dueDateStr || isExpedited || isCancelled) && (
          <div className="flex items-center gap-1.5">
            {isCancelled ? (
              <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500 border-gray-300">
                Cancelled
              </Badge>
            ) : (
              <>
                {dueDateStr && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${URGENCY_BADGE_CLASSES[urgency]}`}
                  >
                    {dueDateStr}
                    {urgency === 'overdue' && ' (overdue)'}
                  </Badge>
                )}
                {isExpedited && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">
                    EXPEDITED
                  </Badge>
                )}
              </>
            )}
          </div>
        )}

        {/* Items section */}
        <div className="space-y-0.5">
          {order.items.map((item) => (
            <p key={item._id} className="text-xs text-muted-foreground">
              {item.quantity}x {item.productName}
              {item.productVariant ? ` (${item.productVariant})` : ''}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
