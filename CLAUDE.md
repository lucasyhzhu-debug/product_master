# CLAUDE.md

## Project Overview

**Malo Recipe Master** — A local-first recipe and product concept management system for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, and product concepts with full versioning, cost calculations, and margin analysis.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Backend | Python + FastAPI | 3.11+ |
| Database | SQLite | 3.x |
| ORM | SQLAlchemy | 2.x |
| Validation | Pydantic | 2.x |
| Frontend | React + TypeScript | 18.x |
| Styling | Tailwind CSS | 3.x |
| UI Components | shadcn/ui | latest |
| State | TanStack Query | 5.x |
| Routing | React Router | 6.x |

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

# Database reset (deletes all data)
rm backend/data/malo_recipes.db && cd backend && python -c "from app.database import init_db; init_db()"
```

## Project Structure

```
malo-recipe-master/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app, CORS, routers
│   │   ├── database.py          # SQLite engine, session, init
│   │   ├── models/              # SQLAlchemy models
│   │   │   ├── __init__.py
│   │   │   ├── ingredient.py
│   │   │   ├── packaging_material.py
│   │   │   ├── tag.py
│   │   │   ├── recipe.py
│   │   │   ├── packaging.py
│   │   │   └── product.py
│   │   ├── schemas/             # Pydantic schemas
│   │   │   ├── __init__.py
│   │   │   └── ...
│   │   ├── crud/                # Database operations
│   │   │   ├── __init__.py
│   │   │   └── ...
│   │   ├── services/            # Business logic, calculations
│   │   │   ├── __init__.py
│   │   │   └── cost_calculator.py
│   │   └── routers/             # API endpoints
│   │       ├── __init__.py
│   │       ├── ingredients.py
│   │       ├── recipes.py
│   │       ├── packaging.py
│   │       ├── products.py
│   │       └── dashboard.py
│   ├── data/
│   │   └── malo_recipes.db
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # shadcn components
│   │   │   ├── layout/          # Header, Sidebar, etc.
│   │   │   ├── recipes/         # Recipe-specific components
│   │   │   ├── packaging/
│   │   │   └── products/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── RecipeEditor.tsx
│   │   │   ├── PackagingEditor.tsx
│   │   │   └── ProductEditor.tsx
│   │   ├── hooks/
│   │   │   ├── useRecipes.ts
│   │   │   ├── usePackaging.ts
│   │   │   └── useProducts.ts
│   │   ├── lib/
│   │   │   ├── api.ts           # Fetch wrapper
│   │   │   ├── utils.ts
│   │   │   └── types.ts         # TypeScript interfaces
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── tailwind.config.js
├── malo_recipe_master_prd.md    # Full specification
├── claude_code_prompt.md        # Build instructions
└── CLAUDE.md                    # This file
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

// Mutations with optimistic updates where appropriate
const mutation = useMutation({
  mutationFn: api.createRecipeVersion,
  onSuccess: () => queryClient.invalidateQueries(['recipe', recipeId]),
});

// Components are functional with explicit prop types
interface RecipeCardProps {
  recipe: Recipe;
  onClick: (id: number) => void;
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

### Endpoints Pattern
```
GET    /api/recipes                    # List all recipes (summary)
GET    /api/recipes/{id}               # Get recipe with all versions
GET    /api/recipes/{id}/versions/{v}  # Get specific version with components
POST   /api/recipes                    # Create new recipe + first version
POST   /api/recipes/{id}/versions      # Create new version (copy from specified version)
DELETE /api/recipes/{id}               # Delete recipe (blocked if used in products)

# Same pattern for /api/packaging and /api/products
```

### Response Format
```python
# List endpoints return summaries
class RecipeSummary(BaseModel):
    id: int
    name: str
    latest_version: int
    tags: list[str]
    total_cost: float | None

# Detail endpoints return full objects
class RecipeDetail(BaseModel):
    id: int
    name: str
    versions: list[RecipeVersionDetail]
    tags: list[Tag]
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
export function RecipeEditorPage() {
  const { recipeId, versionNumber } = useParams();
  const { data: recipe, isLoading } = useRecipe(recipeId);
  
  if (isLoading) return <LoadingSkeleton />;
  if (!recipe) return <NotFound />;
  
  return <RecipeEditor recipe={recipe} initialVersion={versionNumber} />;
}

// Components handle UI logic
function RecipeEditor({ recipe, initialVersion }: Props) {
  const [currentVersion, setCurrentVersion] = useState(initialVersion);
  ...
}
```

### Component Organization
```
components/
├── ui/                    # shadcn primitives (Button, Input, Dialog, etc.)
├── layout/
│   ├── PageHeader.tsx     # Title + back button
│   └── Carousel.tsx       # Horizontal scrolling list
├── shared/
│   ├── VersionNavigator.tsx    # ← Version X →  reused across all editors
│   ├── TagSelector.tsx         # Tag combobox
│   ├── CostTooltip.tsx         # (i) icon with cost breakdown
│   └── ConfirmDialog.tsx       # Delete warnings
├── recipes/
│   ├── RecipeCard.tsx
│   ├── ComponentEditor.tsx
│   ├── IngredientRow.tsx
│   └── IngredientCombobox.tsx
├── packaging/
│   └── ...                # Mirror recipe structure
└── products/
    ├── ProductCard.tsx
    ├── RecipeSelector.tsx
    └── MarginCalculator.tsx
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

// Local UI state via useState/useReducer
// No global state library needed for this app
```

### Form Handling
```typescript
// Use controlled components for recipe editor
const [components, setComponents] = useState<ComponentDraft[]>([]);

// Validate before save
function handleSave() {
  if (components.length === 0) {
    toast.error("Recipe must have at least one component");
    return;
  }
  if (components.some(c => c.ingredients.length === 0)) {
    toast.error("All components must have at least one ingredient");
    return;
  }
  mutation.mutate({ ... });
}
```

## Business Logic

### Cost Calculations (implement in `services/cost_calculator.py`)

```python
def normalize_to_base_unit(quantity: float, unit: str) -> float:
    """Convert kg→g, l→ml. Base units: g, ml, pcs."""
    if unit in ('kg', 'l'):
        return quantity * 1000
    return quantity

def get_ingredient_cost_per_base_unit(ingredient: Ingredient) -> float:
    """Cost per gram (or ml or piece)."""
    total_cost = ingredient.price_excl_shipping + ingredient.shipping_cost
    base_volume = normalize_to_base_unit(ingredient.volume_purchased, ingredient.unit_type)
    return total_cost / base_volume

def get_component_cost(component: RecipeComponent, db: Session) -> float:
    """Sum of ingredient costs for a component."""
    if component.linked_recipe_version_id:
        # Linked component: get cost from source
        return get_recipe_version_cost(component.linked_recipe_version_id, db)
    
    total = 0.0
    for ci in component.ingredients:
        unit_cost = get_ingredient_cost_per_base_unit(ci.ingredient)
        qty_base = normalize_to_base_unit(ci.quantity, ci.unit)
        total += unit_cost * qty_base
    return total

def get_recipe_version_cost(version_id: int, db: Session) -> float:
    """Total cost of all components in a recipe version."""
    version = db.query(RecipeVersion).get(version_id)
    return sum(get_component_cost(c, db) for c in version.components)

def get_recipe_cost_per_gram(version_id: int, db: Session) -> float | None:
    """Cost per gram based on estimated yield."""
    version = db.query(RecipeVersion).get(version_id)
    if not version.estimated_yield_grams:
        return None
    return get_recipe_version_cost(version_id, db) / version.estimated_yield_grams

def get_product_cogs(product_version: ProductVersion, db: Session) -> dict:
    """Full COGS breakdown for a product."""
    total_grams = product_version.num_pieces * product_version.grams_per_piece
    cost_per_gram = get_recipe_cost_per_gram(product_version.recipe_version_id, db)
    
    recipe_cogs = (cost_per_gram or 0) * total_grams
    packaging_cogs = get_packaging_version_cost(product_version.packaging_version_id, db)
    total_cogs = recipe_cogs + packaging_cogs
    
    return {
        "recipe_cogs": recipe_cogs,
        "packaging_cogs": packaging_cogs,
        "total_cogs": total_cogs,
        "retail_price": product_version.retail_price_idr,
        "contribution_margin": product_version.retail_price_idr - total_cogs,
        "contribution_margin_pct": ((product_version.retail_price_idr - total_cogs) / product_version.retail_price_idr) * 100 if product_version.retail_price_idr > 0 else 0,
    }
```

### Versioning Logic

```python
def create_new_version(
    db: Session,
    recipe_id: int,
    copy_from_version_id: int,
    version_name: str,
    description: str
) -> RecipeVersion:
    """Create new version by copying from any existing version."""
    
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

## Key Business Rules (Reference)

1. **Unit conversion**: 1 ml = 1 g for calculations. Final product always in grams.
2. **Version immutability**: Saved versions cannot be edited. Create new version instead.
3. **Linked components**: Editing inline creates new version of source. Only current recipe auto-updates.
4. **Product pinning**: Products stay on selected recipe/packaging versions. Manual update required.
5. **Reusable components**: Only single-component recipes marked as reusable appear in "Add Existing Component".
6. **Deletion rules**: Recipes/packaging cannot be deleted if used in products. Show blocking products in error.

## Testing Approach

### Backend
```python
# Use pytest with test database
@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def test_ingredient_cost_calculation(db):
    ing = Ingredient(
        name="Pistachios",
        unit_type="kg",
        volume_purchased=1.0,
        price_excl_shipping=240000,
        shipping_cost=50000,
    )
    db.add(ing)
    db.commit()
    
    cost_per_gram = get_ingredient_cost_per_base_unit(ing)
    assert cost_per_gram == 290.0  # (240000 + 50000) / 1000
```

### Frontend
```typescript
// Use Vitest + React Testing Library
describe('RecipeEditor', () => {
  it('prevents save with zero components', async () => {
    render(<RecipeEditor recipe={mockRecipe} />);
    
    await userEvent.click(screen.getByText('Save Version'));
    
    expect(screen.getByText(/must have at least one component/i)).toBeInTheDocument();
  });
});
```

## Common Pitfalls

1. **Forgetting to flush before accessing ID** — After `db.add()`, call `db.flush()` to get the auto-generated ID before creating child records.

2. **Circular imports in models** — Use `TYPE_CHECKING` and string annotations for forward references.

3. **N+1 queries** — Use `joinedload` or `selectinload` for relationships accessed in loops.

4. **Stale React Query cache** — Always `invalidateQueries` after mutations that affect list views.

5. **Cost calculation with null yield** — Always check `estimated_yield_grams` before dividing. Return `null` if not set.

6. **Version copy depth** — When copying, deep copy components AND ingredients. Shallow copy creates shared references.

## Environment Variables

```bash
# backend/.env (optional, defaults work for local dev)
DATABASE_URL=sqlite:///./data/malo_recipes.db
CORS_ORIGINS=http://localhost:5173

# frontend/.env
VITE_API_URL=http://localhost:8000/api
```

## Deployment (Future)

For production deployment:
- Replace SQLite with PostgreSQL
- Add authentication (consider Clerk or Auth.js)
- Host backend on Railway/Render
- Host frontend on Vercel
- Use environment-based database URLs
