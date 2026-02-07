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

**NO direct commits to main. NO exceptions.**

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

**After every merge to main:** Update `docs/CHANGELOG.md` (always required). Also update `docs/SCHEMA.md` if schema changed, `docs/API_REFERENCE.md` if backend changed, `docs/ROADMAP.md` if feature completed.

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
| **Vouchers** | `convex/vouchers/` | `src/pages/VouchersManager.tsx`, `src/hooks/convex/useVouchers.ts` |
| **Auth / Users** | `convex/auth/`, `convex/lib/auth.ts` | `src/pages/Login.tsx`, `src/pages/UsersManager.tsx`, `src/contexts/AuthContext.tsx` |
| **Cost calculation** | `convex/lib/costCalculator.ts` | `src/components/shared/CostTooltip.tsx` |
| **Add new page** | `convex/schema.ts`, `convex/[entity]/queries.ts`, `mutations.ts` | `src/App.tsx` (route), `src/pages/[Page].tsx`, `src/hooks/convex/use[Entity].ts` |
| **Access control** | `convex/lib/auth.ts`, `convex/[entity]/mutations.ts` | `src/components/auth/ProtectedRoute.tsx`, `src/App.tsx` |

---

## Critical File Paths

**Backend (Convex) -- 37 tables in `convex/schema.ts`:**
- `convex/schema.ts` -- Database schema definition
- `convex/lib/costCalculator.ts` -- Cost calculation logic
- `convex/lib/auth.ts` -- `requireRole()` authorization helper
- `convex/orders/whatsapp.ts` -- WhatsApp receipt generation
- `convex/orders/helpers.ts` -- Pure order calculation helpers (no ctx)
- `convex/orders/helpers/` -- Ctx-dependent helpers (ballDistribution, statusTransitions, usageTracking, productionRecords, voucherHandling, batchFetching, statusFetching)
- `convex/orders/mutations/` -- Order mutations (split into orderCrud, inventoryIntegration)

**Frontend (19 pages, 21 hooks):**
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
+-- convex/                           # Backend (37 tables)
|   +-- _generated/                   # Auto-generated types & API
|   +-- lib/
|   |   +-- costCalculator.ts         # Cost calculation logic
|   |   +-- auth.ts                   # requireRole() helper
|   +-- auth/                         # Login, sessions, user management
|   +-- channels/                     # Channel usage tracking
|   +-- componentTypes/               # Unified BOM component types
|   +-- customers/                    # Customer CRUD
|   +-- dashboard/                    # Dashboard aggregation queries
|   +-- feedback/                     # Visual feedback overlay
|   +-- ingredients/                  # Ingredient CRUD
|   +-- inventory/                    # Inventory batches, stock, transactions
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
|   +-- productionUnitTypes/          # Production unit types (Big Ball, Mid Ball)
|   +-- products/                     # Product management
|   +-- recipes/                      # Recipe management
|   +-- shipping/                     # Shipping agency tracking
|   +-- storageLocations/             # Storage location CRUD
|   +-- tags/                         # Tag management
|   +-- vouchers/                     # Voucher codes + usage tracking
|   +-- whatsappTemplates/            # Editable WhatsApp templates
|   +-- schema.ts                     # Database schema (37 tables)
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
|   +-- pages/                        # 19 page components
|   |   +-- Dashboard.tsx
|   |   +-- Login.tsx
|   |   +-- RecipeEditor.tsx
|   |   +-- PackagingEditor.tsx
|   |   +-- PackagingView.tsx
|   |   +-- ProductEditor.tsx
|   |   +-- IngredientsManager.tsx
|   |   +-- MaterialsManager.tsx
|   |   +-- OrderManager.tsx
|   |   +-- OrderDetail.tsx
|   |   +-- KitchenView.tsx
|   |   +-- KitchenViewV2.tsx
|   |   +-- MenuProductsManager.tsx
|   |   +-- UsersManager.tsx
|   |   +-- WhatsAppTemplatesManager.tsx
|   |   +-- VouchersManager.tsx
|   |   +-- InventoryManager.tsx
|   |   +-- LocationsManager.tsx
|   |   +-- ComponentTypesManager.tsx
|   +-- hooks/
|   |   +-- convex/                   # 21 Convex hooks + index.ts
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
10. **Unified BOM**: `componentTypes` table unifies production units (balls) and packaging items (boxes, stickers) into a single Bill of Materials system. Two categories: `production`, `packaging`. Backend validators accept legacy `direct_packaging`/`indirect_packaging` for backwards compatibility.
11. **Inventory FIFO**: Packaging inventory uses FIFO batch tracking. Stock is reserved on order confirmation and consumed on fulfillment.

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
