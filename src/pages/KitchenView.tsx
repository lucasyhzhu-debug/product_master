import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChefHat, ChevronRight, Package, Truck, Clock, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout';
import { LoadingCards } from '@/components/shared';

import { useKitchenOrders, useUpdateOrderStatus } from '@/hooks';
import type { OrderSummary, OrderStatus } from '@/lib/types';

// Status groups for Kitchen View
const STATUS_GROUPS = {
  'To Produce': ['Confirmed'],
  'Production Complete': ['ProductionComplete'],
  'Packaging': ['Packaging'],
  'Ready': ['WaitingShipment', 'WaitingPickup'],
} as const;

const GROUP_ICONS: Record<string, React.ElementType> = {
  'To Produce': ChefHat,
  'Production Complete': Package,
  'Packaging': Package,
  'Ready': Truck,
};

// Next status mapping for quick actions
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  Confirmed: 'ProductionComplete',
  ProductionComplete: 'Packaging',
  // Packaging needs special handling (WaitingShipment or WaitingPickup based on delivery_type)
  WaitingShipment: 'CompleteShipped',
  WaitingPickup: 'PickedUp',
};

function formatTime(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const orderDate = new Date(date);
  orderDate.setHours(0, 0, 0, 0);

  if (orderDate.getTime() === today.getTime()) {
    return `Today ${formatTime(dateString)}`;
  }

  if (orderDate < today) {
    return 'OVERDUE';
  }

  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  }) + ` ${formatTime(dateString)}`;
}

function isOverdue(dateString: string | null): boolean {
  if (!dateString) return false;
  const date = new Date(dateString);
  const now = new Date();
  return date < now;
}

interface KitchenOrderCardProps {
  order: OrderSummary;
  onAdvance: () => void;
  isAdvancing: boolean;
  showAdvanceButton: boolean;
}

function KitchenOrderCard({ order, onAdvance, isAdvancing, showAdvanceButton }: KitchenOrderCardProps) {
  const overdue = isOverdue(order.due_date);

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border ${
        overdue ? 'border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-900' : 'border-border bg-card'
      }`}
    >
      <Link to={`/orders/${order.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-mono font-semibold text-sm">{order.order_number}</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-sm truncate">{order.customer_name}</span>
          <Badge variant="outline" className="text-xs">
            {order.item_count} item{order.item_count !== 1 ? 's' : ''}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {overdue ? (
            <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              OVERDUE
            </span>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(order.due_date)}
            </span>
          )}
          {order.delivery_type && (
            <Badge variant="secondary" className="text-xs">
              {order.delivery_type}
            </Badge>
          )}
        </div>
      </Link>

      {showAdvanceButton && (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.preventDefault();
            onAdvance();
          }}
          disabled={isAdvancing}
          className="ml-2"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

interface StatusGroupProps {
  title: string;
  orders: OrderSummary[];
  onAdvanceOrder: (orderId: number, currentStatus: OrderStatus, deliveryType?: string) => void;
  advancingOrderId: number | null;
}

function StatusGroup({ title, orders, onAdvanceOrder, advancingOrderId }: StatusGroupProps) {
  const Icon = GROUP_ICONS[title] || Package;

  if (orders.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
          <Badge variant="secondary" className="ml-auto">
            {orders.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {orders.map((order) => (
          <KitchenOrderCard
            key={order.id}
            order={order}
            onAdvance={() => onAdvanceOrder(order.id, order.status, order.delivery_type || undefined)}
            isAdvancing={advancingOrderId === order.id}
            showAdvanceButton={
              title !== 'Ready' && // Don't show advance for Ready group (they need special handling)
              title !== 'Packaging' // Packaging needs delivery type consideration
            }
          />
        ))}
      </CardContent>
    </Card>
  );
}

export function KitchenView() {
  const [targetDate, setTargetDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const { data: orders, isLoading } = useKitchenOrders(targetDate);
  const updateStatus = useUpdateOrderStatus();
  const [advancingOrderId, setAdvancingOrderId] = useState<number | null>(null);

  // Group orders by status category
  const groupedOrders = useMemo(() => {
    if (!orders) return {};

    const groups: Record<string, OrderSummary[]> = {};

    for (const [groupName, statuses] of Object.entries(STATUS_GROUPS)) {
      groups[groupName] = orders
        .filter((o) => (statuses as readonly string[]).includes(o.status))
        .sort((a, b) => {
          const aOverdue = isOverdue(a.due_date);
          const bOverdue = isOverdue(b.due_date);

          // Overdue orders first
          if (aOverdue && !bOverdue) return -1;
          if (!aOverdue && bOverdue) return 1;

          // Then by due date (earliest first)
          const aDate = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const bDate = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return aDate - bDate;
        });
    }

    return groups;
  }, [orders]);

  const handleAdvanceOrder = (orderId: number, currentStatus: OrderStatus, deliveryType?: string) => {
    let nextStatus = NEXT_STATUS[currentStatus];

    // Special handling for Packaging → Ready
    if (currentStatus === 'Packaging') {
      nextStatus = deliveryType === 'Pickup' ? 'WaitingPickup' : 'WaitingShipment';
    }

    if (!nextStatus) return;

    setAdvancingOrderId(orderId);
    updateStatus.mutate(
      { id: orderId, status: nextStatus },
      {
        onSettled: () => setAdvancingOrderId(null),
      }
    );
  };

  const totalOrders = orders?.length || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kitchen View"
        action={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="date-filter" className="text-sm text-muted-foreground">
                Date:
              </Label>
              <Input
                id="date-filter"
                type="date"
                aria-label="Filter orders by due date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-auto"
              />
            </div>
            <Badge variant="outline" className="text-sm">
              {totalOrders} order{totalOrders !== 1 ? 's' : ''}
            </Badge>
          </div>
        }
      />

      {isLoading ? (
        <LoadingCards count={4} />
      ) : totalOrders === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ChefHat className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No orders to process for this date.</p>
            <p className="text-sm mt-2">All caught up!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(STATUS_GROUPS).map(([groupName]) => (
            <StatusGroup
              key={groupName}
              title={groupName}
              orders={groupedOrders[groupName] || []}
              onAdvanceOrder={handleAdvanceOrder}
              advancingOrderId={advancingOrderId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
