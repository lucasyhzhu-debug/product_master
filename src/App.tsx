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
  OrderDetail,
  KitchenView,
  KitchenViewV2,
  PackagingView,
  MenuProductsManager,
  WhatsAppTemplatesManager,
  VouchersManager,
  InventoryManager,
  LocationsManager,
  ProductionComponentsManager,
  SalesAnalytics,
  RestockPlanner,
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

          {/* Protected routes with Layout */}
          <Route path="/" element={<Layout />}>
            {/* Role-based landing page */}
            <Route
              index
              element={<RoleBasedRedirect />}
            />

            {/* Kitchen V2 - Primary kitchen view */}
            <Route
              path="kitchen"
              element={
                <ProtectedRoute requiredPermission="canAccessKitchen">
                  <KitchenViewV2 />
                </ProtectedRoute>
              }
            />

            {/* Kitchen V1 - Legacy rollback route */}
            <Route
              path="kitchen-legacy"
              element={
                <ProtectedRoute requiredPermission="canAccessKitchen">
                  <KitchenView />
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

            {/* Orders - Order Staff, Manager, Admin */}
            <Route
              path="orders"
              element={
                <ProtectedRoute requiredPermission="canAccessOrders">
                  <OrderManager />
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

            {/* Restock Planner - Manager and Admin */}
            <Route
              path="restock"
              element={
                <ProtectedRoute requiredPermission="canAccessSalesAnalytics">
                  <RestockPlanner />
                </ProtectedRoute>
              }
            />

            {/* Redirects for deleted pages (bookmarked URLs) */}
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
