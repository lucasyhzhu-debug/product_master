import { useState } from 'react';
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
  KitchenOrderCard,
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

export function KitchenView() {
  const [completedCollapsed, setCompletedCollapsed] = useState(true);

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

  // Package status mutations
  const markPackagePacked = useMutation(api.orders.mutations.markPackagePacked);
  const unmarkPackagePacked = useMutation(api.orders.mutations.unmarkPackagePacked);

  const isLoading = statsLoading || ordersLoading || completedLoading;

  const handleCompleteOrder = async (orderId: Id<"orders">) => {
    await completeOrder.mutate(orderId);
  };

  const handleRevertOrder = async (orderId: Id<"orders">) => {
    await revertOrder.mutate(orderId);
  };

  // New tray-based ball completion
  const handleAddBallsToTray = async (ballType: 'original' | 'bite_sized', count: number) => {
    try {
      // Play clunk sound for balls landing in tray
      playClunk();

      const result = await addBallsToTray({ ballType, count });

      // Brief pause for visual effect, then play ding sounds for draining
      if (result.ballsUsed > 0) {
        setTimeout(() => {
          for (let i = 0; i < Math.min(result.ballsUsed, 5); i++) {
            setTimeout(() => playDing(), i * 100);
          }
        }, 200);
      }

      // Celebrate if packages were filled
      if (result.filledPackages.length > 0) {
        confetti({
          particleCount: 50 * result.filledPackages.length,
          spread: 70,
          origin: { y: 0.6 }
        });
        playCompletionFanfare();
      }

      // Build toast message
      const typeName = ballType === 'original' ? 'Original' : 'Bite-sized';
      let message = `+${count} ${typeName}`;
      if (result.ballsUsed > 0) {
        message += ` → ${result.ballsUsed} applied to orders`;
      }
      if (result.overflow > 0) {
        message += ` (${result.overflow} in tray)`;
      }

      toast.success(message);
    } catch (error) {
      toast.error('Failed to add balls');
      console.error(error);
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

  const handlePackageStatusChange = async (itemId: Id<"orderItems">, newStatus: 'filled' | 'packed') => {
    try {
      if (newStatus === 'packed') {
        playSoftClick();
        await markPackagePacked({ orderItemId: itemId });
      } else {
        await unmarkPackagePacked({ orderItemId: itemId });
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
              onComplete={(ballType, count) => {
                if (ballType === 'original') handleAddBallsToTray('original', count);
              }}
              onUndo={(ballType) => {
                if (ballType === 'original') handleRemoveBall('original');
              }}
              trayInventory={trayInventory ?? undefined}
              disabled={!canEditKitchen}
            />
            <InventoryTray
              ballType="original"
              count={trayInventory?.originalBallCount ?? 0}
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
              onComplete={(ballType, count) => {
                if (ballType === 'bite_sized') handleAddBallsToTray('bite_sized', count);
              }}
              onUndo={(ballType) => {
                if (ballType === 'bite_sized') handleRemoveBall('bite_sized');
              }}
              trayInventory={trayInventory ?? undefined}
              disabled={!canEditKitchen}
            />
            <InventoryTray
              ballType="bite_sized"
              count={trayInventory?.biteSizedBallCount ?? 0}
            />
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <LoadingCards count={4} />
      ) : (
        <>
          {/* Pending Orders Section */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ChefHat className="h-5 w-5" />
              Pending Orders
              <span className="text-muted-foreground font-normal">
                ({pendingOrders?.length || 0})
              </span>
            </h2>

            {pendingOrders && pendingOrders.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {pendingOrders.map((order) => (
                  <OrderBox
                    key={order.id}
                    order={{
                      _id: order.id as unknown as Id<"orders">,
                      orderNumber: order.order_number,
                      channel: order.channel ?? undefined,
                      dueDate: order.due_date ? new Date(order.due_date).getTime() : undefined,
                      items: (order.items ?? []).map((item) => ({
                        _id: (item.id as unknown as Id<"orderItems">) ?? ('' as Id<"orderItems">),
                        productName: item.product_name,
                        productVariant: item.product_variant ?? undefined,
                        productionType: item.production_type,
                        productionUnits: item.production_units,
                        quantity: item.quantity,
                        // These fields come from the new system - default to derived values
                        packageStatus: 'empty' as const,
                        ballsFilled: 0,
                      })),
                      customer: order.customer_name ? { name: order.customer_name } : null,
                    }}
                    onPackageStatusChange={handlePackageStatusChange}
                    onComplete={() => handleCompleteOrder(order.id as unknown as Id<"orders">)}
                    disabled={!canEditKitchen}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ChefHat className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pending orders to process.</p>
                  <p className="text-sm mt-2">All caught up!</p>
                </CardContent>
              </Card>
            )}
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

            {!completedCollapsed && completedToday && completedToday.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completedToday.map((order) => (
                  <KitchenOrderCard
                    key={order.id}
                    order={order}
                    onComplete={() => {}}
                    onRevert={() => handleRevertOrder(order.id as unknown as Id<"orders">)}
                    isCompleted={true}
                    disabled={!canEditKitchen}
                  />
                ))}
              </div>
            )}

            {!completedCollapsed && (!completedToday || completedToday.length === 0) && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p>No orders completed today yet.</p>
                </CardContent>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
