# CLAUDE.md

## Project Overview

**Malo Recipe Master** — A local-first recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, and product concepts with full versioning, cost calculations, and margin analysis.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Backend | Python + FastAPI | 3.11+ / 0.109.0 |
| Database | SQLite | 3.x |
| ORM | SQLAlchemy | 2.0.25 |
| Validation | Pydantic | 2.5.3 |
| Frontend | React + TypeScript | 19.2.0 |
| Styling | Tailwind CSS | 4.1.18 |
| UI Components | shadcn/ui (Radix) | latest |
| State | TanStack Query | 5.90.20 |
| Routing | React Router | 7.13.0 |
| HTTP Client | Axios | 1.13.3 |
| Icons | Lucide React | 0.563.0 |

## Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev

# Frontend build
cd frontend
npm run build

# Frontend lint
cd frontend
npm run lint

# Database reset (deletes all data)
rm backend/data/malo_recipes.db && cd backend && python -c "from app.database import init_db; init_db()"

# Windows database reset
del backend\data\malo_recipes.db && cd backend && python -c "from app.database import init_db; init_db()"
```

## Project Structure

```
product_master/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app, CORS, routers
│   │   ├── database.py          # SQLite engine, session, init
│   │   ├── models/              # SQLAlchemy models (7 files)
│   │   │   ├── __init__.py
│   │   │   ├── ingredient.py
│   │   │   ├── packaging_material.py
│   │   │   ├── tag.py
│   │   │   ├── recipe.py        # Recipe, RecipeVersion, RecipeComponent, ComponentIngredient
│   │   │   ├── packaging.py     # PackagingRecipe, PackagingVersion, PackagingComponent
│   │   │   └── product.py       # Product, ProductVersion
│   │   ├── schemas/             # Pydantic schemas (7 files)
│   │   │   ├── __init__.py
│   │   │   ├── ingredient.py
│   │   │   ├── packaging_material.py
│   │   │   ├── tag.py
│   │   │   ├── recipe.py
│   │   │   ├── packaging.py
│   │   │   └── product.py
│   │   ├── crud/                # Database operations (7 files)
│   │   │   ├── __init__.py
│   │   │   ├── ingredients.py
│   │   │   ├── packaging_materials.py
│   │   │   ├── tags.py
│   │   │   ├── recipes.py
│   │   │   ├── packaging.py
│   │   │   └── products.py
│   │   ├── services/            # Business logic
│   │   │   ├── __init__.py
│   │   │   └── cost_calculator.py
│   │   └── routers/             # API endpoints (7 files)
│   │       ├── __init__.py
│   │       ├── ingredients.py
│   │       ├── packaging_materials.py
│   │       ├── tags.py
│   │       ├── recipes.py
│   │       ├── packaging.py
│   │       ├── products.py
│   │       └── dashboard.py
│   ├── data/
│   │   └── malo_recipes.db      # SQLite database (auto-created)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui components (13 files)
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── label.tsx
│   │   │   │   ├── scroll-area.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── separator.tsx
│   │   │   │   ├── skeleton.tsx
│   │   │   │   ├── tabs.tsx
│   │   │   │   ├── textarea.tsx
│   │   │   │   └── tooltip.tsx
│   │   │   ├── layout/          # Layout components
│   │   │   │   ├── index.ts
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Layout.tsx
│   │   │   │   └── PageHeader.tsx
│   │   │   ├── shared/          # Shared utility components
│   │   │   │   ├── index.ts
│   │   │   │   ├── Carousel.tsx
│   │   │   │   ├── ConfirmDialog.tsx
│   │   │   │   ├── CostTooltip.tsx
│   │   │   │   ├── LoadingState.tsx
│   │   │   │   └── VersionNavigator.tsx
│   │   │   ├── recipes/
│   │   │   │   └── RecipeCard.tsx
│   │   │   ├── packaging/
│   │   │   │   └── PackagingCard.tsx
│   │   │   └── products/
│   │   │       └── ProductCard.tsx
│   │   ├── pages/
│   │   │   ├── index.ts
│   │   │   ├── Dashboard.tsx
│   │   │   ├── RecipeEditor.tsx
│   │   │   ├── PackagingEditor.tsx
│   │   │   └── ProductEditor.tsx
│   │   ├── hooks/               # React Query hooks (7 files)
│   │   │   ├── index.ts
│   │   │   ├── useIngredients.ts
│   │   │   ├── useMaterials.ts
│   │   │   ├── usePackaging.ts
│   │   │   ├── useProducts.ts
│   │   │   ├── useRecipes.ts
│   │   │   └── useTags.ts
│   │   ├── lib/
│   │   │   ├── api.ts           # Axios API client
│   │   │   ├── types.ts         # TypeScript interfaces (336 lines)
│   │   │   └── utils.ts         # Utility functions (cn helper)
│   │   ├── App.tsx              # Router setup with React Query
│   │   ├── index.css            # Tailwind CSS + custom theme
│   │   └── main.tsx             # React entry point
│   ├── .env                     # Environment variables
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── vite.config.ts
│   └── eslint.config.js
├── CLAUDE.md                    # This file - development guidelines
├── README.md                    # Quick start guide
├── malo_recipe_master_prd.md    # Product requirements document
└── claude_code_prompt.md        # Build instructions
```

## Code Style

### Python (Backend)

```python
# Use type hints everywhere
def get_recipe_cost(recipe_version_id: int, db: Session) -> float:
    ...

# Pydantic models for all API I/O
class RecipeVersionCreate(BaseModel):
    version_name: str
    description: str
    estimated_yield_grams: float | None = None

# SQLAlchemy models with relationships
class RecipeVersion(Base):
    __tablename__ = "recipe_version"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipe.id"))

    # Relationships
    recipe: Mapped["Recipe"] = relationship(back_populates="versions")
    components: Mapped[list["RecipeComponent"]] = relationship(back_populates="recipe_version")

# CRUD functions return models, not dicts
def get_recipe(db: Session, recipe_id: int) -> Recipe | None:
    return db.query(Recipe).filter(Recipe.id == recipe_id).first()

# Router dependencies
@router.get("/{recipe_id}")
def read_recipe(recipe_id: int, db: Session = Depends(get_db)):
    ...
```

### TypeScript (Frontend)

```typescript
// Interfaces match backend schemas
interface RecipeVersion {
  id: number;
  recipe_id: number;
  version_number: number;
  version_name: string;
  description: string | null;
  estimated_yield_grams: number | null;
  created_at: string;
}

// Use React Query for all API calls
const { data, isLoading } = useQuery({
  queryKey: ['recipe', recipeId],
  queryFn: () => api.getRecipe(recipeId),
});

// Mutations with cache invalidation
const mutation = useMutation({
  mutationFn: api.createRecipeVersion,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] }),
});

// Components are functional with explicit prop types
interface RecipeCardProps {
  recipe: RecipeSummary;
  onClick?: () => void;
}

export function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  ...
}
```

## Database Conventions

### Naming
- Tables: `snake_case`, singular (`recipe`, `recipe_version`)
- Columns: `snake_case`
- Foreign keys: `{referenced_table}_id`
- Junction tables: `{table1}_{table2}` alphabetically (`recipe_tag`)

### Unit Types
- Ingredients: `g`, `kg`, `ml`, `l`, `pcs`
- Packaging Materials: `pcs`, `m`, `cm`, `sheets`

### Patterns
```python
# Always use created_at/updated_at
created_at: Mapped[datetime] = mapped_column(default=func.now())
updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())

# Soft deletes not used — versions are immutable, recipes can be hard deleted with cascade

# Indexes on foreign keys and frequently queried columns
Index("idx_recipe_version_recipe", "recipe_id")
```

### Transactions
```python
# Wrap multi-step operations
def create_recipe_with_components(db: Session, data: RecipeCreate) -> Recipe:
    try:
        recipe = Recipe(name=data.name)
        db.add(recipe)
        db.flush()  # Get ID before adding version

        version = RecipeVersion(recipe_id=recipe.id, ...)
        db.add(version)

        db.commit()
        db.refresh(recipe)
        return recipe
    except Exception:
        db.rollback()
        raise
```

## API Design

### Endpoints (41 total functions across 7 routers)

```
# Dashboard
GET    /api/dashboard/stats              # Dashboard statistics

# Ingredients
GET    /api/ingredients                  # List all with costs
GET    /api/ingredients/{id}             # Get single
POST   /api/ingredients                  # Create
PATCH  /api/ingredients/{id}             # Update
DELETE /api/ingredients/{id}             # Delete

# Packaging Materials
GET    /api/packaging-materials          # List all with costs
GET    /api/packaging-materials/{id}     # Get single
POST   /api/packaging-materials          # Create
PATCH  /api/packaging-materials/{id}     # Update
DELETE /api/packaging-materials/{id}     # Delete

# Tags
GET    /api/tags                         # List all
POST   /api/tags                         # Create
DELETE /api/tags/{id}                    # Delete

# Recipes
GET    /api/recipes                      # List summaries
GET    /api/recipes/reusable             # List reusable components
GET    /api/recipes/{id}                 # Get with all versions
GET    /api/recipes/{id}/versions/{v}    # Get specific version
POST   /api/recipes                      # Create + first version
POST   /api/recipes/{id}/versions        # Create new version
POST   /api/recipes/{id}/versions/copy   # Copy from existing version
PUT    /api/recipes/{id}/tags            # Update tags
DELETE /api/recipes/{id}                 # Delete (blocked if used)

# Packaging (same pattern as recipes)
GET    /api/packaging                    # List summaries
GET    /api/packaging/{id}               # Get with all versions
GET    /api/packaging/{id}/versions/{v}  # Get specific version
POST   /api/packaging                    # Create + first version
POST   /api/packaging/{id}/versions      # Create new version
POST   /api/packaging/{id}/versions/copy # Copy from existing version
PUT    /api/packaging/{id}/tags          # Update tags
DELETE /api/packaging/{id}               # Delete (blocked if used)

# Products
GET    /api/products                     # List with COGS summaries
GET    /api/products/{id}                # Get with all versions
GET    /api/products/{id}/versions/{v}   # Get version with COGS breakdown
POST   /api/products                     # Create + first version
POST   /api/products/{id}/versions       # Create new version
POST   /api/products/{id}/versions/copy  # Copy from existing version
DELETE /api/products/{id}                # Delete
```

### Response Format
```python
# List endpoints return summaries
class RecipeSummary(BaseModel):
    id: int
    name: str
    tags: list[str]
    latest_version: int
    latest_version_name: str
    total_cost: float | None
    cost_per_gram: float | None
    created_at: datetime

# Detail endpoints return full objects
class RecipeVersionDetail(BaseModel):
    id: int
    recipe_id: int
    version_number: int
    version_name: str
    description: str | None
    estimated_yield_grams: float | None
    is_single_component: bool
    is_reusable_component: bool
    components: list[RecipeComponentDetail]
    total_cost: float | None
    cost_per_gram: float | None
```

### Error Handling
```python
from fastapi import HTTPException

# Use HTTP exceptions with clear messages
if not recipe:
    raise HTTPException(status_code=404, detail="Recipe not found")

if recipe_in_use:
    raise HTTPException(
        status_code=400,
        detail=f"Cannot delete recipe. Used in products: {product_names}"
    )
```

## Frontend Patterns

### Page Structure
```typescript
// Pages handle routing params and data fetching
export function RecipeEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';

  const { data: recipe, isLoading } = useRecipe(
    isNew ? undefined : Number(id)
  );

  if (!isNew && isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader title={isNew ? 'New Recipe' : recipe?.name || 'Recipe'} />
      {/* Editor content */}
    </div>
  );
}
```

### Component Organization
```
components/
├── ui/                    # shadcn primitives (Button, Input, Dialog, etc.)
├── layout/
│   ├── Header.tsx         # Top navigation with title
│   ├── Layout.tsx         # Outlet wrapper
│   └── PageHeader.tsx     # Page title + back button
├── shared/
│   ├── Carousel.tsx       # Horizontal scrolling with chevrons (300px scroll)
│   ├── VersionNavigator.tsx    # ← Version X → navigation
│   ├── CostTooltip.tsx    # (i) icon with cost info
│   ├── ConfirmDialog.tsx  # Delete warnings
│   └── LoadingState.tsx   # Skeleton cards
├── recipes/
│   └── RecipeCard.tsx     # Recipe summary card
├── packaging/
│   └── PackagingCard.tsx  # Packaging summary card
└── products/
    └── ProductCard.tsx    # Product summary with COGS
```

### State Management
```typescript
// Server state via React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,  // 30 seconds
      retry: 1,
    },
  },
});

// Local UI state via useState
const [currentVersionNumber, setCurrentVersionNumber] = useState<number | null>(null);
const [components, setComponents] = useState<ComponentDraft[]>([]);
```

### React Query Hooks Pattern
```typescript
// Query key factory
const recipeKeys = {
  all: ['recipes'] as const,
  lists: () => [...recipeKeys.all, 'list'] as const,
  list: () => [...recipeKeys.lists()] as const,
  details: () => [...recipeKeys.all, 'detail'] as const,
  detail: (id: number) => [...recipeKeys.details(), id] as const,
  version: (recipeId: number, versionNumber: number) =>
    [...recipeKeys.detail(recipeId), 'version', versionNumber] as const,
};

// Query hook with enabled flag
export function useRecipeVersion(recipeId: number | undefined, versionNumber: number | undefined) {
  return useQuery({
    queryKey: recipeKeys.version(recipeId!, versionNumber!),
    queryFn: () => recipeApi.getVersion(recipeId!, versionNumber!),
    enabled: recipeId !== undefined && versionNumber !== undefined,
  });
}

// Mutation hook with invalidation
export function useCreateRecipeVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, version }: { recipeId: number; version: RecipeVersionCreate }) =>
      recipeApi.createVersion(recipeId, version),
    onSuccess: (_, { recipeId }) => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.detail(recipeId) });
      queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
    },
  });
}
```

### Form Handling
```typescript
// Use controlled components
const [components, setComponents] = useState<ComponentDraft[]>([]);

// Add component
const addComponent = () => {
  setComponents([...components, {
    id: crypto.randomUUID(),
    component_name: `Component ${components.length + 1}`,
    sort_order: components.length,
    ingredients: [],
  }]);
};

// Validate before save
function handleSave() {
  if (components.length === 0) {
    alert("Recipe must have at least one component");
    return;
  }
  if (components.some(c => c.ingredients.length === 0)) {
    alert("All components must have at least one ingredient");
    return;
  }
  mutation.mutate({ ... });
}
```

## Business Logic

### Cost Calculations (services/cost_calculator.py)

```python
def normalize_to_base_unit(quantity: float, unit: str) -> float:
    """Convert kg→g, l→ml, m→cm. Base units: g, ml, pcs, cm, sheets."""
    if unit in ("kg", "l"):
        return quantity * 1000
    if unit == "m":
        return quantity * 100
    return quantity

def get_ingredient_cost_per_base_unit(ingredient: Ingredient) -> tuple[float, str]:
    """Cost per base unit (g, ml, or pcs). Returns (cost, base_unit)."""
    total_cost = ingredient.price_excl_shipping + ingredient.shipping_cost
    base_volume = normalize_to_base_unit(ingredient.volume_purchased, ingredient.unit_type)
    base_unit = get_base_unit(ingredient.unit_type)

    if base_volume <= 0:
        return 0.0, base_unit

    return total_cost / base_volume, base_unit

def get_component_cost(component: RecipeComponent, db: Session) -> float:
    """Sum of ingredient costs for a component."""
    if component.linked_recipe_version_id:
        # Linked component: get cost from source
        return get_recipe_version_cost(component.linked_recipe_version_id, db)

    total = 0.0
    for ci in component.ingredients:
        total += get_ingredient_line_cost(ci)
    return total

def get_recipe_version_cost(version_id: int, db: Session) -> float:
    """Total cost of all components in a recipe version."""
    version = get_recipe_version(db, version_id)
    if not version:
        return 0.0
    return sum(get_component_cost(c, db) for c in version.components)

def get_recipe_cost_per_gram(version_id: int, db: Session) -> float | None:
    """Cost per gram based on estimated yield. None if not set."""
    version = get_recipe_version(db, version_id)
    if not version or not version.estimated_yield_grams:
        return None
    total_cost = get_recipe_version_cost(version_id, db)
    return total_cost / version.estimated_yield_grams

def get_product_cogs(product_version: ProductVersion, db: Session) -> dict:
    """Full COGS breakdown for a product."""
    total_grams = product_version.num_pieces * product_version.grams_per_piece
    cost_per_gram = get_recipe_cost_per_gram(product_version.recipe_version_id, db)

    recipe_cogs = (cost_per_gram * total_grams) if cost_per_gram else None
    packaging_cogs = get_packaging_version_cost(product_version.packaging_version_id, db)

    if recipe_cogs is not None:
        total_cogs = recipe_cogs + packaging_cogs
        contribution_margin = product_version.retail_price_idr - total_cogs
        contribution_margin_pct = (contribution_margin / product_version.retail_price_idr) * 100
    else:
        total_cogs = None
        contribution_margin = None
        contribution_margin_pct = None

    return {
        "total_grams": total_grams,
        "recipe_cogs": recipe_cogs,
        "packaging_cogs": packaging_cogs,
        "total_cogs": total_cogs,
        "retail_price_idr": product_version.retail_price_idr,
        "contribution_margin": contribution_margin,
        "contribution_margin_pct": contribution_margin_pct,
    }
```

### Versioning Logic

```python
def copy_recipe_version(
    db: Session,
    recipe_id: int,
    copy_from_version_id: int,
    version_name: str,
    description: str
) -> RecipeVersion:
    """Create new version by deep copying from any existing version."""

    # Get source version
    source = db.query(RecipeVersion).get(copy_from_version_id)
    if source.recipe_id != recipe_id:
        raise ValueError("Source version belongs to different recipe")

    # Get next version number
    max_version = db.query(func.max(RecipeVersion.version_number))\
        .filter(RecipeVersion.recipe_id == recipe_id).scalar() or 0

    # Create new version
    new_version = RecipeVersion(
        recipe_id=recipe_id,
        version_number=max_version + 1,
        version_name=version_name,
        description=description,
        estimated_yield_grams=source.estimated_yield_grams,
        is_single_component=source.is_single_component,
        is_reusable_component=source.is_reusable_component,
        copied_from_version_id=copy_from_version_id,
    )
    db.add(new_version)
    db.flush()

    # Deep copy components and ingredients
    for src_comp in source.components:
        new_comp = RecipeComponent(
            recipe_version_id=new_version.id,
            sort_order=src_comp.sort_order,
            component_name=src_comp.component_name,
            linked_recipe_version_id=src_comp.linked_recipe_version_id,
        )
        db.add(new_comp)
        db.flush()

        for src_ing in src_comp.ingredients:
            new_ing = ComponentIngredient(
                recipe_component_id=new_comp.id,
                ingredient_id=src_ing.ingredient_id,
                sort_order=src_ing.sort_order,
                unit=src_ing.unit,
                quantity=src_ing.quantity,
            )
            db.add(new_ing)

    db.commit()
    return new_version
```

## Key Business Rules

1. **Unit conversion**: kg→g, l→ml, m→cm. 1 ml = 1 g for liquid calculations.
2. **Version immutability**: Saved versions cannot be edited. Create new version instead.
3. **Linked components**: Recipes can reference other recipe versions as components.
4. **Product pinning**: Products stay on selected recipe/packaging versions. Manual update required.
5. **Reusable components**: Only single-component recipes marked as reusable appear in component selection.
6. **Deletion rules**: Recipes/packaging cannot be deleted if used in products. Error shows blocking products.
7. **Default tags**: System seeds Dubai-Snack, Extruded-Snack, Sachet, Pouch, Box on init.

## Common Pitfalls

1. **Forgetting to flush before accessing ID** — After `db.add()`, call `db.flush()` to get the auto-generated ID before creating child records.

2. **Circular imports in models** — Use `TYPE_CHECKING` and string annotations for forward references.

3. **N+1 queries** — Use `joinedload` or `selectinload` for relationships accessed in loops.

4. **Stale React Query cache** — Always `invalidateQueries` after mutations that affect list views.

5. **Cost calculation with null yield** — Always check `estimated_yield_grams` before dividing. Return `null` if not set.

6. **Version copy depth** — When copying, deep copy components AND ingredients. Shallow copy creates shared references.

7. **React Router v7 changes** — Use object format for `invalidateQueries({ queryKey: [...] })`.

## Environment Variables

```bash
# backend/.env (optional, defaults work for local dev)
DATABASE_URL=sqlite:///./data/malo_recipes.db
CORS_ORIGINS=http://localhost:5173

# frontend/.env
VITE_API_URL=http://localhost:8000/api
```

## Development Progress

### Phase 1: Backend (Completed)
- [x] SQLite database setup with SQLAlchemy 2.x
- [x] All 7 model files (Ingredient, PackagingMaterial, Tag, Recipe, Packaging, Product)
- [x] All 7 schema files with Pydantic 2.x
- [x] All 7 CRUD modules with eager loading
- [x] Cost calculator service (212 lines)
- [x] All 7 API routers (41 endpoint functions)
- [x] CORS configuration for dev servers
- [x] Database initialization with default tags
- [x] Health check endpoints

### Phase 2: Frontend (Completed)
- [x] Vite + React 19 + TypeScript setup
- [x] Tailwind CSS 4.x with custom theme
- [x] 13 shadcn/ui components
- [x] TanStack Query 5.x with custom hooks
- [x] React Router 7.x with nested routes
- [x] Dashboard with 3 carousels (Products, Recipes, Packaging)
- [x] RecipeEditor with full versioning (648 lines)
- [x] PackagingEditor with material management (607 lines)
- [x] ProductEditor with COGS breakdown (545 lines)
- [x] Shared components (Carousel, VersionNavigator, etc.)
- [x] TypeScript types matching all backend schemas

### Not Yet Implemented
- [ ] Testing (pytest for backend, Vitest for frontend)
- [ ] Authentication/Authorization
- [ ] API rate limiting
- [ ] Structured logging
- [ ] Production deployment configuration
- [ ] Error boundaries in React
- [ ] Pagination for large lists

## Changelog

### 2025-01-27 - Phase 2 Frontend Complete
**Added:**
- Complete React frontend with TypeScript
- Dashboard with carousel navigation
- Recipe/Packaging/Product editors
- Version navigation and copying
- COGS calculations display
- shadcn/ui component library

**Components:**
- 13 UI components (shadcn/ui)
- 3 layout components
- 5 shared utility components
- 3 entity card components
- 4 page components
- 7 React Query hooks

**Technical:**
- React 19.2.0, Tailwind CSS 4.1.18, React Router 7.13.0
- TanStack Query 5.90.20 for server state
- Axios for HTTP client
- Lucide React for icons

### 2025-01-27 - Phase 1 Backend Complete
**Added:**
- FastAPI backend with SQLite database
- Full CRUD operations for all entities
- Cost calculator service
- Versioning system for recipes, packaging, products
- 41 API endpoints across 7 routers

**Models:**
- Ingredient, PackagingMaterial, Tag
- Recipe, RecipeVersion, RecipeComponent, ComponentIngredient
- PackagingRecipe, PackagingVersion, PackagingComponent, PackagingComponentMaterial
- Product, ProductVersion

## Deployment (Future)

For production deployment:
- Replace SQLite with PostgreSQL
- Add authentication (consider Clerk or Auth.js)
- Host backend on Railway/Render
- Host frontend on Vercel
- Use environment-based database URLs
- Add proper logging and monitoring
