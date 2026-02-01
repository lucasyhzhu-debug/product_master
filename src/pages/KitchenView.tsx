import { useState } from 'react';
import { ChefHat, ChevronDown, Eye } from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout';
import { LoadingCards } from '@/components/shared';
import { BallCompletionButtons, SoundToggle, KitchenDashboard, KitchenOrderCard } from '@/components/orders';
import { playCompletionFanfare, playDing } from '@/lib/kitchenSounds';
import { useAuth } from '@/contexts/AuthContext';

import {
  useConvexKitchenStats,
  useConvexKitchenOrdersWithBalls,
  useConvexCompletedToday,
  useConvexCompleteOrder,
  useConvexRevertToConfirmed,
  useConvexCompleteBalls,
} from '@/hooks/convex';
import type { Id } from '../../convex/_generated/dataModel';
import { cn } from '@/lib/utils';

export function KitchenView() {
  const [completedCollapsed, setCompletedCollapsed] = useState(true);

  // Auth context
  const { hasPermission } = useAuth();
  const canEditKitchen = hasPermission('canEditKitchen');

  // Fetch kitchen data using new hooks
  const { data: stats, isLoading: statsLoading } = useConvexKitchenStats();
  const { data: pendingOrders, isLoading: ordersLoading } = useConvexKitchenOrdersWithBalls();
  const { data: completedToday, isLoading: completedLoading } = useConvexCompletedToday();

  // Mutations (toast notifications are handled inside the hooks)
  const completeOrder = useConvexCompleteOrder();
  const revertOrder = useConvexRevertToConfirmed();
  const { mutateAsync: completeBalls } = useConvexCompleteBalls();

  const isLoading = statsLoading || ordersLoading || completedLoading;

  const handleCompleteOrder = async (orderId: number) => {
    await completeOrder.mutate(orderId as unknown as Id<"orders">);
  };

  const handleRevertOrder = async (orderId: number) => {
    await revertOrder.mutate(orderId as unknown as Id<"orders">);
  };

  const handleCompleteBalls = async (ballType: 'big' | 'mid', count: number) => {
    try {
      const result = await completeBalls({ ballType, count });

      // Play ding sounds staggered for each ball used
      for (let i = 0; i < Math.min(result.ballsUsed, 5); i++) {
        setTimeout(() => playDing(), i * 100);
      }

      // If orders were completed, celebrate!
      if (result.completedOrderIds.length > 0) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        playCompletionFanfare();
      }

      // Build toast message
      let message = `${result.ballsUsed} ${ballType} ball${result.ballsUsed !== 1 ? 's' : ''} applied`;
      if (result.completedOrderIds.length > 0) {
        message += ` - ${result.completedOrderIds.length} order${result.completedOrderIds.length !== 1 ? 's' : ''} completed!`;
      }
      if (result.overflow > 0) {
        message += ` (${result.overflow} overflow)`;
      }

      toast.success(message);
    } catch (error) {
      toast.error('Failed to complete balls');
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
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

      {/* Stats Dashboard */}
      <KitchenDashboard stats={stats} />

      {/* Ball Completion Buttons */}
      <BallCompletionButtons
        onComplete={handleCompleteBalls}
        disabled={!canEditKitchen || !pendingOrders?.length}
      />

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingOrders.map((order) => (
                  <KitchenOrderCard
                    key={order.id}
                    order={order}
                    onComplete={() => handleCompleteOrder(order.id)}
                    onRevert={() => {}}
                    isCompleted={false}
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
                    onRevert={() => handleRevertOrder(order.id)}
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
