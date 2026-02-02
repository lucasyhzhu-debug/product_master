# CLAUDE.md

## Project Overview

**Frollie Recipe Master** — A real-time recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, and product concepts with full versioning, cost calculations, and margin analysis.

**Architecture:** Convex (serverless backend + real-time database) + React 19 frontend

---

## Documentation Index

| File | Purpose | When to Read |
|------|---------|--------------|
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Developer onboarding guide | For new developers |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Convex database schema, data flows | Before DB changes |
| [docs/CODE_STYLE.md](docs/CODE_STYLE.md) | TypeScript/Convex coding conventions | During implementation |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Git workflow, code review process | Before any PR |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Convex queries and mutations reference | When modifying backend |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Convex deployment guide | When deploying |
| [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) | Testing environment setup | When testing features |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Version history | After merging |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Future plans, backlog | When planning features |

---

## Quick File Finder

**Backend:** `convex/` | **Frontend:** `src/`

| Task | Backend Files | Frontend Files |
|------|---------------|----------------|
| **Add field to Recipe** | `convex/schema.ts`<br>`convex/recipes/mutations.ts`<br>`convex/recipes/queries.ts` | `src/hooks/convex/useRecipes.ts`<br>`src/pages/RecipeEditor.tsx` |
| **Modify cost calculation** | `convex/lib/costCalculator.ts` | `src/components/shared/CostTooltip.tsx` |
| **Update Recipe UI** | - | `src/pages/RecipeEditor.tsx`<br>`src/components/recipes/RecipeCard.tsx` |
| **Add Packaging field** | `convex/schema.ts`<br>`convex/packaging/mutations.ts`<br>`convex/packaging/queries.ts` | `src/hooks/convex/usePackaging.ts`<br>`src/pages/PackagingEditor.tsx` |
| **Update Product COGS** | `convex/lib/costCalculator.ts`<br>`convex/products/queries.ts` | `src/pages/ProductEditor.tsx` |
| **Add new Tag category** | `convex/tags/mutations.ts` (seedDefaults) | - |
| **Create shared component** | - | `src/components/shared/` |
| **Add validation logic** | `convex/[entity]/mutations.ts` | Form components in `src/pages/` |
| **Database schema change** | `convex/schema.ts` | - |
| **Add dashboard stat** | `convex/dashboard/queries.ts` | `src/pages/Dashboard.tsx` |
| **Add Order field** | `convex/schema.ts`<br>`convex/orders/mutations.ts` | `src/hooks/convex/useOrders.ts`<br>`src/pages/OrderDetail.tsx` |
| **Update WhatsApp template** | `convex/orders/whatsapp.ts` | - |
| **Update Order UI** | - | `src/pages/OrderManager.tsx`<br>`src/pages/OrderDetail.tsx`<br>`src/components/orders/` |
| **Kitchen View (production)** | `convex/orders/queries.ts`<br>`convex/orders/mutations.ts` | `src/pages/KitchenView.tsx`<br>`src/components/orders/InventoryTray.tsx`<br>`src/components/orders/OrderBox.tsx`<br>`src/components/orders/ProductPackage.tsx`<br>`src/components/orders/FlyingBall.tsx` |
| **Ball distribution logic** | `convex/orders/helpers/ballDistribution.ts` | - |
| **Order status transitions** | `convex/orders/helpers/statusTransitions.ts` | - |
| **Channel/agency usage** | `convex/orders/helpers/usageTracking.ts` | - |
| **Production records CRUD** | `convex/orders/helpers/productionRecords.ts` | - |

---

## Critical File Paths

**Backend (Convex):**
- `convex/schema.ts` — Database schema definition (19 tables)
- `convex/lib/costCalculator.ts` — Cost calculation logic
- `convex/orders/whatsapp.ts` — WhatsApp receipt generation
- `convex/orders/helpers.ts` — Pure order calculation helpers (no ctx)
- `convex/orders/helpers/` — Ctx-dependent order helpers (see CODE_STYLE.md for architecture)
- `convex/[entity]/queries.ts` — Read operations (real-time reactive)
- `convex/[entity]/mutations.ts` — Write operations (transactional)

**Frontend Core:**
- `src/App.tsx` — Router setup (9 routes)
- `src/main.tsx` — React entry point with ConvexProvider
- `src/hooks/convex/` — Convex query/mutation hooks (11 files)
- `src/lib/types.ts` — TypeScript interfaces

---

## Tech Stack

| Layer | Technology | Version | Notes |
|-------|------------|---------|-------|
| **Backend** | Convex | ^1.31.7 | Real-time serverless database |
| **Database** | Convex DB | - | Integrated, auto-scaling |
| **Frontend** | React + TypeScript | 19.2.0 | UI framework |
| **Build Tool** | Vite | 7.2.4 | Fast bundler with HMR |
| **Styling** | Tailwind CSS | 4.1.18 | Utility-first CSS |
| **UI Components** | shadcn/ui (Radix) | latest | Accessible components |
| **Routing** | React Router | 7.13.0 | Client-side routing |
| **Icons** | Lucide React | 0.563.0 | Icon library |
| **Notifications** | Sonner | 2.0.7 | Toast notifications |
| **Animations** | Framer Motion | 11.15.0 | Animation library |

---

## Commands

```bash
# Development (run in separate terminals)
npm install                  # Install dependencies
npx convex dev               # Start Convex dev server (Terminal 1)
npm run dev                  # Start Vite dev server (Terminal 2)

# Production Build
npm run build               # Build frontend to dist/

# Linting & Type Check
npm run lint                # ESLint
npm run type-check          # TypeScript type checking

# Convex Commands
npx convex dev              # Start local Convex dev server
npx convex deploy           # Deploy to production
npx convex dashboard        # Open Convex dashboard in browser

# Database Management
npx convex export           # Backup database
npx convex import           # Restore database
# In dashboard → Run: orders/deleteAll:deleteAllOrders  # Clean test data

# Database Seeding (run from Convex dashboard Functions tab)
# tags:seedDefaults          - Creates default tags
# menuProducts:seedDefaults  - Creates default menu products
```

**Database Setup:**
Single dev deployment (`dev:exciting-fennec-671`) for all development.
See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for database management.
```bash
npx convex dev              # Start backend
npm run dev                 # Start frontend
```

---

## Project Structure

```
product_master/
├── convex/                          # Backend (Convex)
│   ├── _generated/                  # Auto-generated Convex types & API
│   ├── lib/
│   │   └── costCalculator.ts        # Cost calculation logic
│   ├── customers/                   # Customer queries/mutations
│   ├── dashboard/                   # Dashboard aggregation queries
│   ├── ingredients/                 # Ingredient CRUD
│   ├── materials/                   # Packaging materials CRUD
│   ├── menuProducts/                # Menu product definitions
│   ├── orders/                      # Order management + WhatsApp
│   │   ├── queries.ts
│   │   ├── mutations.ts
│   │   └── whatsapp.ts              # WhatsApp message templates
│   ├── packaging/                   # Packaging recipes
│   ├── products/                    # Product management
│   ├── recipes/                     # Recipe management
│   ├── tags/                        # Tag management
│   └── schema.ts                    # Database schema (19 tables)
├── src/                             # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── ui/                      # shadcn/ui components
│   │   ├── layout/                  # Header, Layout, PageHeader
│   │   ├── shared/                  # Carousel, ConfirmDialog, CostTooltip, etc.
│   │   ├── ingredients/
│   │   ├── materials/
│   │   ├── recipes/
│   │   ├── packaging/
│   │   ├── products/
│   │   ├── orders/                  # Order components (17 files)
│   │   ├── dashboard/
│   │   └── onboarding/              # Onboarding tour
│   ├── pages/                       # Page components (9 files)
│   │   ├── Dashboard.tsx
│   │   ├── RecipeEditor.tsx
│   │   ├── PackagingEditor.tsx
│   │   ├── ProductEditor.tsx
│   │   ├── IngredientsManager.tsx
│   │   ├── MaterialsManager.tsx
│   │   ├── OrderManager.tsx
│   │   ├── OrderDetail.tsx
│   │   └── KitchenView.tsx
│   ├── hooks/
│   │   ├── convex/                  # Convex hooks (11 files)
│   │   │   ├── useRecipes.ts
│   │   │   ├── usePackaging.ts
│   │   │   ├── useProducts.ts
│   │   │   ├── useOrders.ts
│   │   │   ├── useCustomers.ts
│   │   │   ├── useIngredients.ts
│   │   │   ├── useMaterials.ts
│   │   │   ├── useTags.ts
│   │   │   ├── useMenuProducts.ts
│   │   │   └── useDashboard.ts
│   │   └── useOnboardingTour.ts
│   ├── lib/
│   │   ├── types.ts                 # TypeScript interfaces
│   │   └── utils.ts                 # Utility functions (cn, formatCurrency)
│   ├── App.tsx                      # Router setup
│   ├── main.tsx                     # Entry point with ConvexProvider
│   └── index.css                    # Tailwind CSS + custom theme
├── docs/                            # Documentation
├── public/
├── dist/                            # Build output
├── convex.json                      # Convex configuration
├── vite.config.ts                   # Vite bundler config
├── package.json
├── tsconfig.json
└── CLAUDE.md                        # This file
```

---

## Key Business Rules

1. **Unit conversion**: kg→g, l→ml, m→cm. 1 ml = 1 g for liquid calculations.
2. **Version immutability**: Saved versions cannot be edited. Create new version instead.
3. **Linked components**: Recipes can reference other recipe versions as components.
4. **Product pinning**: Products stay on selected recipe/packaging versions. Manual update required.
5. **Reusable components**: Only single-component recipes marked as reusable appear in component selection.
6. **Deletion rules**: Recipes/packaging cannot be deleted if used in products. Error shows blocking products.
7. **Default tags**: System seeds Dubai-Snack, Extruded-Snack, Sachet, Pouch, Box via `tags:seedDefaults`.
8. **Order numbers**: Format `MMDD-NNN` (e.g., 0129-001) for bank transfer reference.
9. **Kitchen tray system**: Balls accumulate in trays and auto-allocate to pending orders. Production tracking uses orderItemProduction.unitsRemaining and orderItems.ballsFilled/packageStatus systems.
10. **Ball colors**: Pistachio green (#93C572) fill, chocolate brown (#7B3F00) stroke. Consistent across InventoryTray, ProductPackage, and FlyingBall.

---

## Common Pitfalls

1. **Convex IDs are strings** — All IDs from Convex are `Id<"tableName">` types (strings), not numbers.

2. **Convex returns undefined while loading** — Check for `undefined` before rendering:
   ```typescript
   const items = useQuery(api.recipes.list);
   if (items === undefined) return <Loading />;
   ```

3. **camelCase in Convex** — Convex uses camelCase field names (`procurementSource`), not snake_case.

4. **Real-time updates** — Convex queries auto-update. No need to invalidate cache after mutations.

5. **Cost calculation with null yield** — Always check `estimatedYieldGrams` before dividing. Return `null` if not set.

6. **Version copy depth** — When copying, deep copy components AND ingredients. Shallow copy creates shared references.

7. **Tag format** — Tags are stored as `tagIds: Id<"tags">[]` array directly on entities (no junction tables).

8. **Mutations are async** — Always `await` mutation calls:
   ```typescript
   const createRecipe = useMutation(api.recipes.create);
   await createRecipe({ name: "New Recipe", ... });
   ```

---

## Environment Variables

**Single Development Environment:** Convex free tier provides one dev deployment.

| File | Purpose | Committed? |
|------|---------|-----------|
| `.env.local` | Active environment | ❌ No (gitignored) |
| `.env.local.production` | Same as testing (for future use) | ✅ Yes (safe) |
| `.env.local.testing` | Same as production (for future use) | ✅ Yes (safe) |
| `.env.example` | Template for new setups | ✅ Yes |

**Current setup:**
```bash
# .env.local
CONVEX_DEPLOYMENT=dev:exciting-fennec-671
VITE_CONVEX_URL=https://exciting-fennec-671.convex.cloud
VITE_CONVEX_SITE_URL=https://exciting-fennec-671.convex.site
```

**For separate testing environment:** Create a second Convex project or upgrade to Convex Pro.
See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for details.

---

## Git Workflow (Summary)

> **Full details:** See [docs/WORKFLOW.md](docs/WORKFLOW.md)

**Mandatory workflow for ALL code changes:**

```
1. Create new branch from main
2. Make changes & commit
3. Audit & code review
4. Update documentation (see below)
5. Merge back to main
6. Update docs/CHANGELOG.md (REQUIRED)
```

**NO EXCEPTIONS.** Do not commit directly to main.

```bash
# Quick reference
git switch main && git pull
git switch -c feature/your-name
# ... make changes ...
git add <files>
git commit -m "feat: description"
npm run build  # verify before push
git push origin feature/your-name
# After review: merge to main
```

---

## 🚨 Documentation Requirements (MANDATORY)

### Quick Decision Tree

**Before merging, ask yourself:**

```
Did you change code?
├─ YES → Update CHANGELOG.md (ALWAYS REQUIRED)
│   │
│   ├─ Database schema changed?
│   │   └─ YES → Update SCHEMA.md
│   │
│   ├─ Feature completed?
│   │   └─ YES → Update ROADMAP.md
│   │
│   └─ Backend functions changed?
│       └─ YES → Update API_REFERENCE.md
│
└─ NO → No doc updates needed
```

### Documentation Files

| File | When to Update | Required? |
|------|---------------|-----------|
| **CHANGELOG.md** | After EVERY code merge to main | ✅ YES (always) |
| **SCHEMA.md** | Database tables/fields/statuses changed | ⚠️ If applicable |
| **ROADMAP.md** | Feature from backlog completed | ⚠️ If applicable |
| **API_REFERENCE.md** | Convex queries/mutations changed | ⚠️ If applicable |
| **CODE_STYLE.md** | New patterns/conventions added | ❌ Rarely |

### Update Examples

**CHANGELOG.md (REQUIRED FOR ALL MERGES):**
```markdown
## 2026-02-03 - Feature Name or Bug Fix

**Brief description of what changed**

- Bullet point 1
- Bullet point 2

**Files Modified:**
- convex/orders/mutations.ts
- src/pages/OrderDetail.tsx

**Commits:**
- abc123 - feat: add new feature
```

**SCHEMA.md (When schema changes):**
- Added new table → Document full table definition
- Added field → Update table section with new field
- Added order status → Update workflow diagram
- Added index → Document index purpose

**ROADMAP.md (When feature completed):**
- Mark item as [x] in appropriate phase
- Add to version history if milestone

**API_REFERENCE.md (When backend changes):**
- Document new query/mutation signature
- Add example response
- Note any breaking changes

### Enforcement

**Documentation is NOT optional. PRs without complete documentation should be rejected.**

See full details: [docs/WORKFLOW.md](docs/WORKFLOW.md#documentation-requirements)

---

## Custom Commands

### /handover

When the user types `/handover`, execute the handover skill to create a session continuity document.

**Instructions:** Read and follow `.agent/skills/handover/SKILL.md`

**Quick summary:**
1. Get current branch: `git branch --show-current`
2. Find master plan in `docs/plans/` or `docs/`
3. Get recent commits: `git log --oneline -10`
4. Check modified files: `git diff --name-only main...HEAD`
5. Create handover document at `docs/handover/handover-{branch-name}.md`
6. Report to user with next steps for new session

**Use when:**
- Context window is getting full
- Completing a major implementation phase
- Before switching to a different area of work
- User explicitly requests a handover

### /techdebt

When the user types `/techdebt`, execute the techdebt skill to scan for code duplication and consolidation opportunities.

**Instructions:** Read and follow `.agent/skills/techdebt/SKILL.md`

**Quick summary:**
1. Scan card/button/dialog components for duplication
2. Check mutations for CRUD boilerplate
3. Identify hook wrapper patterns
4. Flag naming convention inconsistencies
5. Generate report at `docs/reports/techdebt-{date}.md`

**Use when:**
- End of coding session (routine cleanup)
- Before creating a PR
- Planning refactoring work

### /staffreview

When the user types `/staffreview`, execute the staffreview skill to review implementation plans from the perspective of senior engineers.

**Instructions:** Read and follow `.agent/skills/staffreview/SKILL.md`

**Quick summary:**
1. Accept optional path argument or prompt for plan selection from `docs/plans/`
2. Read project context (CLAUDE.md, CODE_STYLE.md, SCHEMA.md)
3. Perform Staff Developer review (implementation, patterns, duplication)
4. Perform Principal Developer review (architecture, schema flows, logic)
5. Generate consolidated report with Critical/Improvement/Refinement items
6. Recommend specialist agents for each implementation phase
7. Optionally save review to `docs/reviews/staffreview-{plan-name}-{date}.md`

**Use when:**
- Before starting implementation of any plan
- After writing a new implementation plan (self-review)
- When inheriting a plan from another developer

---

## Convex Quick Reference

**Reading data (reactive):**
```typescript
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

const recipes = useQuery(api.recipes.list);
const recipe = useQuery(api.recipes.getById, { id: recipeId });
```

**Writing data:**
```typescript
import { useMutation } from "convex/react";

const createRecipe = useMutation(api.recipes.create);
await createRecipe({ name: "Recipe Name", tagIds: [], createdBy: "admin" });
```

**Defining queries (backend):**
```typescript
// convex/recipes/queries.ts
import { query } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("recipes").collect();
  },
});

export const getById = query({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
```

**Defining mutations (backend):**
```typescript
// convex/recipes/mutations.ts
import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    name: v.string(),
    tagIds: v.array(v.id("tags")),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("recipes", args);
  },
});
```
