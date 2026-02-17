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

// Packaging Materials
export {
  useConvexMaterials,
  useConvexMaterial,
  useConvexMaterialSearch,
  useConvexCreateMaterial,
  useConvexUpdateMaterial,
  useConvexDeleteMaterial,
  type ConvexPackagingMaterial,
  type MaterialCreateInput,
} from "./useMaterials";

// Tags
export {
  useConvexTags,
  useConvexTag,
  useConvexTagsMany,
  useConvexCreateTag,
  useConvexUpdateTag,
  useConvexDeleteTag,
  useConvexSeedTags,
  type ConvexTag,
  type TagCreateInput,
} from "./useTags";

// Recipes
export {
  useConvexRecipes,
  useConvexRecipe,
  useConvexRecipeVersion,
  useConvexReusableComponents,
  useConvexRecipesUsingComponent,
  useConvexRecipeSearch,
  useConvexCreateRecipe,
  useConvexCopyRecipeVersion,
  useConvexCreateRecipeVersion,
  useConvexUpdateRecipeTags,
  useConvexUpdateRecipeName,
  useConvexDeleteRecipe,
  useConvexRecalculateRecipeCosts,
  type ComponentIngredientInput,
  type RecipeComponentInput,
  type RecipeVersionInput,
  type RecipeCreateInput,
} from "./useRecipes";

// Packaging
export {
  useConvexPackagingList,
  useConvexPackaging,
  useConvexPackagingVersion,
  useConvexPackagingSearch,
  useConvexCreatePackaging,
  useConvexCopyPackagingVersion,
  useConvexCreatePackagingVersion,
  useConvexUpdatePackagingTags,
  useConvexUpdatePackagingName,
  useConvexDeletePackaging,
  useConvexRecalculatePackagingCosts,
  type PackagingMaterialInput,
  type PackagingComponentInput,
  type PackagingVersionInput,
  type PackagingCreateInput,
} from "./usePackaging";

// Products
export {
  useConvexProducts,
  useConvexProduct,
  useConvexProductVersion,
  useConvexProductsUsingRecipe,
  useConvexProductsUsingPackaging,
  useConvexProductSearch,
  useConvexCreateProduct,
  useConvexCopyProductVersion,
  useConvexCreateProductVersion,
  useConvexUpdateProductTags,
  useConvexUpdateProductName,
  useConvexDeleteProduct,
  useConvexRecalculateProductCogs,
  type ProductVersionInput,
  type ProductCreateInput,
} from "./useProducts";

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

// Dashboard
export {
  useConvexDashboardSummary,
  useConvexRecentOrders,
  useConvexUpcomingDue,
  useConvexOrderStats,
} from "./useDashboard";

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
