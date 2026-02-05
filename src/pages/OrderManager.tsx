import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Search, ShoppingCart, SearchX, ChevronDown, FileEdit, List } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LoadingCards, EmptyState } from '@/components/shared';
import { OrderFormPOS } from '@/components/orders/OrderFormPOS';
import { OrderFormPOS as OrderFormPOSRedesign } from '@/components/orders/OrderFormPOS_Redesign';

import { useConvexOrders, type OrderFilters } from '@/hooks/convex';
import { useFeatureFlag } from '@/lib/featureFlags';
import { formatCurrency } from '@/lib/utils';
import type { OrderSummary } from '@/lib/types';
import {
  STATUS_CATEGORIES,
  CATEGORY_INFO,
  getStatusCategory,
  getStatusDotColor,
  getWaitingTimeInfo,
  formatOrderDate,
  type StatusCategory,
} from '@/lib/orderConstants';

// ============================================
// Compact Order Card
// ============================================

interface OrderCardProps {
  order: OrderSummary;
  onClick: () => void;
}

function OrderCardCompact({ order, onClick }: OrderCardProps) {
  const dotColor = getStatusDotColor(order.status);
  const waitingInfo = order.status === 'AwaitingPayment'
    ? getWaitingTimeInfo(order.awaiting_payment_since ?? null)
    : null;

  // Calculate payment progress percentage
  const paymentProgress = order.payment_status === 'Paid' ? 100 :
                          order.payment_status === 'Partial' ? 50 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className="h-18 cursor-pointer order-card-hover overflow-hidden"
        onClick={onClick}
      >
        <div className="flex items-center gap-3 p-3">
          {/* Status Dot */}
          <div
            className="status-dot flex-shrink-0"
            style={{ backgroundColor: dotColor }}
          />

          {/* Order Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-mono text-sm font-bold text-gray-900">
                {order.order_number}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                {order.customer_name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{order.item_count} item{order.item_count > 1 ? 's' : ''}</span>
              {order.due_date && (
                <>
                  <span>•</span>
                  <span>Due: {formatOrderDate(order.due_date)}</span>
                </>
              )}
              {waitingInfo && (
                <>
                  <span>•</span>
                  <Badge variant="outline" className={`${waitingInfo.color} text-xs px-1 py-0`}>
                    {waitingInfo.text}
                  </Badge>
                </>
              )}
            </div>
          </div>

          {/* Amount */}
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-bold text-terracotta">
              {formatCurrency(order.total_amount)}
            </p>
            {order.total_discount > 0 && (
              <p className="text-xs text-orange-600">
                -{formatCurrency(order.total_discount)}
              </p>
            )}
          </div>
        </div>

        {/* Payment Progress Bar */}
        {paymentProgress > 0 && paymentProgress < 100 && (
          <div className="h-1 bg-gray-100">
            <div
              className="h-full bg-terracotta transition-all"
              style={{ width: `${paymentProgress}%` }}
            />
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// ============================================
// Filter Buttons
// ============================================

type FilterButtonValue = 'all' | StatusCategory;

interface FilterButtonsProps {
  activeFilter: FilterButtonValue;
  onFilterChange: (filter: FilterButtonValue) => void;
  orderCounts: Record<StatusCategory, number>;
}

function FilterButtons({ activeFilter, onFilterChange, orderCounts }: FilterButtonsProps) {
  const mainCategories: Array<{ value: FilterButtonValue; label: string; category?: StatusCategory }> = [
    { value: 'all', label: 'All' },
    { value: 'awaiting', label: 'Awaiting Payment', category: 'awaiting' },
    { value: 'paidReady', label: 'Paid & Ready', category: 'paidReady' },
    { value: 'kitchen', label: 'In Kitchen', category: 'kitchen' },
    { value: 'ready', label: 'Ready Ship/Pick', category: 'ready' },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 md:flex-wrap md:overflow-visible md:pb-0">
      {mainCategories.map(({ value, label, category }) => {
        const isActive = activeFilter === value;
        const count = category ? orderCounts[category] : 0;
        const info = category ? CATEGORY_INFO[category] : null;

        return (
          <Button
            key={value}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => onFilterChange(value)}
            className={`
              min-w-[100px] md:min-w-[120px] transition-all flex-shrink-0
              ${isActive
                ? 'bg-terracotta hover:bg-terracotta-dark text-white shadow-md'
                : 'hover:border-terracotta hover:text-terracotta'
              }
            `}
          >
            <span className="flex items-center gap-1 md:gap-2">
              {info && <span className="text-sm md:text-base">{info.emoji}</span>}
              <span className="text-xs md:text-sm">{label}</span>
              {category && count > 0 && (
                <Badge
                  variant="secondary"
                  className={`ml-1 text-xs ${isActive ? 'bg-white/20 text-white' : ''}`}
                >
                  {count}
                </Badge>
              )}
            </span>
          </Button>
        );
      })}

      {/* More Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={activeFilter === 'completed' ? 'default' : 'outline'}
            size="sm"
            className={`
              ${activeFilter === 'completed'
                ? 'bg-terracotta hover:bg-terracotta-dark text-white'
                : 'hover:border-terracotta'
              }
            `}
          >
            More
            <ChevronDown className="ml-1 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onFilterChange('completed')}>
            <span className="flex items-center gap-2">
              <span>{CATEGORY_INFO.completed.emoji}</span>
              <span>{CATEGORY_INFO.completed.label}</span>
              {orderCounts.completed > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {orderCounts.completed}
                </Badge>
              )}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ============================================
// Orders Queue Sidebar
// ============================================

interface OrdersQueueProps {
  orders: OrderSummary[];
  activeFilter: FilterButtonValue;
  onOrderClick: (orderId: number) => void;
}

function OrdersQueue({ orders, activeFilter, onOrderClick }: OrdersQueueProps) {
  // Group orders by category
  const groupedOrders = useMemo(() => {
    const groups: Record<StatusCategory, OrderSummary[]> = {
      awaiting: [],
      paidReady: [],
      kitchen: [],
      ready: [],
      completed: [],
    };

    orders.forEach((order) => {
      const category = getStatusCategory(order.status);
      groups[category].push(order);
    });

    return groups;
  }, [orders]);

  // Calculate today's stats
  const todayStats = useMemo(() => {
    const today = new Date().toDateString();
    const todayOrders = orders.filter((o) =>
      new Date(o.created_at).toDateString() === today
    );
    const totalAmount = todayOrders.reduce((sum, o) => sum + o.total_amount, 0);

    return {
      count: todayOrders.length,
      amount: totalAmount,
    };
  }, [orders]);

  // Determine which categories to show
  const categoriesToShow = activeFilter === 'all'
    ? (['awaiting', 'paidReady', 'kitchen', 'ready'] as StatusCategory[])
    : [activeFilter as StatusCategory];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto order-queue-scroll pr-2">
        <AnimatePresence mode="wait">
          {categoriesToShow.map((category) => {
            const categoryOrders = groupedOrders[category];
            const info = CATEGORY_INFO[category];

            if (categoryOrders.length === 0 && activeFilter !== 'all') {
              return (
                <motion.div
                  key={category}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12 text-muted-foreground"
                >
                  <p>No orders in {info.label.toLowerCase()}</p>
                </motion.div>
              );
            }

            if (categoryOrders.length === 0) return null;

            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6"
              >
                {/* Section Header */}
                <div className="sticky top-0 bg-background z-10 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{info.emoji}</span>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                      {info.label}
                    </h3>
                    <Badge className={`${info.color} text-white`}>
                      {categoryOrders.length}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {info.description}
                  </p>
                </div>

                {/* Orders */}
                <div className="space-y-2">
                  {categoryOrders.map((order) => (
                    <OrderCardCompact
                      key={order.id}
                      order={order}
                      onClick={() => onOrderClick(order.id)}
                    />
                  ))}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Today's Stats Footer */}
      <div className="mt-4 pt-4 border-t bg-gradient-to-r from-[var(--color-dark-gradient-from)] to-[var(--color-dark-gradient-to)] text-white p-4 rounded-lg -mx-2">
        <div className="flex justify-between items-center text-sm">
          <span>📊 Today:</span>
          <span className="font-bold">
            {todayStats.count} orders • {formatCurrency(todayStats.amount)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function OrderManager() {
  useDocumentTitle('Orders');
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<FilterButtonValue>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'form' | 'queue'>('form');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Feature flag for order form redesign
  const useRedesign = useFeatureFlag('order_form_redesign');
  const FormComponent = useRedesign ? OrderFormPOSRedesign : OrderFormPOS;

  // Mobile breakpoint detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Build filters for backend query
  const filters: OrderFilters | undefined = useMemo(() => {
    if (activeFilter === 'all') return undefined;
    const statuses = STATUS_CATEGORIES[activeFilter as StatusCategory];
    return { status: statuses as any };
  }, [activeFilter]);

  const { data: orders, isLoading } = useConvexOrders(filters);

  // Apply search filter
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

  // Calculate order counts by category
  const orderCounts = useMemo(() => {
    const counts: Record<StatusCategory, number> = {
      awaiting: 0,
      paidReady: 0,
      kitchen: 0,
      ready: 0,
      completed: 0,
    };

    if (!orders) return counts;

    orders.forEach((order) => {
      const category = getStatusCategory(order.status);
      counts[category]++;
    });

    return counts;
  }, [orders]);

  const handleOrderClick = (orderId: number) => {
    navigate(`/orders/${orderId}`);
  };

  const handleOrderCreated = () => {
    // Form will handle success toast, just refresh will happen automatically
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold order-heading text-gray-900 mb-1">
          Orders
        </h1>
        <div className="w-16 h-1 bg-terracotta rounded-full mb-3 md:mb-4" />

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search orders by number, customer, or salesperson"
            placeholder={isMobile ? "Search..." : "Search orders... ⌘K"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 focus-terracotta"
          />
        </div>
      </div>

      {/* Mobile Tab Navigation */}
      {isMobile && (
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('form')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 font-medium transition-all ${
              activeTab === 'form'
                ? 'text-terracotta border-b-2 border-terracotta -mb-[1px]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileEdit className="h-4 w-4" />
            <span>New Order</span>
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 font-medium transition-all ${
              activeTab === 'queue'
                ? 'text-terracotta border-b-2 border-terracotta -mb-[1px]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <List className="h-4 w-4" />
            <span>
              Queue {orders && orders.length > 0 && `(${orders.length})`}
            </span>
          </button>
        </div>
      )}

      {/* Filter Buttons - Scrollable on mobile */}
      <div className={isMobile ? 'overflow-x-auto -mx-4 px-4' : ''}>
        <FilterButtons
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          orderCounts={orderCounts}
        />
      </div>

      {/* Main Content - Responsive Layout */}
      {isMobile ? (
        /* Mobile: Tab-based single column */
        <AnimatePresence mode="wait">
          {activeTab === 'form' ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <FormComponent
                onSuccess={handleOrderCreated}
                onCancel={() => {}}
              />
            </motion.div>
          ) : (
            <motion.div
              key="queue"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="min-h-[60vh]"
            >
              {isLoading ? (
                <LoadingCards count={3} />
              ) : filteredOrders.length === 0 ? (
                orders?.length === 0 ? (
                  <EmptyState
                    icon={ShoppingCart}
                    title="No orders yet"
                    description="Orders will appear here once created."
                  />
                ) : (
                  <EmptyState
                    icon={SearchX}
                    title="No matching orders"
                    description="Try adjusting your search or filters."
                  />
                )
              ) : (
                <OrdersQueue
                  orders={filteredOrders}
                  activeFilter={activeFilter}
                  onOrderClick={handleOrderClick}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        /* Desktop: Golden Ratio Layout */
        <div className="flex gap-6">
          {/* Form Section - 61.8% */}
          <div className="flex-[618] min-w-0">
            <FormComponent
              onSuccess={handleOrderCreated}
              onCancel={() => {}}
            />
          </div>

          {/* Orders Queue - 38.2% */}
          <div className="flex-[382] min-w-0">
            <Card className="h-[calc(100vh-280px)] sticky top-6">
              <div className="p-4 h-full">
                {isLoading ? (
                  <LoadingCards count={3} />
                ) : filteredOrders.length === 0 ? (
                  orders?.length === 0 ? (
                    <EmptyState
                      icon={ShoppingCart}
                      title="No orders yet"
                      description="Orders will appear here once created."
                    />
                  ) : (
                    <EmptyState
                      icon={SearchX}
                      title="No matching orders"
                      description="Try adjusting your search or filters."
                    />
                  )
                ) : (
                  <OrdersQueue
                    orders={filteredOrders}
                    activeFilter={activeFilter}
                    onOrderClick={handleOrderClick}
                  />
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
