# CLAUDE.md

## Project Overview

**Malo Recipe Master** — A real-time recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, and product concepts with full versioning, cost calculations, and margin analysis. **Now powered by Convex for real-time data sync.**

---

## Documentation Index

| File | Purpose | When to Read |
|------|---------|--------------|
| [docs/SCHEMA.md](docs/SCHEMA.md) | Database schema, data flows, conventions | Before DB changes |
| [docs/CODE_STYLE.md](docs/CODE_STYLE.md) | TypeScript coding conventions, patterns | During implementation |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Git workflow, code review process | Before any PR |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Version history | After merging |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Future plans, backlog | When planning features |

---

## Quick File Finder

**Note:** Backend is in `convex/`, frontend is in `src/`

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
| **Database schema change** | `convex/schema.ts` | Update `src/lib/types.ts` if needed |
| **Add dashboard stat** | `convex/dashboard/queries.ts` | `src/pages/Dashboard.tsx` |
| **Add Order field** | `convex/schema.ts`<br>`convex/orders/mutations.ts` | `src/hooks/convex/useOrders.ts`<br>`src/pages/OrderDetail.tsx` |
| **Update WhatsApp template** | `convex/lib/whatsappFormatter.ts` | - |
| **Update Order UI** | - | `src/pages/OrderManager.tsx`<br>`src/pages/OrderDetail.tsx`<br>`src/components/orders/` |
| **Kitchen View (production)** | `convex/orders/queries.ts` (kitchen endpoint) | `src/pages/KitchenView.tsx` |

---

## Critical File Paths

**Backend Core (Convex):**
- `convex/schema.ts` - Database schema definition (all tables)
- `convex/lib/costCalculator.ts` - Cost calculation logic
- `convex/lib/whatsappFormatter.ts` - WhatsApp receipt generation
- `convex/[entity]/queries.ts` - Read operations for each entity
- `convex/[entity]/mutations.ts` - Write operations for each entity

**Frontend Core:**
- `src/App.tsx` - Router setup (9 routes)
- `src/main.tsx` - React entry point with ConvexProvider
- `src/hooks/convex/` - Convex query/mutation hooks
- `src/lib/types.ts` - TypeScript interfaces (400+ lines)

---

## Tech Stack

| Layer | Technology | Version | Notes |
|-------|------------|---------|-------|
| **Backend** | Convex | latest | Real-time serverless database |
| **Database** | Convex DB | - | Integrated with Convex |
| **Frontend** | React + TypeScript | 19.2.0 | UI framework |
| **Build Tool** | Vite | 6.2.1 | Fast bundler with HMR |
| **Styling** | Tailwind CSS | 4.1.18 | Utility-first CSS |
| **UI Components** | shadcn/ui (Radix) | latest | Accessible components |
| **Routing** | React Router | 7.13.0 | Client-side routing |
| **Icons** | Lucide React | 0.563.0 | Icon library |
| **Notifications** | Sonner | latest | Toast notifications |

---

## Commands

```bash
# Development
npm install
npx convex dev               # Start Convex dev server (run in separate terminal)
npm run dev                  # Start Vite dev server

# Production Build
npm run build               # Builds frontend to dist/

# Linting
npm run lint

# Convex Commands
npx convex dev              # Start local Convex dev server
npx convex deploy           # Deploy to production
npx convex dashboard        # Open Convex dashboard

# Database Seeding (run from Convex dashboard or via code)
# Call tags.mutations.seedDefaults() to create default tags
# Call menuProducts.mutations.seedDefaults() to create default menu products
```

---

## Project Structure

```
product_master/
├── convex/                          # Backend (Convex)
│   ├── _generated/                  # Auto-generated Convex files
│   ├── lib/                         # Shared utilities
│   │   ├── costCalculator.ts        # Cost calculation logic
│   │   └── whatsappFormatter.ts     # WhatsApp message generation
│   ├── customers/                   # Customer queries/mutations
│   ├── dashboard/                   # Dashboard aggregation queries
│   ├── ingredients/                 # Ingredient CRUD
│   ├── menuProducts/                # Menu product definitions
│   ├── orders/                      # Order management
│   ├── packaging/                   # Packaging recipes
│   ├── products/                    # Product management
│   ├── recipes/                     # Recipe management
│   ├── tags/                        # Tag management
│   └── schema.ts                    # Database schema
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
│   │   ├── orders/                  # Order components
│   │   ├── dashboard/               # Dashboard components
│   │   └── onboarding/              # Onboarding tour
│   ├── pages/                       # Page components (9 files)
│   ├── hooks/
│   │   ├── convex/                  # Convex hooks (all data fetching)
│   │   └── useOnboardingTour.ts     # Tour logic
│   ├── lib/
│   │   ├── types.ts                 # TypeScript interfaces
│   │   └── utils.ts                 # Utility functions
│   ├── App.tsx                      # Router setup
│   ├── main.tsx                     # Entry point with ConvexProvider
│   └── index.css                    # Tailwind CSS + custom theme
├── docs/                            # Documentation
├── public/
├── dist/                            # Build output
├── vite.config.ts                   # Vite bundler config
├── package.json                     # npm dependencies & scripts
├── tsconfig.json                    # TypeScript config
└── CLAUDE.md                        # This file - entry point
```

---

## Key Business Rules

1. **Unit conversion**: kg→g, l→ml, m→cm. 1 ml = 1 g for liquid calculations.
2. **Version immutability**: Saved versions cannot be edited. Create new version instead.
3. **Linked components**: Recipes can reference other recipe versions as components.
4. **Product pinning**: Products stay on selected recipe/packaging versions. Manual update required.
5. **Reusable components**: Only single-component recipes marked as reusable appear in component selection.
6. **Deletion rules**: Recipes/packaging cannot be deleted if used in products. Error shows blocking products.
7. **Default tags**: System seeds Dubai-Snack, Extruded-Snack, Sachet, Pouch, Box via seedDefaults mutation.

---

## Common Pitfalls

1. **Convex IDs are strings** — All IDs from Convex are `Id<"tableName">` types (strings), not numbers.

2. **Convex returns undefined while loading** — Check for `undefined` before rendering: `const items = data ?? []`

3. **camelCase in Convex** — Convex uses camelCase field names (procurementSource), not snake_case.

4. **Real-time updates** — Convex queries auto-update. No need to invalidate cache after mutations.

5. **Cost calculation with null yield** — Always check `estimatedYieldGrams` before dividing. Return `null` if not set.

6. **Version copy depth** — When copying, deep copy components AND ingredients. Shallow copy creates shared references.

7. **Tag format varies** — Recipes/packaging use string tag names in arrays; Products use tag objects with `_id` and `name`.

---

## Environment Variables

```bash
# frontend/.env (for Convex)
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

---

## Git Workflow (Summary)

> **Full details:** See [docs/WORKFLOW.md](docs/WORKFLOW.md)

**Mandatory workflow for ALL code changes:**

```
1. Create new branch from main
2. Make changes & commit
3. Audit & code review
4. If works → merge back to main
5. Update docs/CHANGELOG.md
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
