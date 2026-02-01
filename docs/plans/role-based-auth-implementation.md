# Role-Based Authentication Plan for Frollie Recipe Master

## Summary

Implement PIN-based authentication with 3 roles (Kitchen, Order Staff, Admin) for shared factory floor devices. 8-hour sessions, avatar-based login UI, role-based redirects, and account lockout security.

---

## User Requirements (from interview)

| Decision | Choice |
|----------|--------|
| Auth method | PIN-based (4-6 digits) |
| Kitchen → Order Detail | View-only (hide costs) |
| Order Staff → Kitchen View | Read-only access |
| Dashboard access | Hide from non-admins |
| Session length | 8 hours (one shift) |
| User management | Admins only |
| Landing page | Role-based redirect |
| Failed PIN security | Lock after 5 failures (15 min) |
| Location support | Plan for multi-location (add field now) |
| User profile fields | Name + PIN + Role only |
| Login UI | PIN pad with avatars |

---

## Role Access Matrix

| Route | Kitchen | Order Staff | Admin |
|-------|---------|-------------|-------|
| `/` (Dashboard) | Redirect → /kitchen | Redirect → /orders | Full access |
| `/kitchen` | **Full access** | Read-only | Full access |
| `/orders` | Redirect → /kitchen | **Full access** | Full access |
| `/orders/:id` | View-only (no costs) | Full access | Full access |
| `/recipes/:id` | Blocked | Blocked | Full access |
| `/packaging/:id` | Blocked | Blocked | Full access |
| `/products/:id` | Blocked | Blocked | Full access |
| `/ingredients` | Blocked | Blocked | Full access |
| `/materials` | Blocked | Blocked | Full access |
| `/users` (new) | Blocked | Blocked | Full access |

---

## Implementation Phases

### Phase 1: Database Schema (Backend)

**File: `convex/schema.ts`**

Add new `users` table:
```typescript
users: defineTable({
  name: v.string(),
  pinHash: v.string(),           // Hashed 4-6 digit PIN
  role: v.union(v.literal("kitchen"), v.literal("order_staff"), v.literal("admin")),
  avatarUrl: v.optional(v.string()),  // For avatar picker
  isActive: v.boolean(),
  locationId: v.optional(v.string()), // Future: multi-location
  failedAttempts: v.number(),         // For lockout
  lockedUntil: v.optional(v.number()),// Lockout timestamp
  lastLoginAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_role", ["role"])
  .index("by_active", ["isActive"])
```

### Phase 2: Auth Backend (Convex)

**New files to create:**

1. **`convex/lib/auth.ts`** - Helper functions
   - `hashPin(pin: string): string` - Hash PIN for storage
   - `verifyPin(pin: string, hash: string): boolean` - Verify on login
   - `requireRole(ctx, allowedRoles): Promise<User>` - Validate role in mutations

2. **`convex/auth/mutations.ts`** - Auth operations
   - `login({ pin })` - Find user by PIN, check lockout, update lastLoginAt
   - `logout({ userId })` - Clear session (optional server-side)
   - `createUser({ name, pin, role, avatarUrl })` - Admin only
   - `updateUser({ userId, name, avatarUrl })` - Admin only
   - `resetPin({ userId, newPin })` - Admin only
   - `deactivateUser({ userId })` - Soft delete
   - `unlockUser({ userId })` - Clear lockout

3. **`convex/auth/queries.ts`** - User queries
   - `listUsers()` - All users (admin only, no PIN hashes)
   - `getActiveUsers()` - For avatar login screen
   - `getCurrentUser({ userId })` - Validate session

4. **`convex/auth/seed.ts`** - Initial setup
   - `seedAdminUser()` - Create first admin with PIN "000000"

### Phase 3: Frontend Auth Context

**New files to create:**

1. **`src/contexts/AuthContext.tsx`**
   - Manage session in localStorage
   - Session structure: `{ userId, name, role, avatarUrl, expiresAt }`
   - Auto-logout on 8-hour expiry
   - Provide: `user`, `login()`, `logout()`, `isAuthenticated`, `hasRole()`

2. **`src/lib/types.ts`** - Add types
   ```typescript
   export type UserRole = "kitchen" | "order_staff" | "admin";
   export interface AuthSession { userId, name, role, avatarUrl, expiresAt }
   ```

### Phase 4: Login UI

**New files to create:**

1. **`src/pages/Login.tsx`**
   - Grid of staff avatars with names
   - Tap avatar → show PIN pad
   - 4-6 digit PIN entry with visual dots
   - Error handling for wrong PIN / lockout
   - Loading state during auth

2. **`src/components/auth/AvatarGrid.tsx`**
   - Display active users with avatars
   - Tap to select for PIN entry

3. **`src/components/auth/PinPad.tsx`**
   - Large touch-friendly number buttons (0-9)
   - Backspace, Clear, Submit
   - Visual feedback (dots fill as digits entered)

### Phase 5: Route Protection

**Files to modify:**

1. **`src/App.tsx`** - Wrap routes with protection
   - Add `/login` route (public)
   - Add `/users` route (admin only)
   - Wrap all other routes with `<ProtectedRoute>`
   - Implement role-based redirects

2. **`src/components/auth/ProtectedRoute.tsx`** (new)
   - Check authentication
   - Check role permissions
   - Redirect unauthorized users:
     - Not logged in → `/login`
     - Kitchen trying admin route → `/kitchen`
     - Order staff trying admin route → `/orders`

3. **`src/components/layout/Header.tsx`** - Role-based nav
   - Show only permitted nav items per role
   - Add user avatar + logout in header
   - Kitchen: only "Kitchen" nav
   - Order Staff: "Orders" nav
   - Admin: all nav items + "Users"

### Phase 6: Role-Based Data Filtering

**Files to modify:**

1. **`src/pages/OrderDetail.tsx`**
   - Pass `showCosts={role !== "kitchen"}` to OrderItems
   - Hide cost/margin section for kitchen role

2. **`src/components/orders/OrderItems.tsx`**
   - Add `showCosts?: boolean` prop
   - Conditionally render Total Cost, Total Margin, Margin %

3. **`src/pages/KitchenView.tsx`**
   - For order_staff role: disable action buttons
   - Show "Read-only" indicator

4. **`convex/orders/queries.ts`**
   - Strip cost fields from response for kitchen role queries

### Phase 7: User Management Page (Admin)

**New file: `src/pages/UsersManager.tsx`**
- List all users with role badges
- Create new user form (name, PIN, role, avatar)
- Edit user (change name, role, avatar)
- Reset PIN button
- Deactivate/reactivate toggle
- Unlock button for locked accounts

---

## Critical Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `convex/schema.ts` | Modify | Add users table |
| `convex/lib/auth.ts` | Create | PIN hash + role validation |
| `convex/auth/mutations.ts` | Create | Login, user CRUD |
| `convex/auth/queries.ts` | Create | User queries |
| `src/contexts/AuthContext.tsx` | Create | Session management |
| `src/pages/Login.tsx` | Create | Avatar + PIN login |
| `src/components/auth/PinPad.tsx` | Create | Touch PIN entry |
| `src/components/auth/ProtectedRoute.tsx` | Create | Route guards |
| `src/App.tsx` | Modify | Add route protection |
| `src/components/layout/Header.tsx` | Modify | Role-based nav |
| `src/pages/OrderDetail.tsx` | Modify | Hide costs from kitchen |
| `src/components/orders/OrderItems.tsx` | Modify | Conditional cost display |
| `src/pages/KitchenView.tsx` | Modify | Read-only for order staff |
| `src/pages/UsersManager.tsx` | Create | Admin user management |

---

## Verification Plan

1. **Auth Flow Testing**
   - Create admin via seed function
   - Login with correct PIN → redirects to role's landing page
   - Login with wrong PIN 5x → account locked
   - Wait 15 min or admin unlock → can login again
   - Session expires after 8 hours → redirected to login

2. **Role Access Testing**
   - Kitchen staff: can access /kitchen, /orders/:id (no costs), blocked from recipes/products
   - Order staff: can access /orders, /orders/:id (with costs), /kitchen (read-only)
   - Admin: can access all routes + /users

3. **Data Visibility Testing**
   - Kitchen viewing order → no cost/margin columns
   - Order staff viewing order → sees all financial data
   - Kitchen viewing kitchen → can advance status
   - Order staff viewing kitchen → status buttons disabled

4. **Navigation Testing**
   - Kitchen header → only shows "Kitchen"
   - Order staff header → shows "Orders"
   - Admin header → shows all nav items + "Users"

---

## Future Enhancements (Not in MVP)

- Multi-location filtering (schema ready)
- Audit logging (who changed what)
- WhatsApp notifications to staff
- Password option for admin accounts
- Device trust ("remember this tablet")
