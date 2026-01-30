"""
Cost calculation service for recipes, packaging, and products.

Unit conversions:
- kg -> g (x1000)
- l -> ml (x1000)
- m -> cm (x100)
- 1 ml = 1 g for liquids (business rule)

Base units: g, ml, pcs, cm, sheets
"""

from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient
from app.models.packaging_material import PackagingMaterial
from app.models.recipe import RecipeVersion, RecipeComponent, ComponentIngredient
from app.models.packaging import PackagingVersion, PackagingComponent, PackagingComponentMaterial
from app.models.product import ProductVersion


def normalize_to_base_unit(quantity: float, unit: str) -> float:
    """
    Convert quantity to base unit.
    kg -> g, l -> ml, m -> cm
    """
    if unit in ("kg", "l"):
        return quantity * 1000
    if unit == "m":
        return quantity * 100
    return quantity


def get_base_unit(unit_type: str) -> str:
    """Get the base unit for a given unit type."""
    if unit_type in ("kg", "g"):
        return "g"
    if unit_type in ("l", "ml"):
        return "ml"
    if unit_type in ("m", "cm"):
        return "cm"
    return unit_type  # pcs, sheets


def get_ingredient_cost_per_base_unit(ingredient: Ingredient) -> tuple[float, str]:
    """
    Calculate the cost per base unit (g, ml, or pcs) for an ingredient.
    Returns (cost_per_unit, base_unit)
    """
    total_cost = ingredient.price_excl_shipping + ingredient.shipping_cost
    base_volume = normalize_to_base_unit(ingredient.volume_purchased, ingredient.unit_type)
    base_unit = get_base_unit(ingredient.unit_type)

    if base_volume <= 0:
        return 0.0, base_unit

    return total_cost / base_volume, base_unit


def get_material_cost_per_base_unit(material: PackagingMaterial) -> tuple[float, str]:
    """
    Calculate the cost per base unit for a packaging material.
    Returns (cost_per_unit, base_unit)
    """
    total_cost = material.price_excl_shipping + material.shipping_cost
    base_volume = normalize_to_base_unit(material.volume_purchased, material.unit_type)
    base_unit = get_base_unit(material.unit_type)

    if base_volume <= 0:
        return 0.0, base_unit

    return total_cost / base_volume, base_unit


def get_ingredient_line_cost(comp_ingredient: ComponentIngredient) -> float:
    """Calculate the cost for a single ingredient line in a component."""
    ingredient = comp_ingredient.ingredient
    cost_per_unit, _ = get_ingredient_cost_per_base_unit(ingredient)
    quantity_base = normalize_to_base_unit(comp_ingredient.quantity, comp_ingredient.unit)
    return cost_per_unit * quantity_base


def get_component_cost(component: RecipeComponent, db: Session) -> float:
    """
    Calculate the total cost for a recipe component.
    Handles both inline components and linked components.
    """
    if component.linked_recipe_version_id:
        # Linked component: get cost from source recipe version
        return get_recipe_version_cost(component.linked_recipe_version_id, db)

    # Inline component: sum up ingredient costs
    total = 0.0
    for comp_ing in component.ingredients:
        total += get_ingredient_line_cost(comp_ing)

    return total


def get_recipe_version_cost(version_id: int, db: Session) -> float:
    """
    Calculate the total cost for a recipe version.
    Sum of all component costs.
    """
    from app.crud.recipes import get_recipe_version

    version = get_recipe_version(db, version_id)
    if not version:
        return 0.0

    total = 0.0
    for component in version.components:
        total += get_component_cost(component, db)

    return total


def get_recipe_cost_per_gram(version_id: int, db: Session) -> float | None:
    """
    Calculate the cost per gram for a recipe version.
    Returns None if estimated_yield_grams is not set.
    """
    from app.crud.recipes import get_recipe_version

    version = get_recipe_version(db, version_id)
    if not version or not version.estimated_yield_grams:
        return None

    total_cost = get_recipe_version_cost(version_id, db)
    return total_cost / version.estimated_yield_grams


def get_material_line_cost(pcm: PackagingComponentMaterial) -> float:
    """Calculate the cost for a single material line in a packaging component."""
    material = pcm.material
    cost_per_unit, _ = get_material_cost_per_base_unit(material)
    quantity_base = normalize_to_base_unit(pcm.quantity, pcm.unit)
    return cost_per_unit * quantity_base


def get_packaging_component_cost(component: PackagingComponent) -> float:
    """Calculate the total cost for a packaging component."""
    total = 0.0
    for pcm in component.materials:
        total += get_material_line_cost(pcm)
    return total


def get_packaging_version_cost(version_id: int, db: Session) -> float:
    """
    Calculate the total cost for a packaging version.
    Sum of all component costs.
    """
    from app.crud.packaging import get_packaging_version

    version = get_packaging_version(db, version_id)
    if not version:
        return 0.0

    total = 0.0
    for component in version.components:
        total += get_packaging_component_cost(component)

    return total


def get_product_cogs(product_version: ProductVersion, db: Session) -> dict:
    """
    Calculate the full COGS breakdown for a product version.

    Returns dict with:
    - total_grams: Total product weight
    - recipe_cogs: Cost of recipe portion
    - packaging_cogs: Cost of packaging
    - total_cogs: Sum of recipe + packaging
    - retail_price_idr: Retail price
    - contribution_margin: Retail - COGS
    - contribution_margin_pct: Margin as percentage
    """
    total_grams = product_version.num_pieces * product_version.grams_per_piece

    # Recipe COGS
    cost_per_gram = get_recipe_cost_per_gram(product_version.recipe_version_id, db)
    recipe_cogs = (cost_per_gram * total_grams) if cost_per_gram else None

    # Packaging COGS
    packaging_cogs = get_packaging_version_cost(product_version.packaging_version_id, db)

    # Total COGS
    if recipe_cogs is not None:
        total_cogs = recipe_cogs + packaging_cogs
    else:
        total_cogs = None

    # Contribution margin
    retail_price = product_version.retail_price_idr
    if total_cogs is not None and retail_price > 0:
        contribution_margin = retail_price - total_cogs
        contribution_margin_pct = (contribution_margin / retail_price) * 100
    else:
        contribution_margin = None
        contribution_margin_pct = None

    return {
        "total_grams": total_grams,
        "recipe_cogs": recipe_cogs,
        "packaging_cogs": packaging_cogs,
        "total_cogs": total_cogs,
        "retail_price_idr": retail_price,
        "contribution_margin": contribution_margin,
        "contribution_margin_pct": contribution_margin_pct,
    }
