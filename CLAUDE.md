# CLAUDE.md

## Project Overview

**Malo Recipe Master** — A local-first recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, and product concepts with full versioning, cost calculations, and margin analysis.

---

## Documentation Index

| File | Purpose | When to Read |
|------|---------|--------------|
| [docs/SCHEMA.md](docs/SCHEMA.md) | Database schema, data flows, conventions | Before DB changes |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | API endpoints, response formats | Before API changes |
| [docs/CODE_STYLE.md](docs/CODE_STYLE.md) | Python/TS coding conventions, patterns | During implementation |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Git workflow, code review process | Before any PR |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment guide | When deploying |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Version history | After merging |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Future plans, backlog | When planning features |

---

## Quick File Finder

**Note:** Backend files are in `api/app/`, frontend files are in `src/`

| Task | Backend Files | Frontend Files |
|------|---------------|----------------|
| **Add field to Recipe** | `api/app/models/recipe.py`<br>`api/app/schemas/recipe.py`<br>`api/app/crud/recipes.py` | `src/lib/types.ts`<br>`src/hooks/useRecipes.ts` |
| **Modify cost calculation** | `api/app/services/cost_calculator.py` | `src/components/shared/CostTooltip.tsx` |
| **Add Recipe API endpoint** | `api/app/routers/recipes.py` | `src/lib/api.ts`<br>`src/hooks/useRecipes.ts` |
| **Update Recipe UI** | - | `src/pages/RecipeEditor.tsx`<br>`src/components/recipes/RecipeCard.tsx` |
| **Add Packaging field** | `api/app/models/packaging.py`<br>`api/app/schemas/packaging.py`<br>`api/app/crud/packaging.py` | `src/lib/types.ts`<br>`src/hooks/usePackaging.ts` |
| **Update Product COGS** | `api/app/services/cost_calculator.py`<br>`api/app/routers/products.py` | `src/pages/ProductEditor.tsx` |
| **Add new Tag category** | `api/app/database.py` (seed data) | - |
| **Create shared component** | - | `src/components/shared/` |
| **Add validation logic** | `api/app/schemas/[entity].py` | Form components in `src/pages/` |
| **Database schema change** | `api/app/database.py`<br>`api/app/models/[entity].py` | Update `src/lib/types.ts` to match |
| **Fix N+1 query** | `api/app/crud/[entity].py` (add joinedload) | - |
| **Add dashboard stat** | `api/app/routers/dashboard.py`<br>`api/app/crud/[entity].py` | `src/pages/Dashboard.tsx` |
| **Add Order field** | `api/app/models/order.py`<br>`api/app/schemas/order.py`<br>`api/app/crud/orders.py` | `src/lib/types.ts`<br>`src/hooks/useOrders.ts` |
| **Update WhatsApp template** | `api/app/services/whatsapp_formatter.py` | - |
| **Add Order API endpoint** | `api/app/routers/orders.py` | `src/lib/api.ts`<br>`src/hooks/useOrders.ts` |
| **Update Order UI** | - | `src/pages/OrderManager.tsx`<br>`src/pages/OrderDetail.tsx`<br>`src/components/orders/` |
| **Kitchen View (production)** | `api/app/routers/orders.py` (kitchen endpoint)<br>`api/app/crud/orders.py` | `src/pages/KitchenView.tsx` |
| **Database Migration** | `api/scripts/migrate_sqlite_to_pg.py`<br>`api/scripts/MIGRATION_README.md` | - |
| **Deployment Config** | `api/index.py` (Vercel entry)<br>`vercel.json` | `vite.config.ts` |

---

## Critical File Paths

**Backend Core:**
- `api/app/main.py` - FastAPI app, CORS, router registration (55 endpoints total)
- `api/app/database.py` - Database engine (SQLite/PostgreSQL), session factory, init_db(), seed data
- `api/app/services/cost_calculator.py` - All cost calculation logic (212 lines)
- `api/app/services/whatsapp_formatter.py` - WhatsApp receipt generation
- `api/index.py` - Vercel serverless entry point (Mangum ASGI adapter)

**Frontend Core:**
- `src/App.tsx` - Router setup (9 routes), React Query provider
- `src/lib/api.ts` - Axios client, 50+ API functions
- `src/lib/types.ts` - TypeScript interfaces matching backend schemas (400+ lines)

> **Full file paths reference:** See [docs/SCHEMA.md](docs/SCHEMA.md) for complete model/router/hook listings.

---

## Tech Stack

| Layer | Technology | Version | Notes |
|-------|------------|---------|-------|
| **Backend** | Python + FastAPI | 3.11+ / 0.109.0 | ASGI framework |
| **Database (Dev)** | SQLite | 3.x | Local development |
| **Database (Prod)** | PostgreSQL | 15+ | Production (NullPool for serverless) |
| **ORM** | SQLAlchemy | 2.0.25 | Supports both SQLite & PostgreSQL |
| **Validation** | Pydantic | 2.5.3 | Request/response schemas |
| **Deployment** | Vercel | - | Serverless functions + static hosting |
| **ASGI Adapter** | Mangum | 0.18.0 | FastAPI → AWS Lambda/Vercel adapter |
| **DB Driver (Prod)** | psycopg2-binary | 2.9.9 | PostgreSQL driver |
| **Frontend** | React + TypeScript | 19.2.0 | UI framework |
| **Build Tool** | Vite | 6.2.1 | Fast bundler with HMR |
| **Styling** | Tailwind CSS | 4.1.18 | Utility-first CSS |
| **UI Components** | shadcn/ui (Radix) | latest | Accessible components |
| **State** | TanStack Query | 5.90.20 | Server state management |
| **Routing** | React Router | 7.13.0 | Client-side routing |
| **HTTP Client** | Axios | 1.13.3 | API requests |
| **Icons** | Lucide React | 0.563.0 | Icon library |

---

## Commands

```bash
# Development (Local - SQLite)
# Backend
cd api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (from project root)
npm install
npm run dev

# Production Build
npm run build                    # Builds frontend to dist/

# Linting
npm run lint

# Database Management (SQLite - Local Development)
# Database reset (deletes all data)
rm api/data/malo_recipes.db && cd api && python -c "from app.database import init_db; init_db()"

# Windows database reset
del api\data\malo_recipes.db && cd api && python -c "from app.database import init_db; init_db()"

# Migration (SQLite → PostgreSQL)
cd api/scripts
python migrate_sqlite_to_pg.py --sqlite-path ../data/malo_recipes.db --postgres-url "postgresql://user:pass@host:5432/dbname"

# Deployment (Vercel)
vercel                           # Preview deployment
vercel --prod                    # Production deployment

# Environment Variables (Production)
# Set in Vercel dashboard or use vercel env
DATABASE_URL=postgresql://...    # PostgreSQL connection string
VITE_API_URL=/api               # API base URL (relative for same domain)
```

---

## Project Structure

```
product_master/
├── api/                         # Backend (FastAPI) - Vercel Serverless Functions
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app, CORS, routers
│   │   ├── database.py          # DB engine (SQLite/PostgreSQL), session, init
│   │   ├── models/              # SQLAlchemy models (9 files)
│   │   ├── schemas/             # Pydantic schemas (9 files)
│   │   ├── crud/                # Database operations (9 files)
│   │   ├── services/            # Business logic (cost_calculator, whatsapp_formatter)
│   │   └── routers/             # API endpoints (9 files, 55 endpoints)
│   ├── data/
│   │   └── malo_recipes.db      # SQLite database (local dev only)
│   ├── scripts/                 # Migration & deployment scripts
│   ├── index.py                 # Vercel serverless entry point (Mangum)
│   └── requirements.txt         # Python dependencies
├── src/                         # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components (14 files)
│   │   ├── layout/              # Header, Layout, PageHeader
│   │   ├── shared/              # Carousel, ConfirmDialog, CostTooltip, etc.
│   │   ├── ingredients/
│   │   ├── materials/
│   │   ├── recipes/
│   │   ├── packaging/
│   │   ├── products/
│   │   └── orders/              # Order components (7 files)
│   ├── pages/                   # Page components (9 files)
│   ├── hooks/                   # React Query hooks (9 files)
│   ├── lib/
│   │   ├── api.ts               # Axios API client (40+ functions)
│   │   ├── types.ts             # TypeScript interfaces (400+ lines)
│   │   └── utils.ts             # Utility functions
│   ├── App.tsx                  # Router setup with React Query
│   ├── index.css                # Tailwind CSS + custom theme
│   └── main.tsx                 # React entry point
├── docs/                        # Documentation (7 files)
│   ├── SCHEMA.md
│   ├── API_REFERENCE.md
│   ├── CODE_STYLE.md
│   ├── WORKFLOW.md
│   ├── DEPLOYMENT.md
│   ├── CHANGELOG.md
│   └── ROADMAP.md
├── public/
├── dist/                        # Build output (generated by vite build)
├── vercel.json                  # Vercel deployment config
├── vite.config.ts               # Vite bundler config
├── package.json                 # npm dependencies & scripts
├── tsconfig.json                # TypeScript config
├── .env                         # Local environment variables (gitignored)
├── .env.example                 # Environment variable template
├── .gitignore
└── CLAUDE.md                    # This file - entry point
```

---

## Key Business Rules

1. **Unit conversion**: kg→g, l→ml, m→cm. 1 ml = 1 g for liquid calculations.
2. **Version immutability**: Saved versions cannot be edited. Create new version instead.
3. **Linked components**: Recipes can reference other recipe versions as components.
4. **Product pinning**: Products stay on selected recipe/packaging versions. Manual update required.
5. **Reusable components**: Only single-component recipes marked as reusable appear in component selection.
6. **Deletion rules**: Recipes/packaging cannot be deleted if used in products. Error shows blocking products.
7. **Default tags**: System seeds Dubai-Snack, Extruded-Snack, Sachet, Pouch, Box on init.

---

## Common Pitfalls

1. **Forgetting to flush before accessing ID** — After `db.add()`, call `db.flush()` to get the auto-generated ID before creating child records.

2. **Circular imports in models** — Use `TYPE_CHECKING` and string annotations for forward references.

3. **N+1 queries** — Use `joinedload` or `selectinload` for relationships accessed in loops.

4. **Stale React Query cache** — Always `invalidateQueries` after mutations that affect list views.

5. **Cost calculation with null yield** — Always check `estimated_yield_grams` before dividing. Return `null` if not set.

6. **Version copy depth** — When copying, deep copy components AND ingredients. Shallow copy creates shared references.

7. **React Router v7 changes** — Use object format for `invalidateQueries({ queryKey: [...] })`.

---

## Environment Variables

```bash
# backend/.env (optional, defaults work for local dev)
DATABASE_URL=sqlite:///./data/malo_recipes.db
CORS_ORIGINS=http://localhost:5173

# frontend/.env
VITE_API_URL=http://localhost:8000/api
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
