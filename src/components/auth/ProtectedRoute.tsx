import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { type UserRole, ROLE_PERMISSIONS, getRoleLandingPage } from "../../lib/types";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: keyof typeof ROLE_PERMISSIONS.admin;
  allowedRoles?: UserRole[];
  redirectTo?: string;
}

export function ProtectedRoute({
  children,
  requiredPermission,
  allowedRoles,
  redirectTo,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, hasPermission, hasRole } = useAuth();
  const location = useLocation();

  // Show nothing while loading auth state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access
  if (allowedRoles && !hasRole(...allowedRoles)) {
    // Redirect to user's role-appropriate landing page
    const fallbackRoute = redirectTo || getRoleLandingPage(user.role);
    return <Navigate to={fallbackRoute} replace />;
  }

  // Check permission-based access
  if (requiredPermission && !hasPermission(requiredPermission)) {
    const fallbackRoute = redirectTo || getRoleLandingPage(user.role);
    return <Navigate to={fallbackRoute} replace />;
  }

  return <>{children}</>;
}

// Export a helper component for public-only routes (login page)
interface PublicOnlyRouteProps {
  children: ReactNode;
}

export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // If authenticated, redirect to role's landing page
  if (isAuthenticated && user) {
    return <Navigate to={getRoleLandingPage(user.role)} replace />;
  }

  return <>{children}</>;
}
