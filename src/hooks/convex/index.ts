/**
 * Convex hooks barrel export.
 * Import from here for cleaner imports in components.
 */

// Mutation Hook Factory
export { createMutationHook, type MutationHookConfig } from "./createMutationHook";

// Ingredients
export {
  useIngredients,
  useIngredient,
  useIngredientSearch,
  useCreateIngredient,
  useUpdateIngredient,
  useDeleteIngredient,
  useLinkIngredientToComponentType,
  useUnlinkIngredientFromComponentType,
  type ConvexIngredient,
  type IngredientCreateInput,
} from "./useIngredients";

// Menu Products
export {
  // Query hooks
  useMenuProducts,
  useMenuProduct,
  useMenuProductByCode,
  usePosProducts,
  useAvailableProducts,
  usePackagingPosProducts,
  // Mutation hooks
  useCreateMenuProduct,
  useUpdateMenuProduct,
  useDeleteMenuProduct,
  useAssignToSlot,
  useRemoveFromSlot,
  useAssignToPackagingSlot,
  useRemoveFromPackagingSlot,
  // Types
  type MenuProductCreateInput,
  type MenuProductUpdateInput,
  type PosProduct,
  type PackagingPosProduct,
  type AvailableProduct,
} from "./useMenuProducts";

// Orders
export {
  // Query hooks
  useOrders,
  useOrdersPaginated,
  useOrder,
  useOrderByNumber,
  useKitchenOrders,
  useOrdersByCustomer,
  useProductSuggestions,
  useSellerSuggestions,
  useChannelSuggestions,
  useWhatsAppMessage,
  useOrderTemplate,
  useKanbanOrders,
  // Mutation hooks
  useCreateDraft,
  useUpdateDraft,
  useCreateOrder,
  useUpdateOrderStatus,
  useUpdateOrderPayment,
  useUpdateOrderShipping,
  useUpdateOrderDetails,
  useCancelOrder,
  useDeleteOrder,
  useAddOrderItem,
  useRemoveOrderItem,
  useUpdateOrderItemQuantity,
  useReplaceOrderItems,
  useUpdateOrderDiscount,
  useUpdateOrderDeliveryFee,
  useForceComplete,
  // Types
  type OrderItemInput,
  type OrderCreateInput,
  type OrderFilters,
  type WhatsAppTemplate,
} from "./useOrders";

// Customers
export {
  // Query hooks
  useCustomers,
  useCustomer,
  useCustomerSearch,
  useCustomerByPhone,
  // Mutation hooks
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  // Types
  type CustomerCreateInput,
  type CustomerUpdateInput,
} from "./useCustomers";

// Kitchen Stats (PRD-1: Kitchen Core)
export {
  // Query hooks
  useKitchenStats,
  useKitchenOrdersWithBalls,
  useCompletedToday,
  // Mutation hooks
  useCompleteOrder,
  useRevertToConfirmed,
  useCompleteBalls,
  useCompletePackaging,
  useRevertToPackaging,
} from "./useKitchenStats";

// Visual Feedback Overlay
export {
  // Query hooks
  useFeedbackList,
  useFeedback,
  useFeedbackExport,
  useFeedbackStats,
  useOngoingFeedbackCount,
  // Mutation hooks
  useGenerateUploadUrl,
  useCreateFeedback,
  useAddFeedbackComment,
  useToggleFeedbackStatus,
  useUpdateFeedbackPriority,
  useUpdateFeedbackTags,
  useDeleteFeedback,
  // Helper
  uploadScreenshot,
  // Types
  type FeedbackStatus,
  type FeedbackPriority,
  type FeedbackTag,
  type FeedbackComment,
  type FeedbackItem,
  type FeedbackCreateInput,
  type FeedbackStats,
} from "./useFeedback";

// Production Unit Types (PRD-4: Menu Products Manager)
export {
  useProductionUnitTypes,
  useProductionUnitType,
  useProductionUnitTypeByCode,
  type ProductionUnitType,
  type ProductionUnitTypeWithId,
} from "./useProductionUnitTypes";

// Menu Product Components (PRD-4: Menu Products Manager)
export {
  useMenuProductComponents,
  useMenuProductComponentsBatch,
  type MenuProductComponentWithType,
} from "./useMenuProductComponents";

// Inventory (Inventory Management System)
export {
  // Query hooks
  useLowStockAlerts,
  useComponentInventory,
  useLocationInventory,
  useInventoryReport,
  useComponentBatches,
  useLocationTransactions,
  useLatestBatch,
  // Mutation hooks
  useReceiveStock,
  useCreateComponentAndReceiveStock,
  useTransferStock,
  useAdjustStock,
  useDeleteBatch,
  useExpireBatch,
  // Types
  type ReceiveStockInput,
  type TransferStockInput,
  type AdjustStockInput,
  type LowStockAlert,
} from "./useInventory";

// Component Types (Inventory Management System)
export {
  // Query hooks
  useComponentTypes,
  useComponentType,
  useComponentsByCategory,
  useInventoryTrackedComponents,
  useComponentByCode,
  // Mutation hooks
  useCreateComponentType,
  useUpdateComponentType,
  useDeleteComponentType,
  useCreatePackagingQuick,
  useCreateIngredientComponentType,
  // Types
  type ComponentTypeCreateInput,
  type ComponentTypeUpdateInput,
  type ComponentType,
} from "./useComponentTypes";

// Storage Locations (Inventory Management System)
export {
  // Query hooks
  useStorageLocations,
  useStorageLocation,
  useDefaultLocation,
  // Mutation hooks
  useCreateStorageLocation,
  useUpdateStorageLocation,
  useDeleteStorageLocation,
  // Types
  type StorageLocationCreateInput,
  type StorageLocationUpdateInput,
  type StorageLocation,
} from "./useStorageLocations";

// External Data (Multi-Platform Sales Integration)
export {
  // Query hooks
  useExternalOutlets,
  useExternalSnapshots,
  useExternalRevenue,
  useExternalSyncLogs,
  useExternalProductMappings,
  useDashboardSalesSummary,
  useDashboardSalesSummaryByPeriod,
  useOrderDetailsByOrderNumber,
  useRevenueItems,
  // Platform credentials hooks
  useCredentialStatus,
  useRefreshK3MartToken,
  // Action hooks
  useDiscoverK3MartOutlets,
  useSyncK3MartSales,
  useSyncK3MartStock,
  useSyncGoBiz,
  useSyncInternalOrders,
  // Restock planner hooks
  useRestockOverview,
  useChannelSellThrough,
  useSaveRestockTarget,
  useUpdateManualStock,
  // Product mapping hooks
  useCountMappingImpact,
  useUpdateProductMapping,
  // Chart / analytics hooks
  useRevenueTimeSeries,
  useRevenueByOutlet,
  // Types
  type PeriodPreset,
} from "./useExternalData";

// Kitchen Production (Kitchen V3 Redesign)
export { useKitchenProduction } from "./useKitchenProduction";

// Kitchen Targets (Kitchen V4 Redesign — Phase 21)
export { useKitchenTargets } from "./useKitchenTargets";

// Protected Mutation Wrapper
export { useProtectedMutation } from "./useProtectedMutation";

// Sales Analytics Health Monitoring
export {
  useSyncHealthStatus,
  useSyncHealthAlert,
  useCredentialStatusEnhanced,
} from "./useSalesAnalytics";

// K3 Mart Cockpit (K3 Mart Management Cockpit)
export {
  // Query hooks
  useOutletStockSummary,
  useWeeklyDispatchPlans,
  useProductionReadiness,
  useInventorySources,
  useOutletDetail,
  useStockMovementHistory,
  // Action hooks
  useFetchOutletDashboard,
  useSubmitStockFlow,
  useSubmitBulkStockIns,
  useCancelStockFlow,
  useFetchStockFlowHistory,
  useFetchStockFlowDetail,
  useVerifySubmissionStatuses,
  useRefreshOutlets,
  // Protected mutation hooks
  useSaveWeeklyDispatchPlan,
  useConfirmDayPlan,
  useProcessStockOutDestination,
  useToggleOutletActive,
  useSaveOutletSettings,
  useCopyLastWeek,
  useSetProductTarget,
  useOutletSettings,
} from "./useK3MartCockpit";

// Production Recipes (Production Component Hierarchy & COGS)
export {
  // Query hooks
  useProductionRecipe,
  useProductionCogs,
  useProductionComponentsWithTiers,
  // Mutation hooks
  useAddSubComponent,
  useRemoveSubComponent,
  useUpdateSubComponentQuantity,
  useAddIngredient,
  useRemoveIngredient,
  useUpdateIngredientQuantity,
} from "./useProductionRecipes";

// Product Inventory (Finished Goods Inventory Tracker - Phase 17.1)
export {
  useProductInventory,
  useProductInventoryGrouped,
  useProductInventoryTransactions,
  type ProductStockRow,
  type ProductLowStockAlert,
  type ProductInventorySettings,
  type ProductStockGroup,
} from "./useProductInventory";

// GoFood Depot Management (Phase 19)
export {
  useGoFoodDepotSeedCheck,
  useGoFoodDepotOutlets,
  useGoFoodDepotStock,
  useGoFoodRestockSuggestions,
  useGoFoodOutletMappings,
  useGoFoodMenuProducts,
  useGoFoodStockOverviewGrouped,
  useGoFoodStorageLocations,
  useGoFoodSaveOutletMappings,
  useGoFoodInitOutletMappings,
  useGoFoodAdjustDepotStock,
  useGoFoodTransferStock,
} from "./useGoFoodDepot";

// BigSeller Integration (Phase 28)
export {
  useBigSellerSyncState,
  useBigSellerOrders,
  useBigSellerUnmappedSkus,
  useBigSellerOrderStats,
  useStartBigSellerSync,
} from "./useBigSeller";

// GrabFood Menu Simulator
export {
  useGrabFoodMenu,
  useMenuProductsList,
} from "./useGrabFoodMenu";

// Dispatch Planner (Unified Dispatch Planner)
export {
  // Query hooks
  useDispatchPlannerWeekly,
  useDispatchChannelConfig,
  useDispatchPlannerSettings,
  useDispatchConsignmentOutlets,
  useDispatchSimulateInventory,
  useGetBallTotalsForDate,
  // Mutation hooks
  useDispatchSeedDefaults,
  useDispatchSavePlanCell,
  useDispatchUpdateChannelConfig,
  useDispatchReorderPriorities,
  useDispatchUpdateSettings,
  useDispatchAddConsignmentOutlet,
  useDispatchUpdateConsignmentOutlet,
  useDispatchRemoveConsignmentOutlet,
  useSetKitchenDailyOverride,
} from "./useDispatchPlanner";
