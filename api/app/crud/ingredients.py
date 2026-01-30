from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.ingredient import Ingredient
from app.schemas.ingredient import IngredientCreate, IngredientUpdate


def get_ingredients(db: Session, skip: int = 0, limit: int = 100) -> list[Ingredient]:
    return db.query(Ingredient).offset(skip).limit(limit).all()


def get_ingredient(db: Session, ingredient_id: int) -> Ingredient | None:
    return db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()


def search_ingredients(db: Session, query: str, limit: int = 20) -> list[Ingredient]:
    search_pattern = f"%{query}%"
    return (
        db.query(Ingredient)
        .filter(
            or_(
                Ingredient.name.ilike(search_pattern),
                Ingredient.brand.ilike(search_pattern),
            )
        )
        .limit(limit)
        .all()
    )


def create_ingredient(db: Session, ingredient: IngredientCreate) -> Ingredient:
    db_ingredient = Ingredient(**ingredient.model_dump())
    db.add(db_ingredient)
    db.commit()
    db.refresh(db_ingredient)
    return db_ingredient


def update_ingredient(
    db: Session, ingredient_id: int, ingredient: IngredientUpdate
) -> Ingredient | None:
    db_ingredient = get_ingredient(db, ingredient_id)
    if not db_ingredient:
        return None

    update_data = ingredient.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_ingredient, field, value)

    db.commit()
    db.refresh(db_ingredient)
    return db_ingredient


def delete_ingredient(db: Session, ingredient_id: int) -> bool:
    db_ingredient = get_ingredient(db, ingredient_id)
    if not db_ingredient:
        return False

    db.delete(db_ingredient)
    db.commit()
    return True
