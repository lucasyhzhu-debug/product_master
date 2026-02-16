/**
 * Convex hooks for kitchen production.
 * Combines multiple kitchen-related queries into a single interface.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

// ============================================
// Types
// ============================================

interface KitchenProductionData {
  // Loading state
  isLoading: boolean;

  // Production counts per menu product
  productionCounts:
    | Array<{
        menuProductId: string;
        menuProductName: string;
        menuProductCode?: string;
        posSlot?: number;
        productType?: string;
        ballType?: 'big' | 'mid';
        ballCount?: number;
        boxed: number;
        stickered: number;
        packed: number;
        shippedToGoldfinch: number;
        availableForStickering: number;
        availableForPacking: number;
      }>
    | undefined;

  // Packing orders with product items and packaging materials
  packingOrders:
    | Array<{
        _id: string;
        orderNumber: string;
        customerName: string;
        customerPhone?: string;
        status: string;
        deliveryType?: string;
        dueDate?: number;
        productItems: Array<{
          _id: string;
          productName: string;
          productVariant?: string;
          quantity: number;
          menuProductId?: string;
          packageStatus: string;
          isPacked: boolean;
          canPack: boolean;
          availableForPacking: number;
        }>;
        packagingMaterials: Array<{
          componentTypeId: string;
          componentName: string;
          quantityNeeded: number;
        }>;
        allProductsPacked: boolean;
        canMarkReady: boolean;
      }>
    | undefined;

  // Ball tray inventory
  trayInventory:
    | {
        originalBallCount: number;
        biteSizedBallCount: number;
        totalProducedOriginal: number;
        totalProducedBiteSized: number;
      }
    | undefined;

  // Kitchen stats (ball totals, order counts)
  kitchenStats:
    | {
        bigBallsNeeded: number;
        bigBallsCompleted: number;
        midBallsNeeded: number;
        midBallsCompleted: number;
        ordersPending: number;
        ordersCompletedToday: number;
      }
    | undefined;

  // Kitchen configuration (max target + ball composition)
  kitchenConfig:
    | {
        _id: string | null;
        maxProductionTarget: number;
        bigBallTarget: number;
        midBallTarget: number;
        updatedAt: number | null;
        updatedBy: string | null;
      }
    | undefined;

  // Production targets for today (enriched with unit type info)
  productionTargets:
    | Array<{
        productionUnitTypeId: string;
        unitTypeName: string;
        unitTypeCode: string;
        autoTargetQuantity: number;
        manualOverride?: number;
        effectiveTarget: number;
      }>
    | undefined;

  // Per-product manual targets for today (consignment + gofood)
  productTargets:
    | Array<{
        menuProductId: string;
        source: string;
        quantity: number;
      }>
    | undefined;

  // Per-product demand from orders due today/tomorrow (auto-calculated)
  orderProductDemand:
    | Array<{
        menuProductId: string;
        quantity: number;
      }>
    | undefined;

  // GoFood depot data
  goFoodDailyOrder: any;
  depotStock: any;
  goldfinchStickerInventory: any;

  // K3 Mart kitchen summary
  k3MartSummary: any;

  // Today's date string (YYYY-MM-DD)
  today: string;
}

// ============================================
// Hook
// ============================================

/**
 * Combined hook for all kitchen production data.
 * Aggregates multiple queries for the kitchen page.
 */
export function useKitchenProduction(): KitchenProductionData {
  // Get today's date as YYYY-MM-DD (WIB)
  const now = new Date();
  const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const today = wibNow.toISOString().slice(0, 10);

  // INFRA-03: Production counts now derived from productionLog aggregation
  const productionCounts = useQuery(api.productionLog.queries.getAggregatedCounts, {});
  const packingOrders = useQuery(
    api.orders.kitchenQueries.getKitchenPackingOrders,
    {}
  );
  const trayInventory = useQuery(api.orders.queries.getTrayInventory, {});
  const kitchenStats = useQuery(api.orders.queries.getKitchenStats, {});
  const kitchenConfig = useQuery(api.kitchenConfig.queries.getConfig);
  const productionTargets = useQuery(api.productionTargets.queries.getProductionSummary, {
    date: today,
  });
  const productTargets = useQuery(api.productionTargets.queries.getProductTargets, {
    date: today,
  });
  const orderProductDemand = useQuery(api.productionTargets.queries.getOrderProductDemand, {
    date: today,
  });

  // GoFood depot queries
  const goFoodDailyOrder = useQuery(api.gofoodDepot.queries.getGoFoodDailyOrder, {
    date: today,
  });
  const depotStock = useQuery(api.gofoodDepot.queries.getDepotStock, {});
  const goldfinchStickerInventory = useQuery(
    api.gofoodDepot.queries.getGoldfinchStickerInventory,
    {}
  );

  // K3 Mart kitchen summary
  const k3MartSummary = useQuery(api.k3martKitchen.queries.getK3MartKitchenSummary, {
    date: today,
  });

  const isLoading =
    productionCounts === undefined ||
    packingOrders === undefined ||
    trayInventory === undefined ||
    kitchenStats === undefined ||
    kitchenConfig === undefined;

  return {
    isLoading,
    productionCounts,
    packingOrders,
    trayInventory,
    kitchenStats,
    kitchenConfig,
    productionTargets,
    productTargets,
    orderProductDemand,
    goFoodDailyOrder,
    depotStock,
    goldfinchStickerInventory,
    k3MartSummary,
    today,
  };
}
