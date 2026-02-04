import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Layout } from "@/components/layout";
import {
  Dashboard,
  RecipeEditor,
  PackagingEditor,
  ProductEditor,
  IngredientsManager,
  MaterialsManager,
  OrderManager,
  OrderDetail,
  KitchenView,
  PackagingView,
  MenuProductsManager,
  WhatsAppTemplatesManager,
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
            {/* Dashboard - Manager and Admin only */}
            <Route
              index
              element={
                <ProtectedRoute requiredPermission="canAccessDashboard">
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            {/* Kitchen - All roles can access */}
            <Route
              path="kitchen"
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

            {/* Menu Products - Manager and Admin */}
            <Route
              path="menu-products"
              element={
                <ProtectedRoute requiredPermission="canAccessProducts">
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
          </Route>

          {/* Catch-all redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
