# CLAUDE.md

## Project Overview

**Frollie Recipe Master** -- Real-time recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, product concepts, orders, kitchen production, and inventory with full versioning, cost calculations, and margin analysis.

**Architecture:** Convex (serverless backend + real-time database) + React 19 + TypeScript + Vite

---

## Commands

```bash
# Development (two terminals)
npx convex dev               # Terminal 1: Convex backend (connects to dev env)
npm run dev                   # Terminal 2: Vite frontend (localhost)

# Build & Verify
npm run build                 # tsc + vite build (MUST pass before merge)
npm run type-check            # TypeScript only (no build)
npm run lint                  # ESLint
npm run test                  # Vitest (unit tests)
npm run test:watch            # Vitest watch mode
npm run test:coverage         # Vitest with coverage

# Deployment
npm run deploy:check          # Pre-deploy validation (dry run)
npm run deploy:safe           # Validated deploy to production

# Convex
npx convex deploy             # Deploy to production
npx convex export             # Backup database
npx convex dashboard          # Open dashboard in browser

# Seeding (run from Convex dashboard Functions tab)
# tags:seedDefaults           - Creates default tags
# menuProducts:seedDefaults   - Creates default menu products
```

**Environments:**
- **Production**: `prod:decisive-wombat-7` (Vercel + GitHub Actions CI)
- **Development**: `dev:exciting-fennec-671` (local `npx convex dev`)
- **CI/CD**: Push to `main` triggers GitHub Action (Convex deploy) then Vercel rebuild

---

## Git Workflow

**NO direct commits to main for CODE. Documentation-only commits to main are allowed.**

### Code changes — always on a feature branch
Any commit that touches code (anything outside the docs-only paths listed below) MUST be made on a feature branch:

```bash
git switch main && git pull
git switch -c feature/{name}   # or fix/{name}
# ... make changes ...
git add <specific-files>
git commit -m "feat: description"
npm run build                  # MUST pass before merge
git push origin feature/{name}
# Merge to main after review
```

### Documentation-only commits — direct to main is fine
Commits that ONLY touch the following paths may go straight to main, no feature branch needed. This avoids branch churn for planning work that doesn't interact with code:

- `.planning/**` — roadmaps, phase directories, specs, plans, requirements, retrospectives, discussion logs, context files, research notes, UAT checklists
- `docs/**` — CHANGELOG, SCHEMA, API_REFERENCE, ROADMAP, TESTING_GUIDE, design docs, review notes, superpowers specs, superpowers plans
- Root-level `*.md` files — README, CLAUDE.md, etc.
- `.claude/**` — agent definitions, commands, skills, settings (tooling config, not product code)

**Rule of thumb:** if `npm run build` or `npm run test` would be unaffected by the commit, it's doc-only and can go straight to main.

### Workflows that always produce doc-only output (direct-to-main OK)
The following workflows produce ONLY artifacts in the paths above and are explicitly allowed to commit direct to main with no feature branch:

- **GSD planning** (`/gsd-plan-phase`, `/gsd-add-phase`, `/gsd-insert-phase`, `/gsd-research-phase`, `/gsd-plan-milestone-gaps`, `/gsd-new-milestone`, `/gsd-map-codebase`) — writes `.planning/phases/**/*.md`, `.planning/ROADMAP.md`, `.planning/codebase/**`
- **GSD discussion** (`/gsd-discuss-phase`, `/gsd-list-phase-assumptions`, `/gsd-explore`, `/gsd-note`, `/gsd-add-backlog`) — writes `.planning/phases/**/CONTEXT.md`, `.planning/phases/**/DISCUSSION-LOG.md`, `.planning/notes.md`
- **Superpowers brainstorming** (`superpowers:brainstorming` skill) — writes `docs/superpowers/specs/YYYY-MM-DD-*.md`
- **Superpowers plan writing** (`superpowers:writing-plans` skill) — writes `docs/superpowers/plans/YYYY-MM-DD-*.md`
- **Code review artifacts** (`/gsd-code-review`, `/staffreview`, `/triple-review`) — writes `docs/reviews/**/*.md`, `.planning/phases/**/REVIEW.md`
- **Docs updates** (`/gsd-docs-update`, CHANGELOG updates) — writes `docs/**/*.md`
- **Verification artifacts** (`/gsd-verify-work`, `/gsd-validate-phase`, `/gsd-secure-phase`, `/gsd-audit-milestone`) — writes `.planning/phases/**/VERIFICATION.md`, `SECURITY.md`, `UI-REVIEW.md`

These workflows do not need a feature branch. Committing their output to main is the default behavior. This keeps the feature-branch focused on actual code work without interleaving with planning churn.

**Mixed commits** (code + docs together) — still require a feature branch. The carve-out only applies to commits that are 100% in the doc-only paths above. If a planning workflow somehow produces a code change (unusual — most don't), that commit must go to a feature branch.

### Branch-per-phase rule (code work)
Every GSD phase MUST run on its own feature branch (`feature/{slug}`). The GSD config enforces this via `branching_strategy: "phase"` in `.planning/config.json`. Before starting code work on a phase, verify `git branch --show-current` is NOT `main`. After a phase completes and is verified, merge to main before starting the next phase.

Planning artifacts for a phase (spec, plan, discussion logs, roadmap edits) can land on main independently of the phase's code branch — they don't need to wait for the code branch to merge.

### After every merge to main
Update `docs/CHANGELOG.md` (always required). Also update `docs/SCHEMA.md` if schema changed, `docs/API_REFERENCE.md` if backend changed, `docs/ROADMAP.md` if feature completed.

---

## Planning Requirements

**Every implementation plan MUST include these 4 sections. Copy this template:**

```markdown
## Git Workflow
**Branch:** `feature/{name}`
**Checkpoints:** TBD based on waves

## Implementation Waves
### Wave 1: Backend [PARALLEL]
| Agent | Task | Files |
|-------|------|-------|
### Wave 2: Frontend [PARALLEL, after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
### Wave 3: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance |
| Bash | npm run build |

## Documentation Updates
- [ ] CHANGELOG.md
- [ ] {Other docs if applicable}

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] {Feature-specific criteria}
```

**Validation gate:** Before implementing, confirm all 4 sections exist. If any is missing, add it before proceeding.

---

## Quick File Finder

**Backend:** `convex/` | **Frontend:** `src/`

| Task | Backend Files | Frontend Files |
|------|---------------|----------------|
| **Schema change** | `convex/schema.ts` | -- |
| **Recipe changes** | `convex/recipes/mutations.ts`, `queries.ts` | `src/hooks/convex/useRecipes.ts`, `src/pages/RecipeEditor.tsx` |
| **Packaging changes** | `convex/packaging/mutations.ts`, `queries.ts` | `src/hooks/convex/usePackaging.ts`, `src/pages/PackagingEditor.tsx` |
| **Product COGS** | `convex/lib/costCalculator.ts`, `convex/products/queries.ts` | `src/pages/ProductEditor.tsx`, `src/components/shared/CostTooltip.tsx` |
| **Order changes** | `convex/orders/mutations/`, `queries.ts` | `src/hooks/convex/useOrders.ts`, `src/pages/OrderDetail.tsx`, `src/pages/OrderManager.tsx` |
| **Kitchen view** | `convex/orders/queries.ts`, `convex/orders/mutations/` | `src/pages/KitchenViewV2.tsx`, `src/components/kitchen/` |
| **Ball distribution** | `convex/orders/helpers/ballDistribution.ts` | -- |
| **Order status transitions** | `convex/orders/helpers/statusTransitions.ts` | -- |
| **WhatsApp templates** | `convex/orders/whatsapp.ts`, `convex/whatsappTemplates/` | `src/pages/WhatsAppTemplatesManager.tsx` |
| **Menu products** | `convex/menuProducts/`, `convex/menuProductComponents/` | `src/pages/MenuProductsManager.tsx`, `src/hooks/convex/useMenuProducts.ts` |
| **Component types (BOM)** | `convex/componentTypes/` | `src/pages/ComponentTypesManager.tsx`, `src/hooks/convex/useComponentTypes.ts` |
| **Inventory** | `convex/inventory/`, `convex/storageLocations/` | `src/pages/InventoryManager.tsx`, `src/pages/LocationsManager.tsx`, `src/hooks/convex/useInventory.ts` |
| **Product inventory (finished goods)** | `convex/productInventory/` (mutations, queries, substitution.ts, stockTracker.ts) | `src/components/inventory/InventoryAvailabilityPanel.tsx`, `src/components/inventory/FulfillFromInventoryButton.tsx` |
| **Vouchers** | `convex/vouchers/` | `src/pages/VouchersManager.tsx`, `src/hooks/convex/useVouchers.ts` |
| **Customers** | `convex/customers/` | `src/pages/CustomersManager.tsx`, `src/hooks/convex/useCustomers.ts` |
| **Sales analytics** | `convex/reports/` | `src/pages/SalesAnalytics.tsx`, `src/hooks/convex/useSalesAnalytics.ts` |
| **Unit economics analytics** | `convex/reports/unitEconomics.ts`, `convex/reports/productionUnitHelpers.ts`, `convex/reports/channelTaxonomy.ts`, `convex/reports/revenueHelpers.ts` | `src/pages/AnalyticsDashboard.tsx`, `src/components/analytics/`, `src/hooks/convex/useAnalytics.ts`, `src/contexts/AnalyticsFilterContext.tsx` |
| **Expense analytics** | `convex/expenses/analyticsQueries.ts`, `convex/expenses/fraudHelpers.ts` | `src/pages/ExpenseAnalytics.tsx`, `src/components/expenseAnalytics/`, `src/hooks/convex/useExpenseAnalytics.ts` |
| **Journal import** | `convex/journalImport/mutations.ts` | `src/pages/HistoricalImportPage.tsx`, `src/hooks/convex/useJournalImport.ts`, `src/lib/csvImportValidation.ts` |
| **Manual journal** | `convex/manualJournal/mutations.ts`, `queries.ts` | `src/pages/ManualJournalEntry.tsx`, `src/hooks/convex/useManualJournal.ts` |
| **Financial statement** | `convex/reports/incomeStatement.ts`, `convex/lib/journalHelpers.ts` | `src/pages/FinancialStatement.tsx`, `src/lib/csvExport.ts` |
| **K3Mart cockpit** | `convex/k3martCockpit/`, `convex/k3martKitchen/` | `src/pages/K3MartCockpit.tsx`, `src/hooks/convex/useK3MartCockpit.ts` |
| **External data (GoFood)** | `convex/externalData/`, `convex/gofoodDepot/`, `convex/integrations/` | `src/hooks/convex/useExternalData.ts` |
| **Production targets** | `convex/productionTargets/`, `convex/productionLog/` | -- |
| **Restock planning** | `convex/restock/` | `src/pages/RestockPlanner.tsx` |
| **Tags** | `convex/tags/` | `src/pages/TagsManager.tsx`, `src/hooks/convex/useTags.ts` |
| **Auth / Users** | `convex/auth/`, `convex/lib/auth.ts` | `src/pages/Login.tsx`, `src/pages/UsersManager.tsx`, `src/contexts/AuthContext.tsx` |
| **Cost calculation** | `convex/lib/costCalculator.ts` | `src/components/shared/CostTooltip.tsx` |
| **Fixed assets** | `convex/fixedAssets/mutations.ts`, `queries.ts`, `helpers.ts` | `src/pages/AssetRegister.tsx`, `src/hooks/convex/useFixedAssets.ts`, `src/components/assets/` |
| **Bank reconciliation** | `convex/bankStatements/` (mutations, queries, matchEngine, channelMapping), `convex/bankKeywordRules/` (mutations, defaultRules), `convex/lib/journalEngine.ts` (bank_statement_reversal sourceType), `convex/lib/indonesianDate.ts` | `src/pages/BankReconciliationPage.tsx`, `src/pages/BankRulesManager.tsx`, `src/pages/AssetRegister.tsx` (CapEx round-trip), `src/hooks/convex/useBankReconciliation.ts`, `src/components/bankReconciliation/` (17 components: SplitViewWorkspace, BankLinesPane, CandidatesPane, ReconciliationActionBar, StatementProgressHeader, BatchConfirmDialog, LearnFromOverrideDialog, InlineExpenseDialog, InlineRevenueDialog, InlineReimbursementDialog, SearchAllRecordsDialog, RevenueGapTab, ReversedIndicator, ConfidenceBadge, etc.), `src/components/expense/ExpenseSubmitForm.tsx`, `src/lib/bankStatement/` |
| **Tutorial walkthroughs** | -- | `src/components/help/walkthrough/`, `src/components/help/WalkthroughPlayer.tsx` |
| **Add new page** | `convex/schema.ts`, `convex/[entity]/queries.ts`, `mutations.ts` | `src/App.tsx` (route), `src/pages/[Page].tsx`, `src/hooks/convex/use[Entity].ts` |
| **Access control** | `convex/lib/auth.ts`, `convex/[entity]/mutations.ts` | `src/components/auth/ProtectedRoute.tsx`, `src/App.tsx` |

---

## Critical File Paths

**Backend (Convex) -- 59 tables in `convex/schema.ts`:**
- `convex/schema.ts` -- Database schema definition
- `convex/lib/costCalculator.ts` -- Cost calculation logic
- `convex/lib/auth.ts` -- `requireRole()` authorization helper
- `convex/orders/whatsapp.ts` -- WhatsApp receipt generation
- `convex/orders/helpers.ts` -- Pure order calculation helpers (no ctx)
- `convex/orders/helpers/` -- Ctx-dependent helpers (ballDistribution, statusTransitions, usageTracking, productionRecords, voucherHandling, batchFetching, statusFetching)
- `convex/orders/mutations/` -- Order mutations (split into orderCrud, inventoryIntegration)

**Frontend (34 pages, 35 hooks):**
- `src/App.tsx` -- Router setup (all routes use ProtectedRoute)
- `src/main.tsx` -- Entry point with ConvexProvider
- `src/contexts/AuthContext.tsx` -- Auth state management
- `src/hooks/convex/` -- Convex query/mutation hooks
- `src/lib/types.ts` -- TypeScript interfaces
- `src/lib/utils.ts` -- Utilities (cn, formatCurrency)
- `src/components/auth/ProtectedRoute.tsx` -- Route permission guards

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Backend** | Convex ^1.31.7 | Real-time serverless database |
| **Frontend** | React ^19.2.0 + TypeScript ~5.9 | UI framework |
| **Build** | Vite ^7.2.4 | Fast bundler with HMR |
| **Styling** | Tailwind CSS ^4.1.18 + shadcn/ui | Utility-first + accessible components |
| **Routing** | React Router ^7.13.0 | Client-side routing |
| **Testing** | Vitest ^4.0.18 + convex-test | Unit + backend tests |
| **Icons** | Lucide React | Icon library |
| **Toasts** | Sonner | Toast notifications |
| **Animations** | Framer Motion | Animation library |

---

## Project Structure

```
product_master/
+-- convex/                           # Backend (59 tables)
|   +-- _generated/                   # Auto-generated types & API
|   +-- lib/
|   |   +-- costCalculator.ts         # Cost calculation logic
|   |   +-- auth.ts                   # requireRole() helper
|   +-- auth/                         # Login, sessions, user management
|   +-- channels/                     # Channel usage tracking
|   +-- componentTypes/               # Unified BOM component types
|   +-- customers/                    # Customer CRUD
|   +-- dashboard/                    # Dashboard aggregation queries
|   +-- externalData/                 # External data sync (GoFood, etc.)
|   +-- feedback/                     # Visual feedback overlay
|   +-- gofoodDepot/                  # GoFood depot integration
|   +-- ingredients/                  # Ingredient CRUD
|   +-- integrations/                 # Third-party integrations (GoBiz)
|   +-- integrityChecks/              # Data integrity validation
|   +-- inventory/                    # Inventory batches, stock, transactions
|   +-- k3martCockpit/                # K3Mart cockpit dashboard
|   +-- k3martKitchen/                # K3Mart kitchen operations
|   +-- kitchenConfig/                # Kitchen configuration settings
|   +-- materials/                    # Packaging materials CRUD
|   +-- menuProductComponents/        # Menu product -> component type links
|   +-- menuProducts/                 # Menu product definitions
|   +-- migrations/                   # Data migrations
|   +-- orders/                       # Order management
|   |   +-- queries.ts
|   |   +-- mutations/                # Split: orderCrud, inventoryIntegration
|   |   +-- whatsapp.ts              # WhatsApp message templates
|   |   +-- helpers.ts               # Pure functions (no ctx)
|   |   +-- helpers/                  # Ctx-dependent helpers
|   +-- packaging/                    # Packaging recipes
|   +-- platformCredentials/          # Platform API credentials
|   +-- productionCounts/             # Production counts (archived, read-only)
|   +-- productionLog/                # Production log entries (source of truth)
|   +-- productionTargets/            # Daily production targets
|   +-- productionUnitTypes/          # Production unit types (Big Ball, Mid Ball)
|   +-- products/                     # Product management
|   +-- recipes/                      # Recipe management
|   +-- reports/                      # Report generation
|   +-- restock/                      # Restock planning
|   +-- shipping/                     # Shipping agency tracking
|   +-- storageLocations/             # Storage location CRUD
|   +-- tags/                         # Tag management
|   +-- vouchers/                     # Voucher codes + usage tracking
|   +-- whatsappTemplates/            # Editable WhatsApp templates
|   +-- crons.ts                      # Scheduled jobs
|   +-- http.ts                       # HTTP endpoints
|   +-- schema.ts                     # Database schema (59 tables)
+-- src/                              # Frontend
|   +-- components/
|   |   +-- ui/                       # shadcn/ui primitives
|   |   +-- layout/                   # Header, Layout, PageHeader
|   |   +-- auth/                     # ProtectedRoute, LoginForm
|   |   +-- shared/                   # CostTooltip, ConfirmDialog, FormBuilder, etc.
|   |   +-- dashboard/
|   |   +-- feedback/
|   |   +-- ingredients/
|   |   +-- inventory/
|   |   +-- kitchen/                  # Kitchen V2 components
|   |   +-- materials/
|   |   +-- menuProducts/
|   |   +-- onboarding/
|   |   +-- orders/
|   |   +-- packaging/
|   |   +-- products/
|   |   +-- recipes/
|   |   +-- whatsappTemplates/
|   +-- pages/                        # 26 page components
|   |   +-- Dashboard.tsx
|   |   +-- Login.tsx
|   |   +-- RecipeEditor.tsx
|   |   +-- PackagingEditor.tsx
|   |   +-- PackagingView.tsx
|   |   +-- ProductEditor.tsx
|   |   +-- IngredientsManager.tsx
|   |   +-- MaterialsManager.tsx
|   |   +-- OrderManager.tsx
|   |   +-- OrderCreate.tsx
|   |   +-- OrderDetail.tsx
|   |   +-- KitchenViewV2.tsx
|   |   +-- K3MartCockpit.tsx
|   |   +-- MenuProductsManager.tsx
|   |   +-- CustomersManager.tsx
|   |   +-- UsersManager.tsx
|   |   +-- WhatsAppTemplatesManager.tsx
|   |   +-- VouchersManager.tsx
|   |   +-- InventoryManager.tsx
|   |   +-- LocationsManager.tsx
|   |   +-- ComponentTypesManager.tsx
|   |   +-- PackagingComponentsManager.tsx
|   |   +-- ProductionComponentsManager.tsx
|   |   +-- RestockPlanner.tsx
|   |   +-- SalesAnalytics.tsx
|   |   +-- TagsManager.tsx
|   +-- hooks/
|   |   +-- convex/                   # 24 Convex hooks + index.ts
|   +-- contexts/
|   |   +-- AuthContext.tsx           # Auth state (useAuth)
|   +-- lib/
|   |   +-- types.ts                  # TypeScript interfaces
|   |   +-- utils.ts                  # cn, formatCurrency
|   +-- App.tsx                       # Router setup
|   +-- main.tsx                      # Entry with ConvexProvider
|   +-- index.css                     # Tailwind CSS + theme
+-- docs/                             # Documentation
+-- .claude/agents/                   # 10 specialized agents
+-- .agent/skills/                    # 12 custom skills
```

---

## Access Control

All routes use `<ProtectedRoute>` with permission-based or role-based access. Auth uses PIN login with session tokens.

**Roles:** `kitchen`, `order_staff`, `manager`, `admin`

| Page | Permission / Roles | Notes |
|------|-------------------|-------|
| Login | Public | Only unauthenticated |
| Dashboard | `canAccessDashboard` | Manager, Admin |
| Kitchen / Kitchen V2 | `canAccessKitchen` | All roles |
| Packaging View | `canAccessPackaging` | All roles |
| Orders | `canAccessOrders` | Order Staff, Manager, Admin |
| Order Detail | Roles: order_staff, manager, admin, kitchen | Kitchen sees no costs |
| Recipes / Packaging Editor | `canAccessRecipes` | Manager, Admin |
| Product Editor | `canAccessProducts` | Manager, Admin |
| Ingredients | `canAccessIngredients` | Manager, Admin |
| Materials | `canAccessMaterials` | Manager, Admin |
| Menu Products | `canAccessMenuProducts` | Admin |
| Users | `canAccessUsers` | Admin |
| WhatsApp Templates | `canManageWhatsAppTemplates` | Manager, Admin |
| Vouchers | `canAccessVouchers` | Admin |
| Inventory / Locations / Components | `canAccessInventory` | Manager, Admin |
| Customers | `canAccessOrders` | Order Staff, Manager, Admin |
| Sales Analytics | `canAccessDashboard` | Manager, Admin |
| K3Mart Cockpit | `canAccessDashboard` | Manager, Admin |
| Tags | `canAccessIngredients` | Manager, Admin |
| Restock Planner | `canAccessInventory` | Manager, Admin |
| Historical Import | `canManageReimbursements` | Admin |
| Asset Register | `canAccessAssets` | Manager, Admin |

**Backend enforcement:** Use `requireRole(ctx, args.token, ["admin"])` from `convex/lib/auth.ts`. Add `token: v.string()` to protected mutation args.

---

## Key Business Rules

1. **Unit conversion**: kg->g, l->ml, m->cm. 1 ml = 1 g for liquid calculations.
2. **Version immutability**: Saved versions cannot be edited. Create new version instead.
3. **Linked components**: Recipes can reference other recipe versions as components.
4. **Product pinning**: Products stay on selected recipe/packaging versions. Manual update required.
5. **Reusable components**: Only single-component recipes marked as reusable appear in component selection.
6. **Deletion rules**: Recipes/packaging cannot be deleted if used in products. Error shows blocking products.
7. **Order numbers**: Format `MMDD-NNN` (e.g., 0129-001) for bank transfer reference.
8. **Kitchen production**: Balls accumulate in trays and auto-allocate to pending orders. Production tracking uses `orderItemProduction.unitsRemaining` (source of truth) and `orderItems.ballsFilled/packageStatus` (UI display).
9. **Order status workflow**: Draft -> AwaitingPayment -> Confirmed -> InProduction -> Boxed -> Labeled -> WaitingShipment/WaitingPickup -> CompleteShipped/PickedUp. Any non-terminal -> Cancelled.
10. **Unified BOM (source of truth for product composition)**: `componentTypes` table unifies production units (balls) and packaging items (boxes, stickers) into a single Bill of Materials system. Two categories: `production`, `packaging`. **All ball type/count information MUST be derived from BOM** (`menuProductComponents` + `componentTypes`), NOT from the deprecated `menuProducts.productionType`/`productionUnits` or `orderItems.productionType`/`productionUnits` fields. BOM codes: `BIG_BALL` = 80g/Jumbo, `MID_BALL` = 45g/Original.
11. **Inventory FIFO**: Packaging inventory uses FIFO batch tracking. Stock is reserved on order confirmation and consumed on fulfillment.
12. **Production counts source of truth**: All production count data (boxed, stickered, packed, shippedToGoldfinch) is derived from `productionLog` aggregation. The `productionCounts` table is archived (read-only). Resets are tracked via `productionResets` timestamps.
13. **"Units sold" = balls, not products**: Any metric labelled "units sold" or "production volume" MUST count BOM-resolved balls (Big Ball + Mid Ball), not product-level order quantity. A product containing 3 balls counts as 3, not 1. The lifetime hero card estimates total balls via `avgRevenuePerBall` calculated dynamically from BOM-linked items (see `getLifetimeTotalsInternal` in `convex/externalData/queries.ts`).

---

## Common Pitfalls

1. **Convex IDs are typed strings** -- `Id<"tableName">`, not numbers.
2. **Convex returns undefined while loading** -- Always check `if (items === undefined) return <Loading />;`
3. **camelCase in Convex** -- Field names are camelCase (`procurementSource`), not snake_case.
4. **Real-time updates** -- Convex queries auto-update. No cache invalidation needed after mutations.
5. **Cost calculation with null yield** -- Check `estimatedYieldGrams` before dividing. Return `null` if not set.
6. **Version copy depth** -- Deep copy components AND ingredients. Shallow copy creates shared references.
7. **Mutations are async** -- Always `await` mutation calls.
8. **No dynamic imports in Convex** -- Static imports only. Dynamic `import()` works locally but fails silently in production (204 No Content).
9. **React hooks order** -- All hooks must be called before any conditional returns. No hooks after early returns.
10. **Auth token in mutations** -- Protected mutations require `token: v.string()` arg. Extract token before passing to db operations.
11. **NEVER use productionType/productionUnits** -- These deprecated fields on `menuProducts` and `orderItems` cause confusion (e.g., `productionType="original"` maps to BIG_BALL/80g, not what you'd expect). Always derive ball composition from BOM: `menuProductComponents` joined with `componentTypes` (filter `category="production"`, read `code` for `BIG_BALL`/`MID_BALL`).
12. **Branch from main before starting a new phase** -- When creating a phase branch, ALWAYS `git switch main && git pull` first. Never branch from another phase's feature branch. If the previous phase hasn't been merged to main yet, merge it first or wait. Branching from another feature branch interleaves commits and creates messy git history.
13. **Count balls, not product units** -- When counting "units sold" or production volume, ALWAYS resolve BOM to count actual Big Ball + Mid Ball components, NOT product-level quantity. A hamper with 3 balls = 3, not 1. Use `menuProductComponents` + `componentTypes` (category="production") to get ball count per product. The lifetime hero card uses a dynamic `avgRevenuePerBall` (weighted average from BOM-linked revenue items) to estimate total balls from gross revenue. Falls back to 35K IDR/ball when no BOM-linked items exist.
14. **Keep phase directory names short (max 50 chars)** -- Windows has a 260-char path limit. Git worktrees prepend a long base path, so phase directory names like `60-asset-register-depreciation` are fine but `60-asset-register-depreciation-fixed-asset-tracking-with-auto-calculated-monthly-straight-line-depreciation-and-one-click-je-generation` will break worktree creation. Use format: `{number}-{concise-slug}` (e.g., `59-direct-debit-expense-flow`, not the full phase title).
15. **Install `xlsx` from SheetJS CDN, not npm** -- The npm registry version (`xlsx@0.18.5`) is frozen and known-vulnerable (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS). SheetJS publishes patched versions only via their CDN. Correct install: `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Do NOT run `npm audit fix` on this dependency -- it will attempt to downgrade to the vulnerable registry version. Phase 72 established this pattern. When regenerating `package-lock.json` or setting up a fresh worktree, verify `npm ls xlsx` resolves to `0.20.3` (not `0.18.5`).

---

## Documentation Index

| File | Purpose | When to Read |
|------|---------|--------------|
| `docs/SCHEMA.md` | Database schema, data flows | Before DB changes |
| `docs/CODE_STYLE.md` | TypeScript/Convex conventions | During implementation |
| `docs/WORKFLOW.md` | Git workflow, code review | Before any PR |
| `docs/API_REFERENCE.md` | Convex queries/mutations | When modifying backend |
| `docs/CHANGELOG.md` | Version history | After merging (ALWAYS update) |
| `docs/TESTING_GUIDE.md` | Testing setup | When testing features |
| `docs/DEPLOYMENT.md` | Deployment guide | When deploying |
| `docs/ROADMAP.md` | Future plans | When planning features |
| `docs/ONBOARDING.md` | Developer onboarding | For new developers |

---

## Environment Variables

| File | Purpose | Committed? |
|------|---------|-----------|
| `.env.local` | Local dev (dev:exciting-fennec-671) | No (gitignored) |
| `.env.local.production` | Production config reference | Yes |
| `.env` | Default deployment (production) | Yes |
| `.env.example` | Template for new setups | Yes |

---

## Custom Commands

### /handover
Creates session continuity document. **Instructions:** `.agent/skills/handover/SKILL.md`
Use when: context window filling up, completing major phase, switching work areas.

### /techdebt
Scans for code duplication and consolidation opportunities. **Instructions:** `.agent/skills/techdebt/SKILL.md`
Use when: end of session, before PR, planning refactoring.

### /staffreview
Reviews implementation plans from senior engineer perspective. **Instructions:** `.agent/skills/staffreview/SKILL.md`
Use when: before implementing any plan, after writing a plan, inheriting a plan.

### /validate-plan
Validates plan against mandatory requirements (git workflow, waves, docs, success criteria). **Instructions:** `.agent/skills/validate-plan/SKILL.md`
Use when: before starting ANY plan implementation.

---

## Agents (.claude/agents/)

| Agent | Domain |
|-------|--------|
| `cto-orchestrator` | Major implementations, multi-agent coordination |
| `convex-backend` | Schema, queries, mutations |
| `react-ui-builder` | UI components, pages |
| `code-auditor` | Type check, pattern compliance |
| `schema-architect` | Schema design review |
| `refactor-architect` | Code restructuring |
| `agent-builder` | Creating new specialized agents |
| `monolith-restructure` | Folder reorganization |
| `supabase-migrator` | Database migration (legacy) |
| `vercel-fastapi` | Deployment setup (legacy) |

---

## Convex Quick Reference

```typescript
// Frontend: Reading data (reactive, auto-updates)
const recipes = useQuery(api.recipes.list);
const recipe = useQuery(api.recipes.getById, { id: recipeId });
const conditional = useQuery(api.recipes.getById, id ? { id } : "skip");
if (recipes === undefined) return <Loading />;

// Frontend: Writing data
const createRecipe = useMutation(api.recipes.create);
await createRecipe({ name: "Recipe Name", tagIds: [], createdBy: "admin" });

// Backend: Query
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("recipes").collect();
  },
});

// Backend: Mutation with auth
export const create = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    const { token: _, ...data } = args;
    return await ctx.db.insert("recipes", data);
  },
});
```

<!-- GSD:profile-start -->
## Developer Profile

> Generated by GSD from session_analysis. Run `/gsd-profile-user --refresh` to update.

| Dimension | Rating | Confidence |
|-----------|--------|------------|
| Communication | terse-direct | HIGH |
| Decisions | fast-intuitive | HIGH |
| Explanations | code-only | HIGH |
| Debugging | fix-first | MEDIUM |
| UX Philosophy | pragmatic | MEDIUM |
| Vendor Choices | pragmatic-fast | LOW |
| Frustrations | instruction-adherence | MEDIUM |
| Learning | self-directed | MEDIUM |

**Directives:**
- **Communication:** Keep responses action-oriented and concise. Do not ask unnecessary clarifying questions -- interpret terse instructions and execute. When the developer says 'merge it' or 'fix it', proceed immediately without requesting confirmation or providing lengthy preambles.
- **Decisions:** Present recommendations directly rather than lengthy option comparisons. When multiple approaches exist, lead with the recommended one and briefly note alternatives. Do not delay execution waiting for the developer to deliberate -- they decide fast and expect momentum.
- **Explanations:** Provide working results with minimal explanation. Skip conceptual walkthroughs unless explicitly requested. When reporting completed work, give a brief summary of what was done and the outcome -- not a step-by-step narrative of the approach. Prioritize shipping over teaching.
- **Debugging:** When encountering bugs or errors, fix them immediately and report what was fixed. Do not present diagnostic options or ask what the developer wants to investigate -- go fix it. If the root cause is architecturally significant, mention it briefly after the fix is applied, not before.
- **UX Philosophy:** Ensure basic usability and clean layout without being asked. Make loading states visible, error messages clear, and workflows logical. Do not spend time on pixel-perfect polish or animation finesse unless explicitly requested -- focus on functional UX that does not confuse users.
- **Vendor Choices:** When a library or tool choice is needed, recommend the best option directly with a brief rationale. Try this approach -- ask if it matches their preference. Do not present exhaustive comparison tables unless the developer asks for one.
- **Frustrations:** Follow instructions precisely. When the developer says something is critical or must happen, treat it as non-negotiable. Do not omit steps, reorder priorities, or substitute approaches without explicit approval. If deviating from stated instructions for any reason, flag the deviation before proceeding.
- **Learning:** When the developer asks a question, give a direct, targeted answer. Do not expand into tutorial mode or provide background they did not ask for. When they reference past work or solutions, locate and surface the specific information rather than re-explaining from scratch.
<!-- GSD:profile-end -->

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
