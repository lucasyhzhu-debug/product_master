from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.ingredient import (
    IngredientCreate,
    IngredientUpdate,
    IngredientResponse,
    IngredientWithCost,
)
from app.crud import ingredients as crud
from app.services.cost_calculator import get_ingredient_cost_per_base_unit

router = APIRouter(prefix="/api/ingredients", tags=["ingredients"])


@router.get("", response_model=list[IngredientWithCost])
def list_ingredients(
    skip: int = 0,
    limit: int = 100,
    search: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """List all ingredients, optionally filtered by search query."""
    if search:
        items = crud.search_ingredients(db, search, limit)
    else:
        items = crud.get_ingredients(db, skip, limit)

    # Add cost calculations
    result = []
    for item in items:
        cost, base_unit = get_ingredient_cost_per_base_unit(item)
        result.append(
            IngredientWithCost(
                **IngredientResponse.model_validate(item).model_dump(),
                cost_per_base_unit=cost,
                base_unit=base_unit,
            )
        )
    return result


@router.get("/{ingredient_id}", response_model=IngredientWithCost)
def get_ingredient(ingredient_id: int, db: Session = Depends(get_db)):
    """Get a specific ingredient by ID."""
    item = crud.get_ingredient(db, ingredient_id)
    if not item:
        raise HTTPException(status_code=404, detail="Ingredient not found")

    cost, base_unit = get_ingredient_cost_per_base_unit(item)
    return IngredientWithCost(
        **IngredientResponse.model_validate(item).model_dump(),
        cost_per_base_unit=cost,
        base_unit=base_unit,
    )


@router.post("", response_model=IngredientWithCost, status_code=201)
def create_ingredient(ingredient: IngredientCreate, db: Session = Depends(get_db)):
    """Create a new ingredient."""
    item = crud.create_ingredient(db, ingredient)
    cost, base_unit = get_ingredient_cost_per_base_unit(item)
    return IngredientWithCost(
        **IngredientResponse.model_validate(item).model_dump(),
        cost_per_base_unit=cost,
        base_unit=base_unit,
    )


@router.put("/{ingredient_id}", response_model=IngredientWithCost)
def update_ingredient(
    ingredient_id: int, ingredient: IngredientUpdate, db: Session = Depends(get_db)
):
    """Update an existing ingredient."""
    item = crud.update_ingredient(db, ingredient_id, ingredient)
    if not item:
        raise HTTPException(status_code=404, detail="Ingredient not found")

    cost, base_unit = get_ingredient_cost_per_base_unit(item)
    return IngredientWithCost(
        **IngredientResponse.model_validate(item).model_dump(),
        cost_per_base_unit=cost,
        base_unit=base_unit,
    )


@router.delete("/{ingredient_id}", status_code=204)
def delete_ingredient(ingredient_id: int, db: Session = Depends(get_db)):
    """Delete an ingredient."""
    if not crud.delete_ingredient(db, ingredient_id):
        raise HTTPException(status_code=404, detail="Ingredient not found")
