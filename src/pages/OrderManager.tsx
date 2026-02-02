import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, ShoppingCart, SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/layout';
import { LoadingCards, EmptyState } from '@/components/shared';
import { OrderFormPOS } from '@/components/orders/OrderFormPOS';

import { useConvexOrders, type OrderFilters } from '@/hooks/convex';
import type { OrderSummary, OrderStatus, PaymentStatus } from '@/lib/types';

const STATUS_COLORS: Record<OrderStatus, string> = {
  Draft: 'bg-gray-500',
  AwaitingPayment: 'bg-amber-500',
  Confirmed: 'bg-blue-500',
  InProduction: 'bg-purple-500',      // PRD-7: Kitchen actively producing
  ProductionComplete: 'bg-purple-500', // DEPRECATED
  Packaging: 'bg-indigo-500',
  WaitingShipment: 'bg-yellow-500',
  CompleteShipped: 'bg-green-500',
  WaitingPickup: 'bg-orange-500',
  PickedUp: 'bg-green-500',
  Cancelled: 'bg-red-500',
};

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  Unpaid: 'bg-orange-500',
  Partial: 'bg-yellow-500',
  Paid: 'bg-green-500',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function getWaitingTimeInfo(awaitingSince: string | null): { text: string; color: string } | null {
  if (!awaitingSince) return null;

  const start = new Date(awaitingSince);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  let text: string;
  let color: string;

  if (diffHours < 1) {
    text = `${Math.floor(diffMs / (1000 * 60))}m`;
    color = 'bg-green-100 text-green-700';
  } else if (diffHours < 24) {
    text = `${Math.floor(diffHours)}h`;
    color = 'bg-green-100 text-green-700';
  } else if (diffDays < 2) {
    text = `${Math.floor(diffDays)}d ${Math.floor(diffHours % 24)}h`;
    color = 'bg-yellow-100 text-yellow-700';
  } else {
    text = `${Math.floor(diffDays)}d`;
    color = 'bg-red-100 text-red-700';
  }

  return { text: `Waiting ${text}`, color };
}

interface OrderCardProps {
  order: OrderSummary;
  onClick: () => void;
}

function OrderCard({ order, onClick }: OrderCardProps) {
  const waitingInfo = order.status === 'AwaitingPayment'
    ? getWaitingTimeInfo(order.awaiting_payment_since ?? null)
    : null;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-lg font-bold">{order.order_number}</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-sm font-medium truncate max-w-[120px]">{order.customer_name}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1">
              <Badge className={STATUS_COLORS[order.status]}>{order.status}</Badge>
              <Badge className={PAYMENT_COLORS[order.payment_status]}>
                {order.payment_status}
              </Badge>
            </div>
            {waitingInfo && (
              <Badge className={waitingInfo.color}>{waitingInfo.text}</Badge>
            )}
          </div>
        </div>

        <div className="flex justify-between items-end mt-3">
          <div className="text-sm text-muted-foreground">
            <p>{order.item_count} item{order.item_count > 1 ? 's' : ''}</p>
            {order.due_date && (
              <p>Due: {formatDate(order.due_date)}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">{formatCurrency(order.total_amount)}</p>
            {order.total_discount > 0 && (
              <p className="text-sm text-orange-600 font-semibold">
                -{formatCurrency(order.total_discount)}
              </p>
            )}
          </div>
        </div>

        {(order.channel || order.sold_by) && (
          <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
            {order.channel && <span>{order.channel}</span>}
            {order.sold_by && <span>by {order.sold_by}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// PRD-0: Type-safe status filter
type StatusFilterValue = OrderFilters['status'] | 'all';

export function OrderManager() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Layout breakpoints
  const isNarrow = windowWidth < 1024; // Show form above on narrow screens (< lg)
  const isMobile = windowWidth < 640;  // Use dialog on mobile (< sm)

  const filters: OrderFilters | undefined = statusFilter !== 'all' ? { status: statusFilter } : undefined;
  const { data: orders, isLoading } = useConvexOrders(filters);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    if (!searchQuery) return orders;

    const query = searchQuery.toLowerCase();
    return orders.filter(
      (order) =>
        order.order_number.toLowerCase().includes(query) ||
        order.customer_name.toLowerCase().includes(query) ||
        order.sold_by?.toLowerCase().includes(query)
    );
  }, [orders, searchQuery]);

  const handleOrderClick = (orderId: number) => {
    navigate(`/orders/${orderId}`);
  };

  const handleOrderCreated = () => {
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        action={
          <div className="flex gap-2">
            {/* CSV export removed - would need Convex action implementation */}
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Order
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search orders by number, customer name, or salesperson"
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilterValue)} aria-label="Filter orders by status">
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="AwaitingPayment">Awaiting Payment</SelectItem>
            <SelectItem value="Confirmed">Confirmed</SelectItem>
            <SelectItem value="ProductionComplete">Production Complete</SelectItem>
            <SelectItem value="Packaging">Packaging</SelectItem>
            <SelectItem value="WaitingShipment">Waiting for Shipment</SelectItem>
            <SelectItem value="CompleteShipped">Shipped</SelectItem>
            <SelectItem value="WaitingPickup">Waiting for Pickup</SelectItem>
            <SelectItem value="PickedUp">Picked Up</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Form Above (Narrow screens, non-mobile) */}
      {showForm && isNarrow && !isMobile && (
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="text-xl">New Order</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <OrderFormPOS
              onSuccess={() => handleOrderCreated()}
              onCancel={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      )}

      {/* Content */}
      <div className={`grid gap-6 ${isNarrow ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'}`}>
        {/* Quick Create Form - Main Section (Wide screens only) */}
        {!isNarrow && (
          <div className="lg:col-span-2">
            {showForm ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-xl">New Order</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <OrderFormPOS
                    onSuccess={() => handleOrderCreated()}
                    onCancel={() => setShowForm(false)}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Create New Order</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start a new order with the quick creation form
                  </p>
                  <Button
                    size="lg"
                    onClick={() => setShowForm(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Order
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Order List Sidebar */}
        <div className={isNarrow ? '' : 'lg:col-span-1'}>
          <div className="space-y-4">
            {isLoading ? (
              <LoadingCards count={3} />
            ) : filteredOrders.length === 0 ? (
              orders?.length === 0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title="No orders yet"
                  description="Create your first order to start tracking sales and production."
                  action={{ label: 'Create Order', onClick: () => setShowForm(true) }}
                />
              ) : (
                <EmptyState
                  icon={SearchX}
                  title="No matching orders"
                  description="Try adjusting your search or filters to find what you're looking for."
                />
              )
            ) : (
              <div className="grid gap-4">
                {filteredOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onClick={() => handleOrderClick(order.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Form Modal */}
      {showForm && isMobile && (
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Order</DialogTitle>
            </DialogHeader>
            <OrderFormPOS
              onSuccess={() => handleOrderCreated()}
              onCancel={() => setShowForm(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
