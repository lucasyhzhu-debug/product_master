from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.models.recipe import Recipe, RecipeVersion, RecipeComponent, ComponentIngredient, RecipeTag
from app.models.tag import Tag
from app.schemas.recipe import (
    RecipeCreate,
    RecipeVersionCreate,
    RecipeVersionCopyCreate,
    RecipeComponentCreate,
    ComponentIngredientCreate,
)


def get_recipes(db: Session, skip: int = 0, limit: int = 100) -> list[Recipe]:
    return (
        db.query(Recipe)
        .options(joinedload(Recipe.versions), joinedload(Recipe.tags))
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_recipe(db: Session, recipe_id: int) -> Recipe | None:
    return (
        db.query(Recipe)
        .options(joinedload(Recipe.versions), joinedload(Recipe.tags))
        .filter(Recipe.id == recipe_id)
        .first()
    )


def get_recipe_version(db: Session, version_id: int) -> RecipeVersion | None:
    return (
        db.query(RecipeVersion)
        .options(
            joinedload(RecipeVersion.components).joinedload(RecipeComponent.ingredients).joinedload(ComponentIngredient.ingredient)
        )
        .filter(RecipeVersion.id == version_id)
        .first()
    )


def get_recipe_version_by_number(db: Session, recipe_id: int, version_number: int) -> RecipeVersion | None:
    return (
        db.query(RecipeVersion)
        .options(
            joinedload(RecipeVersion.components).joinedload(RecipeComponent.ingredients).joinedload(ComponentIngredient.ingredient)
        )
        .filter(RecipeVersion.recipe_id == recipe_id, RecipeVersion.version_number == version_number)
        .first()
    )


def get_reusable_recipes(db: Session) -> list[RecipeVersion]:
    """Get all recipe versions that are marked as reusable components."""
    return (
        db.query(RecipeVersion)
        .filter(RecipeVersion.is_reusable_component == True)
        .options(joinedload(RecipeVersion.recipe))
        .all()
    )


def get_recipes_using_component(db: Session, linked_version_id: int) -> list[dict]:
    """Get all recipes that use a specific recipe version as a linked component."""
    components = (
        db.query(RecipeComponent)
        .filter(RecipeComponent.linked_recipe_version_id == linked_version_id)
        .options(joinedload(RecipeComponent.recipe_version).joinedload(RecipeVersion.recipe))
        .all()
    )

    result = []
    for comp in components:
        result.append({
            "recipe_id": comp.recipe_version.recipe_id,
            "recipe_name": comp.recipe_version.recipe.name,
            "version_number": comp.recipe_version.version_number,
        })
    return result


def create_recipe(db: Session, recipe: RecipeCreate) -> Recipe:
    # Create the recipe
    db_recipe = Recipe(name=recipe.name)
    db.add(db_recipe)
    db.flush()

    # Add tags
    if recipe.tag_ids:
        tags = db.query(Tag).filter(Tag.id.in_(recipe.tag_ids)).all()
        db_recipe.tags = tags

    # Create first version
    _create_version_with_components(
        db,
        recipe_id=db_recipe.id,
        version_number=1,
        version_data=recipe.first_version,
        copied_from_version_id=None,
    )

    db.commit()
    db.refresh(db_recipe)
    return db_recipe


def create_recipe_version(
    db: Session, recipe_id: int, version_data: RecipeVersionCopyCreate
) -> RecipeVersion | None:
    """Create a new version by copying from an existing version."""
    recipe = get_recipe(db, recipe_id)
    if not recipe:
        return None

    source_version = get_recipe_version(db, version_data.copy_from_version_id)
    if not source_version or source_version.recipe_id != recipe_id:
        return None

    # Get next version number
    max_version = (
        db.query(func.max(RecipeVersion.version_number))
        .filter(RecipeVersion.recipe_id == recipe_id)
        .scalar()
    ) or 0

    # Create new version with copied components
    new_version = RecipeVersion(
        recipe_id=recipe_id,
        version_number=max_version + 1,
        version_name=version_data.version_name,
        description=version_data.description,
        estimated_yield_grams=source_version.estimated_yield_grams,
        is_single_component=source_version.is_single_component,
        is_reusable_component=source_version.is_reusable_component,
        copied_from_version_id=version_data.copy_from_version_id,
    )
    db.add(new_version)
    db.flush()

    # Deep copy components and ingredients
    for src_comp in source_version.components:
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
    db.refresh(new_version)
    return new_version


def create_recipe_version_new(
    db: Session, recipe_id: int, version_data: RecipeVersionCreate
) -> RecipeVersion | None:
    """Create a completely new version with provided components."""
    recipe = get_recipe(db, recipe_id)
    if not recipe:
        return None

    # Get next version number
    max_version = (
        db.query(func.max(RecipeVersion.version_number))
        .filter(RecipeVersion.recipe_id == recipe_id)
        .scalar()
    ) or 0

    return _create_version_with_components(
        db,
        recipe_id=recipe_id,
        version_number=max_version + 1,
        version_data=version_data,
        copied_from_version_id=None,
    )


def _create_version_with_components(
    db: Session,
    recipe_id: int,
    version_number: int,
    version_data: RecipeVersionCreate,
    copied_from_version_id: int | None,
) -> RecipeVersion:
    """Helper to create a version with its components."""
    is_single_component = len(version_data.components) == 1

    new_version = RecipeVersion(
        recipe_id=recipe_id,
        version_number=version_number,
        version_name=version_data.version_name,
        description=version_data.description,
        estimated_yield_grams=version_data.estimated_yield_grams,
        is_single_component=is_single_component,
        is_reusable_component=version_data.is_reusable_component and is_single_component,
        copied_from_version_id=copied_from_version_id,
    )
    db.add(new_version)
    db.flush()

    for comp_data in version_data.components:
        new_comp = RecipeComponent(
            recipe_version_id=new_version.id,
            sort_order=comp_data.sort_order,
            component_name=comp_data.component_name,
            linked_recipe_version_id=comp_data.linked_recipe_version_id,
        )
        db.add(new_comp)
        db.flush()

        for ing_data in comp_data.ingredients:
            new_ing = ComponentIngredient(
                recipe_component_id=new_comp.id,
                ingredient_id=ing_data.ingredient_id,
                sort_order=ing_data.sort_order,
                unit=ing_data.unit,
                quantity=ing_data.quantity,
            )
            db.add(new_ing)

    db.commit()
    db.refresh(new_version)
    return new_version


def update_recipe_tags(db: Session, recipe_id: int, tag_ids: list[int]) -> Recipe | None:
    recipe = get_recipe(db, recipe_id)
    if not recipe:
        return None

    tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all()
    recipe.tags = tags
    db.commit()
    db.refresh(recipe)
    return recipe


def delete_recipe(db: Session, recipe_id: int) -> bool:
    recipe = get_recipe(db, recipe_id)
    if not recipe:
        return False

    db.delete(recipe)
    db.commit()
    return True
