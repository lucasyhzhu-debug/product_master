import { useState } from 'react';
import { Package2, ChevronDown, ChevronRight, Clock, User, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout';
import { LoadingCards } from '@/components/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { cn, formatCurrency } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface ProductionComponent {
  _id: string;
  quantity: number;
  productionUnitType: {
    _id: string;
    code: string;
    name: string;
    color?: string;
  } | null;
}

interface PackagingOrderItem {
  _id: Id<"orderItems">;
  productName: string;
  productVariant?: string;
  quantity: number;
  unitPrice: number;
  menuProductId?: Id<"menuProducts">;
  menuProduct: {
    _id: Id<"menuProducts">;
    code: string;
    name: string;
    cachedProductionSummary?: string;
  } | null;
  productionComponents: ProductionComponent[];
}

interface PackagingOrder {
  _id: Id<"orders">;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  dueDate?: number;
  totalAmount: number;
  itemCount: number;
  items: PackagingOrderItem[];
}

// ============================================
// Component
// ============================================

export function PackagingView() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEditKitchen = hasPermission('canEditKitchen');

  // Fetch packaging orders
  const packagingOrders = useQuery(api.orders.queries.getPackagingOrders, {});
  const updateStatus = useMutation(api.orders.mutations.updateStatus);

  const isLoading = packagingOrders === undefined;

  const handleMarkAsPackaged = async (orderId: Id<"orders">) => {
    try {
      await updateStatus({ orderId, status: "Packaging" });
      toast.success("Order marked as packaged");
    } catch (error) {
      toast.error("Failed to update order status");
      console.error(error);
    }
  };

  const formatDueDate = (timestamp?: number) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    if (isToday) {
      return `Today ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (isTomorrow) {
      return `Tomorrow ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString('id-ID', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PageHeader title="Packaging View" />
          <Badge variant="outline" className="flex items-center gap-1">
            <Package2 className="h-3 w-3" />
            {packagingOrders?.length ?? 0} orders ready
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <LoadingCards count={4} />
      ) : packagingOrders && packagingOrders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(packagingOrders as PackagingOrder[]).map((order) => (
            <PackagingOrderCard
              key={order._id}
              order={order}
              onMarkAsPackaged={() => handleMarkAsPackaged(order._id)}
              onViewOrder={() => navigate(`/orders/${order._id}`)}
              disabled={!canEditKitchen}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No orders ready for packaging.</p>
            <p className="text-sm mt-2">Orders will appear here after production is complete.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================
// Packaging Order Card Component
// ============================================

interface PackagingOrderCardProps {
  order: PackagingOrder;
  onMarkAsPackaged: () => void;
  onViewOrder: () => void;
  disabled?: boolean;
}

function PackagingOrderCard({ order, onMarkAsPackaged, onViewOrder, disabled }: PackagingOrderCardProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg font-bold">
              #{order.orderNumber}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <User className="h-3 w-3" />
              <span>{order.customerName}</span>
            </div>
            {order.customerPhone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span>{order.customerPhone}</span>
              </div>
            )}
          </div>
          {order.dueDate && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDueDate(order.dueDate)}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Items Section */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span>Items ({order.items.length})</span>
        </button>

        {expanded && (
          <div className="space-y-3 pl-6">
            {order.items.map((item) => (
              <PackagingItem key={item._id} item={item} />
            ))}
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-semibold">{formatCurrency(order.totalAmount)}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onViewOrder}
          >
            View Order
          </Button>
          <Button
            className="flex-1"
            onClick={onMarkAsPackaged}
            disabled={disabled}
          >
            <Package2 className="h-4 w-4 mr-2" />
            Mark Packaged
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Packaging Item Component
// ============================================

interface PackagingItemProps {
  item: PackagingOrderItem;
}

function PackagingItem({ item }: PackagingItemProps) {
  // Get production summary from menu product or components
  const productionSummary = item.menuProduct?.cachedProductionSummary ||
    (item.productionComponents.length > 0
      ? item.productionComponents
          .map((c) => `${c.quantity} ${c.productionUnitType?.name ?? 'Unknown'}`)
          .join(', ')
      : null);

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between">
        <div>
          <span className="font-medium">{item.quantity}x</span>{' '}
          <span>{item.productName}</span>
          {item.productVariant && (
            <span className="text-muted-foreground"> ({item.productVariant})</span>
          )}
        </div>
      </div>

      {/* Production components (packaging instructions) */}
      {productionSummary && (
        <div className="flex flex-wrap gap-1">
          {item.productionComponents.map((comp, idx) => (
            <Badge
              key={idx}
              variant="secondary"
              className="text-xs"
              style={{
                backgroundColor: comp.productionUnitType?.color
                  ? `${comp.productionUnitType.color}20`
                  : undefined,
                borderColor: comp.productionUnitType?.color || undefined,
              }}
            >
              {comp.quantity} {comp.productionUnitType?.name ?? 'unit'}
            </Badge>
          ))}
          {item.productionComponents.length === 0 && productionSummary && (
            <span className="text-xs text-muted-foreground">
              {productionSummary}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatDueDate(timestamp?: number) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  if (isToday) {
    return `Today ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (isTomorrow) {
    return `Tomorrow ${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('id-ID', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
