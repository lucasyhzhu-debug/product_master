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

                  {/* Ingredients/Materials - Manager and Admin */}
                  <Route
                    path="ingredients"
                    element={
                      <ProtectedRoute requiredPermission="canAccessIngredients">
                        <IngredientsManager />
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

                  {/* Income Statement - Manager and Admin */}
                  <Route
                    path="financials"
                    element={
                      <ProtectedRoute requiredPermission="canAccessDashboard">
                        <FinancialStatement />
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
  if (user.role === "kitchen") return <Navigate to="/kitchen" replace />;
  if (user.role === "order_staff") return <Navigate to="/orders" replace />;
  // Manager and Admin → Hub page
  return <Navigate to="/home" replace />;
}

export default App;
