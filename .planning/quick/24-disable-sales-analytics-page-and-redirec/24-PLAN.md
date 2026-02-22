---
phase: 24-disable-sales-analytics
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.tsx
  - src/components/layout/Header.tsx
  - src/components/layout/MobileBottomNav.tsx
  - src/components/layout/Footer.tsx
autonomous: true
requirements: [BANDWIDTH-01]
must_haves:
  truths:
    - "Manager/Admin default route (/) redirects to /orders, not /sales"
    - "Navigating to /sales redirects to /orders"
    - "Sales Analytics and K3Mart Cockpit nav links are hidden"
    - "All code is preserved with comments for easy re-enable after March 1st"
  artifacts:
    - path: "src/App.tsx"
      provides: "Disabled sales/k3mart routes with redirect, updated RoleBasedRedirect"
      contains: "BANDWIDTH CONSERVATION"
  key_links:
    - from: "src/App.tsx"
      to: "/orders"
      via: "RoleBasedRedirect and /sales redirect"
      pattern: "Navigate to=./orders."
---

<objective>
Temporarily disable Sales Analytics and K3Mart Cockpit pages to conserve Convex query bandwidth until March 1st quota reset. Redirect default route and all disabled routes to Orders page. All changes clearly commented for easy revert.

Purpose: Stop expensive aggregation queries from consuming production bandwidth
Output: Modified routing and navigation with bandwidth conservation comments
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.tsx
@src/components/layout/Header.tsx
@src/components/layout/MobileBottomNav.tsx
@src/components/layout/Footer.tsx
</context>

## Git Workflow
**Branch:** `fix/disable-sales-bandwidth`
**Checkpoints:** None (autonomous)

## Implementation Waves
### Wave 1: Route + Nav Changes [SINGLE]
| Agent | Task | Files |
|-------|------|-------|
| executor | Disable routes, update redirects, hide nav links | App.tsx, Header.tsx, MobileBottomNav.tsx, Footer.tsx |

### Wave 2: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| Bash | npm run build |

## Documentation Updates
- [ ] CHANGELOG.md

## Success Criteria
- [ ] `npm run build` succeeds
- [ ] `/` redirects manager/admin to `/orders`
- [ ] `/sales` redirects to `/orders`
- [ ] `/k3mart-cockpit` redirects to `/orders`
- [ ] Sales/K3Mart nav links hidden
- [ ] All disabled code has `BANDWIDTH CONSERVATION` comments for easy grep-revert

<tasks>

<task type="auto">
  <name>Task 1: Disable expensive routes and redirect to Orders</name>
  <files>src/App.tsx, src/components/layout/Header.tsx, src/components/layout/MobileBottomNav.tsx, src/components/layout/Footer.tsx</files>
  <action>
In `src/App.tsx`:

1. Update `RoleBasedRedirect` — change the Manager/Admin fallback from `/sales` to `/orders`:
   ```tsx
   // Manager and Admin → Orders (BANDWIDTH CONSERVATION: was /sales, re-enable after March 1st)
   return <Navigate to="/orders" replace />;
   ```

2. Comment out the Sales Analytics route block (lines 248-256) and replace with a redirect:
   ```tsx
   {/* BANDWIDTH CONSERVATION: Sales Analytics disabled until March 1st quota reset
   <Route
     path="sales"
     element={
       <ProtectedRoute requiredPermission="canAccessSalesAnalytics">
         <SalesAnalytics />
       </ProtectedRoute>
     }
   />
   */}
   ```

3. Comment out the K3Mart Cockpit route block (lines 258-266) and replace with a redirect:
   ```tsx
   {/* BANDWIDTH CONSERVATION: K3Mart Cockpit disabled until March 1st quota reset
   <Route
     path="k3mart-cockpit"
     element={
       <ProtectedRoute requiredPermission="canAccessSalesAnalytics">
         <K3MartCockpit />
       </ProtectedRoute>
     }
   />
   */}
   ```

4. Add redirect routes in the "Redirects (no layout needed)" section:
   ```tsx
   {/* BANDWIDTH CONSERVATION: redirect disabled pages to orders */}
   <Route path="sales" element={<Navigate to="/orders" replace />} />
   <Route path="k3mart-cockpit" element={<Navigate to="/orders" replace />} />
   ```

5. Comment out the unused imports for `SalesAnalytics` and `K3MartCockpit` from the page imports (keep them in the import statement but add a comment noting they are temporarily unused — OR remove from the destructuring to avoid lint warnings, and add a comment above the import block). Preferred: remove from destructured imports and add a comment:
   ```tsx
   // BANDWIDTH CONSERVATION: SalesAnalytics, K3MartCockpit temporarily removed — re-enable after March 1st
   ```

In `src/components/layout/Header.tsx`:
- Comment out the Sales nav item `{ path: '/sales', label: 'Sales', ... }` with a `// BANDWIDTH CONSERVATION` comment

In `src/components/layout/MobileBottomNav.tsx`:
- Comment out the Sales nav item `{ path: '/sales', ... }` with a `// BANDWIDTH CONSERVATION` comment

In `src/components/layout/Footer.tsx`:
- Comment out the Sales link `{ path: '/sales', label: 'Sales' }` with a `// BANDWIDTH CONSERVATION` comment

IMPORTANT: Keep all disabled code intact (commented, not deleted) so it can be re-enabled by searching for "BANDWIDTH CONSERVATION" and uncommenting.
  </action>
  <verify>
Run `npm run build` — must pass with no errors.
Run `npm run type-check` — must pass (no unused import errors since imports are removed from destructuring).
Grep for "BANDWIDTH CONSERVATION" to confirm all disable points are marked:
  `grep -r "BANDWIDTH CONSERVATION" src/` should show hits in all 4 files.
  </verify>
  <done>
- Manager/Admin default redirect goes to /orders
- /sales and /k3mart-cockpit redirect to /orders
- Nav links for Sales hidden in Header, MobileBottomNav, Footer
- All changes marked with "BANDWIDTH CONSERVATION" for easy revert
- Build passes cleanly
  </done>
</task>

</tasks>

<verification>
- `npm run build` passes
- `npm run type-check` passes
- Grep confirms all 4 files have BANDWIDTH CONSERVATION markers
</verification>

<success_criteria>
- Build succeeds with zero errors
- No route loads SalesAnalytics or K3MartCockpit components
- All disabled code easily findable via "BANDWIDTH CONSERVATION" grep
- Revert requires only uncommenting marked sections and restoring the /sales redirect in RoleBasedRedirect
</success_criteria>

<output>
After completion, create `.planning/quick/24-disable-sales-analytics-page-and-redirec/24-SUMMARY.md`
</output>
