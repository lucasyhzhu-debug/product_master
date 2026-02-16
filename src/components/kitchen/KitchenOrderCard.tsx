import { useState } from 'react';
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
  disabled: boolean;
}

export function KitchenOrderCard({
  order,
  onTogglePack,
  onMarkReady,
  onSendBack,
  disabled,
}: KitchenOrderCardProps) {
  const [showSendBackConfirm, setShowSendBackConfirm] = useState(false);

  const checklistItems: ChecklistItem[] = order.productItems.map((item) => ({
    _id: item._id,
    productName: item.productName,
    productVariant: item.productVariant,
    quantity: item.quantity,
    isPacked: item.isPacked,
    canPack: item.canPack,
  }));

  return (
    <>
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-lg font-bold">
                #{order.orderNumber}
              </span>
              {order.expedited && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  <Zap className="w-3 h-3" />
                  EXPEDITED
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {order.customerName}
            </p>
          </div>
          {order.deliveryType && (
            <span
              className={cn(
                'flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                order.deliveryType.toLowerCase() === 'pickup'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              )}
            >
              {order.deliveryType.toLowerCase() === 'pickup' ? 'Pickup' : 'Delivery'}
            </span>
          )}
        </div>

        {/* Checklist */}
        <div className="px-4 py-3">
          <KitchenOrderChecklist
            items={checklistItems}
            onToggle={(orderItemId, event) => onTogglePack(order._id, orderItemId, event)}
            disabled={disabled}
          />
        </div>

        {/* Footer actions */}
        <div className="px-4 py-3 border-t border-border flex items-center gap-2">
          <Button
            onClick={(e) => onMarkReady(order._id, e)}
            disabled={disabled || !order.allProductsPacked}
            className={cn(
              'flex-1 font-semibold',
              order.allProductsPacked
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : ''
            )}
          >
            <Check className="w-4 h-4 mr-1.5" />
            Complete Order
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSendBackConfirm(true)}
            disabled={disabled}
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <Undo2 className="w-4 h-4 mr-1" />
            Send Back
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
