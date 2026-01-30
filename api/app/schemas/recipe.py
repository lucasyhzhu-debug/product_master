from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.tag import TagResponse
from app.schemas.ingredient import IngredientResponse


# Component Ingredient schemas
class ComponentIngredientCreate(BaseModel):
    ingredient_id: int
    sort_order: int = 0
    unit: str = Field("g", pattern="^(g|kg|ml|l|pcs)$")
    quantity: float = Field(..., gt=0)


class ComponentIngredientResponse(BaseModel):
    id: int
    ingredient_id: int
    sort_order: int
    unit: str
    quantity: float
    ingredient: IngredientResponse
    cost: float | None = None  # Calculated field

    class Config:
        from_attributes = True


# Recipe Component schemas
class RecipeComponentCreate(BaseModel):
    sort_order: int = 0
    component_name: str = Field(..., min_length=1, max_length=255)
    linked_recipe_version_id: int | None = None
    ingredients: list[ComponentIngredientCreate] = []


class RecipeComponentResponse(BaseModel):
    id: int
    sort_order: int
    component_name: str
    linked_recipe_version_id: int | None
    ingredients: list[ComponentIngredientResponse]
    subtotal_cost: float | None = None  # Calculated field

    class Config:
        from_attributes = True


# Recipe Version schemas
class RecipeVersionCreate(BaseModel):
    version_name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1, max_length=1000)
    estimated_yield_grams: float | None = Field(None, gt=0)
    is_reusable_component: bool = False
    components: list[RecipeComponentCreate] = []


class RecipeVersionCopyCreate(BaseModel):
    copy_from_version_id: int
    version_name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1, max_length=1000)


class RecipeVersionResponse(BaseModel):
    id: int
    recipe_id: int
    version_number: int
    version_name: str
    description: str | None
    estimated_yield_grams: float | None
    is_single_component: bool
    is_reusable_component: bool
    copied_from_version_id: int | None
    created_at: datetime
    created_by: str

    class Config:
        from_attributes = True


class RecipeVersionDetail(RecipeVersionResponse):
    components: list[RecipeComponentResponse]
    total_cost: float | None = None
    cost_per_gram: float | None = None


# Recipe schemas
class RecipeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    tag_ids: list[int] = []
    first_version: RecipeVersionCreate


class RecipeResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    created_by: str
    tags: list[TagResponse]
    versions: list[RecipeVersionResponse]

    class Config:
        from_attributes = True


class RecipeSummary(BaseModel):
    id: int
    name: str
    tags: list[str]
    latest_version: int
    latest_version_name: str
    total_cost: float | None
    cost_per_gram: float | None
    created_at: datetime
