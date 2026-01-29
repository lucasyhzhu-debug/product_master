---
name: implement_role_based_access
description: Implement generic Role-Based Access Control (RBAC) for UI elements and Routes.
---

# Implement Role-Based Access Control (RBAC)

Use this skill to restrict access to specific routes or UI components based on the user's role.

## 1. Define Permissions Configuration

Create or update `src/config/permissions.ts` to centralize access logic.
Do NOT hardcode `role === 'admin'` check scattered across components.

```typescript
// src/config/permissions.ts
import { Profile } from '@/services/auth';

export type UserRole = Profile['role'];

// Define granular permissions or route groups
export const PERMISSIONS = {
  // Routes strictly for Admin
  ADMIN_ROUTES: ['/admin', '/settings'],
  
  // Routes for Production Floor
  PRODUCTION_ROUTES: ['/production', '/inventory'],
  
  // Specific Actions
  CAN_DELETE_USER: ['admin'] as UserRole[],
  CAN_ADJUST_STOCK: ['admin', 'production_floor'] as UserRole[],
};

/**
 * Check if a role has access to a specific route prefix
 */
export function hasRouteAccess(role: UserRole, path: string): boolean {
  if (role === 'admin') return true; // Admin sees all
  
  // Add your logic here, e.g.:
  if (path.startsWith('/admin')) return false;
  if (path.startsWith('/production') && role === 'office') return false;
  
  return true;
}
```

## 2. Create RoleGuard Component

Create `src/components/auth/RoleGuard.tsx` to protect specific layouts or pages. This wraps the existing `AuthGuard` logic or extends it.

```tsx
'use client';

import { useAuth } from '@/hooks/useAuth'; // Assumes you create a hook or use session directly
import { UserRole } from '@/config/permissions';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  fallbackPath?: string;
}

export function RoleGuard({ children, allowedRoles, fallbackPath = '/unauthorized' }: RoleGuardProps) {
  const { session, loading } = useAuth(); // Implement useAuth or use getSession pattern
  const router = useRouter();

  useEffect(() => {
    if (!loading && session) {
      if (!allowedRoles.includes(session.role as UserRole)) {
        router.push(fallbackPath);
      }
    }
  }, [session, loading, allowedRoles, router, fallbackPath]);

  if (loading || !session || !allowedRoles.includes(session.role as UserRole)) {
    return null; // Or generic loader
  }

  return <>{children}</>;
}
```

## 3. Update Global Navigation

Refactor `src/components/domain/GlobalNavBar.tsx` to use the permission logic.

```tsx
// Inside GlobalNavBar component
// ... imports
import { hasRouteAccess } from '@/config/permissions';

// ... inside render
const navItems = [
    // ... items
].filter(item => {
    if (!session) return false;
    return hasRouteAccess(session.role, item.href);
});
```

## 4. Protect Module Layouts

Apply the `RoleGuard` in `src/app/(modules)/[module]/layout.tsx`.

```tsx
// src/app/(modules)/admin/layout.tsx
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['admin']}>
      {children}
    </RoleGuard>
  );
}
```
