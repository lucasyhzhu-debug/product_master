# Phase 3: Quick Fixes -- Tech Debt - Research

**Researched:** 2026-02-13
**Domain:** Codebase cleanup -- dead code removal, deprecated status mapping, shim elimination, index audit
**Confidence:** HIGH

## Summary

This phase is purely subtractive: remove deprecated code, dead files, shim modules, stale status mappings, and redundant indexes. No new libraries, no new features. The complexity is in correctly identifying all references to deprecated code and ensuring no regressions after removal.

All five QFIX items are well-scoped with clear boundaries. The biggest risk is QFIX-03 (shim removal), which has the widest blast radius at 30+ files across frontend, hooks, and test suites. QFIX-04 (deprecated status mapping) is the most nuanced because the deprecated statuses are deeply woven into both frontend UI maps and backend queries/mutations. QFIX-05 (index audit) requires systematic cross-referencing of every schema index against all `withIndex()` calls in the codebase.

**Primary recommendation:** Execute QFIX-01 and QFIX-02 first (smallest blast radius, independent), then QFIX-04 (status mappings), then QFIX-03 (shim removal -- largest blast radius but mechanically simple), then QFIX-05 (index audit -- requires verification after all other changes).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Historical status display (QFIX-04)
- Map deprecated statuses to nearest active equivalents: `ProductionComplete` -> `Boxed`, `Packaging` -> `InProduction`
- Old orders display with the mapped status badge -- they blend into the current workflow, no "Legacy" label
- Keep deprecated statuses as filter options so users can still find old orders (important for accounting, sales, and discount review)
- Allow status transitions out of deprecated statuses (e.g., cancellation) -- don't freeze old orders
- Remove from UI color/label mappings by replacing with the mapped equivalents, not by deleting
- Schema validator keeps both values for historical data integrity

#### KitchenView retirement (QFIX-02)
- KitchenViewV2 is a complete replacement -- no features to preserve from V1
- Delete KitchenView.tsx and cascade: remove any orphaned components in `src/components/kitchen/` that only V1 used
- Route check: Claude determines during research whether routes differ and handles accordingly
- Git history is sufficient -- no preservation artifacts needed beyond the changelog entry

#### Shim removal & imports (QFIX-03)
- Remove `convex/orders/mutations.ts` shim and update all imports in one shot (single commit, clean break)
- Full audit of both frontend AND backend files for imports from the shim -- not just the 19+ known frontend files
- No external callers -- only this frontend repo references these mutations, so path changes are safe
- API surface: Claude's discretion on whether paths change or remain equivalent, based on Convex module resolution

#### Index removal criteria (QFIX-05)
- Moderate aggressiveness: remove clearly redundant indexes (prefix duplicates) AND unused single-field indexes that no query references
- Requires code audit: match each index against actual query usage before removing
- If the audit reveals obviously missing indexes, add them opportunistically (don't defer everything to Phase 7)
- Document all removed (and added) indexes with justification in CHANGELOG.md
- Convex handles index removal safely -- no special deploy caution needed
- Test in dev environment as standard practice, but no extra gates

### Claude's Discretion
- KitchenView route handling (same route swap vs redirect)
- API path structure after shim removal (preserve or restructure)
- Orphaned component detection methodology
- Exact index audit approach and tooling
- QFIX-01 implementation (replacing "current-user" with AuthContext username -- straightforward, no user decisions needed)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Architecture Patterns

### Pattern 1: AuthContext Username Access (QFIX-01)
**What:** Replace hardcoded `"current-user"` with actual authenticated user name from AuthContext
**When to use:** Any frontend component that passes `createdBy` to a Convex mutation

The `useAuth()` hook returns `{ user }` where `user.name` is the authenticated username string.

```typescript
// BEFORE (hardcoded)
createdBy: "current-user",

// AFTER (from AuthContext)
const { user } = useAuth();
// ...
createdBy: user?.name ?? "unknown",
```

**Files affected (6 occurrences in 5 files):**
1. `src/pages/LocationsManager.tsx:121` -- `createdBy: "current-user"` in `createLocation()`
2. `src/components/inventory/ComponentTypeDialog.tsx:91` -- `createdBy: "current-user"` in `createComponentType()`
3. `src/components/inventory/ReceiveStockDialog.tsx:194` -- `createdBy: "current-user"` in `receiveBatch()`
4. `src/components/inventory/ReceiveStockDialog.tsx:242` -- `createdBy: "current-user"` in `createComponentAndReceive()`
5. `src/components/inventory/AdjustStockDialog.tsx:158` -- `createdBy: "current-user"` in `adjustStock()`
6. `src/components/inventory/TransferStockDialog.tsx:92` -- `createdBy: "current-user"` in `transferStock()`

**Important:** Each component must import and call `useAuth()`. This hook must be called before any conditional returns (React hooks order rule). Check if the component already imports `useAuth` before adding a duplicate import.

### Pattern 2: Convex Module Path Resolution (QFIX-03)
**What:** Convex uses file-based routing. The generated `api` object maps file paths to API paths.
**Key finding:** `convex/orders/mutations.ts` (the shim) maps to `api.orders.mutations`, while `convex/orders/mutations/index.ts` maps to `api.orders.mutations.index`.

Currently the shim file (`convex/orders/mutations.ts`) does `export * from "./mutations/index"`. The generated `api.d.ts` shows BOTH modules exist:
- `"orders/mutations": typeof orders_mutations` (from the shim)
- `"orders/mutations/index": typeof orders_mutations_index` (from the directory)

All frontend/test code uses `api.orders.mutations.X` which resolves to the shim file.

**Critical insight for shim removal:** When `convex/orders/mutations.ts` is deleted, Convex will auto-generate the API so that `api.orders.mutations.index.X` becomes the path for functions defined in `convex/orders/mutations/index.ts`. The path `api.orders.mutations.X` will NO LONGER resolve (since the file is gone).

**Recommendation:** Do NOT simply delete the shim. Instead, the planner must choose one of:
- **Option A (Preserve API paths):** Move the barrel re-export content INTO `convex/orders/mutations.ts` as the real exports instead of re-exporting from `./mutations/index`. In other words, swap the shim from re-exporting to directly exporting. This keeps `api.orders.mutations.X` working but defeats the purpose of removal.
- **Option B (Update all callers -- RECOMMENDED):** Delete the shim and update all callers from `api.orders.mutations.X` to the domain-specific paths like `api.orders.mutations.orderCrud.create`, `api.orders.mutations.statusUpdates.updateStatus`, etc. This is the clean break the user requested.
- **Option C (Rename index to take over):** Delete the shim, and rename `convex/orders/mutations/index.ts` to something else, OR rely on Convex's behavior with barrel files in directories. **Testing needed:** Verify whether Convex with a `convex/orders/mutations/` directory (and its `index.ts`) generates `api.orders.mutations.X` when no `convex/orders/mutations.ts` file exists. This is the ideal outcome if Convex resolves directory index files to the directory path.

**Verification needed:** Test in dev environment whether deleting the shim causes `api.orders.mutations.X` to still resolve via the directory's `index.ts`. If yes, Option C is trivial (just delete the shim, no caller changes). If no, Option B is required.

### Pattern 3: Deprecated Status Mapping (QFIX-04)
**What:** Map `ProductionComplete` -> `Boxed` and `Packaging` -> `InProduction` in UI display code, while preserving the values in schema validators and backend queries.

**Status mapping decision:**
| Deprecated Status | Maps To | Rationale |
|---|---|---|
| `ProductionComplete` | `Boxed` | Both mean "production done, ready for next step" |
| `Packaging` | `InProduction` | Packaging was the old workflow step between Confirmed and Completion |

**Files requiring status mapping changes (UI layer only):**

Frontend status color/label maps (replace deprecated entries with mapped equivalents):
1. `src/lib/orderConstants.ts` -- `STATUS_COLORS` record (lines 14-28) -- Remove `ProductionComplete` and `Packaging` entries, their colors map to Boxed/InProduction already
2. `src/lib/orderConstants.ts` -- `STATUS_CATEGORIES.kitchen` (line 43) -- Remove `Packaging` from kitchen category
3. `src/components/dashboard/ProductionQueueTable.tsx` -- `STATUS_CONFIG` record (lines 13-30) -- Remove `ProductionComplete` and `Packaging` entries
4. `src/components/orders/OrderHeader.tsx` -- Status color map (line 11-12) -- Remove deprecated entries
5. `src/components/orders/OrderStatusPanel.tsx` -- `STATUS_OPTIONS` array (lines 11-23) -- Keep as filter options per user decision
6. `src/pages/OrderDetail.tsx` -- Status step mapping (lines 52-55) and various status checks
7. `src/components/dashboard/SalesWidget.tsx` -- Any status display code

Backend files that reference deprecated statuses (DO NOT CHANGE -- keep for historical data):
- `convex/schema.ts` -- Keep `v.literal("ProductionComplete")` and `v.literal("Packaging")`
- `convex/orders/validators.ts` -- Keep validators
- `convex/orders/queries.ts` -- Keep `.withIndex("by_status", "ProductionComplete")` and `"Packaging"` queries
- `convex/orders/whatsapp.ts` -- Keep status labels for WhatsApp messages
- `convex/orders/helpers/statusTransitions.ts` -- Keep in ALL_STATUSES, keep transition logic
- `convex/orders/helpers/ballDistribution.ts` -- Keep Packaging status transition
- `convex/orders/mutations/` -- Keep all backend status handling

**Critical nuance:** The user wants deprecated statuses KEPT as filter options. This means `OrderStatusPanel.tsx` keeps them in `STATUS_OPTIONS`. But the UI display (badges, colors, labels) should show the mapped equivalent. Implementation approach: add a `getDisplayStatus()` helper that maps `ProductionComplete` -> `Boxed` and `Packaging` -> `InProduction`, then use this helper in all display code.

**TypeScript type implications:** The `OrderStatus` type in `src/lib/types.ts` must KEEP `ProductionComplete` and `Packaging` because they are valid values returned from the database. Removing them from the type would cause compile errors wherever the DB returns these values.

### Pattern 4: KitchenView Orphan Detection (QFIX-02)
**What:** Identify and remove components that were only used by KitchenView V1.

**Route status (researched):**
- `/kitchen` route already points to `KitchenViewV2` (App.tsx line 62)
- `/kitchen-legacy` route has a redirect to `/kitchen` (App.tsx line 66)
- KitchenView is NOT imported in App.tsx -- it is ONLY exported from `src/pages/index.ts` (line 9)

**Recommendation:** Delete `KitchenView.tsx`, remove its export from `src/pages/index.ts`, and remove the `/kitchen-legacy` redirect (dead route).

**Orphaned V1-only components (from `src/components/orders/`):**

KitchenView.tsx imports these from `@/components/orders`:
- `BallCompletionButtons` -- Used ONLY by KitchenView.tsx (no other consumers found)
- `SoundToggle` -- Used ONLY by KitchenView.tsx
- `KitchenDashboard` -- Used ONLY by KitchenView.tsx
- `KitchenHelpPanel` -- Used ONLY by KitchenView.tsx
- `InventoryTray` -- Used ONLY by KitchenView.tsx
- `OrderBox` -- Used ONLY by KitchenView.tsx (internally imports `ProductPackage` and `ChannelBadge`)
- `FlyingBall` -- Used ONLY by KitchenView.tsx

Sub-dependencies (only referenced by the above orphans):
- `ProductPackage` -- Only imported by `OrderBox.tsx`
- `KitchenOrderCard` -- Exported from index.ts but never imported by any page or component

Components to KEEP (used elsewhere):
- `ChannelBadge` -- Also imported by `OrderForm.tsx` (keep it)
- All other `@/components/orders/` exports are used by OrderDetail, OrderManager, etc.

**V2 components (`src/components/kitchen/`):**
KitchenViewV2 imports: `SwipeableKitchenLayout`, `ProductionLogPanel`, `BoxingPanel`, `StickeringPanel`, `PackingPanel`

The following `src/components/kitchen/` components are exported in index.ts but their consumer status needs verification during implementation:
- `KanbanColumn`, `PackageCounter`, `BoxingOrderCard`, `StickeringOrderCard`, `ReadyToShipCard`, `BallTrayCounter`, `PackagingStockItem`, `DailySummaryWidget`, `BatchConfirmDialog`, `FlipNumber`, `FlowChevrons`, `GoFoodStickerCard`, `GoFoodPackingCard`, `K3MartStockCard`, `K3MartPackingCard`

These are V2 kitchen subcomponents -- do NOT delete. They may be imported by the V2 panels.

**Files to delete (QFIX-02):**
1. `src/pages/KitchenView.tsx`
2. `src/components/orders/BallCompletionButtons.tsx`
3. `src/components/orders/SoundToggle.tsx`
4. `src/components/orders/KitchenDashboard.tsx`
5. `src/components/orders/KitchenHelpPanel.tsx`
6. `src/components/orders/InventoryTray.tsx`
7. `src/components/orders/OrderBox.tsx`
8. `src/components/orders/FlyingBall.tsx`
9. `src/components/orders/ProductPackage.tsx`
10. `src/components/orders/KitchenOrderCard.tsx`
11. `src/lib/kitchenSounds.ts` -- Only imported by KitchenView, SoundToggle, and ProductPackage (all V1)
12. `src/hooks/convex/usePendingBallStats.ts` -- Only imported by KitchenView.tsx

**Additional dependency note:** The `canvas-confetti` npm package is only imported by `KitchenView.tsx`. After deletion, it becomes an unused dependency. Could be removed from `package.json` but not strictly necessary for this phase.

**Files to modify:**
1. `src/pages/index.ts` -- Remove `KitchenView` export (line 9)
2. `src/components/orders/index.ts` -- Remove exports for deleted components (lines 12-23)
3. `src/hooks/convex/index.ts` -- Remove `usePendingBallStats` export
4. `src/App.tsx` -- Remove `/kitchen-legacy` redirect (line 66)

### Pattern 5: Index Audit Methodology (QFIX-05)
**What:** Cross-reference every `.index()` definition in `convex/schema.ts` against every `.withIndex()` call across the entire `convex/` directory.

**Index inventory (from schema.ts):**

All indexes defined in schema, with usage status based on `.withIndex()` grep:

| Table | Index | Fields | Used? | Notes |
|-------|-------|--------|-------|-------|
| ingredients | by_name | [name] | YES (tags/mutations) | Keep |
| ingredients | by_brand | [brand] | NO `.withIndex("by_brand")` found | **CANDIDATE FOR REMOVAL** |
| packagingMaterials | by_name | [name] | Not directly via withIndex | Check if `.collect()` filtered |
| tags | by_name | [name] | YES | Keep |
| menuProducts | by_code | [code] | YES (many) | Keep |
| menuProducts | by_active | [isActive] | YES | Keep |
| menuProducts | by_pos_slot | [posSlot] | Not found in withIndex | **CANDIDATE** -- check queries |
| menuProducts | by_packaging_pos_slot | [packagingPosSlot] | Not found in withIndex | **CANDIDATE** -- check queries |
| menuProducts | by_default_price | [defaultPrice] | YES (externalData/mutations:490) | Keep |
| productionUnitTypes | by_code | [code] | YES | Keep |
| productionUnitTypes | by_active | [isActive] | YES | Keep |
| menuProductComponents | by_menu_product | [menuProductId] | YES (many) | Keep |
| menuProductComponents | by_component_type | [componentTypeId] | YES | Keep |
| recipes | by_name | [name] | Not directly via withIndex | Check usage |
| recipeVersions | by_recipe | [recipeId] | YES | Keep (also prefix of by_recipe_version) |
| recipeVersions | by_recipe_version | [recipeId, versionNumber] | YES | Keep |
| recipeVersions | by_reusable | [isReusableComponent] | YES | Keep |
| recipeComponents | by_version | [recipeVersionId] | YES | Keep |
| recipeComponents | by_linked_version | [linkedRecipeVersionId] | YES | Keep |
| componentIngredients | by_component | [recipeComponentId] | YES | Keep |
| componentIngredients | by_ingredient | [ingredientId] | YES | Keep |
| packagingRecipes | by_name | [name] | Not directly via withIndex | Check usage |
| packagingVersions | by_packaging | [packagingRecipeId] | YES | Keep (also prefix of by_packaging_version) |
| packagingVersions | by_packaging_version | [packagingRecipeId, versionNumber] | YES | Keep |
| packagingComponents | by_version | [packagingVersionId] | YES | Keep |
| packagingComponentMaterials | by_component | [packagingComponentId] | YES | Keep |
| packagingComponentMaterials | by_material | [packagingMaterialId] | YES | Keep |
| products | by_name | [name] | Not directly via withIndex | Check usage |
| productVersions | by_product | [productId] | YES | Keep (also prefix of by_product_version) |
| productVersions | by_product_version | [productId, versionNumber] | Not found directly | Prefix covers it |
| productVersions | by_recipe_version | [recipeVersionId] | YES | Keep |
| productVersions | by_packaging_version | [packagingVersionId] | YES | Keep |
| customers | by_name | [name] | Not directly via withIndex | Check usage |
| customers | by_phone | [phone] | YES | Keep |
| orders | by_order_number | [orderNumber] | YES (many) | Keep |
| orders | by_customer | [customerId] | YES | Keep |
| orders | by_status | [status] | YES (many) | Keep (also prefix of by_status_due_date) |
| orders | by_channel | [channel] | YES | Keep |
| orders | by_status_due_date | [status, dueDate] | Not found in withIndex | **CANDIDATE** -- check if only by_status is used |
| orderItems | by_order | [orderId] | YES (many) | Keep |
| orderItems | by_product_name | [productName] | Not found in withIndex | **CANDIDATE FOR REMOVAL** |
| orderItems | by_menu_product | [menuProductId] | YES | Keep |
| orderItems | by_production_type | [orderId, productionType] | Not found in withIndex | **CANDIDATE FOR REMOVAL** (deprecated field) |
| orderItemProduction | by_order_item | [orderItemId] | YES | Keep |
| orderItemProduction | by_production_type | [productionUnitTypeId] | YES | Keep |
| orderItemProduction | by_remaining | [unitsRemaining] | Not found in withIndex | **CANDIDATE** |
| orderItemProduction | by_completion | [orderItemId, unitsRemaining] | Not found in withIndex | **CANDIDATE** |
| orderMessages | by_order | [orderId] | YES | Keep |
| orderMessages | by_order_template | [orderId, template] | YES | Keep |
| feedback | by_status | [status] | YES | Keep |
| feedback | by_priority | [priority] | YES | Keep |
| users | by_role | [role] | YES | Keep |
| users | by_active | [isActive] | YES | Keep |
| sessions | by_token | [token] | YES | Keep |
| sessions | by_user | [userId] | YES | Keep |
| sessions | by_expiry | [expiresAt] | Not found in withIndex | **CANDIDATE** -- might be for cron cleanup |
| kitchenInventory | by_date | [date] | YES | Keep |
| productionTargets | by_date | [date] | YES | Keep |
| productionTargets | by_type_date | [productionUnitTypeId, date] | YES | Keep |
| productionProductTargets | by_date | [date] | YES | Keep |
| productionProductTargets | by_date_product | [date, menuProductId] | Not found in withIndex | **CANDIDATE** |
| productionProductTargets | by_date_source | [date, source] | YES | Keep |
| productionProductTargets | by_date_source_product | [date, source, menuProductId] | YES | Keep |
| productionCounts | by_menu_product | [menuProductId] | YES | Keep |
| productionTargetLogs | by_date | [date] | Not found in withIndex | **CANDIDATE** |
| productionTargetLogs | by_date_timestamp | [date, timestamp] | Not found in withIndex | **CANDIDATE** |
| productionLog | by_menu_product | [menuProductId] | YES | Keep |
| productionLog | by_menu_product_timestamp | [menuProductId, timestamp] | Not found in withIndex | **CANDIDATE** (prefix duplicate of by_menu_product) |
| productionLog | by_action | [action] | Not found in withIndex | **CANDIDATE FOR REMOVAL** |
| productionLog | by_timestamp | [timestamp] | YES | Keep |
| channelUsage | by_channel | [channel] | YES | Keep |
| channelUsage | by_usage | [usageCount] | YES | Keep |
| shippingAgencyUsage | by_agency | [agency] | YES | Keep |
| shippingAgencyUsage | by_usage | [usageCount] | YES | Keep |
| whatsappTemplates | by_code | [code] | YES | Keep |
| orderEvents | by_order | [orderId] | Not found in withIndex | **CANDIDATE** -- might be needed for future features |
| orderEvents | by_type | [eventType] | Not found in withIndex | **CANDIDATE** |
| orderEvents | by_timestamp | [timestamp] | Not found in withIndex | **CANDIDATE** |
| vouchers | by_code | [code] | YES | Keep |
| vouchers | by_active | [isActive] | YES | Keep |
| vouchers | by_manager_override | [isManagerOverride] | YES | Keep |
| vouchers | by_active_valid | [isActive, validFrom] | Not found in withIndex | **CANDIDATE** -- should be used for efficient validation |
| voucherUsage | by_voucher | [voucherId] | YES | Keep |
| voucherUsage | by_customer | [customerId] | Not found in withIndex | **CANDIDATE** |
| voucherUsage | by_voucher_customer | [voucherId, customerId] | YES | Keep |
| voucherUsage | by_order | [orderId] | YES | Keep |
| componentTypes | by_code | [code] | YES (many) | Keep |
| componentTypes | by_category | [category] | YES | Keep |
| componentTypes | by_active | [isActive] | YES | Keep |
| componentTypes | by_track_inventory | [trackInventory] | YES | Keep |
| storageLocations | by_type | [locationType] | YES | Keep |
| storageLocations | by_active | [isActive] | YES | Keep |
| storageLocations | by_default | [isDefault] | YES | Keep |
| inventoryBatches | by_component | [componentTypeId] | YES | Keep (prefix of by_component_location) |
| inventoryBatches | by_location | [locationId] | Not found directly | **CANDIDATE** -- check if by_component_location covers it |
| inventoryBatches | by_component_location | [componentTypeId, locationId] | YES | Keep |
| inventoryBatches | by_status | [status] | Not found in withIndex | **CANDIDATE** |
| inventoryBatches | by_fifo | [componentTypeId, locationId, purchaseDate] | YES (many) | Keep |
| componentStock | by_component | [componentTypeId] | YES | Keep (prefix of by_component_location) |
| componentStock | by_location | [locationId] | YES | Keep |
| componentStock | by_component_location | [componentTypeId, locationId] | YES | Keep |
| componentTransactions | by_component | [componentTypeId, createdAt] | Not found in withIndex (non-standard -- compound) | Check usage |
| componentTransactions | by_location | [locationId, createdAt] | YES | Keep |
| componentTransactions | by_batch | [batchId] | Not found in withIndex | **CANDIDATE** |
| componentTransactions | by_order | [orderId] | Not found in withIndex | **CANDIDATE** |
| orderComponentReservations | by_order | [orderId] | YES | Keep |
| orderComponentReservations | by_component | [componentTypeId] | Not found in withIndex | **CANDIDATE** |
| orderComponentReservations | by_status | [status] | Not found in withIndex | **CANDIDATE** |
| externalOutlets | by_source | [source] | YES | Keep |
| externalOutlets | by_source_external_id | [source, externalId] | YES | Keep |
| externalOutlets | by_active | [isActive] | Not found in withIndex | **CANDIDATE** |
| (remaining external tables) | various | various | Most used | Audit individually during implementation |

**Strong removal candidates (clearly unused, no prefix benefit):**
1. `ingredients.by_brand` -- Never used in any withIndex call
2. `orderItems.by_product_name` -- Never used
3. `orderItems.by_production_type` -- Uses deprecated field, never used
4. `productionLog.by_action` -- Never used
5. `productionLog.by_menu_product_timestamp` -- Prefix duplicate of `by_menu_product`, never used directly

**Moderate removal candidates (unused but potentially useful for future features):**
6. `orderItemProduction.by_remaining` -- Not currently used but conceptually useful for finding incomplete items
7. `orderItemProduction.by_completion` -- Not currently used
8. `sessions.by_expiry` -- Likely intended for cron cleanup but not yet implemented
9. `orderEvents.by_order` / `by_type` / `by_timestamp` -- Audit table, queries may be added later
10. `productionProductTargets.by_date_product` -- Prefix of `by_date_source_product`

**Recommendation:** Remove items 1-5 definitively. For items 6-10, remove unless there's evidence of planned usage in ROADMAP.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status display mapping | Inline conditionals everywhere | Single `getDisplayStatus()` helper | Centralize mapping logic, easy to maintain |
| Orphaned file detection | Manual grep each file | Systematic: search all imports, cross-ref index.ts exports | Miss nothing, methodical |
| Index audit | Manual reading | Grep `withIndex()` calls, compare against schema | Comprehensive, verifiable |

## Common Pitfalls

### Pitfall 1: Convex API Path Breaking Change (QFIX-03)
**What goes wrong:** Deleting `convex/orders/mutations.ts` breaks `api.orders.mutations.X` paths in all frontend and test code
**Why it happens:** Convex file-based routing means the file path IS the API path. No file = no path.
**How to avoid:** Test in dev environment first: delete the shim, run `npx convex dev`, check if `api.orders.mutations.X` still resolves via the directory's `index.ts`. If not, all callers must be updated.
**Warning signs:** TypeScript compilation errors in all files using `api.orders.mutations.X`

### Pitfall 2: Removing Status Values from TypeScript Type (QFIX-04)
**What goes wrong:** Removing `ProductionComplete` and `Packaging` from the `OrderStatus` type causes compilation errors because the database still returns these values
**Why it happens:** Historical orders have these statuses stored in the DB. Convex queries return them.
**How to avoid:** KEEP both values in the `OrderStatus` type. Only change UI display code, not types.
**Warning signs:** `npm run type-check` failures after type modification

### Pitfall 3: Orphaned Import in orders/index.ts (QFIX-02)
**What goes wrong:** Deleting component files but forgetting to update the barrel export file causes compilation errors
**Why it happens:** `src/components/orders/index.ts` exports all components including V1-only ones
**How to avoid:** Update `index.ts` in the same commit as file deletions
**Warning signs:** Build failure with "module not found" errors

### Pitfall 4: React Hooks Order Violation (QFIX-01)
**What goes wrong:** Adding `useAuth()` after a conditional return in a component breaks React's rules of hooks
**Why it happens:** Components may have early returns for loading states before the hook call site
**How to avoid:** Place `useAuth()` at the top of the component, before any conditional returns
**Warning signs:** React runtime error "Rendered fewer hooks than expected"

### Pitfall 5: Status Filter Options vs Display (QFIX-04)
**What goes wrong:** Removing deprecated statuses from filter dropdowns prevents users from finding old orders
**Why it happens:** Conflating "don't display as badge" with "don't allow filtering"
**How to avoid:** Keep in filter options (OrderStatusPanel STATUS_OPTIONS), only change visual display (colors, labels, badges)
**Warning signs:** Users report inability to find old orders

### Pitfall 6: Test Files Using Shim Path (QFIX-03)
**What goes wrong:** Frontend and hook changes pass but test files still reference old API paths
**Why it happens:** Tests are in a separate `tests/` directory, easy to miss in grep
**How to avoid:** Include `tests/` directory in the import audit
**Warning signs:** `npm run test` failures after shim removal

**Affected test files:**
- `tests/convex/helpers.ts` (~2 references)
- `tests/convex/ballDistribution.test.ts` (~30+ references)
- `tests/convex/orderLifecycle.test.ts` (~50+ references)
- `tests/convex/orders.test.ts` (~25+ references)
- `src/hooks/__tests__/useConvexHooks.test.tsx` (~10 references)

### Pitfall 7: Backend Queries Still Need Deprecated Statuses (QFIX-04)
**What goes wrong:** Removing `Packaging` from backend query filters breaks kitchen queries
**Why it happens:** `convex/orders/kitchenQueries.ts:14` includes "Packaging" in its status list, `convex/orders/queries.ts` has multiple queries filtering by these statuses
**How to avoid:** ONLY change frontend UI mapping code. Backend stays untouched.
**Warning signs:** Kitchen view stops showing orders that are in deprecated status

## Code Examples

### QFIX-01: Replace hardcoded username
```typescript
// In a component that already has useAuth:
const { user } = useAuth();

// Replace all occurrences:
// BEFORE
createdBy: "current-user",

// AFTER
createdBy: user?.name ?? "unknown",
```

### QFIX-02: Clean barrel export removal
```typescript
// src/components/orders/index.ts
// REMOVE these lines:
export { default as KitchenDashboard } from './KitchenDashboard';
export { default as KitchenOrderCard } from './KitchenOrderCard';
export { default as BallCompletionButtons } from './BallCompletionButtons';
export { SoundToggle } from './SoundToggle';
export { KitchenHelpPanel } from './KitchenHelpPanel';
export { ProductPackage } from './ProductPackage';
export { InventoryTray } from './InventoryTray';
export { OrderBox } from './OrderBox';
export { FlyingBall } from './FlyingBall';
```

### QFIX-04: Status display helper
```typescript
// src/lib/orderConstants.ts (new helper)
/**
 * Map deprecated statuses to their display equivalents.
 * Used for UI display only -- backend and filters keep original values.
 */
export function getDisplayStatus(status: OrderStatus): OrderStatus {
  switch (status) {
    case 'ProductionComplete': return 'Boxed';
    case 'Packaging': return 'InProduction';
    default: return status;
  }
}

// Usage in STATUS_COLORS, STATUS_CONFIG, etc.:
// Instead of removing deprecated keys, map through getDisplayStatus
// when looking up colors/labels
```

### QFIX-03: Shim API path verification
```bash
# Step 1: Delete shim in dev
rm convex/orders/mutations.ts

# Step 2: Run convex dev and check generated types
npx convex dev

# Step 3: Check if api.orders.mutations.X still resolves
# Look at convex/_generated/api.d.ts for path changes
```

## File Impact Summary

### QFIX-01 (5 files modified)
- `src/pages/LocationsManager.tsx`
- `src/components/inventory/AdjustStockDialog.tsx`
- `src/components/inventory/ReceiveStockDialog.tsx`
- `src/components/inventory/ComponentTypeDialog.tsx`
- `src/components/inventory/TransferStockDialog.tsx`

### QFIX-02 (12 files deleted, 4 files modified)
Deleted:
- `src/pages/KitchenView.tsx`
- `src/components/orders/BallCompletionButtons.tsx`
- `src/components/orders/SoundToggle.tsx`
- `src/components/orders/KitchenDashboard.tsx`
- `src/components/orders/KitchenHelpPanel.tsx`
- `src/components/orders/InventoryTray.tsx`
- `src/components/orders/OrderBox.tsx`
- `src/components/orders/FlyingBall.tsx`
- `src/components/orders/ProductPackage.tsx`
- `src/components/orders/KitchenOrderCard.tsx`
- `src/lib/kitchenSounds.ts`
- `src/hooks/convex/usePendingBallStats.ts`

Modified:
- `src/pages/index.ts`
- `src/components/orders/index.ts`
- `src/hooks/convex/index.ts`
- `src/App.tsx`

### QFIX-03 (1 file deleted, ~8+ files modified -- depends on API path outcome)
Deleted:
- `convex/orders/mutations.ts`

Modified (if callers need updating):
- `src/pages/KitchenViewV2.tsx` (5 references)
- `src/pages/PackagingView.tsx` (1 reference)
- `src/hooks/convex/useOrders.ts` (12 references)
- `src/hooks/convex/useKitchenStats.ts` (5 references)
- `tests/convex/helpers.ts` (2 references)
- `tests/convex/ballDistribution.test.ts` (30+ references)
- `tests/convex/orderLifecycle.test.ts` (50+ references)
- `tests/convex/orders.test.ts` (25+ references)
- `src/hooks/__tests__/useConvexHooks.test.tsx` (10 references)

### QFIX-04 (6-8 frontend files modified, 0 backend files)
- `src/lib/orderConstants.ts`
- `src/components/dashboard/ProductionQueueTable.tsx`
- `src/components/orders/OrderHeader.tsx`
- `src/components/orders/OrderStatusPanel.tsx`
- `src/pages/OrderDetail.tsx`
- `src/components/dashboard/SalesWidget.tsx` (if applicable)

### QFIX-05 (1 file modified)
- `convex/schema.ts`

## Open Questions

1. **Convex directory index resolution**
   - What we know: `convex/orders/mutations.ts` (shim) maps to `api.orders.mutations`. The directory has `convex/orders/mutations/index.ts` which maps to `api.orders.mutations.index`.
   - What's unclear: If the shim is deleted, does Convex resolve `api.orders.mutations.X` via the directory's `index.ts`? This determines whether QFIX-03 is trivial (delete shim only) or requires updating 100+ references.
   - Recommendation: **Test in dev environment FIRST** before planning the full migration. This is a 2-minute test that saves hours. Run `npx convex dev` after deleting the shim and check the generated `api.d.ts`.

2. **`by_pos_slot` and `by_packaging_pos_slot` index usage**
   - What we know: No `.withIndex("by_pos_slot")` or `.withIndex("by_packaging_pos_slot")` found in grep
   - What's unclear: These may be queried via `.filter()` instead of `.withIndex()`, or they may be planned for future POS features
   - Recommendation: Keep for now -- they serve a clear business purpose (POS slot lookup) even if not yet optimized with withIndex

3. **`orderEvents` indexes (by_order, by_type, by_timestamp)**
   - What we know: No withIndex calls found for any of these
   - What's unclear: orderEvents is an audit table that may need these indexes when audit UI is built
   - Recommendation: Keep all three -- they're cheap and clearly needed for future audit features

4. **`kitchenSounds.ts` module** (RESOLVED)
   - Verified: Only imported by `KitchenView.tsx`, `SoundToggle.tsx`, and `ProductPackage.tsx` -- all V1 components being deleted
   - KitchenViewV2 does NOT use kitchenSounds
   - Decision: Delete `src/lib/kitchenSounds.ts` as part of QFIX-02

## Sources

### Primary (HIGH confidence)
- Codebase inspection via Grep/Read tools -- all file paths, import chains, index usage verified
- Convex Context7 documentation -- module path resolution behavior
- `convex/_generated/api.d.ts` -- actual generated API paths showing dual registration

### Secondary (MEDIUM confidence)
- Convex file-based routing documentation -- directory index resolution behavior (needs dev verification for edge case of sibling file + directory with same name)

## Metadata

**Confidence breakdown:**
- QFIX-01 (current-user): HIGH -- 6 occurrences in 5 files, straightforward pattern
- QFIX-02 (KitchenView removal): HIGH -- route already migrated, orphans clearly identified
- QFIX-03 (shim removal): MEDIUM -- API path resolution after deletion needs dev verification
- QFIX-04 (deprecated statuses): HIGH -- all UI mapping locations identified, clear separation between frontend changes and backend preservation
- QFIX-05 (index audit): HIGH -- comprehensive withIndex grep completed, candidates identified with rationale

**Research date:** 2026-02-13
**Valid until:** 2026-03-13 (stable codebase, no library version concerns)
