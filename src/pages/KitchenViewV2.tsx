/**
 * KitchenView V2 - Redesigned with boxing/stickering workflow
 *
 * This is Wave 5 implementation for the inventory management system.
 * Features 3-column Kanban layout for Boxing, Stickering, and Ready to Ship.
 */

import { useState, useMemo } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Package, Tag, Truck, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout';
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
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { toast } from 'sonner';
import type { Id } from '../../convex/_generated/dataModel';

export function KitchenViewV2() {
  useDocumentTitle('Kitchen - Wave 5');

  const { hasPermission } = useAuth();
  const canEditKitchen = hasPermission('canEditKitchen');

  // Fetch kitchen data
  const kitchenOrders = useQuery(api.orders.queries.getKitchenOrders, {});
  const trayInventory = useQuery(api.orders.queries.getTrayInventory, {});

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
        // Handle legacy orders without menuProductId
        if (!item.menuProductId) {
          return {
            _id: item._id as unknown as Id<'orderItems'>,
            productName: item.productName,
            quantity: item.quantity,
            filled: Math.floor((item.ballsFilled ?? 0) / (item.productionUnits ?? 1)),
            ballsPerPackage: item.productionUnits ?? 1,
            boxType: 'Standard', // Fallback for legacy
          };
        }

        return {
          _id: item._id as unknown as Id<'orderItems'>,
          productName: item.productName,
          quantity: item.quantity,
          filled: Math.floor((item.ballsFilled ?? 0) / (item.productionUnits ?? 1)),
          ballsPerPackage: item.productionUnits ?? 1,
          boxType: 'Standard', // TODO: Get from menuProduct packaging type
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
        // TODO: Calculate from menuProduct packaging components
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
    // For single order, transition directly to Labeled
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
    try {
      for (const orderId of batchDialog.orderIds) {
        await updateOrderStatus({ orderId, status: 'Labeled' });
      }
      toast.success(`${batchDialog.orderIds.length} orders labeled`);
      setBatchDialog({ ...batchDialog, open: false });
    } catch (error) {
      console.error('Failed to batch sticker:', error);
      toast.error('Failed to apply stickers');
    }
  };

  const handleMarkShipped = async (orderId: Id<'orders'>) => {
    try {
      // Determine if pickup or shipment based on order details
      // For now, default to CompleteShipped
      await updateOrderStatus({ orderId, status: 'CompleteShipped' });
      toast.success('Order marked as shipped');
    } catch (error) {
      console.error('Failed to mark shipped:', error);
      toast.error('Failed to mark shipped');
    }
  };

  const isLoading = kitchenOrders === undefined;

  // Mock daily stats (TODO: Implement backend query)
  const dailyStats = {
    ballsProduced: 0,
    ordersCompleted: 0,
    packagesBoxed: 0,
    stickersApplied: 0,
    inventoryConsumed: [],
  };

  // Mock packaging inventory (TODO: Implement backend query)
  const packagingInventory = [
    { name: 'Long Box', available: 12, reserved: 8, reorderPoint: 20, isLow: true, isCritical: false },
    { name: 'Single Box', available: 85, reserved: 10, reorderPoint: 50, isLow: false, isCritical: false },
    { name: 'Wrapper', available: 200, reserved: 50, reorderPoint: 300, isLow: true, isCritical: false },
    {
      name: 'Product Sticker',
      available: 150,
      reserved: 20,
      reorderPoint: 100,
      isLow: false,
      isCritical: false,
    },
    { name: 'QR Sticker', available: 45, reserved: 15, reorderPoint: 80, isLow: true, isCritical: false },
  ];

  // Calculate pending ball stats
  const pendingBallStats = useMemo(() => {
    let originalCount = 0;
    let originalBalls = 0;
    let biteSizedCount = 0;
    let biteSizedBalls = 0;

    for (const order of transformedBoxingOrders) {
      for (const item of order.items) {
        const remaining = item.quantity - item.filled;
        if (remaining > 0) {
          // TODO: Determine ball type from menuProduct
          originalCount++;
          originalBalls += remaining * item.ballsPerPackage;
        }
      }
    }

    return { originalCount, originalBalls, biteSizedCount, biteSizedBalls };
  }, [transformedBoxingOrders]);

  if (isLoading) {
    return <LoadingCards count={4} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
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
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="container mx-auto px-6 py-6 flex gap-6">
        {/* Left Sidebar - Ball Trays & Daily Summary */}
        <aside className="w-80 space-y-4 flex-shrink-0">
          {/* Ball Trays */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Ball Inventory</h2>
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
        <main className="flex-1">
          <div className="grid grid-cols-3 gap-4 h-[calc(100vh-12rem)]">
            {/* Column 1: Boxing */}
            <KanbanColumn
              title="Needs Boxing"
              subtitle="Fill packages"
              count={transformedBoxingOrders.length}
              color="amber"
              icon={<Package className="w-5 h-5" />}
            >
              <div className="space-y-3">
                {transformedBoxingOrders.map((order) => (
                  <BoxingOrderCard
                    key={order._id}
                    order={order}
                    onFillPackage={handleFillPackage}
                    onUnfillPackage={handleUnfillPackage}
                    disabled={!canEditKitchen}
                  />
                ))}
                {transformedBoxingOrders.length === 0 && (
                  <div className="text-center text-slate-400 py-8">No orders to box</div>
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
                  <div className="p-4 bg-blue-900/30 border-t border-blue-800">
                    <button
                      onClick={() =>
                        handleBatchSticker(transformedStickeringOrders.map((o) => o._id))
                      }
                      disabled={!canEditKitchen}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Tag className="w-4 h-4 inline mr-2" />
                      Apply Stickers to All ({transformedStickeringOrders.length})
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
                  <div className="text-center text-slate-400 py-8">No orders to sticker</div>
                )}
              </div>
            </KanbanColumn>

            {/* Column 3: Ready to Ship */}
            <KanbanColumn
              title="Ready to Ship"
              subtitle="Labeled, awaiting dispatch"
              count={transformedReadyOrders.length}
              color="emerald"
              icon={<Truck className="w-5 h-5" />}
            >
              <div className="space-y-2">
                {transformedReadyOrders.map((order) => (
                  <ReadyToShipCard
                    key={order._id}
                    order={order}
                    onMarkShipped={() => handleMarkShipped(order._id)}
                    disabled={!canEditKitchen}
                  />
                ))}
                {transformedReadyOrders.length === 0 && (
                  <div className="text-center text-slate-400 py-8">No orders ready</div>
                )}
              </div>
            </KanbanColumn>
          </div>
        </main>

        {/* Right Sidebar - Packaging Inventory */}
        <aside className="w-72 space-y-4 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">Packaging Stock</h2>
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
          packageCount: batchDialog.orderIds.length, // TODO: Calculate actual packages
          consumables: [
            // TODO: Calculate from menuProduct BOMs
            {
              name: 'Box Sticker',
              quantity: batchDialog.orderIds.length,
              available: 150,
              isLow: false,
            },
          ],
          totalCOGS: 0, // TODO: Calculate from FIFO
        }}
        onConfirm={handleConfirmBatch}
      />
    </div>
  );
}
