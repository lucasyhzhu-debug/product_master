---
phase: 25-codebase-cleanup
plan: "03"
subsystem: backend-auth
tags: [protectedMutation, auth, orders, productionRecipes, cleanup]
dependency_graph:
  requires: [25-02]
  provides: [protectedMutation migration for orders/mutations and productionRecipes]
  affects: [convex/orders/mutations/statusUpdates.ts, convex/productionRecipes/mutations.ts]
tech_stack:
  added: []
  patterns: [protectedMutation wrapper from convex/lib/functions.ts]
key_files:
  modified:
    - convex/orders/mutations/statusUpdates.ts
    - convex/productionRecipes/mutations.ts
decisions:
  - "requireRole() calls removed (not kept) — requireRole accepts a session token string, not a user ID. After protectedMutation migration there is no token in args, so requireRole cannot be called with correct args. The wrapper already enforces roles via user.role check, making requireRole redundant."
  - "orderCrud.ts, itemCrud.ts, packaging.ts, inventoryIntegration.ts: no migration needed — these files had no requireRole() calls and no token: v.string() auth args"
  - "forceComplete is the only mutation in statusUpdates.ts that required migration; all other mutations used optional token only for userId audit resolution (not role enforcement)"
metrics:
  duration_minutes: 2
  completed_date: "2026-02-23"
  tasks_completed: 2
  files_modified: 2
---

# Phase 25 Plan 03: protectedMutation Migration (orders + productionRecipes) Summary

**One-liner:** Migrated forceComplete (statusUpdates.ts) and 6 CRUD mutations (productionRecipes/mutations.ts) from bare mutation() + token args to protectedMutation wrapper with roles.

## What Was Built

Migrated 7 role-protected mutations across 2 files to the `protectedMutation` wrapper pattern from `convex/lib/functions.ts`.

### Files Analyzed

| File | Mutations | Action |
|------|-----------|--------|
| `orders/mutations/orderCrud.ts` | 12 mutations | No migration needed — all public (no requireRole) |
| `orders/mutations/statusUpdates.ts` | 8 mutations | 1 migrated: `forceComplete` |
| `orders/mutations/itemCrud.ts` | 4 mutations | No migration needed — all public |
| `orders/mutations/packaging.ts` | 8 mutations | No migration needed — all public |
| `orders/mutations/inventoryIntegration.ts` | 4 mutations | No migration needed — all public |
| `productionRecipes/mutations.ts` | 7 mutations | 6 migrated (1 internalMutation unchanged) |

### Migrations Performed

**convex/orders/mutations/statusUpdates.ts:**
- `forceComplete`: `mutation` + `token: v.string()` + `requireRole(ctx, args.token, ["admin", "manager"])` → `protectedMutation({ roles: ["admin", "manager"] })` with `ctx.user` available directly

**convex/productionRecipes/mutations.ts:**
- `addSubComponent`: migrated — roles: admin, manager
- `removeSubComponent`: migrated — roles: admin, manager
- `updateSubComponentQuantity`: migrated — roles: admin, manager
- `addIngredient`: migrated — roles: admin, manager
- `removeIngredient`: migrated — roles: admin, manager
- `updateIngredientQuantity`: migrated — roles: admin, manager
- `recalculateComponentCogs` (internalMutation): unchanged — internal, not user-facing

### Mutations Left as bare mutation()

**orderCrud.ts:** `create`, `cancel`, `remove`, `completeOrder`, `revertToConfirmed`, `updateOrderDiscount`, `completeBalls`, `createDraft`, `updateDraft`, `submitOrder`, `copyFromCancelled`, `updateDeliveryFee`
- None have `requireRole` calls or `token: v.string()` auth args
- `submitOrder` and `copyFromCancelled` use `token: v.optional(v.string())` only for userId resolution in audit logs — not for auth enforcement

**statusUpdates.ts:** `updateStatus`, `updatePayment`, `updateShipping`, `updateDetails`, `moveForward`, `moveBackward`, `expediteOrder`
- Same pattern — optional token for audit trail only, no requireRole

**itemCrud.ts:** `addItem`, `removeItem`, `replaceItems`, `updateItemQuantity` — no auth

**packaging.ts:** `markPackagePacked`, `completePackaging`, `revertToPackaging`, `markAllItemPackagesPacked`, `unmarkPackagePacked`, `fillPackage`, `unfillPackage` — no auth

**inventoryIntegration.ts:** `reserveStockForOrder`, `consumeBoxingMaterials`, `consumeStickerMaterials`, `releaseReservation` — no auth (internal helpers)

**kitchen.ts and migrations.ts:** Intentionally excluded per plan scope (internal/seed operations).

## Decision on requireRole() Handling

**Removed**, not kept. Rationale: `requireRole(ctx, token, roles)` requires a session token string to call `getSessionUser`. After `protectedMutation` migration, `args.token` no longer exists (removed from args). Passing anything else (e.g., `ctx.user._id`) would be semantically incorrect. The protectedMutation wrapper already performs an equivalent role check (`roles.includes(user.role)`), so the requireRole call is genuinely redundant. This is cleaner and avoids a double DB lookup.

The `requireRole` import was removed from both files since it's no longer used.

## Verification Results

- `npm run type-check`: PASS (zero errors)
- `grep "protectedMutation" kitchen.ts migrations.ts`: NONE (untouched)
- `grep "token: v.string()" [migrated files]`: NONE (all removed)
- `grep "protectedMutation" statusUpdates.ts productionRecipes/mutations.ts`: Multiple matches (correct)

## Deviations from Plan

**1. [Rule 1 - Bug] requireRole() calls removed rather than kept**
- **Found during:** Task 1 analysis of requireRole signature
- **Issue:** requireRole(ctx, token, roles) requires a session token string. After protectedMutation migration, no token exists in args. The plan said "keep existing requireRole() calls as belt-and-suspenders" but also noted "if requireRole only works with token strings, then remove the redundant requireRole() call."
- **Fix:** Removed requireRole calls and imports from both files. The protectedMutation wrapper already enforces roles via `roles.includes(user.role)`.
- **Files modified:** statusUpdates.ts, productionRecipes/mutations.ts
- **Commits:** 41b4dcc, f5532b8

**2. Scope clarification: fewer migrations than anticipated**
- **Found during:** Task 1 analysis of orderCrud.ts
- **Issue:** Plan estimated ~12 mutations in orderCrud.ts and ~8 in statusUpdates.ts needing migration. In practice, only `forceComplete` in statusUpdates.ts required migration. All other mutations use `token: v.optional(v.string())` only for audit trail userId resolution, not for role enforcement.
- **Resolution:** This is correct behavior — public mutations should remain as bare mutation(). No deviation from plan intent.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: statusUpdates.ts migration | 41b4dcc | convex/orders/mutations/statusUpdates.ts |
| Task 2: productionRecipes/mutations.ts migration | f5532b8 | convex/productionRecipes/mutations.ts |

## Self-Check: PASSED

Files exist:
- convex/orders/mutations/statusUpdates.ts: FOUND
- convex/productionRecipes/mutations.ts: FOUND

Commits exist:
- 41b4dcc: FOUND
- f5532b8: FOUND
