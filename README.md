# Malo Recipe Master

A local-first recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, and product concepts with full versioning, cost calculations, and margin analysis.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.11+ + FastAPI |
| Database | SQLite 3.x |
| ORM | SQLAlchemy 2.x |
| Validation | Pydantic 2.x |
| Frontend | React 18.x + TypeScript |
| Styling | Tailwind CSS 3.x |
| UI Components | shadcn/ui |
| State | TanStack Query 5.x |
| Routing | React Router 6.x |

## Project Structure

```
malo-recipe-master/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, routers
│   │   ├── database.py          # SQLite engine, session, init
│   │   ├── models/              # SQLAlchemy models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── crud/                # Database operations
│   │   ├── services/            # Business logic (cost calculations)
│   │   └── routers/             # API endpoints
│   ├── data/
│   │   └── malo_recipes.db      # SQLite database
│   └── requirements.txt
├── frontend/                     # React app (Phase 2)
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── lib/
│   └── package.json
├── CLAUDE.md                    # Development guidelines
├── malo_recipe_master_prd.md    # Product requirements
└── README.md
```

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API will be available at http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at http://localhost:5173

## API Endpoints

### Dashboard
- `GET /api/dashboard/stats` - Dashboard statistics

### Ingredients
- `GET /api/ingredients` - List all ingredients
- `POST /api/ingredients` - Create ingredient
- `GET /api/ingredients/{id}` - Get ingredient
- `PUT /api/ingredients/{id}` - Update ingredient
- `DELETE /api/ingredients/{id}` - Delete ingredient

### Packaging Materials
- `GET /api/packaging-materials` - List all materials
- `POST /api/packaging-materials` - Create material
- `GET /api/packaging-materials/{id}` - Get material
- `PUT /api/packaging-materials/{id}` - Update material
- `DELETE /api/packaging-materials/{id}` - Delete material

### Tags
- `GET /api/tags` - List all tags
- `POST /api/tags` - Create tag
- `DELETE /api/tags/{id}` - Delete tag

### Recipes
- `GET /api/recipes` - List all recipes (summaries)
- `POST /api/recipes` - Create recipe with first version
- `GET /api/recipes/{id}` - Get recipe with all versions
- `GET /api/recipes/{id}/versions/{v}` - Get specific version details
- `POST /api/recipes/{id}/versions` - Create new version (copy from existing)
- `PUT /api/recipes/{id}/tags` - Update recipe tags
- `DELETE /api/recipes/{id}` - Delete recipe (blocked if used in products)
- `GET /api/recipes/reusable` - List reusable components

### Packaging
- Same pattern as recipes at `/api/packaging`

### Products
- `GET /api/products` - List all products (summaries)
- `POST /api/products` - Create product with first version
- `GET /api/products/{id}` - Get product with all versions
- `GET /api/products/{id}/versions/{v}` - Get version with COGS breakdown
- `POST /api/products/{id}/versions` - Create new version
- `DELETE /api/products/{id}` - Delete product

## Key Features

### Versioning System
- Versions are immutable once saved
- Linear version chain with copy-from-any capability
- Version metadata tracked (created date, copied from)

### Cost Calculations
- Ingredient cost per base unit (g, ml, pcs)
- Unit conversions (kg→g, l→ml)
- Component subtotals
- Recipe total cost and cost-per-gram
- Product COGS (recipe + packaging)
- Contribution margin analysis

### Business Rules
- 1 ml = 1 g for liquid ingredient calculations
- Products stay pinned to selected recipe/packaging versions
- Recipes/packaging cannot be deleted if used in products

## Development Progress

### Phase 1: Backend (Completed)
- [x] Database setup with SQLite
- [x] SQLAlchemy models for all entities
- [x] Pydantic schemas for API I/O
- [x] CRUD operations
- [x] Cost calculator service
- [x] API routers
- [x] Default tag seeding

### Phase 2: Frontend (Completed)
- [x] React + TypeScript setup with Vite
- [x] Tailwind CSS 4.x + shadcn/ui components
- [x] TanStack Query for API state management
- [x] Dashboard with carousels (Products, Recipes, Packaging)
- [x] Recipe Editor with version navigation and component management
- [x] Packaging Editor with material management
- [x] Product Editor with COGS breakdown

## Frontend Structure

```
frontend/src/
├── components/
│   ├── ui/                  # shadcn/ui components (Button, Card, Dialog, etc.)
│   ├── layout/              # Layout components (Header, PageHeader)
│   ├── shared/              # Shared components (Carousel, VersionNavigator, etc.)
│   ├── recipes/             # Recipe-specific components
│   ├── packaging/           # Packaging-specific components
│   └── products/            # Product-specific components
├── pages/
│   ├── Dashboard.tsx        # Main dashboard with carousels
│   ├── RecipeEditor.tsx     # Recipe create/edit with versions
│   ├── PackagingEditor.tsx  # Packaging create/edit with versions
│   └── ProductEditor.tsx    # Product create/edit with COGS
├── hooks/                   # React Query hooks for each entity
├── lib/
│   ├── api.ts              # Axios API client
│   ├── types.ts            # TypeScript interfaces
│   └── utils.ts            # Utility functions
└── App.tsx                 # Router setup
```

## Environment Variables

### Frontend
```bash
# frontend/.env
VITE_API_URL=http://localhost:8000/api
```
