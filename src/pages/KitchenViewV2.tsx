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
import { useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { ConvexError } from 'convex/values';
import { toast } from 'sonner';
import { actionToast } from '@/lib/actionToast';
import type { Id } from '../../convex/_generated/dataModel';

/** Extract error message from ConvexError or regular Error */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) return String(error.data);
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Map backend error messages to human-friendly copy for kitchen staff */
function friendlyCopy(msg: string): string {
  if (msg.includes('Insufficient balls')) {
    const match = msg.match(/need (\d+), have (\d+)/);
    return match ? `Not enough balls! ${match[2]} in tray, need ${match[1]}` : msg;
  }
  if (msg.includes('Insufficient boxed'))
    return msg.replace(/Insufficient boxed products: need (\d+), available (\d+)/, 'Only $2 boxed, need $1 to sticker');
  if (msg.includes('Insufficient stickered'))
    return msg.replace(/Insufficient stickered products: need (\d+), available (\d+)/, 'Only $2 stickered, need $1 to pack');
  return msg;
}

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
    goFoodDailyOrder,
    depotStock,
    goldfinchStickerInventory,
    k3MartSummary,
    today,
  } = useKitchenProduction();

  // Mutations - ball tray (legacy, no auth)
  const addBallsToTray = useMutation(api.orders.mutations.index.addBallsToTray);

  // Mutations - production targets (protected with auth)
  const setProductTarget = useProtectedMutation(api.productionTargets.mutations.setProductTarget);

  // Mutations - new kitchen V3 (protected with auth)
  const boxProducts = useProtectedMutation(api.orders.mutations.index.boxProducts);
  const stickerProducts = useProtectedMutation(api.orders.mutations.index.stickerProducts);
  const togglePackOrderLineItem = useProtectedMutation(api.orders.mutations.index.togglePackOrderLineItem);
  const markOrderReady = useProtectedMutation(api.orders.mutations.index.markOrderReady);

  // GoFood depot mutations
  const recordShipment = useProtectedMutation(api.gofoodDepot.mutations.recordShipment);

  // GoBiz sync action
  const syncGoBizAction = useAction(api.integrations.gobiz.adapter.syncGoBizRevenue);

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
      const result = await boxProducts({
        menuProductId: menuProductId as Id<'menuProducts'>,
        quantity,
      });
      const action = quantity > 0 ? 'Boxed' : 'Unboxed';
      if (result?.warning) {
        actionToast(`${action} ${Math.abs(quantity)} (packaging low)`, event, 'warning');
      } else {
        actionToast(`${action} ${Math.abs(quantity)}`, event);
      }
    } catch (error) {
      actionToast(friendlyCopy(extractErrorMessage(error, 'Failed to box products')), event, 'error');
    }
  };

  // Handlers - Stickering
  const handleStickerProducts = async (menuProductId: string, quantity: number, event?: React.MouseEvent) => {
    try {
      const result = await stickerProducts({
        menuProductId: menuProductId as Id<'menuProducts'>,
        quantity,
      });
      const action = quantity > 0 ? 'Stickered' : 'Unstickered';
      if (result?.warning) {
        actionToast(`${action} ${Math.abs(quantity)} (packaging low)`, event, 'warning');
      } else {
        actionToast(`${action} ${Math.abs(quantity)}`, event);
      }
    } catch (error) {
      actionToast(friendlyCopy(extractErrorMessage(error, 'Failed to sticker products')), event, 'error');
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
      actionToast(friendlyCopy(extractErrorMessage(error, 'Failed to toggle pack')), event, 'error');
    }
  };

  const handleMarkOrderReady = async (orderId: string, event?: React.MouseEvent) => {
    try {
      await markOrderReady({
        orderId: orderId as Id<'orders'>,
      });
      actionToast('Order marked as ready!', event);
    } catch (error) {
      actionToast(friendlyCopy(extractErrorMessage(error, 'Failed to mark order ready')), event, 'error');
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

  // Handler - Ship to Goldfinch
  const handleShipToGoldfinch = async (
    selectedItems: Array<{
      menuProductId: string;
      quantity: number;
      stickerTransfers: Array<{ componentTypeId: string; quantity: number }>;
    }>
  ) => {
    try {
      const items = selectedItems.map((item) => ({
        menuProductId: item.menuProductId as Id<'menuProducts'>,
        quantity: item.quantity,
        stickerTransfers: item.stickerTransfers.map((s) => ({
          componentTypeId: s.componentTypeId as Id<'componentTypes'>,
          quantity: s.quantity,
        })),
      }));

      const result = await recordShipment({ items });
      actionToast(
        `Shipped ${result.totalBoxes} boxes + ${result.totalStickers} stickers to Goldfinch`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to ship to Goldfinch';
      toast.error(msg);
    }
  };

  // Handler - GoBiz Sync Now
  const handleSyncNow = async () => {
    try {
      toast.info('Syncing GoBiz data...');
      await syncGoBizAction({ triggeredBy: 'kitchen_manual' });
      toast.success('GoBiz sync complete');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Sync failed';
      toast.error(msg);
    }
  };

  // Handler - K3 Mart Sync Stock
  const syncK3MartAction = useAction(api.integrations.k3mart.adapter.syncK3MartStock);
  const handleSyncK3Mart = async () => {
    try {
      toast.info('Syncing K3 Mart stock...');
      await syncK3MartAction({ triggeredBy: 'kitchen_manual' });
      toast.success('K3 Mart sync complete');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Sync failed';
      toast.error(msg);
    }
  };

  // Build depot stock map for ProductionLogPanel
  const depotStockMap = useMemo(() => {
    if (!depotStock) return undefined;
    const map = new Map<string, number>();
    for (const s of depotStock) {
      if (s.quantity > 0) {
        map.set(s.menuProductId, s.quantity);
      }
    }
    return map;
  }, [depotStock]);

  // Build GoFood sticker card data for StickeringPanel
  const goFoodDepotData = useMemo(() => {
    if (!goFoodDailyOrder?.items) return undefined;
    return goFoodDailyOrder.items.map((item: any) => {
      return {
        menuProductId: item.menuProductId,
        depotStock: item.currentDepotStock,
        soldToday: item.soldToday,
        shippedToday: item.shippedToday,
        stickerDeficit: item.stickerDeficit,
        stickersAtGoldfinch: goldfinchStickerInventory?.reduce(
          (sum: number, s: any) => sum + s.available, 0
        ) ?? 0,
        freshness: 'fresh' as const, // Simplified for now
      };
    });
  }, [goFoodDailyOrder, goldfinchStickerInventory]);

  // Build GoFood packing card data for PackingPanel
  const goFoodPackingData = useMemo(() => {
    if (!goFoodDailyOrder?.items || goFoodDailyOrder.items.length === 0) return null;

    // Find if already shipped today
    const shippedItems = goFoodDailyOrder.items.filter((i: any) => i.shippedToday > 0);
    const shippedAt = shippedItems.length > 0 ? undefined : undefined; // Will be set from shipments query

    // Build items with boxed counts from productionCounts
    const pcMap = new Map(
      productionCounts?.map((p) => [p.menuProductId, p]) ?? []
    );

    const items = goFoodDailyOrder.items.map((item: any) => ({
      menuProductId: item.menuProductId,
      productName: item.productName,
      targetQty: item.targetQty,
      existingAtDepot: item.existingAtDepot,
      toShipToday: item.toShipToday,
      shippedToday: item.shippedToday,
      freshness: 'fresh' as const,
      boxedCount: pcMap.get(item.menuProductId)?.boxed ?? 0,
    }));

    // Build sticker transfer suggestions
    const totalToShip = items.reduce((sum: number, i: any) => sum + i.toShipToday, 0);
    const stickerTransfers = goldfinchStickerInventory?.map((s: any) => ({
      componentTypeId: s.componentTypeId,
      componentName: s.componentName,
      quantity: totalToShip, // 1:1 sticker per box
      officeStock: s.totalStock,
    })) ?? [];

    // Build current depot stock display
    const depotCurrentStock = goFoodDailyOrder.items.map((item: any) => ({
      productName: item.productName,
      boxes: item.currentDepotStock,
      stickers: 0, // Simplified
      freshness: 'fresh' as const,
    }));

    return {
      orderNumber: goFoodDailyOrder.orderNumber,
      date: goFoodDailyOrder.date,
      items,
      stickerTransfers,
      depotCurrentStock,
      shippedAt,
    };
  }, [goFoodDailyOrder, productionCounts, goldfinchStickerInventory]);

  // Build K3 Mart outlet stock map for ProductionLogPanel + BoxingPanel
  const k3MartStockMap = useMemo(() => {
    if (!k3MartSummary?.items?.length) return undefined;
    const map = new Map<string, number>();
    for (const item of k3MartSummary.items) {
      if (item.totalOutletStock > 0) {
        map.set(item.menuProductId, item.totalOutletStock);
      }
    }
    return map;
  }, [k3MartSummary]);

  // Build K3 Mart sticker data for StickeringPanel
  const k3MartStickerData = useMemo(() => {
    if (!k3MartSummary?.items?.length) return undefined;
    return k3MartSummary.items;
  }, [k3MartSummary]);

  // Build K3 Mart packing data for PackingPanel
  const k3MartPackingData = useMemo(() => {
    if (!k3MartSummary?.items?.length) return null;

    // Only include items with consignment targets
    const targetItems = k3MartSummary.items.filter(
      (i: any) => i.consignmentTarget > 0
    );
    if (targetItems.length === 0) return null;

    const pcMap = new Map(
      productionCounts?.map((p) => [p.menuProductId, p]) ?? []
    );

    const items = targetItems.map((item: any) => {
      const pc = pcMap.get(item.menuProductId);
      const boxed = pc?.boxed ?? 0;
      const stickered = pc?.stickered ?? 0;
      return {
        menuProductId: item.menuProductId,
        productName: item.productName,
        consignmentTarget: item.consignmentTarget,
        boxed,
        stickered,
        isReady: stickered >= item.consignmentTarget,
      };
    });

    return { date: today, items };
  }, [k3MartSummary, productionCounts, today]);

  // Compute per-product total target (orders + consignment + gofood) for BoxingPanel
  const productTargetTotals = useMemo(() => {
    if (!productionCounts) return {};
    const map: Record<string, number> = {};
    for (const p of productionCounts.filter(p => p.posSlot != null)) {
      const orders = orderProductDemand?.find(d => d.menuProductId === p.menuProductId)?.quantity ?? 0;
      const consignment = productTargets
        ?.filter(t => t.source === 'consignment' && t.menuProductId === p.menuProductId)
        .reduce((sum, t) => sum + t.quantity, 0) ?? 0;
      const gofood = productTargets
        ?.filter(t => t.source === 'gofood' && t.menuProductId === p.menuProductId)
        .reduce((sum, t) => sum + t.quantity, 0) ?? 0;
      const total = orders + consignment + gofood;
      if (total > 0) map[p.menuProductId] = total;
    }
    return map;
  }, [productionCounts, productTargets, orderProductDemand]);

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
          depotStockMap={depotStockMap}
          k3MartStockMap={k3MartStockMap}
          onAddBalls={handleAddBalls}
          onSetProductTarget={handleSetProductTarget}
          disabled={!canEditKitchen}
        />
        <BoxingPanel
          productionCounts={productionCounts}
          trayInventory={trayInventory}
          neededFromOrders={neededFromOrders}
          productTargetTotals={productTargetTotals}
          k3MartStockMap={k3MartStockMap}
          onBoxProducts={handleBoxProducts}
          disabled={!canEditKitchen}
        />
        <StickeringPanel
          productionCounts={productionCounts}
          neededFromOrders={neededFromOrders}
          goFoodDepotData={goFoodDepotData}
          lastSyncAt={goFoodDailyOrder?.lastSyncAt}
          k3MartData={k3MartStickerData}
          k3MartLastSyncAt={k3MartSummary?.lastSyncAt}
          onStickerProducts={handleStickerProducts}
          onSyncNow={handleSyncNow}
          onSyncK3Mart={handleSyncK3Mart}
          disabled={!canEditKitchen}
        />
        <PackingPanel
          packingOrders={packingOrders}
          goFoodPackingData={goFoodPackingData}
          k3MartPackingData={k3MartPackingData}
          onTogglePack={handleTogglePack}
          onMarkOrderReady={handleMarkOrderReady}
          onShipToGoldfinch={handleShipToGoldfinch}
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
              depotStockMap={depotStockMap}
              k3MartStockMap={k3MartStockMap}
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
              productTargetTotals={productTargetTotals}
              k3MartStockMap={k3MartStockMap}
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
              goFoodDepotData={goFoodDepotData}
              lastSyncAt={goFoodDailyOrder?.lastSyncAt}
              k3MartData={k3MartStickerData}
              k3MartLastSyncAt={k3MartSummary?.lastSyncAt}
              onStickerProducts={handleStickerProducts}
              onSyncNow={handleSyncNow}
              onSyncK3Mart={handleSyncK3Mart}
              disabled={!canEditKitchen}
            />
          </div>
          <div className="lg:col-span-1">
            <h2 className="text-lg font-bold text-gray-900 mb-3 px-1" style={{ color: 'var(--color-station-packing-accent)' }}>
              To Pack
            </h2>
            <PackingPanel
              packingOrders={packingOrders}
              goFoodPackingData={goFoodPackingData}
              k3MartPackingData={k3MartPackingData}
              onTogglePack={handleTogglePack}
              onMarkOrderReady={handleMarkOrderReady}
              onShipToGoldfinch={handleShipToGoldfinch}
              disabled={!canEditKitchen}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
