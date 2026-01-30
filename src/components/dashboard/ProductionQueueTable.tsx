import { Link } from 'react-router-dom';
import { ChevronRight, Phone, AlertTriangle, ChefHat } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UrgentOrder, OrderStatus } from '@/lib/types';

interface ProductionQueueTableProps {
  orders: UrgentOrder[];
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; color: string }
> = {
  Draft: { label: 'Draft', variant: 'secondary', color: 'text-gray-600' },
  AwaitingPayment: { label: 'Awaiting Payment', variant: 'outline', color: 'text-amber-600' },
  Confirmed: { label: 'Confirmed', variant: 'default', color: 'text-blue-600' },
  ProductionComplete: { label: 'Production Done', variant: 'secondary', color: 'text-purple-600' },
  Packaging: { label: 'Packaging', variant: 'default', color: 'text-indigo-600' },
  WaitingShipment: { label: 'Ready to Ship', variant: 'outline', color: 'text-green-600' },
  CompleteShipped: { label: 'Shipped', variant: 'secondary', color: 'text-green-600' },
  WaitingPickup: { label: 'Ready for Pickup', variant: 'outline', color: 'text-green-600' },
  PickedUp: { label: 'Picked Up', variant: 'secondary', color: 'text-green-600' },
  Cancelled: { label: 'Cancelled', variant: 'destructive', color: 'text-red-600' },
};

function formatDueDate(dateStr: string | null, isOverdue: boolean): string {
  if (!dateStr) return 'No due date';

  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(date);
  dueDate.setHours(0, 0, 0, 0);

  if (isOverdue) {
    const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'OVERDUE (1 day)';
    return `OVERDUE (${diffDays} days)`;
  }

  // Check if today
  if (dueDate.getTime() === today.getTime()) {
    // Show time if available
    const hours = date.getHours();
    const minutes = date.getMinutes();
    if (hours || minutes) {
      return `Today ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    return 'Today';
  }

  // Show date
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  });
}

function formatCurrency(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export function ProductionQueueTable({ orders }: ProductionQueueTableProps) {
  const overdueCount = orders.filter((o) => o.is_overdue).length;

  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Production Queue</CardTitle>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/kitchen">Kitchen View</Link>
            </Button>
          </div>
          <CardDescription>Orders due today or overdue that need attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-24 text-muted-foreground">
            No urgent orders right now
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Production Queue</CardTitle>
            {overdueCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {overdueCount} overdue
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/kitchen">Kitchen View</Link>
          </Button>
        </div>
        <CardDescription>Orders due today or overdue that need attention</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {orders.map((order) => {
            const statusConfig = STATUS_CONFIG[order.status];
            return (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Order Number */}
                  <div className="font-mono text-sm font-medium">#{order.order_number}</div>

                  {/* Customer Info */}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{order.customer_name}</div>
                    {order.customer_phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {order.customer_phone}
                      </div>
                    )}
                  </div>

                  {/* Item Count */}
                  <div className="text-sm text-muted-foreground">
                    {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                  </div>

                  {/* Status Badge */}
                  <Badge variant={statusConfig.variant} className={cn('text-xs', statusConfig.color)}>
                    {statusConfig.label}
                  </Badge>
                </div>

                <div className="flex items-center gap-4">
                  {/* Due Date */}
                  <div
                    className={cn(
                      'text-sm font-medium',
                      order.is_overdue ? 'text-red-600' : 'text-muted-foreground'
                    )}
                  >
                    {order.is_overdue && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                    {formatDueDate(order.due_date, order.is_overdue)}
                  </div>

                  {/* Amount */}
                  <div className="text-sm font-medium w-28 text-right">
                    {formatCurrency(order.total_amount)}
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
        </div>

        {orders.length >= 7 && (
          <div className="p-3 border-t bg-muted/30">
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link to="/orders">View All Orders</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProductionQueueTableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-muted animate-pulse rounded" />
            <div className="h-6 w-32 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-8 w-24 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-4 w-64 bg-muted animate-pulse rounded mt-1" />
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                <div className="h-6 w-20 bg-muted animate-pulse rounded" />
              </div>
              <div className="flex items-center gap-4">
                <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
