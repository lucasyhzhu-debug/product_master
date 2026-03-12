import { useState, useMemo } from 'react';
import { format, isToday, isTomorrow, isPast, startOfDay, differenceInCalendarDays } from 'date-fns';
import { Check, Undo2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { KitchenOrderChecklist } from './KitchenOrderChecklist';
import type { ChecklistItem } from './KitchenOrderChecklist';

export interface PackingOrder {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  status: string;
  deliveryType?: string;
  dueDate?: number;
  expedited?: boolean;
  creatorName?: string;
  productItems: Array<{
    _id: string;
    productName: string;
    productVariant?: string;
    quantity: number;
    menuProductId?: string;
    packageStatus: string;
    isPacked: boolean;
    canPack: boolean;
    availableForPacking: number;
  }>;
  packagingMaterials: Array<{
    componentTypeId: string;
    componentName: string;
    quantityNeeded: number;
  }>;
  allProductsPacked: boolean;
  canMarkReady: boolean;
}

interface KitchenOrderCardProps {
  order: PackingOrder;
  onTogglePack: (orderId: string, orderItemId: string, event?: React.MouseEvent) => void;
  onMarkReady: (orderId: string, event?: React.MouseEvent) => void;
  onSendBack: (orderId: string) => void;
  onOverride?: (orderId: string, orderItemId: string, reason: string) => void;
  canOverride?: boolean;
  disabled: boolean;
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

const URGENCY_TEXT_CLASSES: Record<UrgencyLevel, string> = {
  default: 'text-foreground',
  tomorrow: 'text-amber-600 dark:text-amber-400',
  today: 'text-red-600 dark:text-red-400',
  overdue: 'text-red-700 dark:text-red-400 font-bold',
};

const URGENCY_BORDER_CLASSES: Record<UrgencyLevel, string> = {
  default: 'border-border',
  tomorrow: 'border-amber-300 dark:border-amber-600',
  today: 'border-red-300 dark:border-red-500',
  overdue: 'border-red-400 dark:border-red-600 border-2',
};

function getDueDateLabel(dueDate: number): string {
  const due = new Date(dueDate);
  const now = new Date();
  const daysDiff = differenceInCalendarDays(due, now);
  const dayName = format(due, 'EEE, MMM d');

  if (daysDiff < 0) return `${dayName} \u00b7 OVERDUE`;
  if (daysDiff === 0) return `${dayName} \u00b7 TODAY`;
  if (daysDiff === 1) return `${dayName} \u00b7 TOMORROW`;
  return `${dayName} \u00b7 ${daysDiff} days`;
}

export function KitchenOrderCard({
  order,
  onTogglePack,
  onMarkReady,
  onSendBack,
  onOverride,
  canOverride,
  disabled,
}: KitchenOrderCardProps) {
  const [showSendBackConfirm, setShowSendBackConfirm] = useState(false);

  const urgency = getUrgencyLevel(order.dueDate);

  const checklistItems: ChecklistItem[] = order.productItems.map((item) => ({
    _id: item._id,
    productName: item.productName,
    productVariant: item.productVariant,
    quantity: item.quantity,
    isPacked: item.isPacked,
    canPack: item.canPack,
  }));

  // Progress: packed / total items
  const packedCount = order.productItems.filter((i) => i.isPacked).length;
  const totalCount = order.productItems.length;

  // Due date label
  const dueDateLabel = useMemo(
    () => (order.dueDate ? getDueDateLabel(order.dueDate) : null),
    [order.dueDate]
  );

  return (
    <>
      <div
        className={cn(
          'bg-card rounded-lg shadow-sm overflow-hidden border',
          URGENCY_BORDER_CLASSES[urgency]
        )}
      >
        {/* Header: Due date + customer + order number */}
        <div className="px-3 py-2 border-b border-border space-y-0.5">
          {/* Row 1: Due date + expedited badge + progress */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {dueDateLabel ? (
                <span
                  className={cn(
                    'text-sm font-semibold break-words',
                    URGENCY_TEXT_CLASSES[urgency]
                  )}
                >
                  {dueDateLabel}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">No due date</span>
              )}
              {order.expedited && (
                <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 flex-shrink-0">
                  <Zap className="w-2.5 h-2.5" />
                  EXP
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">
              {packedCount}/{totalCount} packed
            </span>
          </div>

          {/* Row 2: Customer name + order number + delivery badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium break-words">
                {order.customerName}
              </span>
              <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                #{order.orderNumber}
              </span>
            </div>
            {order.deliveryType && (
              <span
                className={cn(
                  'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  order.deliveryType.toLowerCase() === 'pickup'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                )}
              >
                {order.deliveryType.toLowerCase() === 'pickup' ? 'Pickup' : 'Delivery'}
              </span>
            )}
          </div>
        </div>

        {/* Checklist */}
        <div className="px-3 py-2">
          <KitchenOrderChecklist
            items={checklistItems}
            onToggle={(orderItemId, event) => onTogglePack(order._id, orderItemId, event)}
            onOverride={onOverride ? (orderItemId, reason) => onOverride(order._id, orderItemId, reason) : undefined}
            canOverride={canOverride}
            disabled={disabled}
          />
        </div>

        {/* Footer actions */}
        <div className="px-3 py-2 border-t border-border flex items-center gap-2">
          <Button
            size="sm"
            onClick={(e) => onMarkReady(order._id, e)}
            disabled={disabled || !order.allProductsPacked}
            className={cn(
              'flex-1 font-semibold text-sm',
              order.allProductsPacked
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : ''
            )}
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            Complete
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSendBackConfirm(true)}
            disabled={disabled}
            className="text-destructive border-destructive/30 hover:bg-destructive/10 text-xs"
          >
            <Undo2 className="w-3.5 h-3.5 mr-1" />
            Back
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showSendBackConfirm}
        onOpenChange={setShowSendBackConfirm}
        title="Send Back to Order Desk"
        description="Send this order back to the order desk? All packing progress will be reset."
        confirmLabel="Send Back"
        variant="destructive"
        onConfirm={() => {
          onSendBack(order._id);
          setShowSendBackConfirm(false);
        }}
      />
    </>
  );
}
