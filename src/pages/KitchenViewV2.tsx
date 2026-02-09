/**
 * KitchenView V2 - Production-optimized kitchen workflow
 *
 * Redesigned for tablet/touchscreen use in production environment.
 * Focus: Readability, touch-friendly controls, minimal visual noise.
 */

import { useState, useMemo } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Package, Tag, Truck, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LoadingCards } from '@/components/shared';
import {
  KanbanColumn,
  BoxingOrderCard,
  StickeringOrderCard,
  ReadyToShipCard,
  BallTrayCounter,
  PackagingStockItem,
  DailySummaryWidget,
  BatchConfirmDialog,
} from '@/components/kitchen';
import { usePendingBallStats } from '@/hooks/convex/usePendingBallStats';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { toast } from 'sonner';
import type { Id } from '../../convex/_generated/dataModel';

export function KitchenViewV2() {
  useDocumentTitle('Kitchen Production');

  const { hasPermission } = useAuth();
  const canEditKitchen = hasPermission('canEditKitchen');

  // Fetch kitchen data
  const kitchenOrders = useQuery(api.orders.queries.getKitchenOrders, {});
  const trayInventory = useQuery(api.orders.queries.getTrayInventory, {});
  const packagingStockData = useQuery(api.inventory.queries.getPackagingStockSummary, {});
  const kitchenStats = useQuery(api.orders.queries.getKitchenStats, {});

  // Mutations
  const fillPackageMutation = useMutation(api.orders.mutations.fillPackage);
  const unfillPackageMutation = useMutation(api.orders.mutations.unfillPackage);
  const addBallsToTray = useMutation(api.orders.mutations.addBallsToTray);
  const removeBallFromTray = useMutation(api.orders.mutations.removeBallFromTray);
  const updateOrderStatus = useMutation(api.orders.mutations.updateStatus);

  // Batch confirm dialog state
  const [batchDialog, setBatchDialog] = useState<{
    open: boolean;
    action: 'sticker' | 'box';
    orderIds: Id<'orders'>[];
  }>({
    open: false,
    action: 'sticker',
    orderIds: [],
  });

  // Group orders by status
  const { boxingOrders, stickeringOrders, readyOrders } = useMemo(() => {
    if (!kitchenOrders) {
      return { boxingOrders: [], stickeringOrders: [], readyOrders: [] };
    }

    const boxing = kitchenOrders.filter(
      (order) =>
        order.status === 'Confirmed' ||
        order.status === 'InProduction' ||
        order.status === 'Packaging'
    );

    const stickering = kitchenOrders.filter((order) => order.status === 'Boxed');

    const ready = kitchenOrders.filter((order) => order.status === 'Labeled');

    return {
      boxingOrders: boxing,
      stickeringOrders: stickering,
      readyOrders: ready,
    };
  }, [kitchenOrders]);

  // Transform orders for components (null-safe menuProductId handling)
  const transformedBoxingOrders = useMemo(() => {
    return boxingOrders.map((order) => {
      const orderItems = (order.items ?? []).map((item) => {
        const ballsPerPackage = item.productionUnits ?? 1;
        const ballsFilled = item.ballsFilled ?? 0;
        const filled = Math.floor(ballsFilled / ballsPerPackage);

        return {
          _id: item._id as unknown as Id<'orderItems'>,
          productName: item.productName,
          quantity: item.quantity,
          filled,
          ballsPerPackage,
        };
      });

      const totalPackages = orderItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalPackagesFilled = orderItems.reduce((sum, item) => sum + item.filled, 0);
      const totalBallsNeeded = orderItems.reduce(
        (sum, item) => sum + item.quantity * item.ballsPerPackage,
        0
      );
      const totalBallsFilled = orderItems.reduce(
        (sum, item) => sum + item.filled * item.ballsPerPackage,
        0
      );

      return {
        _id: order._id as unknown as Id<'orders'>,
        orderNumber: order.orderNumber,
        customerName: order.customerName ?? 'Unknown',
        orderStatus: order.status,
        items: orderItems,
        totalPackages,
        totalPackagesFilled,
        totalBallsNeeded,
        totalBallsFilled,
        confirmedAt: order._creationTime,
      };
    });
  }, [boxingOrders]);

  const transformedStickeringOrders = useMemo(() => {
    return stickeringOrders.map((order) => ({
      _id: order._id as unknown as Id<'orders'>,
      orderNumber: order.orderNumber,
      customerName: order.customerName ?? 'Unknown',
      totalPackages: order.itemCount,
      stickerTypes: [
        { name: 'Box Sticker', count: order.itemCount },
      ],
    }));
  }, [stickeringOrders]);

  const transformedReadyOrders = useMemo(() => {
    return readyOrders.map((order) => ({
      _id: order._id as unknown as Id<'orders'>,
      orderNumber: order.orderNumber,
      customerName: order.customerName ?? 'Unknown',
      totalPackages: order.itemCount,
      deliveryType: order.deliveryType ?? undefined,
    }));
  }, [readyOrders]);

  // Handlers
  const handleFillPackage = async (itemId: Id<'orderItems'>) => {
    try {
      await fillPackageMutation({ orderItemId: itemId, ballsToAdd: 1 });
      toast.success('Package filled');
    } catch (error) {
      console.error('Failed to fill package:', error);
      toast.error('Failed to fill package');
    }
  };

  const handleUnfillPackage = async (itemId: Id<'orderItems'>) => {
    try {
      await unfillPackageMutation({ orderItemId: itemId, ballsToRemove: 1 });
      toast.success('Package unfilled');
    } catch (error) {
      console.error('Failed to unfill package:', error);
      toast.error('Failed to unfill package');
    }
  };

  const handleMarkBoxed = async (orderId: Id<'orders'>) => {
    try {
      await updateOrderStatus({ orderId, status: 'Boxed' });
      toast.success('Order marked as boxed');
    } catch (error) {
      console.error('Failed to mark boxed:', error);
      toast.error('Failed to mark as boxed');
    }
  };

  const handleAddBalls = async (ballType: 'original' | 'bite_sized', count: number) => {
    try {
      await addBallsToTray({ ballType, count });
      toast.success(`+${count} balls added`);
    } catch (error) {
      console.error('Failed to add balls:', error);
      toast.error('Failed to add balls');
    }
  };

  const handleRemoveBall = async (ballType: 'original' | 'bite_sized') => {
    try {
      await removeBallFromTray({ ballType });
    } catch (error) {
      console.error('Failed to remove ball:', error);
      toast.error('Failed to remove ball');
    }
  };

  const handleApplyStickers = async (orderId: Id<'orders'>) => {
    try {
      await updateOrderStatus({ orderId, status: 'Labeled' });
      toast.success('Stickers applied');
    } catch (error) {
      console.error('Failed to apply stickers:', error);
      toast.error('Failed to apply stickers');
    }
  };

  const handleBatchSticker = (orderIds: Id<'orders'>[]) => {
    setBatchDialog({
      open: true,
      action: 'sticker',
      orderIds,
    });
  };

  const handleConfirmBatch = async () => {
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const orderId of batchDialog.orderIds) {
      try {
        await updateOrderStatus({ orderId, status: 'Labeled' });
        succeeded.push(orderId);
      } catch (error) {
        console.error(`Failed to label order ${orderId}:`, error);
        // Find the order number for the error message
        const order = stickeringOrders.find((o) => o._id === orderId);
        failed.push(order?.orderNumber ?? orderId);
      }
    }

    setBatchDialog({ ...batchDialog, open: false });

    if (failed.length === 0) {
      toast.success(`${succeeded.length} orders labeled`);
    } else if (succeeded.length === 0) {
      toast.error('Failed to label all orders');
    } else {
      toast.warning(
        `${succeeded.length} of ${batchDialog.orderIds.length} orders labeled. Failed: ${failed.join(', ')}`
      );
    }
  };

  const handleMarkShipped = async (orderId: Id<'orders'>, deliveryType?: string) => {
    try {
      const isPickup = deliveryType?.toLowerCase().includes('pickup');
      const status = isPickup ? 'WaitingPickup' : 'WaitingShipment';
      await updateOrderStatus({ orderId, status });
      toast.success(isPickup ? 'Order ready for pickup' : 'Order marked for shipping');
    } catch (error) {
      console.error('Failed to mark shipped:', error);
      toast.error('Failed to update order status');
    }
  };

  const isLoading = kitchenOrders === undefined;

  // Daily stats from real kitchen data
  const dailyStats = {
    ballsProduced: (kitchenStats?.bigBallsCompleted ?? 0) + (kitchenStats?.midBallsCompleted ?? 0),
    ordersCompleted: kitchenStats?.ordersCompletedToday ?? 0,
    packagesBoxed: 0,
    stickersApplied: 0,
    inventoryConsumed: [] as { name: string; quantity: number }[],
  };

  // Real packaging inventory from Convex
  const packagingInventory = packagingStockData ?? [];

  // Calculate pending ball stats using shared hook (supports both original and bite-sized)
  const pendingBallStats = usePendingBallStats(boxingOrders);

  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Kitchen Production</h1>
              {!canEditKitchen && (
                <Badge variant="secondary" className="flex items-center gap-1.5 text-sm">
                  <Eye className="h-3.5 w-3.5" />
                  View Only
                </Badge>
              )}
            </div>
            <div className="text-sm text-gray-600">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="px-3 sm:px-4 py-4 flex gap-3 sm:gap-4">
        {/* Left Sidebar */}
        <aside className="w-64 lg:w-72 space-y-4 flex-shrink-0 hidden lg:block">
          {/* Ball Trays */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900 px-1">Ball Inventory</h2>
            <BallTrayCounter
              ballType="original"
              count={trayInventory?.originalBallCount ?? 0}
              pendingOrders={pendingBallStats.originalCount}
              pendingBalls={pendingBallStats.originalBalls}
              onAdd={(count) => handleAddBalls('original', count)}
              onRemove={() => handleRemoveBall('original')}
              disabled={!canEditKitchen}
            />
            <BallTrayCounter
              ballType="bite_sized"
              count={trayInventory?.biteSizedBallCount ?? 0}
              pendingOrders={pendingBallStats.biteSizedCount}
              pendingBalls={pendingBallStats.biteSizedBalls}
              onAdd={(count) => handleAddBalls('bite_sized', count)}
              onRemove={() => handleRemoveBall('bite_sized')}
              disabled={!canEditKitchen}
            />
          </div>

          {/* Daily Summary */}
          <DailySummaryWidget stats={dailyStats} />
        </aside>

        {/* Main Content - 3 Column Kanban */}
        <main className="flex-1 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {/* Column 1: Boxing */}
            <KanbanColumn
              title="Needs Boxing"
              subtitle="Fill packages"
              count={transformedBoxingOrders.length}
              color="orange"
              icon={<Package className="w-5 h-5" />}
            >
              <div className="space-y-3">
                {transformedBoxingOrders.map((order) => (
                  <BoxingOrderCard
                    key={order._id}
                    order={order}
                    orderStatus={order.orderStatus}
                    onFillPackage={handleFillPackage}
                    onUnfillPackage={handleUnfillPackage}
                    onMarkBoxed={() => handleMarkBoxed(order._id)}
                    disabled={!canEditKitchen}
                  />
                ))}
                {transformedBoxingOrders.length === 0 && (
                  <div className="text-center text-gray-500 py-12 text-sm">
                    No orders to box
                  </div>
                )}
              </div>
            </KanbanColumn>

            {/* Column 2: Stickering */}
            <KanbanColumn
              title="Needs Stickers"
              subtitle="Boxed, awaiting labels"
              count={transformedStickeringOrders.length}
              color="blue"
              icon={<Tag className="w-5 h-5" />}
              footer={
                transformedStickeringOrders.length > 0 && (
                  <div className="p-3 bg-blue-50 border-t border-blue-200">
                    <button
                      onClick={() =>
                        handleBatchSticker(transformedStickeringOrders.map((o) => o._id))
                      }
                      disabled={!canEditKitchen}
                      className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                    >
                      <Tag className="w-4 h-4 inline mr-2" />
                      Apply All ({transformedStickeringOrders.length})
                    </button>
                  </div>
                )
              }
            >
              <div className="space-y-2">
                {transformedStickeringOrders.map((order) => (
                  <StickeringOrderCard
                    key={order._id}
                    order={order}
                    onApplyStickers={() => handleApplyStickers(order._id)}
                    disabled={!canEditKitchen}
                  />
                ))}
                {transformedStickeringOrders.length === 0 && (
                  <div className="text-center text-gray-500 py-12 text-sm">
                    No orders to sticker
                  </div>
                )}
              </div>
            </KanbanColumn>

            {/* Column 3: Ready to Ship */}
            <KanbanColumn
              title="Ready to Ship"
              subtitle="Labeled, awaiting dispatch"
              count={transformedReadyOrders.length}
              color="green"
              icon={<Truck className="w-5 h-5" />}
            >
              <div className="space-y-2">
                {transformedReadyOrders.map((order) => (
                  <ReadyToShipCard
                    key={order._id}
                    order={order}
                    onMarkShipped={() => handleMarkShipped(order._id, order.deliveryType)}
                    disabled={!canEditKitchen}
                  />
                ))}
                {transformedReadyOrders.length === 0 && (
                  <div className="text-center text-gray-500 py-12 text-sm">
                    No orders ready
                  </div>
                )}
              </div>
            </KanbanColumn>
          </div>
        </main>

        {/* Right Sidebar - Packaging Inventory */}
        <aside className="w-56 lg:w-64 space-y-4 flex-shrink-0 hidden xl:block">
          <h2 className="text-base font-semibold text-gray-900 px-1">Materials</h2>
          <div className="space-y-2">
            {packagingInventory.map((item, idx) => (
              <PackagingStockItem key={idx} {...item} />
            ))}
          </div>
        </aside>
      </div>

      {/* Batch Confirm Dialog */}
      <BatchConfirmDialog
        open={batchDialog.open}
        onOpenChange={(open) => setBatchDialog({ ...batchDialog, open })}
        action={batchDialog.action}
        summary={{
          orderCount: batchDialog.orderIds.length,
          packageCount: batchDialog.orderIds.length,
          consumables: (packagingStockData ?? []).map((item) => ({
            name: item.name,
            quantity: batchDialog.orderIds.length,
            available: item.available,
            isLow: item.isLow,
          })),
          totalCOGS: 0,
        }}
        onConfirm={handleConfirmBatch}
      />
    </div>
  );
}
