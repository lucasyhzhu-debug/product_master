# Code Style Guide

> **Purpose:** Coding conventions and patterns for Malo Recipe Master.
> **When to read:** During implementation to ensure consistency.

## Table of Contents
- [Python (Backend)](#python-backend)
- [TypeScript (Frontend)](#typescript-frontend)
- [Frontend Patterns](#frontend-patterns)
- [Business Logic Examples](#business-logic-examples)

---

## Python (Backend)

### Type Hints
```python
# Use type hints everywhere
def get_recipe_cost(recipe_version_id: int, db: Session) -> float:
    ...

# Use Optional for nullable types (or | None in Python 3.10+)
def get_recipe(db: Session, recipe_id: int) -> Recipe | None:
    return db.query(Recipe).filter(Recipe.id == recipe_id).first()
```

### Pydantic Models
```python
# Pydantic models for all API I/O
class RecipeVersionCreate(BaseModel):
    version_name: str
    description: str
    estimated_yield_grams: float | None = None
```

### SQLAlchemy Models
```python
class RecipeVersion(Base):
    __tablename__ = "recipe_version"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipe.id"))

    # Relationships
    recipe: Mapped["Recipe"] = relationship(back_populates="versions")
    components: Mapped[list["RecipeComponent"]] = relationship(back_populates="recipe_version")
```

### CRUD Functions
```python
# CRUD functions return models, not dicts
def get_recipe(db: Session, recipe_id: int) -> Recipe | None:
    return db.query(Recipe).filter(Recipe.id == recipe_id).first()

# Use joinedload/selectinload to avoid N+1 queries
def get_recipe_with_components(db: Session, recipe_id: int) -> Recipe | None:
    return db.query(Recipe)\
        .options(joinedload(Recipe.versions))\
        .filter(Recipe.id == recipe_id).first()
```

### Router Dependencies
```python
@router.get("/{recipe_id}")
def read_recipe(recipe_id: int, db: Session = Depends(get_db)):
    recipe = crud.get_recipe(db, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe
```

---

## TypeScript (Frontend)

### Interfaces
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

// Components have explicit prop types
interface RecipeCardProps {
  recipe: RecipeSummary;
  onClick?: () => void;
}

export function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  ...
}
```

### React Query
```typescript
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
```

### Components
```typescript
// Components are functional with explicit prop types
interface RecipeCardProps {
  recipe: RecipeSummary;
  onClick?: () => void;
}

export function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  ...
}
```

---

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

---

## Business Logic Examples

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
