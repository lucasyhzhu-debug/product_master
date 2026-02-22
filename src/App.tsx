import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/AuthContext";
import {
  RecipeEditor,
  PackagingEditor,
  ProductEditor,
  IngredientsManager,
  MaterialsManager,
  OrderManager,
  OrderCreate,
  OrderDetail,
  KitchenViewV2,
  PackagingView,
  MenuProductsManager,
  WhatsAppTemplatesManager,
  VouchersManager,
  InventoryManager,
  LocationsManager,
  ProductionComponentsManager,
  SalesAnalytics,
  K3MartCockpit,
  CustomersManager,
  TagsManager,
  DispatchPlanner,
  GoFoodDepotManager,
} from "@/pages";
import Login from "@/pages/Login";
import UsersManager from "@/pages/UsersManager";
import {
  ProtectedRoute,
  PublicOnlyRoute,
} from "@/components/auth/ProtectedRoute";

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
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

              {/* Recipe/Packaging/Product editors - Manager and Admin */}
              <Route
                path="recipes/:id"
                element={
                  <ProtectedRoute requiredPermission="canAccessRecipes">
                    <RecipeEditor />
                  </ProtectedRoute>
                }
              />

              <Route
                path="packaging/:id"
                element={
                  <ProtectedRoute requiredPermission="canAccessRecipes">
                    <PackagingEditor />
                  </ProtectedRoute>
                }
              />

              <Route
                path="products/:id"
                element={
                  <ProtectedRoute requiredPermission="canAccessProducts">
                    <ProductEditor />
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

              <Route
                path="materials"
                element={
                  <ProtectedRoute requiredPermission="canAccessMaterials">
                    <MaterialsManager />
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

              {/* Tags - Manager and Admin */}
              <Route
                path="tags"
                element={
                  <ProtectedRoute requiredPermission="canAccessRecipes">
                    <TagsManager />
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

              {/* Sales Analytics - Manager and Admin */}
              <Route
                path="sales"
                element={
                  <ProtectedRoute requiredPermission="canAccessSalesAnalytics">
                    <SalesAnalytics />
                  </ProtectedRoute>
                }
              />

              {/* K3 Mart Cockpit - Manager and Admin */}
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
            </Route>

            {/* Redirects (no layout needed) */}
            <Route path="restock" element={<Navigate to="/k3mart-cockpit" replace />} />
            <Route path="inventory/components" element={<Navigate to="/components/production" replace />} />
            <Route path="components/packaging" element={<Navigate to="/inventory" replace />} />
          </Route>

          {/* Catch-all redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
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
  // Manager and Admin → Sales
  return <Navigate to="/sales" replace />;
}

export default App;
