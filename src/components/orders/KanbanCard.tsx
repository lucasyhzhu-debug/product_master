/**
 * KanbanCard - Order card for Kanban board columns.
 * Shows customer name, order number, due date with urgency coloring,
 * pricing with discounts, all line items, creator name, and expedited badge.
 * Supports "my orders" (blue ring) and "orders with notes" (amber ring) highlights.
 *
 * Phase 14 Plan 04: Kanban board UI.
 * Quick 23: highlight my orders and orders with notes.
 */
import { format, isToday, isTomorrow, isPast, startOfDay } from 'date-fns';
import { Link } from 'react-router-dom';
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
  // CR-D: stripped (undefined) for non-managers on subscription orders.
  lineTotal?: number;
}

export interface KanbanOrder {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerId?: string;
  customerPhone?: string;
  status: string;
  dueDate?: number;
  // CR-D: money fields are stripped (undefined) for non-managers on subscription
  // orders (server-side strip). Card renders "—" when undefined.
  totalAmount?: number;
  totalCost?: number;
  totalMargin?: number;
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
  notes?: string;
  createdByUserId?: string;
}

interface KanbanCardProps {
  order: KanbanOrder;
  onCardClick: (orderId: string, status: string) => void;
  simplified?: boolean;
  isMine?: boolean;
  highlightMine?: boolean;
  highlightNotes?: boolean;
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
  tomorrow: 'bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] border-[var(--color-status-warning)]/30',
  today: 'bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] border-[var(--color-status-error)]/30',
  overdue: 'bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] font-bold border-[var(--color-status-error)]/30',
};

// ============================================
// Component
// ============================================

export function KanbanCard({
  order,
  onCardClick,
  simplified = false,
  isMine,
  highlightMine,
  highlightNotes,
}: KanbanCardProps) {
  const isCancelled = order.status === 'Cancelled';
  const urgency = isCancelled ? 'default' : getUrgencyLevel(order.dueDate);
  const isExpedited = !isCancelled && order.expedited === true;

  // Compute highlight state
  const hasMineHighlight = !isCancelled && highlightMine && isMine;
  const hasNotesHighlight = !isCancelled && highlightNotes && !!order.notes;

  // Build border/ring class string
  // Expedited amber border takes precedence over notes highlight when both exist
  let highlightClass = '';
  if (hasMineHighlight && hasNotesHighlight) {
    // Combined: blue ring for mine + amber left border for notes
    highlightClass = 'ring-2 ring-blue-400 border-l-4 border-l-amber-400';
  } else if (hasMineHighlight) {
    highlightClass = 'ring-2 ring-blue-400';
  } else if (hasNotesHighlight && !isExpedited) {
    highlightClass = 'ring-1 ring-amber-300';
  }

  // CR-D: money may be stripped (undefined) for non-managers on subscription
  // orders. When stripped, skip discount math and render "—" for the total.
  const moneyStripped = order.totalAmount === undefined && order.finalTotal === undefined;

  // Calculate discount (order-level + voucher)
  const orderDiscount = order.orderLevelDiscount && order.orderLevelDiscountType && order.totalAmount !== undefined
    ? order.orderLevelDiscountType === 'percentage'
      ? order.totalAmount * (order.orderLevelDiscount / 100)
      : order.orderLevelDiscount
    : 0;
  const voucherDiscount = order.voucherDiscountValue ?? 0;
  const discount = moneyStripped ? 0 : orderDiscount + voucherDiscount;
  const discountedTotal = moneyStripped
    ? undefined
    : order.finalTotal ?? ((order.totalAmount ?? 0) - discount);

  // Format due date
  const dueDateStr = order.dueDate
    ? format(new Date(order.dueDate), 'EEE, MMM d')
    : null;

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${
        isCancelled ? 'opacity-50 border-muted' : isExpedited ? 'border-amber-400 border-2' : ''
      } ${highlightClass}`}
      onClick={() => onCardClick(order._id, order.status)}
    >
      <CardContent className="p-3 space-y-2">
        {/* Header: Customer name + price, order by + discount */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {order.customerId ? (
              <Link
                to={`/crm/customers/${order.customerId}`}
                className="font-semibold text-sm hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {order.customerName}
              </Link>
            ) : (
              <p className="font-semibold text-sm">{order.customerName}</p>
            )}
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
              <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-border">
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
                  <Badge className="bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] border-[var(--color-status-warning)]/30 text-[10px]">
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

        {/* Notes display */}
        {order.notes && (
          <p className="text-xs text-[var(--color-status-warning)] bg-[var(--color-status-warning-bg)] rounded px-1.5 py-0.5 line-clamp-2">
            {order.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
