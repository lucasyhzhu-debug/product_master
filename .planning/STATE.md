# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-15)
**Core value:** Production reliability — single source of truth for recipes, orders, kitchen, inventory
**Current focus:** Milestone v1.0 COMPLETE — ready for next milestone

## Current Position
Milestone v1.0 Concerns Cleanup & Refactor — SHIPPED 2026-02-15
All 11 phases, 36 plans complete

## Phase Readiness

| Phase | Status | Blockers |
|-------|--------|----------|
| 1 — Test Infrastructure | COMPLETE (all 4 plans done) | None |
| 2 — Security & Docs | COMPLETE (all 2 plans done) | None |
| 3 — Tech Debt | COMPLETE (all 4 plans done) | None |
| 4 — Bugs | COMPLETE (all 2 plans done) | None |
| 5 — Backend Factories | COMPLETE (all 3 plans done) | None |
| 6 — BOM Migration | COMPLETE (all 3 plans done) | None |
| 7 — Query Optimization | COMPLETE (all 3 plans done) | None |
| 8 — Schema Cleanup | COMPLETE (all 4 plans done) | None |
| 9 — UI Brand Consolidation | COMPLETE (all 5 plans done) | None |
| 10 — Frontend Factories | COMPLETE (all 3 plans done) | None |
| 11 — Infrastructure | COMPLETE (all 3 plans done) | None |

## Parallel Opportunities
Phases 1-11 COMPLETE. All planned phases done. Ready for merge to main and next milestone planning.

## Session History

| Date | Phase | Action | Notes |
|------|-------|--------|-------|
| 2026-02-13 | -- | Project initialized | 39 requirements, 10 phases, roadmap created |
| 2026-02-13 | 01 | Plan 04 complete | Voucher handling tests: 15 tests, 3 helpers |
| 2026-02-13 | 01 | Plan 02 complete | FIFO inventory tests: 20 tests, 4 helpers |
| 2026-02-13 | 01 | Plan 01 complete | Ball distribution tests: 25 tests, 4 helpers |
| 2026-02-13 | 01 | Plan 03 complete | Order lifecycle tests: 30 tests, 4 helpers. Phase 01 COMPLETE. |
| 2026-02-13 | 02 | Plan 01 complete | Env files untracked, .gitignore fixed, SECURITY.md created |
| 2026-02-13 | 03 | Plan 03 complete | Removed 12 unused schema indexes (QFIX-05) |
| 2026-02-13 | 03 | Plan 01 complete | Replaced "current-user" in 5 files, deleted KitchenView V1 + 11 orphans |
| 2026-02-13 | 03 | Plan 02 complete | getDisplayStatus() helper, deprecated status cleanup in 5 UI files |
| 2026-02-13 | 02 | Plan 02 complete | Git history scrub, TruffleHog scan, CONVEX_DEPLOY_KEY rotated. Phase 02 COMPLETE. |
| 2026-02-13 | 03 | Plan 04 complete | Deleted orders/mutations.ts shim, migrated 135 refs across 8 files. Phase 03 COMPLETE. |
| 2026-02-13 | 04 | Plan 01 complete | Stock shortage override dialog: English UX, reason input, expanded roles, audit trail |
| 2026-02-13 | 05 | Plan 01 complete | convex-helpers auth wrappers, query helpers, test auth helper, SessionProvider |
| 2026-02-13 | 04 | Plan 02 complete | Cost invalidation schedulers, production records query, K3Mart backlog conversion. Phase 04 COMPLETE. |
| 2026-02-13 | 05 | Plan 02 complete | Ingredients/materials/tags protectedMutation, query helpers, useSessionMutation hooks, tags tests with auth |
| 2026-02-13 | 05 | Plan 03 complete | Customers/storageLocations protectedMutation, shipping internal docs, frontend useSessionMutation |
| 2026-02-14 | 06 | Plan 01 complete | BOM backfill migration + verification query, auto-corrections for Original Single/Triple |
| 2026-02-14 | 06 | Plan 02 complete | Dual-read pattern in queries/packaging, stop writing deprecated fields in all mutations |
| 2026-02-14 | 06 | Plan 03 complete | Frontend deprecated field removal, schema optional, BOM migration COMPLETE. Phase 06 COMPLETE. |
| 2026-02-14 | 07 | Plan 01 complete | isKitchenVisible denorm + by_kitchen_visible index, per-order indexed lookups, optimized kitchen/dashboard queries |
| 2026-02-14 | 07 | Plan 02 complete | Eager COGS caching: invalidateMenuProductCosts cascade, stale badge, recalculateAllCosts admin button with diff dialog |
| 2026-02-14 | 07 | Plan 03 complete | Cursor-based pagination for orders/inventory/production/revenue, Load More UI in OrderManager. Phase 07 COMPLETE. |
| 2026-02-14 | 08 | Plan 01 complete | Schema field audit: 215 fields categorized A/B/C/D, 55 denormalization annotations in schema.ts, SCHEMA_AUDIT.md created |
| 2026-02-14 | 08 | Plan 02 complete | Removed all deprecated field code refs (productionType/productionUnits/isFixed), posSlot deletion guard, dead hook deleted |
| 2026-02-14 | 08 | Plan 03 complete | 9 migration functions: 6 backfill (Cat B) + 2 cleanup (Cat C) + 1 verify query in schemaCleanup.ts |
| 2026-02-14 | 08 | Plan 04 complete | 13 fields tightened, 5 deprecated fields removed, migration file AnyDoc casts, build passes. Phase 08 COMPLETE. |
| 2026-02-14 | 09 | Plan 01 complete | ThemeProvider context, teal brand tokens, dark mode CSS, Inter-only fonts, UI brand reference doc (360 lines) |
| 2026-02-14 | 09 | Plan 02 complete | Layout shell: scroll-hide header, AnimatePresence page transitions, mobile bottom nav, desktop footer, fullWidth route variant |
| 2026-02-14 | 09 | Plan 03 complete | PageHeader badge slot, 3 custom-header migrations, 8 pages cleaned for padding/colors/spacing consistency |
| 2026-02-14 | 09 | Plan 04 complete | Dashboard/OrderManager PageHeader migration, 23 files cleaned of terracotta/hardcoded colors, OrderFormPOS Playfair removal |
| 2026-02-14 | 09 | Plan 05 complete | Skeleton screens, dark mode re-enabled (ThemeContext + 60 CSS vars), kitchen 20-file color migration, 22-file non-kitchen dark fixes, header redesign (role-colored pill). Phase 09 COMPLETE. |
| 2026-02-14 | 10 | Plan 02 complete | EntityManager generic CRUD component, shadcn Table, table/card toggle, FormBuilder dialogs, bulk selection, search, sort |
| 2026-02-14 | 10 | Plan 01 complete | createMutationHook factory, 5 entity hooks migrated, customer transform removed, StorageLocations toasts added |
| 2026-02-14 | 10 | Plan 03 complete | 5 entity pages migrated to EntityManager (3 existing, 2 new), /customers + /tags routes. Phase 10 COMPLETE. |
| 2026-02-14 | 11 | Plan 01 complete | Schema tables (integrityCheckLogs, productionResets), productionLog GoFood actions, weekly cron, dependency audit with 6 upgrades |
| 2026-02-14 | 11 | Plan 02 complete | ProductionLog aggregation queries, removed all productionCounts writes, resetCounts via productionResets |
| 2026-02-14 | 11 | Plan 03 complete | Frontend switchover to productionLog, full integrity check, Phase 11 CHANGELOG. Phase 11 COMPLETE. |

## Decisions
- Schema uses discountType "amount" (not "fixed") for fixed-value voucher discounts
- validateFinalPrice blocks orders with finalTotal <= 0 (no free orders via voucher)
- Indonesian locale formatting for minimum order error messages (dots not commas)
- Test FIFO logic directly via t.run() rather than through API mutations for focused unit testing
- Fixed pre-existing type error in createDefaultStorageLocation helper
- Used completeBalls mutation (not fillPendingOrders) as primary ball distribution test entry point
- Test helpers create both componentTypes and productionUnitTypes for bridge table compatibility
- All ball distribution fixtures use BOM system exclusively (no deprecated fields)
- cancel mutation does not release inventory reservations (only updateStatus with Cancelled does) -- documented gap
- updateStatus has no state machine enforcement (any status transition allowed) -- documented gap
- Used updateStatus for inventory release tests, cancel mutation for status/production tests
- Added .env.local.* glob to .gitignore (original patterns did not cover .env.local.production/.env.local.testing filenames)
- Used casual internal-team tone for SECURITY.md per user preference
- Documented 39 requireRole() usages across 11 files as token-in-args scope
- Removed 12 unused indexes (5 strong + 7 moderate) after grep-verified audit
- Kept inventoryBatches.by_location (1 active reference), productionTargetLogs.by_date (future audit use)
- Added inline QFIX-05 comments for audit trail on removed indexes
- Used user?.name ?? "unknown" fallback for inventory audit trail (not empty string)
- Removed /kitchen-legacy redirect route entirely since V1 is deleted
- Fixed pre-existing unused OrderStatus import in OrderHeader.tsx to unblock build
- Used Partial<Record> for STATUS_COLORS to safely remove deprecated entries
- Updated getStatusCategory() to route through getDisplayStatus() so all callers benefit automatically
- Added missing Boxed/Labeled statuses to OrderStatusPanel dropdown
- Used git-filter-repo (not BFG) for history scrub since Java not installed
- Cherry-picked 34 phase commits onto rewritten history (unpushed local work preserved)
- TruffleHog 2.2.1 secrets scan: 18 false positives, 0 real secrets found
- Used api.orders.mutations.index.X path (not domain-specific paths) for shim migration simplicity
- Override audit stores user-provided reason (not re-fetched shortage details) since reservation already succeeded with skipStockCheck
- Expanded stock override access to order_staff in addition to manager/admin
- Used regex parsing for structured shortage line display with raw line fallback
- Used customMutation role metadata pattern (3rd arg) for per-function role declarations -- roles declared at definition site, never over wire
- Generic "Unauthorized" error for all auth failures (no role/status details leaked)
- Custom useLocalStorage hook for SessionProvider (localStorage, not sessionStorage) for cross-tab persistence
- Auth token synced to malo_session_id localStorage key on all 5 state transitions (login, logout, mount valid, mount expired, server invalidation)
- Cost invalidation is depth-1 only -- does not cascade to linked recipe consumers (self-corrects on next view)
- K3Mart TODOs converted to BACKLOG references (K3MART-01 through K3MART-06), not implemented
- Production records mapped per-item with parent product name for display context
- Shipping mutations remain bare mutation() -- internal system calls, auth enforced by calling order mutations (Pitfall 6)
- StorageLocations queries left as-is -- custom index/sort patterns too entity-specific for generic helpers
- Shipping queries left as-is -- unique usage tracking patterns not suited to generic helpers
- Tags seedDefaults uses publicMutation (not protectedMutation) to remain callable from dashboard without auth
- createdBy derived from ctx.user.name on server, removed from frontend create input types
- Tags seedDefaults hook uses useMutation (not useSessionMutation) since public mutation does not accept sessionId
- Entity queries remain public (no auth) since ProtectedRoute already guards page-level access
- PRODUCTION_TYPE_TO_BOM_CODE mapping: original->BIG_BALL, bite_sized->MID_BALL (counterintuitive but correct per CLAUDE.md Pitfall #11)
- Known corrections auto-applied: Original Single -> 1 MID_BALL, Original Triple -> 3 MID_BALL (overrides standard mapping)
- Brochure reclassification deletes menuProduct record but warns about referencing orderItems (snapshot data preserved)
- Verification query compares against standard mapping only (not corrections), so corrected products will show as mismatches (expected)
- Dual-read pattern: BOM production records checked first, deprecated fields used as fallback for historical orders
- productionByItem batch fetch moved before stats calculation loops (use-before-declaration fix)
- Packaging mutations use async per-item DB lookups for BOM helpers (not batch -- single item context)
- menuProducts.create uses empty string/zero defaults for deprecated required schema fields (BOM-04 will relax)
- Debug query renames deprecated fields with deprecated_ prefix and adds hasBOMData flag
- Frontend type definitions retain deprecated fields as optional with @deprecated JSDoc for TypeScript compatibility
- PackageStatusDisplay replaces productionUnits prop with ballsPerPackage for BOM-derived ball count display
- menuProducts create/update mutations no longer propagate deprecated fields to database
- Seed data retains deprecated field values with DEPRECATED comments for dev backward compatibility
- BOM-05 (remove by_production_type on orderItems) already done in Phase 3 QFIX-05, documented not re-executed
- isKitchenVisible set at every status mutation point including revert handlers and auto-transition helpers
- completedAt set on terminal transitions (CompleteShipped/PickedUp/Cancelled), cleared on revert
- Kitchen query: by_kitchen_visible index for active orders + terminal status fetch for completed-today (completedAt >= midnight)
- batchFetching uses Promise.all per-order indexed lookups (scales with active orders, not total history)
- getProductSuggestions bounded to take(500) for recent unique suggestions
- Dashboard entity counts parallelized with Promise.all
- confirmPayment mutation does not exist -- payment confirmation goes through updateStatus
- Pre-existing fifo.test.ts failure (by_batch index) from Phase 3 QFIX-05, not related to query optimization
- unitCost stores production-only COGS (breakdown.production), packaging costs excluded per user decision
- Stale marker (unitCostStaleAt) set synchronously on componentType cost change, cleared after async recalculation
- recalculateAllCosts returns diff array with productId, name, oldCost, newCost, delta for changed products
- Stale badge in list cards only -- edit form uses live-calculated costs from component rows, not cached unitCost
- Recalculate Costs button visible only to admin role
- Paginated queries support single status only (not arrays) due to Convex filter() + paginate() limitation
- OrderManager dual-hook pattern: paginated for All view, non-paginated for category tabs
- useConvexOrders accepts "skip" string to disable query when paginated hook is active
- countOrders uses .collect().length (Convex has no native count API)
- Existing non-paginated queries preserved for backward compatibility (KitchenView, category tabs)
- orders.completedAt stays v.optional() (Category A) -- active orders legitimately lack it, only terminal orders have it
- 55 denormalization annotations: 18 SNAPSHOT + 25 CACHE + 12 DERIVED, formal format with source-of-truth and timing
- menuProducts.isFixed classified Category C (removable) -- posSlot/packagingPosSlot replaces deletion protection
- useConvexFixedProducts identified as dead code (exported but never imported)
- Items without production records contribute 0 balls (no fallback to deprecated fields)
- getBallsPerPackageForItem returns 1 default without production records (same behavior, no deprecated field read)
- hasProductionData returns false without fallback (clean separation from deprecated productionType)
- Deletion protection uses posSlot/packagingPosSlot check instead of isFixed
- POS badge (Pin icon) replaces Fixed badge (Lock icon) in MenuProductsManager UI
- productionType/productionUnits removed from create/update mutation validator args
- bomBackfill.ts productionUnits defaults to 1 when undefined (migration file type safety fix)
- costPerBaseUnit backfill: (priceExclShipping + shippingCost) / volumePurchased, then convert to base unit (kg->g: *0.001, l->ml: *0.001)
- menuProducts.productType defaults to "food" (all current products are food)
- orders.completedAt backfill uses _creationTime for terminal historical orders (best-guess)
- orders.finalTotal backfill: totalAmount - (orderLevelDiscount ?? 0)
- kitchenInventory.updatedBy defaults to "system" for backfilled records
- verifyCleanupComplete checks both Category B (backfilled) and Category C (cleared) fields plus packagingMaterials
- Migration files use AnyDoc cast pattern to reference removed schema fields post-tightening
- menuProducts create defaults: unitCost=0, cachedProductionSummary="", productType="food"
- kitchenInventory auto-create defaults: updatedBy="system"
- productionUnitTypes create color default: "#93C572" (green)
- seedFixedProducts updated with required cachedProductionSummary and productType per product
- updateCachedProductionSummary sets empty string (not undefined) when no components exist
- Inter-only typography (dropped Playfair Display) -- single font reduces FOUT, matches Notion-style reference
- Teal #0D9488 as brand accent replacing terracotta #E07856 -- fresh, natural feel for snack brand
- Border radius 12px/8px/6px (up from 8px/6px/4px) -- warmer, more approachable
- shadcn primary token remapped to teal HSL -- all shadcn Button/Ring components automatically use brand color
- Kitchen station and domain colors preserved as-is (semantic, not theme-dependent)
- MobileBottomNav uses text-primary for active tabs (text-brand deferred until Plan 09-01 brand tokens are integrated)
- Sonner Toaster keeps inline CSS variable styling (useTheme deferred until ThemeContext is wired)
- MobileBottomNav primary tabs: Sales, Orders, Kitchen, Inventory; More sheet: K3 Mart, Production, WhatsApp, Products, Vouchers, Users
- Header inner container changed from container class to max-w-[1400px] for alignment with PageContainer
- Dual layout routing: fullWidth (kitchen, orders) vs standard (with PageContainer) in App.tsx
- ComponentTypesManager.tsx is a deleted stub (4 lines) -- not a real page, skipped in audit
- Semantic status colors (green/yellow/red margins, blue/green discount types) preserved as-is -- semantic, not brand accent
- InventoryManager terracotta gradient replaced with default shadcn primary Button (teal from Plan 01)
- PageHeader badge prop used for inline status indicators (PackagingView order count)
- PageHeader action prop used for header-level buttons (K3MartCockpit sync, MenuProductsManager actions)
- OrderManager window.innerWidth replaced with Tailwind responsive classes (md:hidden/md:flex)
- Dark summary panels use bg-foreground text-background (replacing removed --color-dark-gradient-from/to vars)
- Kitchen #E07856 references replaced with station CSS variables (--color-station-packing), not brand vars
- OrderFormPOS Playfair Display inline style block removed entirely (Inter is site-wide font)
- FormBuilder renders its own submit/cancel buttons inside EntityManager dialog (no separate DialogFooter)
- useViewPreference stores in localStorage under entityManager:{key}:view namespace
- Default card auto-generates from columns config: first column = title, rest = detail rows
- Bulk delete falls back to Promise.all of individual onDelete calls when onBulkDelete not provided
- Sort state cycles asc -> desc -> clear on repeated column header clicks
- Undo toast re-creates entity via onCreate with cached form data (pragmatic re-creation, not true undo)
- createMutationHook uses Parameters<typeof mutation> to inherit exact useSessionMutation arg types (avoids complex generic math)
- Customer transform layer removed entirely -- order forms updated to use raw Convex _id directly
- useConvexSeedTags kept as standalone hook (useMutation not useSessionMutation -- public mutation, no sessionId)
- LocationsManager inline toasts removed in favor of factory-provided toast notifications
- productionLog summary type extended inline with new ship_goldfinch/return_goldfinch action types (not Record<string,number>)
- Placeholder integrity check inserts pass entry to integrityCheckLogs so crons.ts compiles before Plan 03 implementation
- 6 safe patch/minor dependency upgrades applied; 7 major version upgrades skipped with documented rationale
- [Phase 10-03]: transformFormData converts empty strings to undefined for optional mutation fields
- [Phase 10-03]: LocationsManager uses Badge renders in columns for type and status display
- [Phase 10-03]: TagsManager defaults to card view with undo support (no referential deps)
- ReadableCtx = QueryCtx | MutationCtx union type allows aggregateForProduct to work in both query and mutation contexts
- return_goldfinch log entries add to stickered total (items returned from Goldfinch become available for re-stickering)
- Kitchen mutations read aggregated counts for validation before writing log entries (prevents invalid state transitions)
- kitchenQueries pre-fetches orderItems and aggregates only for referenced menuProductIds (not all active products)
- productionCounts table is now fully archived -- no reads or writes from frontend or backend mutations
- Integrity check mismatches are expected and informational since productionLog is authoritative (dual-write historical discrepancies)
- **RCA: Phase 11 branching failure** — Phase 11 was started on `feature/infrastructure` branched from `feature/frontend-factories` (Phase 10's branch) instead of from `main`. Phase 10 had not been merged to main yet. Result: Phase 10 and 11 commits are interleaved on the same branch lineage. Root cause: orchestrator ran `git checkout -b feature/infrastructure` from the current HEAD without first verifying it was on `main` or that the previous phase's branch had been merged. The `handle_branching` workflow step creates branches from current HEAD but does not validate the starting point. Mitigation: all commits will be merged together from `feature/infrastructure` which contains both phases' work. No code impact — only git history is messier than intended.

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01 | 02 | 5min | 2 | 2 |
| 01 | 04 | 4min | 2 | 2 |
| 01 | 01 | 7min | 2 | 2 |
| 01 | 03 | 8min | 3 | 2 |
| 02 | 01 | 5min | 2 | 3 |
| 03 | 03 | 5min | 1 | 1 |
| 03 | 01 | 6min | 2 | 17 |
| 03 | 02 | 7min | 2 | 5 |
| 02 | 02 | 14min | 3 | 2 |
| 03 | 04 | 4min | 2 | 11 |
| 04 | 01 | 7min | 2 | 5 |
| 05 | 01 | 8min | 2 | 6 |
| 04 | 02 | 9min | 2 | 8 |
| 05 | 02 | 5min | 2 | 10 |
| 05 | 03 | 6min | 2 | 7 |
| 06 | 01 | 3min | 2 | 2 |
| 06 | 02 | 8min | 2 | 6 |
| 06 | 03 | 9min | 2 | 7 |
| 07 | 01 | 7min | 2 | 11 |
| 07 | 02 | 8min | 2 | 5 |
| 07 | 03 | 7min | 2 | 7 |
| 08 | 01 | 7min | 2 | 3 |
| 08 | 02 | 7min | 2 | 8 |
| 08 | 03 | 3min | 2 | 1 |
| 08 | 04 | 4min | 2 | 11 |
| 09 | 01 | 5min | 2 | 5 |
| 09 | 02 | 4min | 2 | 9 |
| 09 | 03 | 5min | 2 | 11 |
| 09 | 04 | 6min | 2 | 23 |
| 09 | 05 | 15min | 2 | 44 |
| 10 | 02 | 5min | 2 | 5 |
| 10 | 01 | 7min | 2 | 10 |
| 10 | 03 | 8min | 3 | 8 |
| 11 | 01 | 5min | 2 | 7 |
| 11 | 02 | 9min | 2 | 8 |
| 11 | 03 | 4min | 2 | 4 |

---
*Last updated: 2026-02-14*
*Last session stopped at: Completed 11-03-PLAN.md (frontend switchover + integrity check). Phase 11 COMPLETE (3/3 plans). All 11 phases done.*

