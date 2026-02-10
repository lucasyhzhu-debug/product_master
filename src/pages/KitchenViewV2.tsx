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

import { useState, useEffect, useMemo } from 'react';
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
import { actionToast } from '@/lib/actionToast';
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
    productTargets,
    orderProductDemand,
    today,
  } = useKitchenProduction();

  // Mutations - ball tray (legacy, no auth)
  const addBallsToTray = useMutation(api.orders.mutations.addBallsToTray);

  // Mutations - production targets (protected with auth)
  const setProductTarget = useProtectedMutation(api.productionTargets.mutations.setProductTarget);

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
  const handleAddBalls = async (ballType: 'original' | 'bite_sized', count: number, event?: React.MouseEvent) => {
    try {
      await addBallsToTray({ ballType, count });
      const message = count > 0 ? `+${count} balls added` : `${count} balls removed`;
      actionToast(message, event);
    } catch {
      toast.error(count > 0 ? 'Failed to add balls' : 'Failed to remove balls');
    }
  };

  // Handlers - Boxing
  const handleBoxProducts = async (menuProductId: string, quantity: number, event?: React.MouseEvent) => {
    try {
      await boxProducts({
        menuProductId: menuProductId as Id<'menuProducts'>,
        quantity,
      });
      const action = quantity > 0 ? 'Boxed' : 'Unboxed';
      actionToast(`${action} ${Math.abs(quantity)}`, event);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to box products';
      toast.error(msg);
    }
  };

  // Handlers - Stickering
  const handleStickerProducts = async (menuProductId: string, quantity: number, event?: React.MouseEvent) => {
    try {
      await stickerProducts({
        menuProductId: menuProductId as Id<'menuProducts'>,
        quantity,
      });
      const action = quantity > 0 ? 'Stickered' : 'Unstickered';
      actionToast(`${action} ${Math.abs(quantity)}`, event);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to sticker products';
      toast.error(msg);
    }
  };

  // Handlers - Packing
  const handleTogglePack = async (orderId: string, orderItemId: string, event?: React.MouseEvent) => {
    try {
      await togglePackOrderLineItem({
        orderId: orderId as Id<'orders'>,
        orderItemId: orderItemId as Id<'orderItems'>,
      });
      actionToast('Packed', event);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to toggle pack';
      toast.error(msg);
    }
  };

  const handleMarkOrderReady = async (orderId: string, event?: React.MouseEvent) => {
    try {
      await markOrderReady({
        orderId: orderId as Id<'orders'>,
      });
      actionToast('Order marked as ready!', event);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to mark order ready';
      toast.error(msg);
    }
  };

  // Handler - Set product target (source: "consignment" | "gofood")
  const handleSetProductTarget = async (menuProductId: string, source: string, quantity: number) => {
    try {
      await setProductTarget({
        date: today,
        source,
        menuProductId: menuProductId as Id<'menuProducts'>,
        quantity,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to set target';
      toast.error(msg);
    }
  };

  // Aggregate "packages needed from orders" per menuProductId
  const neededFromOrders = useMemo(() => {
    if (!packingOrders) return {};
    const map: Record<string, number> = {};
    for (const order of packingOrders) {
      for (const item of order.productItems) {
        if (item.menuProductId && !item.isPacked) {
          map[item.menuProductId] = (map[item.menuProductId] ?? 0) + item.quantity;
        }
      }
    }
    return map;
  }, [packingOrders]);

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
          productionCounts={productionCounts}
          productTargets={productTargets}
          orderProductDemand={orderProductDemand}
          onAddBalls={handleAddBalls}

          onSetProductTarget={handleSetProductTarget}
          disabled={!canEditKitchen}
        />
        <BoxingPanel
          productionCounts={productionCounts}
          trayInventory={trayInventory}
          neededFromOrders={neededFromOrders}
          onBoxProducts={handleBoxProducts}
          disabled={!canEditKitchen}
        />
        <StickeringPanel
          productionCounts={productionCounts}
          neededFromOrders={neededFromOrders}
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
              productionCounts={productionCounts}
              productTargets={productTargets}
              orderProductDemand={orderProductDemand}
              onAddBalls={handleAddBalls}
    
              onSetProductTarget={handleSetProductTarget}
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
