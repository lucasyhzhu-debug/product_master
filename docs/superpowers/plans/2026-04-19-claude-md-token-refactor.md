# CLAUDE.md Token Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `CLAUDE.md` from 534 lines / 34KB to ~200–230 lines / ~12KB via extraction (reference content → `docs/`) and compression (dedupe git workflow prose, trim pitfall examples) — pure token reduction, no content updates.

**Architecture:** Three steps that read from the current CLAUDE.md, optionally patch `docs/ARCHITECTURE.md` / `docs/API_REFERENCE.md` for coverage gaps, create `docs/FILE_MAP.md`, rewrite CLAUDE.md to the target form, verify via grep + `wc`, then commit atomically to `main`.

**Tech Stack:** Markdown files only. No code changes. Commit follows existing CLAUDE.md doc-only rule (direct to `main`).

**Spec:** `docs/superpowers/specs/2026-04-19-claude-md-token-refactor-design.md`

---

## Preconditions

- Current branch MUST be `main` (doc-only commit per project rules).
- Working tree may have unrelated modifications; the executor touches only:
  - `CLAUDE.md`
  - `docs/FILE_MAP.md` (new)
  - Possibly `docs/ARCHITECTURE.md` and `docs/API_REFERENCE.md`

---

## Task 1: Audit target docs for coverage gaps

**Goal:** Before removing content from CLAUDE.md, confirm destination docs already cover it. Any gap must be patched by Task 3 / Task 4.

**Files read:**
- `docs/ARCHITECTURE.md`
- `docs/API_REFERENCE.md`
- `docs/SECURITY.md`

- [ ] **Step 1: Read each target doc**

```bash
wc -l docs/ARCHITECTURE.md docs/API_REFERENCE.md docs/SECURITY.md
```

Then use `Read` on each file (full contents).

- [ ] **Step 2: Check coverage against the 3 extractions**

| Extracted content (from CLAUDE.md) | Target doc | Check |
|---|---|---|
| "Project Structure" ASCII tree (lines 216–327) | `docs/ARCHITECTURE.md` | Does it describe the `convex/` and `src/` folder hierarchy? |
| "Critical File Paths" (lines 178–196) | `docs/ARCHITECTURE.md` | Does it name `convex/schema.ts`, `convex/lib/costCalculator.ts`, `convex/lib/auth.ts`, `src/App.tsx`, `src/contexts/AuthContext.tsx`? |
| "Convex Quick Reference" code block (lines 468–498) | `docs/API_REFERENCE.md` | Does it show the `useQuery` / `useMutation` frontend pattern AND the `query`/`mutation` backend pattern with auth? |

For each row, record **COVERED** or **GAP**.

- [ ] **Step 3: Record findings**

Produce a short in-memory note (no file needed) like:

```
ARCHITECTURE.md — Project Structure: COVERED / GAP
ARCHITECTURE.md — Critical File Paths: COVERED / GAP
API_REFERENCE.md — Convex Quick Reference: COVERED / GAP
```

**Decision:** Gaps in Task 1 → patch them in Task 3 / Task 4. No gaps → skip those tasks.

- [ ] **Step 4: Do not commit anything** — this task is read-only.

---

## Task 2: Create `docs/FILE_MAP.md`

**Goal:** Verbatim copy of the current CLAUDE.md "Quick File Finder" table into its own doc. The copy is lossless so no information is destroyed; compression comes from removing it from CLAUDE.md in Task 5.

**Files:**
- Create: `docs/FILE_MAP.md`

- [ ] **Step 1: Create `docs/FILE_MAP.md` with this exact content**

```markdown
# File Map — Where to Touch What

Quick lookup for which backend (`convex/`) and frontend (`src/`) files to modify per feature area. Extracted from `CLAUDE.md` to keep the always-loaded context lean.

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

## Full Role → Route Permission Table

All routes use `<ProtectedRoute>` with permission-based or role-based access. Auth is PIN login with session tokens.

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

**Backend enforcement:** `requireRole(ctx, args.token, ["admin"])` from `convex/lib/auth.ts`. Add `token: v.string()` to protected mutation args.
```

- [ ] **Step 2: Verify file exists and line count is reasonable**

```bash
wc -l docs/FILE_MAP.md
```

Expected: between 55 and 75 lines.

- [ ] **Step 3: Verify a known entry round-trips**

```bash
grep -F "Bank reconciliation" docs/FILE_MAP.md
```

Expected: at least one match.

- [ ] **Step 4: Do not commit yet** — batched into Task 7.

---

## Task 3: Patch `docs/ARCHITECTURE.md` if Task 1 found gaps

**Condition:** Skip this task if Task 1 recorded "COVERED" for both the Project Structure tree and Critical File Paths.

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: If Project Structure GAP → append the structure tree**

Append at the end of `docs/ARCHITECTURE.md` (preserve existing trailing newline rules):

```markdown

---

## Project Structure

```
product_master/
+-- convex/                           # Backend (65 tables)
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
|   |   +-- whatsapp.ts               # WhatsApp message templates
|   |   +-- helpers.ts                # Pure functions (no ctx)
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
|   +-- schema.ts                     # Database schema
+-- src/                              # Frontend
|   +-- components/
|   |   +-- ui/                       # shadcn/ui primitives
|   |   +-- layout/                   # Header, Layout, PageHeader
|   |   +-- auth/                     # ProtectedRoute, LoginForm
|   |   +-- shared/                   # CostTooltip, ConfirmDialog, FormBuilder, etc.
|   |   +-- (feature folders)
|   +-- pages/                        # Page components
|   +-- hooks/
|   |   +-- convex/                   # Convex query/mutation hooks + index.ts
|   +-- contexts/
|   |   +-- AuthContext.tsx           # Auth state (useAuth)
|   +-- lib/
|   |   +-- types.ts                  # TypeScript interfaces
|   |   +-- utils.ts                  # cn, formatCurrency
|   +-- App.tsx                       # Router setup
|   +-- main.tsx                      # Entry with ConvexProvider
|   +-- index.css                     # Tailwind CSS + theme
+-- docs/                             # Documentation
+-- .claude/agents/                   # Specialized agents
+-- .agent/skills/                    # Custom skills
```
```

Note: If `docs/ARCHITECTURE.md` already has a Project Structure section but it's outdated/partial, use Edit to update it rather than appending. Do NOT create a duplicate section.

- [ ] **Step 2: If Critical File Paths GAP → append the critical paths block**

Append after the Project Structure block (or in a reasonable existing section):

```markdown

---

## Critical File Paths

**Backend (Convex) — 65 tables in `convex/schema.ts`:**
- `convex/schema.ts` — Database schema definition
- `convex/lib/costCalculator.ts` — Cost calculation logic
- `convex/lib/auth.ts` — `requireRole()` authorization helper
- `convex/orders/whatsapp.ts` — WhatsApp receipt generation
- `convex/orders/helpers.ts` — Pure order calculation helpers (no ctx)
- `convex/orders/helpers/` — Ctx-dependent helpers (ballDistribution, statusTransitions, usageTracking, productionRecords, voucherHandling, batchFetching, statusFetching)
- `convex/orders/mutations/` — Order mutations (split into orderCrud, inventoryIntegration)

**Frontend:**
- `src/App.tsx` — Router setup (all routes use ProtectedRoute)
- `src/main.tsx` — Entry point with ConvexProvider
- `src/contexts/AuthContext.tsx` — Auth state management
- `src/hooks/convex/` — Convex query/mutation hooks
- `src/lib/types.ts` — TypeScript interfaces
- `src/lib/utils.ts` — Utilities (cn, formatCurrency)
- `src/components/auth/ProtectedRoute.tsx` — Route permission guards
```

**Note on "65 tables":** The original CLAUDE.md says "59 tables" in the Critical File Paths comment. Per the user's memory, the current count is 65 (not 59 — Phase 35 audit is authoritative). Task 5 also updates the CLAUDE.md copy to say 65 where relevant (though the spec is "no accuracy fixes", this specific number appears in a header comment we're moving; updating it while relocating costs zero extra effort). **If in doubt, preserve the "59 tables" verbatim and flag it.**

Actually per spec "No content accuracy fixes" — preserve `59 tables` verbatim in the extracted copy. Use `59 tables` instead of `65 tables` in the blocks above.

- [ ] **Step 3: Verify the patched file parses as markdown and file still exists**

```bash
wc -l docs/ARCHITECTURE.md
```

Record the new line count.

- [ ] **Step 4: Do not commit yet** — batched into Task 7.

---

## Task 4: Patch `docs/API_REFERENCE.md` if Task 1 found a gap

**Condition:** Skip if Task 1 recorded "COVERED" for Convex Quick Reference.

**Files:**
- Modify: `docs/API_REFERENCE.md`

- [ ] **Step 1: Append a "Convex Quick Reference" section** (or merge into an existing "Patterns" section if one exists)

Append at the end of the file:

````markdown

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
````

- [ ] **Step 2: Verify**

```bash
grep -c "useMutation(api\." docs/API_REFERENCE.md
```

Expected: ≥ 1 (confirms the code block was added).

- [ ] **Step 3: Do not commit yet** — batched into Task 7.

---

## Task 5: Rewrite `CLAUDE.md`

**Goal:** Replace the current 534-line CLAUDE.md with the compressed target form below. Preserve all 15 pitfalls (light compression only — mechanical drop of restating examples, keep the rule + why), all 13 business rules, all git-workflow rules, and the auto-generated Developer Profile block (between `<!-- GSD:profile-start -->` and `<!-- GSD:profile-end -->`) and Graphify block at the bottom byte-for-byte.

**Files:**
- Modify: `CLAUDE.md` (full rewrite)

- [ ] **Step 1: Capture the preserved blocks from the current file**

Run:

```bash
grep -n "GSD:profile-start\|GSD:profile-end\|^## graphify" CLAUDE.md
```

Use `Read` to load the lines from `<!-- GSD:profile-start -->` through the end of the file. Copy this to memory — it will be appended verbatim at the end of the new file.

- [ ] **Step 2: Write the new `CLAUDE.md` with the following content**

Replace the entire file with this exact content, **except** the two blocks at the bottom (Developer Profile and Graphify) which are pasted from Step 1:

```markdown
# CLAUDE.md

## Project Overview

**Frollie Recipe Master** — Real-time recipe and product concept management for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, product concepts, orders, kitchen production, and inventory with full versioning, cost calculations, and margin analysis.

**Architecture:** Convex (serverless backend + real-time database) + React 19 + TypeScript + Vite

---

## Commands

```bash
# Development (two terminals)
npx convex dev               # Terminal 1: Convex backend (dev env)
npm run dev                  # Terminal 2: Vite frontend (localhost)

# Build & Verify
npm run build                # tsc + vite build (MUST pass before merge)
npm run type-check           # TypeScript only
npm run lint                 # ESLint
npm run test                 # Vitest (unit tests)
npm run test:watch           # Vitest watch mode
npm run test:coverage        # Vitest with coverage

# Deployment
npm run deploy:check         # Pre-deploy validation (dry run)
npm run deploy:safe          # Validated deploy to production

# Convex
npx convex deploy            # Deploy to production
npx convex export            # Backup database
npx convex dashboard         # Open dashboard in browser

# Seeding (run from Convex dashboard Functions tab)
# tags:seedDefaults, menuProducts:seedDefaults
```

**Environments:**
- **Production:** `prod:decisive-wombat-7` (Vercel + GitHub Actions CI)
- **Development:** `dev:exciting-fennec-671` (local `npx convex dev`)
- **CI/CD:** Push to `main` → Convex deploy → Vercel rebuild

---

## Git Workflow

**NO direct commits to main for CODE. Doc-only commits to main are allowed.**

### Doc-only paths (direct-to-main OK)
Commits that ONLY touch these paths may go straight to main:
- `.planning/**` — roadmaps, phase directories, specs, plans, discussion logs, UAT checklists
- `docs/**` — CHANGELOG, SCHEMA, API_REFERENCE, ROADMAP, design docs, review notes, superpowers specs & plans
- Root-level `*.md` — README, CLAUDE.md, etc.
- `.claude/**` — agent definitions, commands, skills, settings

**Rule of thumb:** if `npm run build` or `npm run test` would be unaffected, it's doc-only.

Mixed commits (code + docs) still require a feature branch.

### Code changes — always on a feature branch
```bash
git switch main && git pull
git switch -c feature/{name}   # or fix/{name}
# edit, test...
git add <specific-files>
git commit -m "feat: description"
npm run build                  # MUST pass before merge
git push origin feature/{name}
```

### Workflows that always produce doc-only output
GSD planning (`/gsd-plan-phase`, `/gsd-add-phase`, `/gsd-new-milestone`, `/gsd-map-codebase`), GSD discussion (`/gsd-discuss-phase`, `/gsd-note`), Superpowers brainstorming/plan-writing, code review artifacts (`/gsd-code-review`, `/staffreview`, `/triple-review`), docs updates, verification artifacts (`/gsd-verify-work`, `/gsd-validate-phase`). These commit direct to main with no feature branch.

### Branch-per-phase rule
Every GSD phase runs on its own feature branch (`feature/{slug}`). Before starting phase code work, `git branch --show-current` MUST NOT be `main`. After a phase is verified, merge to main before starting the next. Planning artifacts can land on main independently.

### After every merge to main
Update `docs/CHANGELOG.md` (ALWAYS). Also `docs/SCHEMA.md` if schema changed, `docs/API_REFERENCE.md` if backend changed, `docs/ROADMAP.md` if feature completed.

---

## Planning Requirements

Every implementation plan MUST include these 4 sections. Copy this template:

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

**Validation gate:** Before implementing, confirm all 4 sections exist. If any is missing, add it first.

---

## File Map

See `docs/FILE_MAP.md` for the per-feature table of which backend/frontend files to touch. Updated whenever a new feature area lands.

---

## Access Control

All routes use `<ProtectedRoute>` with permission- or role-based access. Auth is PIN login with session tokens.

**Roles:** `kitchen`, `order_staff`, `manager`, `admin`

**Backend enforcement:** `requireRole(ctx, args.token, ["admin"])` from `convex/lib/auth.ts`. Add `token: v.string()` to protected mutation args.

Full per-route permission table: `docs/FILE_MAP.md` (Full Role → Route Permission Table section).

---

## Key Business Rules

1. **Unit conversion:** kg→g, l→ml, m→cm. 1 ml = 1 g for liquid calculations.
2. **Version immutability:** Saved versions cannot be edited — create new version.
3. **Linked components:** Recipes can reference other recipe versions as components.
4. **Product pinning:** Products stay on selected recipe/packaging versions. Manual update required.
5. **Reusable components:** Only single-component recipes marked as reusable appear in component selection.
6. **Deletion rules:** Recipes/packaging cannot be deleted if used in products. Error shows blocking products.
7. **Order numbers:** Format `MMDD-NNN` (e.g., `0129-001`) for bank transfer reference.
8. **Kitchen production:** Balls accumulate in trays and auto-allocate to pending orders. Source of truth: `orderItemProduction.unitsRemaining`. UI display: `orderItems.ballsFilled/packageStatus`.
9. **Order status workflow:** Draft → AwaitingPayment → Confirmed → InProduction → Boxed → Labeled → WaitingShipment/WaitingPickup → CompleteShipped/PickedUp. Any non-terminal → Cancelled.
10. **Unified BOM (source of truth for product composition):** `componentTypes` table unifies production units (balls) and packaging items (boxes, stickers). Categories: `production`, `packaging`. **All ball type/count information MUST come from BOM** (`menuProductComponents` + `componentTypes`), NOT from deprecated `menuProducts.productionType`/`productionUnits` or `orderItems.productionType`/`productionUnits`. BOM codes: `BIG_BALL` = 80g/Jumbo, `MID_BALL` = 45g/Original.
11. **Inventory FIFO:** Packaging inventory uses FIFO batch tracking. Stock reserved on order confirmation, consumed on fulfillment.
12. **Production counts source of truth:** All production count data (boxed, stickered, packed, shippedToGoldfinch) derives from `productionLog` aggregation. `productionCounts` is archived (read-only). Resets tracked via `productionResets` timestamps.
13. **"Units sold" = balls, not products:** Any metric labelled "units sold" or "production volume" MUST count BOM-resolved balls (Big + Mid), not product-level order qty. A hamper with 3 balls counts as 3. Lifetime hero card estimates balls via `avgRevenuePerBall` (dynamic, from BOM-linked items — see `getLifetimeTotalsInternal` in `convex/externalData/queries.ts`).

---

## Common Pitfalls

1. **Convex IDs are typed strings** — `Id<"tableName">`, not numbers.
2. **Convex returns undefined while loading** — always check `if (items === undefined) return <Loading />;`.
3. **camelCase in Convex** — field names are `procurementSource`, not `procurement_source`.
4. **Real-time updates** — Convex queries auto-update. No cache invalidation needed after mutations.
5. **Null yield in cost calc** — check `estimatedYieldGrams` before dividing. Return `null` if not set.
6. **Version copy depth** — deep copy components AND ingredients. Shallow copy creates shared references.
7. **Mutations are async** — always `await`.
8. **No dynamic imports in Convex** — static only. Dynamic `import()` works locally but fails silently in production (204 No Content).
9. **React hooks order** — all hooks before any conditional returns. No hooks after early returns.
10. **Auth token in mutations** — protected mutations require `token: v.string()`. Strip before db operations.
11. **NEVER use `productionType`/`productionUnits`** — deprecated on `menuProducts` and `orderItems` (e.g., `productionType="original"` maps to BIG_BALL/80g — misleading). Always derive balls from BOM: `menuProductComponents` + `componentTypes` (filter `category="production"`, read `code` for `BIG_BALL`/`MID_BALL`).
12. **Branch from main before starting a new phase** — ALWAYS `git switch main && git pull` first. Never branch from another phase's feature branch. If the previous phase isn't merged, merge it or wait. Branching from another feature branch creates messy history.
13. **Count balls, not product units** — "units sold" and production volume MUST resolve BOM to count actual Big + Mid balls. A hamper with 3 balls = 3. Use `menuProductComponents` + `componentTypes` (category=`production`). Lifetime hero card uses dynamic `avgRevenuePerBall` (weighted from BOM-linked revenue items); falls back to 35K IDR/ball when no BOM-linked items exist.
14. **Keep phase directory names short (max 50 chars)** — Windows 260-char path limit + git worktree prefix causes truncation. Use `{number}-{concise-slug}` (e.g., `59-direct-debit-expense-flow`), not the full phase title.
15. **Install `xlsx` from SheetJS CDN, not npm** — npm registry `xlsx@0.18.5` is frozen + known-vulnerable (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS). Install: `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Do NOT run `npm audit fix` on xlsx — it tries to downgrade. After regenerating `package-lock.json`, verify `npm ls xlsx` resolves to `0.20.3`.

---

## Documentation Index

| File | Purpose | When to Read |
|------|---------|--------------|
| `docs/FILE_MAP.md` | Per-feature file map + full permission table | Before any implementation |
| `docs/ARCHITECTURE.md` | Project structure, critical file paths | For overall layout |
| `docs/SCHEMA.md` | Database schema, data flows | Before DB changes |
| `docs/API_REFERENCE.md` | Convex queries/mutations + patterns | When modifying backend |
| `docs/CODE_STYLE.md` | TypeScript/Convex conventions | During implementation |
| `docs/WORKFLOW.md` | Git workflow, code review | Before any PR |
| `docs/CHANGELOG.md` | Version history | After merging (ALWAYS update) |
| `docs/TESTING_GUIDE.md` | Testing setup | When testing features |
| `docs/DEPLOYMENT.md` | Deployment guide | When deploying |
| `docs/ROADMAP.md` | Future plans | When planning features |
| `docs/ONBOARDING.md` | Developer onboarding | For new developers |
| `docs/SECURITY.md` | Auth, roles, permissions | For access-control changes |

---

## Environment Variables

| File | Purpose | Committed? |
|------|---------|-----------|
| `.env.local` | Local dev (`dev:exciting-fennec-671`) | No (gitignored) |
| `.env.local.production` | Production config reference | Yes |
| `.env` | Default deployment (production) | Yes |
| `.env.example` | Template for new setups | Yes |

---

```

Then **append verbatim** the preserved blocks captured in Step 1 (Developer Profile with its HTML comment boundaries, plus the `## graphify` section). The appended content begins with `<!-- GSD:profile-start -->` and ends at end-of-file.

- [ ] **Step 3: Verify file size and structure**

```bash
wc -l CLAUDE.md
```

Expected: between 180 and 230 lines.

```bash
wc -c CLAUDE.md
```

Expected: between 11,000 and 14,500 bytes.

- [ ] **Step 4: Verify preserved blocks are intact**

```bash
grep -c "GSD:profile-start" CLAUDE.md
grep -c "GSD:profile-end" CLAUDE.md
grep -c "^## graphify" CLAUDE.md
```

Expected: `1`, `1`, `1`.

- [ ] **Step 5: Do not commit yet** — batched into Task 7.

---

## Task 6: Verification

**Goal:** Prove nothing load-bearing was lost.

- [ ] **Step 1: All 15 pitfalls present**

Count numbered entries in the Pitfalls section:

```bash
awk '/^## Common Pitfalls/,/^---$/' CLAUDE.md | grep -cE "^[0-9]+\."
```

Expected: `15`. If the count differs, extract the section and diff against the source of truth:

```bash
awk '/^## Common Pitfalls/,/^---$/' CLAUDE.md
```

Then compare against the 15 pitfalls specified in Task 5 Step 2 and find the missing number.

- [ ] **Step 2: All 13 business rules present**

```bash
awk '/^## Key Business Rules/,/^---$/' CLAUDE.md | grep -cE "^[0-9]+\."
```

Expected: `13`.

- [ ] **Step 3: Key git-workflow rules present**

```bash
grep -c "Branch-per-phase" CLAUDE.md       # Expected: ≥ 1
grep -c "Doc-only paths" CLAUDE.md         # Expected: ≥ 1
grep -c "npm run build" CLAUDE.md          # Expected: ≥ 2 (commands + workflow)
grep -c "doc-only" CLAUDE.md               # Expected: ≥ 2
```

- [ ] **Step 4: All Documentation Index pointers resolve**

```bash
for f in FILE_MAP.md ARCHITECTURE.md SCHEMA.md API_REFERENCE.md CODE_STYLE.md WORKFLOW.md CHANGELOG.md TESTING_GUIDE.md DEPLOYMENT.md ROADMAP.md ONBOARDING.md SECURITY.md; do
  test -f "docs/$f" && echo "$f: OK" || echo "$f: MISSING"
done
```

Expected: all OK. If any say MISSING, that pointer must be removed from CLAUDE.md's Documentation Index OR the file must be created (flag to user).

- [ ] **Step 5: `docs/FILE_MAP.md` exists and has the expected content**

```bash
test -f docs/FILE_MAP.md && echo "FILE_MAP.md exists"
grep -c "Bank reconciliation" docs/FILE_MAP.md    # Expected: ≥ 1
grep -c "canAccessDashboard" docs/FILE_MAP.md     # Expected: ≥ 1 (permission table)
```

- [ ] **Step 6: Size targets hit**

```bash
echo "CLAUDE.md: $(wc -l < CLAUDE.md) lines, $(wc -c < CLAUDE.md) bytes"
```

Expected: 180–230 lines, 11,000–14,500 bytes.

Compare to baseline (534 lines, 34,175 bytes).

- [ ] **Step 7: Spot-check extracted content wasn't lost**

```bash
grep -c "Quick File Finder" docs/FILE_MAP.md || true  # content moved, exact header may or may not match
grep -c "Bank reconciliation" docs/FILE_MAP.md        # canary entry: Expected ≥ 1
grep -c "useQuery" docs/API_REFERENCE.md              # Expected ≥ 1 (either pre-existing or Task 4 added)
```

- [ ] **Step 8: Build unaffected (sanity)**

Skip `npm run build` for speed — this is a pure doc commit and `build` doesn't touch CLAUDE.md or docs/. Just confirm no staged code files:

```bash
git status --short CLAUDE.md docs/FILE_MAP.md docs/ARCHITECTURE.md docs/API_REFERENCE.md
```

Expected: only markdown files staged (or unstaged). No `.ts`/`.tsx`/`.js`.

- [ ] **Step 9: If any verification fails, STOP and report**

Do not commit. Re-do Task 5 (or the relevant patch task) until verification passes.

---

## Task 7: Commit

**Goal:** Single atomic commit on `main`. All modified files in one commit (per spec).

- [ ] **Step 1: Confirm on main**

```bash
git branch --show-current
```

Expected: `main`. If not, **stop and ask the user** before switching — the working tree may have unrelated in-progress changes.

- [ ] **Step 2: Stage only the refactor files**

```bash
git add CLAUDE.md docs/FILE_MAP.md
# If Task 3 ran:
git add docs/ARCHITECTURE.md
# If Task 4 ran:
git add docs/API_REFERENCE.md
```

Do NOT use `git add -A` or `git add .` — there may be unrelated modified files in the working tree.

- [ ] **Step 3: Inspect the staged diff**

```bash
git diff --cached --stat
```

Expected: 2–4 files modified. Only markdown.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: refactor CLAUDE.md to reduce always-loaded context

Extract reference content (Quick File Finder, Access Control table,
Project Structure tree, Critical File Paths, Convex Quick Reference)
into docs/FILE_MAP.md and existing docs. Compress Git Workflow
duplication into one canonical table. Light mechanical compression
of Common Pitfalls — rule + why preserved, restating examples
dropped. Developer Profile and Graphify sections preserved verbatim.

Target size: 534 lines → ~210 lines (~60% reduction).

Spec: docs/superpowers/specs/2026-04-19-claude-md-token-refactor-design.md

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Verify commit landed**

```bash
git log -1 --stat
```

Expected: one commit with the refactor files, author intact.

- [ ] **Step 6: Report final stats to user**

Message:

```
CLAUDE.md refactor committed on main.

Before:  534 lines / 34,175 bytes
After:   <N>  lines / <M>     bytes
Reduction: <pct>%

Files touched:
  - CLAUDE.md (rewritten)
  - docs/FILE_MAP.md (new, <K> lines)
  - docs/ARCHITECTURE.md (patched — only if Task 3 ran)
  - docs/API_REFERENCE.md (patched — only if Task 4 ran)

Verification: all 15 pitfalls, 13 business rules, and git-workflow rules present.
Documentation Index pointers resolved.
Single commit ready on main.
```

- [ ] **Step 7: Do NOT push** — leave the user to push (they may want to review the commit or batch with other work first).

---

## Rollback

If anything goes wrong after committing:

```bash
git reset --hard HEAD~1
```

This wipes the single refactor commit. `docs/FILE_MAP.md` becomes an untracked file (harmless — delete with `rm` if desired). `docs/ARCHITECTURE.md` / `docs/API_REFERENCE.md` revert to pre-commit state.

**Do NOT force-push.** Nothing has been pushed at commit time.

---

## Success Criteria

- [ ] `CLAUDE.md` between 180 and 230 lines
- [ ] `CLAUDE.md` between 11,000 and 14,500 bytes
- [ ] All 15 numbered pitfalls present in `CLAUDE.md`
- [ ] All 13 numbered business rules present in `CLAUDE.md`
- [ ] Branch-per-phase rule + doc-only carve-out rule + `npm run build` gate all mentioned in `CLAUDE.md`
- [ ] `<!-- GSD:profile-start -->` and `<!-- GSD:profile-end -->` markers present in `CLAUDE.md` with content intact
- [ ] `## graphify` section present in `CLAUDE.md` with content intact
- [ ] `docs/FILE_MAP.md` exists and contains the Quick File Finder table + full permission table
- [ ] Every file path in `CLAUDE.md`'s Documentation Index resolves to an existing file
- [ ] Exactly one commit on `main` touching only markdown files
- [ ] No push performed (user controls pushing)
