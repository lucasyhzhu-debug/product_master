import { useState, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ChefHat, ChevronDown, Eye } from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { useQuery, useMutation } from 'convex/react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout';
import { LoadingCards } from '@/components/shared';
import {
  BallCompletionButtons,
  SoundToggle,
  KitchenDashboard,
  KitchenHelpPanel,
  InventoryTray,
  OrderBox,
  FlyingBall,
} from '@/components/orders';
import { playCompletionFanfare, playDing, playClunk, playSoftClick } from '@/lib/kitchenSounds';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '../../convex/_generated/api';

import {
  useConvexKitchenStats,
  useConvexKitchenOrdersWithBalls,
  useConvexCompletedToday,
  useConvexCompleteOrder,
  useConvexRevertToConfirmed,
} from '@/hooks/convex';
import type { Id } from '../../convex/_generated/dataModel';
import { cn } from '@/lib/utils';

// Flying ball animation state type
interface FlyingBallState {
  id: string;
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  ballType: 'original' | 'bite_sized';
  delay: number;
}

export function KitchenView() {
  useDocumentTitle('Kitchen');
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [flyingBalls, setFlyingBalls] = useState<FlyingBallState[]>([]);

  // Loading states for Fill Orders buttons
  const [isFillingOriginal, setIsFillingOriginal] = useState(false);
  const [isFillingBiteSized, setIsFillingBiteSized] = useState(false);

  // Refs for animation positions
  const originalTrayRef = useRef<HTMLDivElement>(null);
  const biteSizedTrayRef = useRef<HTMLDivElement>(null);
  const ordersContainerRef = useRef<HTMLDivElement>(null);

  // Auth context
  const { hasPermission } = useAuth();
  const canEditKitchen = hasPermission('canEditKitchen');

  // Fetch kitchen data
  const { data: stats, isLoading: statsLoading } = useConvexKitchenStats();
  const { data: pendingOrders, isLoading: ordersLoading } = useConvexKitchenOrdersWithBalls();
  const { data: completedToday, isLoading: completedLoading } = useConvexCompletedToday();

  // Tray inventory query
  const trayInventory = useQuery(api.orders.queries.getTrayInventory, {});

  // Mutations
  const completeOrder = useConvexCompleteOrder();
  const revertOrder = useConvexRevertToConfirmed();

  // New tray mutations
  const addBallsToTray = useMutation(api.orders.mutations.addBallsToTray);
  const removeBallFromTray = useMutation(api.orders.mutations.removeBallFromTray);
  const fillPendingOrdersMutation = useMutation(api.orders.mutations.fillPendingOrders);

  // Package status mutations
  const markPackagePacked = useMutation(api.orders.mutations.markPackagePacked);
  const unmarkPackagePacked = useMutation(api.orders.mutations.unmarkPackagePacked);

  const isLoading = statsLoading || ordersLoading || completedLoading;

  // Calculate pending order count AND total balls needed for each ball type
  const { pendingOriginalCount, pendingOriginalBalls } = useMemo(() => {
    if (!pendingOrders) return { pendingOriginalCount: 0, pendingOriginalBalls: 0 };
    let orderCount = 0;
    let totalBalls = 0;
    for (const order of pendingOrders) {
      const originalItems = order.items?.filter(item => item.production_type === "original") ?? [];
      if (originalItems.length > 0) {
        orderCount++;
        // Sum up balls still needed: (quantity * production_units) - balls_filled
        for (const item of originalItems) {
          const totalRequired = (item.quantity ?? 0) * (item.production_units ?? 0);
          const needed = totalRequired - (item.balls_filled ?? 0);
          if (needed > 0) totalBalls += needed;
        }
      }
    }
    return { pendingOriginalCount: orderCount, pendingOriginalBalls: totalBalls };
  }, [pendingOrders]);

  const { pendingBiteSizedCount, pendingBiteSizedBalls } = useMemo(() => {
    if (!pendingOrders) return { pendingBiteSizedCount: 0, pendingBiteSizedBalls: 0 };
    let orderCount = 0;
    let totalBalls = 0;
    for (const order of pendingOrders) {
      const biteSizedItems = order.items?.filter(item => item.production_type === "bite_sized") ?? [];
      if (biteSizedItems.length > 0) {
        orderCount++;
        // Sum up balls still needed: (quantity * production_units) - balls_filled
        for (const item of biteSizedItems) {
          const totalRequired = (item.quantity ?? 0) * (item.production_units ?? 0);
          const needed = totalRequired - (item.balls_filled ?? 0);
          if (needed > 0) totalBalls += needed;
        }
      }
    }
    return { pendingBiteSizedCount: orderCount, pendingBiteSizedBalls: totalBalls };
  }, [pendingOrders]);

  // Trigger flying ball animation
  const triggerFlyingBalls = useCallback(
    (ballType: 'original' | 'bite_sized', count: number) => {
      const trayRef = ballType === 'original' ? originalTrayRef : biteSizedTrayRef;
      const trayRect = trayRef.current?.getBoundingClientRect();
      const ordersRect = ordersContainerRef.current?.getBoundingClientRect();

      if (!trayRect || !ordersRect) return;

      // Start position is center of tray
      const startPos = {
        x: trayRect.left + trayRect.width / 2,
        y: trayRect.top + trayRect.height / 2,
      };

      // End position is top of orders container (approximate target)
      const endPos = {
        x: ordersRect.left + ordersRect.width / 2,
        y: ordersRect.top + 50,
      };

      // Create flying balls (limit to 5 for performance)
      const ballCount = Math.min(count, 5);
      const newBalls: FlyingBallState[] = [];

      for (let i = 0; i < ballCount; i++) {
        // Add slight randomness to end positions for visual interest
        const offsetX = (Math.random() - 0.5) * 100;
        const offsetY = (Math.random() - 0.5) * 30;

        newBalls.push({
          id: `${Date.now()}-${i}`,
          startPosition: startPos,
          endPosition: {
            x: endPos.x + offsetX,
            y: endPos.y + offsetY,
          },
          ballType,
          delay: i * 0.08,
        });
      }

      setFlyingBalls((prev) => [...prev, ...newBalls]);
    },
    []
  );

  const handleCompleteOrder = async (orderId: Id<"orders">) => {
    await completeOrder.mutate(orderId);
  };

  const handleRevertOrder = async (orderId: Id<"orders">) => {
    await revertOrder.mutate(orderId);
  };

  // Add balls to tray (NO auto-distribution)
  const handleAddBallsToTray = async (ballType: 'original' | 'bite_sized', count: number) => {
    try {
      const result = await addBallsToTray({ ballType, count });

      // Play clunk sound for balls landing in tray
      playClunk();

      // Simple toast - no flying animation on add
      const typeName = ballType === 'original' ? 'Original' : 'Bite-sized';
      toast.success(`+${count} ${typeName} (${result.trayCount} in tray)`);
    } catch (error) {
      toast.error('Failed to add balls');
      console.error(error);
    }
  };

  // Fill pending orders with balls from tray
  const handleFillPendingOrders = async (ballType: 'original' | 'bite_sized') => {
    const setLoading = ballType === 'original' ? setIsFillingOriginal : setIsFillingBiteSized;

    // Prevent rapid clicks
    if (isFillingOriginal || isFillingBiteSized) return;

    setLoading(true);

    try {
      const result = await fillPendingOrdersMutation({ ballType });

      if (!result.success) {
        toast.error(result.error || 'No balls distributed');
        return;
      }

      if (result.ballsUsed === 0) {
        toast.info('No pending orders to fill');
        return;
      }

      // Trigger flying ball animation
      triggerFlyingBalls(ballType, result.ballsUsed);

      // Play ding sounds (capped at 3 for UX)
      const dingCount = Math.min(result.ballsUsed, 3);
      for (let i = 0; i < dingCount; i++) {
        setTimeout(() => playDing(), i * 100);
      }

      // Confetti for completed packages
      if (result.packagesCompleted > 0) {
        setTimeout(() => {
          playCompletionFanfare();
          confetti({
            particleCount: 50 * result.packagesCompleted,
            spread: 70,
            origin: { y: 0.6 }
          });
        }, dingCount * 100 + 200);
      }

      // Success toast
      const typeName = ballType === 'original' ? 'Original' : 'Bite-sized';
      let message = `${result.ballsUsed} ${typeName} → ${result.ordersUpdated} order${result.ordersUpdated !== 1 ? 's' : ''}`;
      if (result.overflow > 0) {
        message += ` (${result.overflow} remaining)`;
      }
      toast.success(message);

    } catch (error) {
      toast.error('Failed to fill orders. Please try again.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBall = async (ballType: 'original' | 'bite_sized') => {
    try {
      await removeBallFromTray({ ballType });
      // Silent - no sound for undo
    } catch (error) {
      toast.error('Failed to remove ball');
      console.error(error);
    }
  };

  const handlePackageStatusChange = async (itemId: Id<"orderItems">, newStatus: 'filled' | 'packed', packageIndex: number) => {
    try {
      if (newStatus === 'packed') {
        playSoftClick();
        const result = await markPackagePacked({ orderItemId: itemId, packageIndex });
        // Show toast if order auto-transitioned
        if (result?.statusTransition) {
          const nextStatus = result.statusTransition.to === 'WaitingShipment' ? 'Ready for Shipment' : 'Ready for Pickup';
          toast.success(`Order ${nextStatus}!`, { duration: 3000 });
        }
      } else {
        await unmarkPackagePacked({ orderItemId: itemId, packageIndex });
      }
    } catch (error) {
      toast.error('Failed to update package');
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PageHeader title="Kitchen View" />
          {!canEditKitchen && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              View Only
            </Badge>
          )}
        </div>
        <SoundToggle />
      </div>

      {/* Help Panel - auto-shows on first visit */}
      <KitchenHelpPanel />

      {/* Stats Dashboard */}
      <KitchenDashboard stats={stats} />

      {/* Production Zone - Side by Side Trays */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Original Zone */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <svg width="24" height="22" viewBox="0 0 24 22">
                <ellipse cx="12" cy="11" rx="10" ry="9" fill="#93C572" stroke="#7B3F00" strokeWidth="2.5" />
                <ellipse cx="8" cy="7" rx="3" ry="2" fill="rgba(255,255,255,0.35)" />
              </svg>
              Original
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BallCompletionButtons
              filterBallType="original"
              onComplete={(_, count) => handleAddBallsToTray('original', count)}
              onUndo={() => handleRemoveBall('original')}
              trayInventory={trayInventory ?? undefined}
              disabled={!canEditKitchen}
            />
            <InventoryTray
              ref={originalTrayRef}
              ballType="original"
              count={trayInventory?.originalBallCount ?? 0}
              onFillPendingOrders={() => handleFillPendingOrders('original')}
              pendingOrderCount={pendingOriginalCount}
              pendingBallsNeeded={pendingOriginalBalls}
              isFillingOrders={isFillingOriginal}
            />
          </CardContent>
        </Card>

        {/* Bite-sized Zone */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <svg width="18" height="17" viewBox="0 0 18 17">
                <ellipse cx="9" cy="8.5" rx="7.5" ry="7" fill="#93C572" stroke="#7B3F00" strokeWidth="2" />
                <ellipse cx="6" cy="5" rx="2" ry="1.5" fill="rgba(255,255,255,0.35)" />
              </svg>
              Bite-sized
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BallCompletionButtons
              filterBallType="bite_sized"
              onComplete={(_, count) => handleAddBallsToTray('bite_sized', count)}
              onUndo={() => handleRemoveBall('bite_sized')}
              trayInventory={trayInventory ?? undefined}
              disabled={!canEditKitchen}
            />
            <InventoryTray
              ref={biteSizedTrayRef}
              ballType="bite_sized"
              count={trayInventory?.biteSizedBallCount ?? 0}
              onFillPendingOrders={() => handleFillPendingOrders('bite_sized')}
              pendingOrderCount={pendingBiteSizedCount}
              pendingBallsNeeded={pendingBiteSizedBalls}
              isFillingOrders={isFillingBiteSized}
            />
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <LoadingCards count={4} />
      ) : (
        <>
          {/* Pending Orders Section */}
          <section className="space-y-4" ref={ordersContainerRef}>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ChefHat className="h-5 w-5" />
              Pending Orders
              <span className="text-muted-foreground font-normal">
                ({pendingOrders?.length || 0})
              </span>
            </h2>

            <AnimatePresence mode="popLayout">
              {pendingOrders && pendingOrders.length > 0 ? (
                <motion.div
                  key="orders-list"
                  className="grid grid-cols-1 gap-4"
                  layout
                >
                  {pendingOrders.map((order, index) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100, transition: { duration: 0.3 } }}
                      transition={{ delay: index * 0.05 }}
                      layout
                    >
                      <OrderBox
                        order={{
                          _id: order.id as unknown as Id<"orders">,
                          orderNumber: order.order_number,
                          status: order.status,
                          channel: order.channel ?? undefined,
                          dueDate: order.due_date ? new Date(order.due_date).getTime() : undefined,
                          items: (order.items ?? []).map((item) => ({
                            _id: (item.id as unknown as Id<"orderItems">) ?? ('' as Id<"orderItems">),
                            productName: item.product_name,
                            productVariant: item.product_variant ?? undefined,
                            productionType: item.production_type,
                            productionUnits: item.production_units,
                            quantity: item.quantity,
                            // Use DB packageStatus, fallback to calculated if not set
                            packageStatus: item.package_status ?? (
                              item.balls_filled && item.production_units && item.balls_filled >= (item.quantity * item.production_units)
                                ? 'filled'
                                : item.balls_filled && item.balls_filled > 0
                                  ? 'filling'
                                  : 'empty'
                            ),
                            ballsFilled: item.balls_filled ?? 0,
                            packedPackageIndices: item.packed_package_indices,
                          })),
                          customer: order.customer_name ? { name: order.customer_name } : null,
                        }}
                        onPackageStatusChange={handlePackageStatusChange}
                        onComplete={() => handleCompleteOrder(order.id as unknown as Id<"orders">)}
                        disabled={!canEditKitchen}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <ChefHat className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No pending orders to process.</p>
                      <p className="text-sm mt-2">All caught up!</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Completed Today Section - Collapsible */}
          <section className="space-y-4">
            <button
              onClick={() => setCompletedCollapsed(!completedCollapsed)}
              className="flex items-center gap-2 text-lg font-semibold hover:text-primary transition-colors"
            >
              <span>Completed Today</span>
              <span className="text-muted-foreground font-normal">
                ({completedToday?.length || 0})
              </span>
              <ChevronDown
                className={cn(
                  'h-5 w-5 transition-transform duration-200',
                  !completedCollapsed && 'rotate-180'
                )}
              />
            </button>

            <AnimatePresence>
              {!completedCollapsed && completedToday && completedToday.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="grid grid-cols-1 gap-4 overflow-hidden"
                >
                  {completedToday.map((order, index) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <OrderBox
                        order={{
                          _id: order.id as unknown as Id<"orders">,
                          orderNumber: order.order_number,
                          status: order.status,
                          channel: order.channel ?? undefined,
                          dueDate: order.due_date ? new Date(order.due_date).getTime() : undefined,
                          items: (order.items ?? []).map((item) => ({
                            _id: (item.id as unknown as Id<"orderItems">) ?? ('' as Id<"orderItems">),
                            productName: item.product_name,
                            productVariant: item.product_variant ?? undefined,
                            productionType: item.production_type,
                            productionUnits: item.production_units,
                            quantity: item.quantity,
                            // Use DB packageStatus, fallback to packed for completed orders
                            packageStatus: item.package_status ?? 'packed',
                            ballsFilled: item.balls_filled ?? 0,
                            packedPackageIndices: item.packed_package_indices,
                          })),
                          customer: order.customer_name ? { name: order.customer_name } : null,
                        }}
                        onRevert={() => handleRevertOrder(order.id as unknown as Id<"orders">)}
                        disabled={!canEditKitchen}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {!completedCollapsed && (!completedToday || completedToday.length === 0) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <p>No orders completed today yet.</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </>
      )}

      {/* Flying balls animation layer */}
      <AnimatePresence>
        {flyingBalls.map((ball) => (
          <FlyingBall
            key={ball.id}
            {...ball}
            onComplete={() => {
              setFlyingBalls((prev) => prev.filter((b) => b.id !== ball.id));
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
