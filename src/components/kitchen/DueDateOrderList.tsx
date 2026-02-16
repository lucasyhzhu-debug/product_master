import { ChefHat } from 'lucide-react';
import { groupByDueDate } from '@/lib/dueDateGrouping';
import { DueDateGroupHeader } from './DueDateGroupHeader';
import { KitchenOrderCard } from './KitchenOrderCard';
import { K3MartSyntheticCard } from './K3MartSyntheticCard';
import type { PackingOrder } from './KitchenOrderCard';
import type { K3MartKitchenSummary } from './K3MartSyntheticCard';

interface DueDateOrderListProps {
  orders: PackingOrder[];
  k3MartSummary?: K3MartKitchenSummary;
  onTogglePack: (orderId: string, orderItemId: string, event?: React.MouseEvent) => void;
  onMarkReady: (orderId: string, event?: React.MouseEvent) => void;
  onSendBack: (orderId: string) => void;
  onOverride?: (orderId: string, orderItemId: string, reason: string) => void;
  onK3MartQuantityChange?: (menuProductId: string, quantity: number) => void;
  canOverride?: boolean;
  canEdit: boolean;
  disabled: boolean;
}

export function DueDateOrderList({
  orders,
  k3MartSummary,
  onTogglePack,
  onMarkReady,
  onSendBack,
  onOverride,
  onK3MartQuantityChange,
  canOverride,
  canEdit,
  disabled,
}: DueDateOrderListProps) {
  const groups = groupByDueDate(orders);

  // Empty state
  if (groups.length === 0 && (!k3MartSummary || k3MartSummary.items.length === 0)) {
    return (
      <div className="px-4 py-12 text-center">
        <ChefHat className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-base font-medium">
          No orders in kitchen
        </p>
      </div>
    );
  }

  // Determine where to place K3Mart card: inside "Due Today" group, or as standalone section
  const todayGroupIndex = groups.findIndex((g) => g.key === 'today');
  const showK3MartStandalone = k3MartSummary && k3MartSummary.items.length > 0 && todayGroupIndex === -1;
  const showK3MartInToday = k3MartSummary && k3MartSummary.items.length > 0 && todayGroupIndex !== -1;

  return (
    <div className="px-4 py-4 space-y-3">
      {/* K3Mart standalone section (when no "Due Today" group exists) */}
      {showK3MartStandalone && (
        <div className="space-y-2">
          <DueDateGroupHeader label="Due Today" orderCount={0} isOverdue={false} />
          <K3MartSyntheticCard
            summary={k3MartSummary!}
            onQuantityChange={onK3MartQuantityChange}
            canEdit={canEdit}
          />
        </div>
      )}

      {/* Due-date groups */}
      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <DueDateGroupHeader
            label={group.label}
            orderCount={group.orderCount}
            isOverdue={group.isOverdue}
          />

          {/* K3Mart card at top of "Due Today" group */}
          {showK3MartInToday && group.key === 'today' && (
            <K3MartSyntheticCard
              summary={k3MartSummary!}
              onQuantityChange={onK3MartQuantityChange}
              canEdit={canEdit}
            />
          )}

          {/* Order cards */}
          {group.orders.map((order) => (
            <KitchenOrderCard
              key={order._id}
              order={order}
              onTogglePack={onTogglePack}
              onMarkReady={onMarkReady}
              onSendBack={onSendBack}
              onOverride={onOverride}
              canOverride={canOverride}
              disabled={disabled}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
