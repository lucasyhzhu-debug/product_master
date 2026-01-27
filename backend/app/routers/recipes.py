from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.recipe import (
    RecipeCreate,
    RecipeResponse,
    RecipeSummary,
    RecipeVersionDetail,
    RecipeVersionCopyCreate,
    RecipeComponentResponse,
    ComponentIngredientResponse,
)
from app.schemas.ingredient import IngredientResponse
from app.crud import recipes as crud
from app.crud.products import get_products_using_recipe
from app.services.cost_calculator import (
    get_recipe_version_cost,
    get_recipe_cost_per_gram,
    get_component_cost,
    get_ingredient_line_cost,
)

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


def _build_version_detail(version, db: Session) -> RecipeVersionDetail:
    """Build a detailed version response with cost calculations."""
    components_data = []
    for comp in version.components:
        ingredients_data = []
        for ci in comp.ingredients:
            ing_cost = get_ingredient_line_cost(ci)
            ingredients_data.append(
                ComponentIngredientResponse(
                    id=ci.id,
                    ingredient_id=ci.ingredient_id,
                    sort_order=ci.sort_order,
                    unit=ci.unit,
                    quantity=ci.quantity,
                    ingredient=IngredientResponse.model_validate(ci.ingredient),
                    cost=ing_cost,
                )
            )

        comp_cost = get_component_cost(comp, db)
        components_data.append(
            RecipeComponentResponse(
                id=comp.id,
                sort_order=comp.sort_order,
                component_name=comp.component_name,
                linked_recipe_version_id=comp.linked_recipe_version_id,
                ingredients=ingredients_data,
                subtotal_cost=comp_cost,
            )
        )

    total_cost = get_recipe_version_cost(version.id, db)
    cost_per_gram = get_recipe_cost_per_gram(version.id, db)

    return RecipeVersionDetail(
        id=version.id,
        recipe_id=version.recipe_id,
        version_number=version.version_number,
        version_name=version.version_name,
        description=version.description,
        estimated_yield_grams=version.estimated_yield_grams,
        is_single_component=version.is_single_component,
        is_reusable_component=version.is_reusable_component,
        copied_from_version_id=version.copied_from_version_id,
        created_at=version.created_at,
        created_by=version.created_by,
        components=components_data,
        total_cost=total_cost,
        cost_per_gram=cost_per_gram,
    )


@router.get("", response_model=list[RecipeSummary])
def list_recipes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all recipes with summary information."""
    recipes = crud.get_recipes(db, skip, limit)
    result = []
    for recipe in recipes:
        if recipe.versions:
            latest = max(recipe.versions, key=lambda v: v.version_number)
            total_cost = get_recipe_version_cost(latest.id, db)
            cost_per_gram = get_recipe_cost_per_gram(latest.id, db)
            result.append(
                RecipeSummary(
                    id=recipe.id,
                    name=recipe.name,
                    tags=[t.name for t in recipe.tags],
                    latest_version=latest.version_number,
                    latest_version_name=latest.version_name,
                    total_cost=total_cost,
                    cost_per_gram=cost_per_gram,
                    created_at=recipe.created_at,
                )
            )
    return result


@router.get("/reusable", response_model=list[dict])
def list_reusable_recipes(db: Session = Depends(get_db)):
    """List all recipe versions marked as reusable components."""
    versions = crud.get_reusable_recipes(db)
    result = []
    for v in versions:
        result.append({
            "id": v.id,
            "recipe_id": v.recipe_id,
            "recipe_name": v.recipe.name,
            "version_number": v.version_number,
            "version_name": v.version_name,
        })
    return result


@router.get("/{recipe_id}", response_model=RecipeResponse)
def get_recipe(recipe_id: int, db: Session = Depends(get_db)):
    """Get a recipe with all its versions."""
    recipe = crud.get_recipe(db, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.get("/{recipe_id}/versions/{version_number}", response_model=RecipeVersionDetail)
def get_recipe_version(
    recipe_id: int, version_number: int, db: Session = Depends(get_db)
):
    """Get a specific recipe version with full details."""
    version = crud.get_recipe_version_by_number(db, recipe_id, version_number)
    if not version:
        raise HTTPException(status_code=404, detail="Recipe version not found")
    return _build_version_detail(version, db)


@router.get("/{recipe_id}/usage", response_model=list[dict])
def get_recipe_usage(recipe_id: int, db: Session = Depends(get_db)):
    """Get products using any version of this recipe."""
    return get_products_using_recipe(db, recipe_id)


@router.post("", response_model=RecipeResponse, status_code=201)
def create_recipe(recipe: RecipeCreate, db: Session = Depends(get_db)):
    """Create a new recipe with its first version."""
    if not recipe.first_version.components:
        raise HTTPException(
            status_code=400, detail="Recipe must have at least one component"
        )

    for comp in recipe.first_version.components:
        if not comp.ingredients and not comp.linked_recipe_version_id:
            raise HTTPException(
                status_code=400,
                detail=f"Component '{comp.component_name}' must have at least one ingredient",
            )

    return crud.create_recipe(db, recipe)


@router.post("/{recipe_id}/versions", response_model=RecipeVersionDetail, status_code=201)
def create_version(
    recipe_id: int, version: RecipeVersionCopyCreate, db: Session = Depends(get_db)
):
    """Create a new version by copying from an existing version."""
    new_version = crud.create_recipe_version(db, recipe_id, version)
    if not new_version:
        raise HTTPException(
            status_code=400, detail="Could not create version. Check recipe and source version IDs."
        )
    return _build_version_detail(new_version, db)


@router.put("/{recipe_id}/tags", response_model=RecipeResponse)
def update_tags(recipe_id: int, tag_ids: list[int], db: Session = Depends(get_db)):
    """Update the tags for a recipe."""
    recipe = crud.update_recipe_tags(db, recipe_id, tag_ids)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.delete("/{recipe_id}", status_code=204)
def delete_recipe(recipe_id: int, db: Session = Depends(get_db)):
    """Delete a recipe. Blocked if used in any products."""
    products = get_products_using_recipe(db, recipe_id)
    if products:
        product_names = [p["product_name"] for p in products]
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete recipe. Used in products: {', '.join(product_names)}",
        )

    if not crud.delete_recipe(db, recipe_id):
        raise HTTPException(status_code=404, detail="Recipe not found")
