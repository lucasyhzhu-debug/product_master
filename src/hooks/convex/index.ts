/**
 * Convex hooks barrel export.
 * Import from here for cleaner imports in components.
 */

// Mutation Hook Factory
export { createMutationHook, type MutationHookConfig } from "./createMutationHook";

// Ingredients
export {
  useConvexIngredients,
  useConvexIngredient,
  useConvexIngredientSearch,
  useConvexCreateIngredient,
  useConvexUpdateIngredient,
  useConvexDeleteIngredient,
  type ConvexIngredient,
  type IngredientCreateInput,
} from "./useIngredients";

// Menu Products
export {
  // Query hooks
  useConvexMenuProducts,
  useConvexMenuProduct,
  useConvexMenuProductByCode,
  useConvexPosProducts,
  useConvexAvailableProducts,
  useConvexPackagingPosProducts,
  // Mutation hooks
  useConvexCreateMenuProduct,
  useConvexUpdateMenuProduct,
  useConvexDeleteMenuProduct,
  useConvexAssignToSlot,
  useConvexRemoveFromSlot,
  useConvexAssignToPackagingSlot,
  useConvexRemoveFromPackagingSlot,
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
  useConvexOrders,
  useConvexOrdersPaginated,
  useConvexOrder,
  useConvexOrderByNumber,
  useConvexKitchenOrders,
  useConvexOrdersByCustomer,
  useConvexProductSuggestions,
  useConvexSellerSuggestions,
  useConvexChannelSuggestions,
  useConvexWhatsAppMessage,
  useConvexOrderTemplate,
  useKanbanOrders,
  // Mutation hooks
  useCreateDraft,
  useUpdateDraft,
  useConvexCreateOrder,
  useConvexUpdateOrderStatus,
  useConvexUpdateOrderPayment,
  useConvexUpdateOrderShipping,
  useConvexUpdateOrderDetails,
  useConvexCancelOrder,
  useConvexDeleteOrder,
  useConvexAddOrderItem,
  useConvexRemoveOrderItem,
  useConvexUpdateOrderItemQuantity,
  useConvexReplaceOrderItems,
  useConvexUpdateOrderDiscount,
  useConvexUpdateOrderDeliveryFee,
  // Types
  type OrderItemInput,
  type OrderCreateInput,
  type OrderFilters,
  type WhatsAppTemplate,
} from "./useOrders";

// Customers
export {
  // Query hooks
  useConvexCustomers,
  useConvexCustomer,
  useConvexCustomerSearch,
  useConvexCustomerByPhone,
  // Mutation hooks
  useConvexCreateCustomer,
  useConvexUpdateCustomer,
  useConvexDeleteCustomer,
  // Types
  type CustomerCreateInput,
  type CustomerUpdateInput,
} from "./useCustomers";

// Kitchen Stats (PRD-1: Kitchen Core)
export {
  // Query hooks
  useConvexKitchenStats,
  useConvexKitchenOrdersWithBalls,
  useConvexCompletedToday,
  // Mutation hooks
  useConvexCompleteOrder,
  useConvexRevertToConfirmed,
  useConvexCompleteBalls,
  useConvexCompletePackaging,
  useConvexRevertToPackaging,
} from "./useKitchenStats";

// Visual Feedback Overlay
export {
  // Query hooks
  useConvexFeedbackList,
  useConvexFeedback,
  useConvexFeedbackExport,
  useConvexFeedbackStats,
  useConvexOngoingFeedbackCount,
  // Mutation hooks
  useConvexGenerateUploadUrl,
  useConvexCreateFeedback,
  useConvexAddFeedbackComment,
  useConvexToggleFeedbackStatus,
  useConvexUpdateFeedbackPriority,
  useConvexUpdateFeedbackTags,
  useConvexDeleteFeedback,
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
  useConvexProductionUnitTypes,
  useConvexProductionUnitType,
  useConvexProductionUnitTypeByCode,
  type ProductionUnitType,
  type ProductionUnitTypeWithId,
} from "./useProductionUnitTypes";

// Menu Product Components (PRD-4: Menu Products Manager)
export {
  useConvexMenuProductComponents,
  useConvexMenuProductComponentsBatch,
  type MenuProductComponentWithType,
} from "./useMenuProductComponents";

// Inventory (Inventory Management System)
export {
  // Query hooks
  useConvexLowStockAlerts,
  useConvexComponentInventory,
  useConvexLocationInventory,
  useConvexInventoryReport,
  useConvexComponentBatches,
  useConvexLocationTransactions,
  useConvexLatestBatch,
  // Mutation hooks
  useConvexReceiveStock,
  useConvexCreateComponentAndReceiveStock,
  useConvexTransferStock,
  useConvexAdjustStock,
  useConvexDeleteBatch,
  useConvexExpireBatch,
  // Types
  type ReceiveStockInput,
  type TransferStockInput,
  type AdjustStockInput,
  type LowStockAlert,
} from "./useInventory";

// Component Types (Inventory Management System)
export {
  // Query hooks
  useConvexComponentTypes,
  useConvexComponentType,
  useConvexComponentsByCategory,
  useConvexInventoryTrackedComponents,
  useConvexComponentByCode,
  // Mutation hooks
  useConvexCreateComponentType,
  useConvexUpdateComponentType,
  useConvexDeleteComponentType,
  useConvexCreatePackagingQuick,
  useConvexCreateIngredientComponentType,
  // Types
  type ComponentTypeCreateInput,
  type ComponentTypeUpdateInput,
  type ComponentType,
} from "./useComponentTypes";

// Storage Locations (Inventory Management System)
export {
  // Query hooks
  useConvexStorageLocations,
  useConvexStorageLocation,
  useConvexDefaultLocation,
  // Mutation hooks
  useConvexCreateStorageLocation,
  useConvexUpdateStorageLocation,
  useConvexDeleteStorageLocation,
  // Types
  type StorageLocationCreateInput,
  type StorageLocationUpdateInput,
  type StorageLocation,
} from "./useStorageLocations";

// External Data (Multi-Platform Sales Integration)
export {
  // Query hooks
  useConvexExternalOutlets,
  useConvexExternalSnapshots,
  useConvexExternalRevenue,
  useConvexExternalSyncLogs,
  useConvexExternalProductMappings,
  useConvexDashboardSalesSummary,
  useConvexDashboardSalesSummaryByPeriod,
  useConvexOrderDetailsByOrderNumber,
  useConvexRevenueItems,
  // Platform credentials hooks
  useConvexCredentialStatus,
  useConvexRefreshK3MartToken,
  // Action hooks
  useConvexDiscoverK3MartOutlets,
  useConvexSyncK3MartSales,
  useConvexSyncK3MartStock,
  useConvexSyncGoBiz,
  useConvexSyncInternalOrders,
  // Restock planner hooks
  useConvexRestockOverview,
  useConvexChannelSellThrough,
  useConvexSaveRestockTarget,
  useConvexUpdateManualStock,
  // Product mapping hooks
  useConvexCountMappingImpact,
  useConvexUpdateProductMapping,
  // Chart / analytics hooks
  useConvexRevenueTimeSeries,
  useConvexRevenueByOutlet,
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
  useConvexSyncHealthStatus,
  useConvexSyncHealthAlert,
  useConvexCredentialStatusEnhanced,
} from "./useSalesAnalytics";

// K3 Mart Cockpit (K3 Mart Management Cockpit)
export {
  // Query hooks
  useConvexOutletStockSummary,
  useConvexWeeklyDispatchPlans,
  useConvexProductionReadiness,
  useConvexInventorySources,
  useConvexOutletDetail,
  useConvexStockMovementHistory,
  // Action hooks
  useConvexFetchOutletDashboard,
  useConvexSubmitStockFlow,
  useConvexSubmitBulkStockIns,
  useConvexCancelStockFlow,
  useConvexFetchStockFlowHistory,
  useConvexFetchStockFlowDetail,
  useConvexVerifySubmissionStatuses,
  useConvexRefreshOutlets,
  // Protected mutation hooks
  useConvexSaveWeeklyDispatchPlan,
  useConvexConfirmDayPlan,
  useConvexProcessStockOutDestination,
  useConvexToggleOutletActive,
  useConvexSaveOutletSettings,
  useConvexCopyLastWeek,
  useConvexSetProductTarget,
  useConvexOutletSettings,
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

// Dispatch Planner (Unified Dispatch Planner)
export {
  // Query hooks
  useDispatchPlannerWeekly,
  useDispatchChannelConfig,
  useDispatchPlannerSettings,
  useDispatchConsignmentOutlets,
  useDispatchSimulateInventory,
  // Mutation hooks
  useDispatchSeedDefaults,
  useDispatchSavePlanCell,
  useDispatchUpdateChannelConfig,
  useDispatchReorderPriorities,
  useDispatchUpdateSettings,
  useDispatchAddConsignmentOutlet,
  useDispatchUpdateConsignmentOutlet,
  useDispatchRemoveConsignmentOutlet,
} from "./useDispatchPlanner";
