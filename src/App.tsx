import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import { lazyWithPreload } from '@/lib/lazyWithPreload';
import { RouteLoadingFallback } from '@/components/shared/RouteLoadingFallback';
import { ChunkErrorBoundary } from '@/components/shared/ChunkErrorBoundary';

// EAGER: Login (entry point) and HubPage (manager/admin landing, zero Convex bandwidth)
import Login from "@/pages/Login";
import { HubPage } from '@/pages/HubPage';

// EAGER: Help Center — purely static JSX with no Convex queries
import { HelpCenter } from '@/pages/HelpCenter';
import { GuideRouter } from '@/pages/guides/GuideRouter';

import {
  ProtectedRoute,
  PublicOnlyRoute,
} from "@/components/auth/ProtectedRoute";

// LAZY: All other pages — each becomes its own JS chunk
// Named exports require the .then(m => ({ default: m.PageName })) pattern
// (React.lazy requires a default export)
const IngredientsManager = lazyWithPreload(() =>
  import('./pages/IngredientsManager').then(m => ({ default: m.IngredientsManager }))
);
const OrderManager = lazyWithPreload(() =>
  import('./pages/OrderManager').then(m => ({ default: m.OrderManager }))
);
const OrderCreate = lazyWithPreload(() =>
  import('./pages/OrderCreate').then(m => ({ default: m.OrderCreate }))
);
const OrderDetail = lazyWithPreload(() =>
  import('./pages/OrderDetail').then(m => ({ default: m.OrderDetail }))
);
const KitchenViewV2 = lazyWithPreload(() =>
  import('./pages/KitchenViewV2').then(m => ({ default: m.KitchenViewV2 }))
);
const PackagingView = lazyWithPreload(() =>
  import('./pages/PackagingView').then(m => ({ default: m.PackagingView }))
);
const MenuProductsManager = lazyWithPreload(() =>
  import('./pages/MenuProductsManager').then(m => ({ default: m.MenuProductsManager }))
);
const WhatsAppTemplatesManager = lazyWithPreload(() =>
  import('./pages/WhatsAppTemplatesManager').then(m => ({ default: m.WhatsAppTemplatesManager }))
);
const VouchersManager = lazyWithPreload(() =>
  import('./pages/VouchersManager').then(m => ({ default: m.VouchersManager }))
);
const InventoryManager = lazyWithPreload(() =>
  import('./pages/InventoryManager').then(m => ({ default: m.InventoryManager }))
);
const LocationsManager = lazyWithPreload(() =>
  import('./pages/LocationsManager').then(m => ({ default: m.LocationsManager }))
);
const ProductionComponentsManager = lazyWithPreload(() =>
  import('./pages/ProductionComponentsManager').then(m => ({ default: m.ProductionComponentsManager }))
);
const CustomersManager = lazyWithPreload(() =>
  import('./pages/CustomersManager').then(m => ({ default: m.CustomersManager }))
);
const UsersManager = lazyWithPreload(() =>
  import('./pages/UsersManager')
);
const DispatchPlanner = lazyWithPreload(() =>
  import('./pages/DispatchPlanner').then(m => ({ default: m.DispatchPlanner }))
);
const GoFoodDepotManager = lazyWithPreload(() =>
  import('./pages/GoFoodDepotManager').then(m => ({ default: m.GoFoodDepotManager }))
);
const SalesAnalytics = lazyWithPreload(() =>
  import('./pages/SalesAnalytics').then(m => ({ default: m.SalesAnalytics }))
);
const FinancialStatement = lazyWithPreload(() =>
  import('./pages/FinancialStatement').then(m => ({ default: m.FinancialStatement }))
);
const FinancialExportPage = lazyWithPreload(() =>
  import('./pages/FinancialExportPage').then(m => ({ default: m.FinancialExportPage }))
);
const K3MartCockpit = lazyWithPreload(() =>
  import('./pages/K3MartCockpit').then(m => ({ default: m.K3MartCockpit }))
);
const GrabFoodManager = lazyWithPreload(() =>
  import('./pages/GrabFoodManager').then(m => ({ default: m.GrabFoodManager }))
);
const GrabFoodMenuSimulator = lazyWithPreload(() =>
  import('./pages/GrabFoodMenuSimulator').then(m => ({ default: m.GrabFoodMenuSimulator }))
);
const AccountsManager = lazyWithPreload(() =>
  import('./pages/AccountsManager').then(m => ({ default: m.AccountsManager }))
);
const ExpenseSubmit = lazyWithPreload(() =>
  import('./pages/ExpenseSubmit').then(m => ({ default: m.ExpenseSubmit }))
);
const MyExpenses = lazyWithPreload(() =>
  import('./pages/MyExpenses').then(m => ({ default: m.MyExpenses }))
);
const ExpenseApproval = lazyWithPreload(() =>
  import('./pages/ExpenseApproval').then(m => ({ default: m.ExpenseApproval }))
);
const ReimbursementManager = lazyWithPreload(() =>
  import('./pages/ReimbursementManager').then(m => ({ default: m.ReimbursementManager }))
);
const BankAccountsManager = lazyWithPreload(() =>
  import('./pages/BankAccountsManager').then(m => ({ default: m.BankAccountsManager }))
);
const PayrollManager = lazyWithPreload(() =>
  import('./pages/PayrollManager').then(m => ({ default: m.PayrollManager }))
);
const ExpenseAnalytics = lazyWithPreload(() =>
  import('./pages/ExpenseAnalytics').then(m => ({ default: m.ExpenseAnalytics }))
);
const HistoricalImportPage = lazyWithPreload(() =>
  import('./pages/HistoricalImportPage').then(m => ({ default: m.HistoricalImportPage }))
);
const BusinessSettings = lazyWithPreload(() =>
  import('./pages/BusinessSettings').then(m => ({ default: m.BusinessSettings }))
);
const InvoicePage = lazyWithPreload(() =>
  import('./pages/InvoicePage').then(m => ({ default: m.InvoicePage }))
);
const ManualJournalEntry = lazyWithPreload(() =>
  import('./pages/ManualJournalEntry').then(m => ({ default: m.ManualJournalEntry }))
);
const AssetRegister = lazyWithPreload(() =>
  import('./pages/AssetRegister').then(m => ({ default: m.AssetRegister }))
);
const StockCount = lazyWithPreload(() =>
  import('./pages/StockCount').then(m => ({ default: m.StockCount }))
);
const BulkPriceUpdate = lazyWithPreload(() =>
  import('./pages/BulkPriceUpdate').then(m => ({ default: m.BulkPriceUpdate }))
);
const StaffPerformance = lazyWithPreload(() =>
  import('./pages/StaffPerformance').then(m => ({ default: m.StaffPerformance }))
);
const ClockInGate = lazyWithPreload(() =>
  import('./pages/ClockInGate').then(m => ({ default: m.ClockInGate }))
);
const MyPerformance = lazyWithPreload(() =>
  import('./pages/MyPerformance').then(m => ({ default: m.MyPerformance }))
);
const BankReconciliationPage = lazyWithPreload(() =>
  import('./pages/BankReconciliationPage').then(m => ({ default: m.BankReconciliationPage }))
);
const BankRulesManager = lazyWithPreload(() =>
  import('./pages/BankRulesManager').then(m => ({ default: m.BankRulesManager }))
);
const AnalyticsDashboard = lazyWithPreload(() =>
  import('./pages/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard }))
);
const UnlinkedProductsBackfill = lazyWithPreload(() =>
  import('./pages/UnlinkedProductsBackfill').then(m => ({ default: m.UnlinkedProductsBackfill }))
);

// BEGIN 74.5.1 ROUTES — lazy imports
// Plan 09 (ChannelRoutingManager + ProductInventorySettings) adds these.
// Plan 10 (ChannelAuditWorkbench) appends the audit workbench.
const ChannelRoutingManager = lazyWithPreload(() =>
  import('./pages/ChannelRoutingManager').then(m => ({ default: m.ChannelRoutingManager }))
);
const ProductInventorySettings = lazyWithPreload(() =>
  import('./pages/ProductInventorySettings').then(m => ({ default: m.ProductInventorySettings }))
);
const ChannelAuditWorkbench = lazyWithPreload(() =>
  import('./pages/ChannelAuditWorkbench').then(m => ({ default: m.ChannelAuditWorkbench }))
);
// END 74.5.1 ROUTES — lazy imports

// Phase 85: /admin/telegram-chats — Telegram chat registry
const TelegramChatsManager = lazyWithPreload(() =>
  import('./pages/TelegramChatsManager').then(m => ({ default: m.TelegramChatsManager }))
);

// Phase D: /crm — CRM home shell
const CrmHome = lazyWithPreload(() =>
  import('./pages/crm/CrmHome').then(m => ({ default: m.CrmHome }))
);
// Phase B (Subscriptions): /crm/customers/:customerId/subscriptions/:subId/week
const SubscriptionSchedulePage = lazyWithPreload(() =>
  import('./pages/crm/SubscriptionSchedulePage').then(m => ({ default: m.SubscriptionSchedulePage }))
);
// Phase B (Subscriptions): /crm/customers/:customerId/subscriptions/:subId/week/invoice
const SubscriptionWeeklyInvoicePage = lazyWithPreload(() =>
  import('./pages/crm/SubscriptionWeeklyInvoicePage').then(m => ({ default: m.SubscriptionWeeklyInvoicePage }))
);
// Phase B (Subscriptions): /crm/funding — operator funding dashboard
const CrmFundingDashboardPage = lazyWithPreload(() =>
  import('./pages/crm/CrmFundingDashboardPage').then(m => ({ default: m.CrmFundingDashboardPage }))
);
// Phase D: /crm/customers/:customerId — customer hub (two-pane)
const CustomerDashboard = lazyWithPreload(() =>
  import('./pages/crm/CustomerDashboard').then(m => ({ default: m.CustomerDashboard }))
);
// Phase D: /crm/customers/:customerId/agreements — agreement page (T15)
const AgreementPage = lazyWithPreload(() =>
  import('./pages/crm/AgreementPage').then(m => ({ default: m.AgreementPage }))
);
// Phase D: /crm/customers/:customerId/subscriptions/:subId — subscription detail (T16)
const SubscriptionPage = lazyWithPreload(() =>
  import('./pages/crm/SubscriptionPage').then(m => ({ default: m.SubscriptionPage }))
);
// Phase D: /crm/customers/:customerId/activity — customer activity timeline (T22)
const CustomerActivityPage = lazyWithPreload(() =>
  import('./pages/crm/CustomerActivityPage').then(m => ({ default: m.CustomerActivityPage }))
);
// Sub-onboarding: /crm/customers/:customerId/subscriptions/new — create draft subscription
const NewSubscriptionPage = lazyWithPreload(() =>
  import('./pages/crm/NewSubscriptionPage').then(m => ({ default: m.NewSubscriptionPage }))
);

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <ChunkErrorBoundary>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              {/* Public route - login */}
              <Route
                path="/login"
                element={
                  <PublicOnlyRoute>
                    <Login />
                  </PublicOnlyRoute>
                }
              />

              {/* Protected routes */}
              <Route path="/">
                {/* Role-based landing page */}
                <Route index element={<RoleBasedRedirect />} />

                {/* Full-width pages (no PageContainer) */}
                <Route element={<Layout fullWidth />}>
                  <Route
                    path="kitchen"
                    element={
                      <ProtectedRoute requiredPermission="canAccessKitchen">
                        <KitchenViewV2 />
                      </ProtectedRoute>
                    }
                  />
                  {/* Phase 74: Clock-In gate screen (ATT-01). Kitchen-role users land
                      here after PIN login; they tap Clock-In and are routed to /kitchen. */}
                  <Route
                    path="kitchen/clock"
                    element={
                      <ProtectedRoute requiredPermission="canAccessKitchen">
                        <ClockInGate />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="orders"
                    element={
                      <ProtectedRoute requiredPermission="canAccessOrders">
                        <OrderManager />
                      </ProtectedRoute>
                    }
                  />
                </Route>

                {/* Standard pages (with PageContainer) */}
                <Route element={<Layout />}>
                  {/* Hub page - Manager and Admin landing */}
                  <Route
                    path="home"
                    element={
                      <ProtectedRoute requiredPermission="canAccessDashboard">
                        <HubPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Help Center -- All authenticated roles (auth-only, no permission restriction) */}
                  <Route path="help" element={<ProtectedRoute><HelpCenter /></ProtectedRoute>} />
                  <Route path="help/:guideId" element={<ProtectedRoute><GuideRouter /></ProtectedRoute>} />

                  {/* Packaging - All roles can access (PRD-5) */}
                  <Route
                    path="packaging"
                    element={
                      <ProtectedRoute requiredPermission="canAccessPackaging">
                        <PackagingView />
                      </ProtectedRoute>
                    }
                  />

                  {/* Order Create - Dedicated creation page */}
                  <Route
                    path="orders/new"
                    element={
                      <ProtectedRoute requiredPermission="canAccessOrders">
                        <OrderCreate />
                      </ProtectedRoute>
                    }
                  />

                  {/* Order Detail - Kitchen can view (no costs), others full access */}
                  <Route
                    path="orders/:id"
                    element={
                      <ProtectedRoute
                        allowedRoles={["order_staff", "manager", "admin", "kitchen"]}
                      >
                        <OrderDetail />
                      </ProtectedRoute>
                    }
                  />

                  {/* Invoice Form + Preview (Phase 58) */}
                  <Route
                    path="orders/:orderId/invoice"
                    element={
                      <ProtectedRoute requiredPermission="canAccessInvoices">
                        <InvoicePage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Invoice Print View - finalized (Phase 58) */}
                  <Route
                    path="orders/:orderId/invoice/:invoiceNumber"
                    element={
                      <ProtectedRoute requiredPermission="canAccessInvoices">
                        <InvoicePage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Ingredients/Materials - Manager and Admin */}
                  <Route
                    path="ingredients"
                    element={
                      <ProtectedRoute requiredPermission="canAccessIngredients">
                        <IngredientsManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Bulk Price Update - Manager and Admin (Phase 68) */}
                  <Route
                    path="bulk-price-update"
                    element={
                      <ProtectedRoute requiredPermission="canAccessIngredients">
                        <BulkPriceUpdate />
                      </ProtectedRoute>
                    }
                  />

                  {/* Customers - Order Staff, Manager, Admin */}
                  <Route
                    path="customers"
                    element={
                      <ProtectedRoute requiredPermission="canAccessOrders">
                        <CustomersManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Menu Products - Admin only */}
                  <Route
                    path="menu-products"
                    element={
                      <ProtectedRoute requiredPermission="canAccessMenuProducts">
                        <MenuProductsManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Users - Admin only */}
                  <Route
                    path="users"
                    element={
                      <ProtectedRoute requiredPermission="canAccessUsers">
                        <UsersManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* WhatsApp Templates - Manager and Admin */}
                  <Route
                    path="whatsapp-templates"
                    element={
                      <ProtectedRoute requiredPermission="canManageWhatsAppTemplates">
                        <WhatsAppTemplatesManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Vouchers - Admin only */}
                  <Route
                    path="vouchers"
                    element={
                      <ProtectedRoute requiredPermission="canAccessVouchers">
                        <VouchersManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Expenses - All authenticated roles (Phase 44) */}
                  <Route
                    path="expenses"
                    element={
                      <ProtectedRoute requiredPermission="canSubmitExpenses">
                        <MyExpenses />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="expenses/new"
                    element={
                      <ProtectedRoute requiredPermission="canSubmitExpenses">
                        <ExpenseSubmit />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="expenses/approve"
                    element={
                      <ProtectedRoute requiredPermission="canApproveExpenses">
                        <ExpenseApproval />
                      </ProtectedRoute>
                    }
                  />

                  {/* Expense Analytics - Manager and Admin (Phase 50 stub) */}
                  <Route
                    path="expense-analytics"
                    element={
                      <ProtectedRoute requiredPermission="canAccessExpenseAnalytics">
                        <ExpenseAnalytics />
                      </ProtectedRoute>
                    }
                  />

                  {/* Reimbursements (admin-only, Phase 46) */}
                  <Route
                    path="reimbursements"
                    element={
                      <ProtectedRoute requiredPermission="canManageReimbursements">
                        <ReimbursementManager />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="bank-accounts"
                    element={
                      <ProtectedRoute requiredPermission="canManageReimbursements">
                        <BankAccountsManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Payroll (admin-only, Phase 47) */}
                  <Route
                    path="payroll"
                    element={
                      <ProtectedRoute requiredPermission="canManageReimbursements">
                        <PayrollManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Chart of Accounts (admin-only) */}
                  <Route
                    path="accounts"
                    element={
                      <ProtectedRoute requiredPermission="canManageReimbursements">
                        <AccountsManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Business Settings (admin-only, Phase 57) */}
                  <Route
                    path="settings/business"
                    element={
                      <ProtectedRoute requiredPermission="canAccessBusinessSettings">
                        <BusinessSettings />
                      </ProtectedRoute>
                    }
                  />

                  {/* Historical Expense Import (admin-only, Phase 51) */}
                  <Route
                    path="import"
                    element={
                      <ProtectedRoute requiredPermission="canManageReimbursements">
                        <HistoricalImportPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Manual Journal Entry (admin + manager, Phase 62) */}
                  <Route
                    path="journal"
                    element={
                      <ProtectedRoute requiredPermission="canManageReimbursements">
                        <ManualJournalEntry />
                      </ProtectedRoute>
                    }
                  />

                  {/* Bank Reconciliation — /bank-reconciliation (manager + admin, Phase 73 D-23) */}
                  <Route
                    path="bank-reconciliation"
                    element={
                      <ProtectedRoute allowedRoles={["manager", "admin"]}>
                        <BankReconciliationPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Bank Rules — /bank-rules (admin-only, Phase 72) */}
                  <Route
                    path="bank-rules"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <BankRulesManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Phase 80.2: Unlinked Products Backfill — admin-only one-time data repair */}
                  <Route
                    path="admin/unlinked-products-backfill"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <UnlinkedProductsBackfill />
                      </ProtectedRoute>
                    }
                  />

                  {/* BEGIN 74.5.1 ROUTES — Channel Routing Spine admin surfaces */}
                  {/* Plan 09: /admin/channel-routing — routing rule CRUD + resolution preview */}
                  <Route
                    path="admin/channel-routing"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <ChannelRoutingManager />
                      </ProtectedRoute>
                    }
                  />
                  {/* Plan 09: /admin/product-inventory-settings — 8-key flag map + thresholds */}
                  <Route
                    path="admin/product-inventory-settings"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <ProductInventorySettings />
                      </ProtectedRoute>
                    }
                  />
                  {/* Plan 10: /admin/channel-audit — 5-issue-type audit workbench */}
                  <Route
                    path="admin/channel-audit"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <ChannelAuditWorkbench />
                      </ProtectedRoute>
                    }
                  />
                  {/* END 74.5.1 ROUTES */}

                  {/* Phase 85: /admin/telegram-chats — Telegram chat registry */}
                  <Route
                    path="admin/telegram-chats"
                    element={
                      <ProtectedRoute requiredPermission="canAccessTelegramChats">
                        <TelegramChatsManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Asset Register (manager + admin, Phase 60) */}
                  <Route
                    path="assets"
                    element={
                      <ProtectedRoute requiredPermission="canAccessAssets">
                        <AssetRegister />
                      </ProtectedRoute>
                    }
                  />
                  {/* Phase 73 D-21: /asset-register/new alias for CapEx round-trip */}
                  <Route
                    path="asset-register/new"
                    element={
                      <ProtectedRoute requiredPermission="canAccessAssets">
                        <AssetRegister />
                      </ProtectedRoute>
                    }
                  />

                  {/* Staff Performance Report (manager + admin) */}
                  <Route
                    path="staff-performance"
                    element={
                      <ProtectedRoute requiredPermission="canAccessDashboard">
                        <StaffPerformance />
                      </ProtectedRoute>
                    }
                  />

                  {/* My Performance — self-scoped attendance + production (all roles, Phase 74 D-13) */}
                  <Route
                    path="my-performance"
                    element={
                      <ProtectedRoute requiredPermission="canAccessKitchen">
                        <MyPerformance />
                      </ProtectedRoute>
                    }
                  />

                  {/* Inventory - Manager and Admin */}
                  <Route
                    path="inventory"
                    element={
                      <ProtectedRoute requiredPermission="canAccessInventory">
                        <InventoryManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Inventory Locations - Manager and Admin */}
                  <Route
                    path="inventory/locations"
                    element={
                      <ProtectedRoute requiredPermission="canAccessInventory">
                        <LocationsManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* Stock Count - All roles with inventory access */}
                  <Route
                    path="inventory/stock-count"
                    element={
                      <ProtectedRoute requiredPermission="canAccessInventory">
                        <StockCount />
                      </ProtectedRoute>
                    }
                  />

                  {/* Production Components - Manager and Admin */}
                  <Route
                    path="components/production"
                    element={
                      <ProtectedRoute requiredPermission="canAccessInventory">
                        <ProductionComponentsManager />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="sales"
                    element={
                      <ProtectedRoute requiredPermission="canAccessSalesAnalytics">
                        <SalesAnalytics />
                      </ProtectedRoute>
                    }
                  />

                  {/* Phase 80: Unit Economics Analytics Dashboard - Manager + Admin */}
                  <Route
                    path="analytics"
                    element={
                      <ProtectedRoute requiredPermission="canAccessDashboard">
                        <AnalyticsDashboard />
                      </ProtectedRoute>
                    }
                  />

                  {/* Income Statement - Manager and Admin */}
                  <Route
                    path="financials"
                    element={
                      <ProtectedRoute requiredPermission="canAccessDashboard">
                        <FinancialStatement />
                      </ProtectedRoute>
                    }
                  />

                  {/* Phase 76 — Financial Data Export (FIN-03 + FIN-04) — Manager + Admin */}
                  <Route
                    path="financials/export"
                    element={
                      <ProtectedRoute allowedRoles={["manager", "admin"]}>
                        <FinancialExportPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="k3mart-cockpit"
                    element={
                      <ProtectedRoute requiredPermission="canAccessSalesAnalytics">
                        <K3MartCockpit />
                      </ProtectedRoute>
                    }
                  />

                  {/* Restock Planner - Manager and Admin */}
                  <Route
                    path="restock-planner"
                    element={
                      <ProtectedRoute requiredPermission="canAccessDashboard">
                        <DispatchPlanner />
                      </ProtectedRoute>
                    }
                  />

                  {/* GoFood Depot Management - Manager and Admin */}
                  <Route
                    path="gofood-depot"
                    element={
                      <ProtectedRoute requiredPermission="canAccessDashboard">
                        <GoFoodDepotManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* GrabFood Manager - Manager and Admin */}
                  <Route
                    path="grabfood"
                    element={
                      <ProtectedRoute requiredPermission="canAccessSalesAnalytics">
                        <GrabFoodManager />
                      </ProtectedRoute>
                    }
                  />

                  {/* GrabFood Menu Simulator - Admin */}
                  <Route
                    path="grabfood-menu"
                    element={
                      <ProtectedRoute requiredPermission="canAccessDashboard">
                        <GrabFoodMenuSimulator />
                      </ProtectedRoute>
                    }
                  />

                  {/* Phase D — CRM home shell (manager + admin) */}
                  <Route
                    path="crm"
                    element={
                      <ProtectedRoute requiredPermission="canAccessCrm">
                        <CrmHome />
                      </ProtectedRoute>
                    }
                  />
                  {/* Phase D — Customer hub (two-pane) (manager + admin) */}
                  <Route
                    path="crm/customers/:customerId"
                    element={
                      <ProtectedRoute requiredPermission="canAccessCrm">
                        <CustomerDashboard />
                      </ProtectedRoute>
                    }
                  />
                  {/* Phase D — Agreement page (T15) (manager + admin) */}
                  <Route
                    path="crm/customers/:customerId/agreements"
                    element={
                      <ProtectedRoute requiredPermission="canAccessCrm">
                        <AgreementPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Sub-onboarding — new subscription form (static "new" before :subId) */}
                  <Route
                    path="crm/customers/:customerId/subscriptions/new"
                    element={
                      <ProtectedRoute requiredPermission="canAccessCrm">
                        <NewSubscriptionPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Phase D — Subscription detail page (T16) (manager + admin) */}
                  <Route
                    path="crm/customers/:customerId/subscriptions/:subId"
                    element={
                      <ProtectedRoute requiredPermission="canAccessCrm">
                        <SubscriptionPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Phase D — Customer activity timeline (T22) (manager + admin) */}
                  <Route
                    path="crm/customers/:customerId/activity"
                    element={
                      <ProtectedRoute requiredPermission="canAccessCrm">
                        <CustomerActivityPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Phase B (Subscriptions) — CRM schedule calendar (manager + admin) */}
                  <Route
                    path="crm/customers/:customerId/subscriptions/:subId/week"
                    element={
                      <ProtectedRoute requiredPermission="canAccessCrm">
                        <SubscriptionSchedulePage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Phase B (Subscriptions) — Weekly invoice page (manager + admin) */}
                  <Route
                    path="crm/customers/:customerId/subscriptions/:subId/week/invoice"
                    element={
                      <ProtectedRoute requiredPermission="canAccessCrm">
                        <SubscriptionWeeklyInvoicePage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Phase B (Subscriptions) — Funding dashboard (manager + admin) */}
                  <Route
                    path="crm/funding"
                    element={
                      <ProtectedRoute requiredPermission="canAccessCrm">
                        <CrmFundingDashboardPage />
                      </ProtectedRoute>
                    }
                  />
                </Route>

                {/* Redirects (no layout needed) */}
                <Route path="restock" element={<Navigate to="/k3mart-cockpit" replace />} />
                <Route path="inventory/components" element={<Navigate to="/components/production" replace />} />
                <Route path="components/packaging" element={<Navigate to="/inventory" replace />} />
              </Route>

              {/* Catch-all redirect to login */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </ChunkErrorBoundary>
      </BrowserRouter>
      <Toaster />
    </TooltipProvider>
  );
}

/** Redirects to the appropriate landing page based on user role */
function RoleBasedRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // Phase 74: kitchen role lands on the Clock-In gate screen (ATT-01, D-01).
  if (user.role === "kitchen") return <Navigate to="/kitchen/clock" replace />;
  if (user.role === "order_staff") return <Navigate to="/orders" replace />;
  // Manager and Admin → Hub page
  return <Navigate to="/home" replace />;
}

export default App;
