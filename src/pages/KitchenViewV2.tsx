/**
 * KitchenView V3 - Swipeable 4-panel kitchen production workflow
 *
 * Mobile-first redesign with batch production model:
 * Panel 1: Production Log (ball input + targets)
 * Panel 2: To Box (batch boxing by product type)
 * Panel 3: To Sticker (batch stickering by product type)
 * Panel 4: To Pack (per-order packing checklist)
 *
 * Desktop (1024px+): side-by-side panels with sidebar
 * Mobile (<768px): swipeable panels with station pill bar
 */

import { useState, useEffect } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LoadingCards } from '@/components/shared';
import {
  SwipeableKitchenLayout,
  ProductionLogPanel,
  BoxingPanel,
  StickeringPanel,
  PackingPanel,
} from '@/components/kitchen';
import { useKitchenProduction } from '@/hooks/convex/useKitchenProduction';
import { useProtectedMutation } from '@/hooks/convex/useProtectedMutation';
import { useAuth } from '@/contexts/AuthContext';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { toast } from 'sonner';
import type { Id } from '../../convex/_generated/dataModel';

export function KitchenViewV2() {
  useDocumentTitle('Kitchen Production');

  const { hasPermission } = useAuth();
  const canEditKitchen = hasPermission('canEditKitchen');

  // Active panel for mobile swipe
  const [activePanel, setActivePanel] = useState(0);

  // Combined kitchen data hook
  const {
    isLoading,
    productionCounts,
    packingOrders,
    trayInventory,
    kitchenStats,
    productionTargets,
  } = useKitchenProduction();

  // Mutations - ball tray (legacy, no auth)
  const addBallsToTray = useMutation(api.orders.mutations.addBallsToTray);
  const removeBallFromTray = useMutation(api.orders.mutations.removeBallFromTray);

  // Mutations - new kitchen V3 (protected with auth)
  const boxProducts = useProtectedMutation(api.orders.mutations.boxProducts);
  const stickerProducts = useProtectedMutation(api.orders.mutations.stickerProducts);
  const togglePackOrderLineItem = useProtectedMutation(api.orders.mutations.togglePackOrderLineItem);
  const markOrderReady = useProtectedMutation(api.orders.mutations.markOrderReady);

  // Wake lock to prevent phone sleep
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake lock not supported or denied - silently ignore
      }
    };

    requestWakeLock();

    // Re-acquire on visibility change (e.g., switching tabs)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLock?.release();
    };
  }, []);

  // Handlers - Ball tray
  const handleAddBalls = async (ballType: 'original' | 'bite_sized', count: number) => {
    try {
      await addBallsToTray({ ballType, count });
      toast.success(`+${count} balls added`);
    } catch {
      toast.error('Failed to add balls');
    }
  };

  const handleRemoveBall = async (ballType: 'original' | 'bite_sized') => {
    try {
      await removeBallFromTray({ ballType });
    } catch {
      toast.error('Failed to remove ball');
    }
  };

  // Handlers - Boxing
  const handleBoxProducts = async (menuProductId: string, quantity: number) => {
    try {
      await boxProducts({
        menuProductId: menuProductId as Id<'menuProducts'>,
        quantity,
      });
      const action = quantity > 0 ? 'Boxed' : 'Unboxed';
      toast.success(`${action} ${Math.abs(quantity)}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to box products';
      toast.error(msg);
    }
  };

  // Handlers - Stickering
  const handleStickerProducts = async (menuProductId: string, quantity: number) => {
    try {
      await stickerProducts({
        menuProductId: menuProductId as Id<'menuProducts'>,
        quantity,
      });
      const action = quantity > 0 ? 'Stickered' : 'Unstickered';
      toast.success(`${action} ${Math.abs(quantity)}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to sticker products';
      toast.error(msg);
    }
  };

  // Handlers - Packing
  const handleTogglePack = async (orderId: string, orderItemId: string) => {
    try {
      await togglePackOrderLineItem({
        orderId: orderId as Id<'orders'>,
        orderItemId: orderItemId as Id<'orderItems'>,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to toggle pack';
      toast.error(msg);
    }
  };

  const handleMarkOrderReady = async (orderId: string) => {
    try {
      await markOrderReady({
        orderId: orderId as Id<'orders'>,
      });
      toast.success('Order marked as ready!');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to mark order ready';
      toast.error(msg);
    }
  };

  // Station counts for pill bar badges
  const stationCounts: [number, number, number, number] = [
    0, // Production: no count needed
    productionCounts?.length ?? 0, // Boxing: products to box
    productionCounts?.filter(p => p.availableForStickering > 0).length ?? 0, // Stickering
    packingOrders?.length ?? 0, // Packing: orders to pack
  ];

  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  return (
    <div className="min-h-screen bg-[#F8F6F3]">
      {/* Header */}
      <header className="bg-white border-b border-[#E8E2DB] shadow-sm sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Kitchen</h1>
              {!canEditKitchen && (
                <Badge variant="secondary" className="flex items-center gap-1.5 text-sm">
                  <Eye className="h-3.5 w-3.5" />
                  View Only
                </Badge>
              )}
            </div>
            <div className="text-sm text-gray-600 font-medium">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile: Swipeable Panels */}
      <SwipeableKitchenLayout
        activeIndex={activePanel}
        onIndexChange={setActivePanel}
        stationCounts={stationCounts}
      >
        <ProductionLogPanel
          trayInventory={trayInventory}
          kitchenStats={kitchenStats}
          productionTargets={productionTargets}
          onAddBalls={handleAddBalls}
          onRemoveBall={handleRemoveBall}
          disabled={!canEditKitchen}
        />
        <BoxingPanel
          productionCounts={productionCounts}
          trayInventory={trayInventory}
          onBoxProducts={handleBoxProducts}
          disabled={!canEditKitchen}
        />
        <StickeringPanel
          productionCounts={productionCounts}
          onStickerProducts={handleStickerProducts}
          disabled={!canEditKitchen}
        />
        <PackingPanel
          packingOrders={packingOrders}
          onTogglePack={handleTogglePack}
          onMarkOrderReady={handleMarkOrderReady}
          disabled={!canEditKitchen}
        />
      </SwipeableKitchenLayout>

      {/* Desktop: Side-by-side layout */}
      <div className="hidden md:block px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1">
            <h2 className="text-lg font-bold text-gray-900 mb-3 px-1" style={{ color: 'var(--color-station-production-accent)' }}>
              Production Log
            </h2>
            <ProductionLogPanel
              trayInventory={trayInventory}
              kitchenStats={kitchenStats}
              productionTargets={productionTargets}
              onAddBalls={handleAddBalls}
              onRemoveBall={handleRemoveBall}
              disabled={!canEditKitchen}
            />
          </div>
          <div className="lg:col-span-1">
            <h2 className="text-lg font-bold text-gray-900 mb-3 px-1" style={{ color: 'var(--color-station-boxing-accent)' }}>
              To Box
            </h2>
            <BoxingPanel
              productionCounts={productionCounts}
              trayInventory={trayInventory}
              onBoxProducts={handleBoxProducts}
              disabled={!canEditKitchen}
            />
          </div>
          <div className="lg:col-span-1">
            <h2 className="text-lg font-bold text-gray-900 mb-3 px-1" style={{ color: 'var(--color-station-stickering-accent)' }}>
              To Sticker
            </h2>
            <StickeringPanel
              productionCounts={productionCounts}
              onStickerProducts={handleStickerProducts}
              disabled={!canEditKitchen}
            />
          </div>
          <div className="lg:col-span-1">
            <h2 className="text-lg font-bold text-gray-900 mb-3 px-1" style={{ color: 'var(--color-station-packing-accent)' }}>
              To Pack
            </h2>
            <PackingPanel
              packingOrders={packingOrders}
              onTogglePack={handleTogglePack}
              onMarkOrderReady={handleMarkOrderReady}
              disabled={!canEditKitchen}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
