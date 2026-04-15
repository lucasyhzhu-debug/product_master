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
  useExternalSyncLogs,
  useExternalProductMappings,
  useDashboardSalesSummary,
  useDashboardSalesSummaryByPeriod,
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
  useSetMenuProductForSku,
  // Chart / analytics hooks
  useRevenueTimeSeries,
  useRevenueByOutlet,
  // Lifetime totals
  useLifetimeTotals,
  // Types
  type PeriodPreset,
  type ChannelBreakdown,
  type LifetimeTotals,
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
  // Action hooks
  useFetchOutletDashboard,
  useSubmitStockFlow,
  useSubmitBulkStockIns,
  useCancelStockFlow,
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
  useBulkStockCount,
  useLastStockCount,
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
  useBackfillBigsellerItems,
  useRescanEmptyRows,
} from "./useBigSeller";

// GrabFood Integration (Phase 27)
export {
  useGrabFoodOrders,
  useGrabFoodOrderStats,
  useGrabFoodActions,
  useGrabFoodOutlets,
} from "./useGrabFood";

// GrabFood Menu Simulator
export {
  useGrabFoodMenu,
  useMenuProductsList,
} from "./useGrabFoodMenu";

// Consignment Settlements (Phase 29)
export {
  useConsignmentOutlets,
  useConsignmentSettlements,
  useConsignmentGlobalSummary,
  useCreateConsignmentOutlet,
  useUpdateConsignmentOutlet,
  useCreateConsignmentSettlement,
  useUpdateConsignmentSettlement,
  useMarkConsignmentPaid,
  useDeleteConsignmentSettlement,
} from "./useConsignment";

// Income Statement (Phase 33)
export { useFinancials } from "./useFinancials";

// Accounts (Chart of Accounts Management - Phase 43)
export {
  useAccounts,
  useAccount,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  type Account,
} from "./useAccounts";

// Expenses (Expense Submission - Phase 44, Approval - Phase 45)
export {
  // Query hooks
  useMyExpenses,
  useAllExpenses,
  useExpense,
  useExpenseStatusHistory,
  usePendingForApproval,
  useRejectionChain,
  // Mutation hooks
  useCreateExpenseDraft,
  useUpdateExpenseDraft,
  useSubmitExpense,
  useExpenseUploadUrl,
  useApproveExpense,
  useRejectExpense,
  useVoidExpense,
  // Types
  type Expense,
  type AllExpense,
  type ExpenseStatus,
  type ExpenseStatusHistoryEntry,
  type PendingExpense,
  type RejectionChainEntry,
} from "./useExpenses";

// Reimbursements (Reimbursement Batching - Phase 46)
export {
  // Query hooks
  useAwaitingPayment,
  useBatches,
  useBatchById,
  useBatchItems,
  // Mutation hooks
  useCreateBatch,
  useConfirmBatch,
  useVoidBatch,
  // Types
  type AwaitingPaymentGroup,
  type Batch,
} from "./useReimbursements";

// Bank Accounts (Reimbursement Batching - Phase 46)
export {
  // Query hooks
  useBankAccounts,
  useBankAccount,
  // Mutation hooks
  useCreateBankAccount,
  useUpdateBankAccount,
  useDeleteBankAccount,
  useUpdateBankDetails,
  // Types
  type BankAccount,
} from "./useBankAccounts";

// Payroll (Payroll Management - Phase 47)
export {
  usePayrollEntries,
  usePayrollEntry,
  useCreatePayroll,
  useVoidPayroll,
  usePayrollUploadUrl,
  type PayrollEntry,
  type PayrollStatus,
} from "./usePayroll";

// Expense Analytics (Phase 50)
export {
  useOpExAnalytics,
  useExpenseMetrics,
  useFraudFlags,
  type OpExAnalyticsData,
  type ExpenseMetricsData,
  type FraudFlagsData,
} from "./useExpenseAnalytics";

// Journal Import (Historical Expense Import - Phase 51)
export { useBulkCreateJournalEntries } from "./useJournalImport";

// Business Settings (Invoice Backend - Phase 57)
export {
  useBusinessSettings,
  useUpsertBusinessSettings,
  useBusinessSettingsUploadUrl,
  type BusinessSettings,
} from "./useBusinessSettings";

// Invoices (Invoice Backend - Phase 57)
export {
  useInvoicesByOrder,
  useInvoice,
  useCreateInvoiceDraft,
  useUpdateInvoiceDraft,
  useDiscardInvoiceDraft,
  useFinalizeInvoice,
  type Invoice,
} from "./useInvoice";

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

// Manual Journal Entry (Phase 62)
export {
  useManualJournalEntries,
  useCreateManualJournalEntry,
} from "./useManualJournal";

// Bulk Price Update (Phase 68: COGS Bulk Price Update)
export {
  useBulkUpdateIngredientPrices,
  useBulkUpdateMaterialPrices,
} from "./useBulkPriceUpdate";

// Fixed Assets (Asset Register & Depreciation - Phase 60)
export {
  useFixedAssets,
  useFixedAsset,
  useDepreciationPreview,
  useDepreciationReminder,
  useCreateAsset,
  useUpdateAsset,
  useRunDepreciation,
  useDisposeAsset,
  useVoidDepreciationMonth,
  useGenerateAssetUploadUrl,
} from "./useFixedAssets";

// Staff Performance (Kitchen production reporting)
export {
  useStaffPerformance,
  type StaffPerformanceData,
  type StaffSummary,
} from "./useStaffPerformance";
