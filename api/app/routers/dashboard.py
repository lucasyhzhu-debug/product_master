from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.recipe import Recipe, RecipeVersion, RecipeComponent
from app.models.packaging import PackagingRecipe, PackagingVersion
from app.models.product import Product, ProductVersion
from app.services.cost_calculator import get_recipe_version_cost
from app.crud.orders import get_order_stats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics."""
    # Total counts
    total_recipes = db.query(func.count(Recipe.id)).scalar() or 0
    total_packaging = db.query(func.count(PackagingRecipe.id)).scalar() or 0
    total_products = db.query(func.count(Product.id)).scalar() or 0

    # Most used recipe (as linked component + in products)
    most_used_recipe = None
    most_used_recipe_count = 0

    recipes = db.query(Recipe).all()
    for recipe in recipes:
        version_ids = [v.id for v in db.query(RecipeVersion).filter(RecipeVersion.recipe_id == recipe.id).all()]
        if not version_ids:
            continue

        # Count as linked component
        linked_count = (
            db.query(func.count(RecipeComponent.id))
            .filter(RecipeComponent.linked_recipe_version_id.in_(version_ids))
            .scalar()
            or 0
        )

        # Count in products
        product_count = (
            db.query(func.count(ProductVersion.id))
            .filter(ProductVersion.recipe_version_id.in_(version_ids))
            .scalar()
            or 0
        )

        total_usage = linked_count + product_count
        if total_usage > most_used_recipe_count:
            most_used_recipe_count = total_usage
            most_used_recipe = recipe.name

    # Most used packaging
    most_used_packaging = None
    most_used_packaging_count = 0

    packagings = db.query(PackagingRecipe).all()
    for packaging in packagings:
        version_ids = [
            v.id
            for v in db.query(PackagingVersion)
            .filter(PackagingVersion.packaging_recipe_id == packaging.id)
            .all()
        ]
        if not version_ids:
            continue

        usage_count = (
            db.query(func.count(ProductVersion.id))
            .filter(ProductVersion.packaging_version_id.in_(version_ids))
            .scalar()
            or 0
        )

        if usage_count > most_used_packaging_count:
            most_used_packaging_count = usage_count
            most_used_packaging = packaging.name

    # Average recipe cost (of latest versions)
    avg_recipe_cost = None
    recipe_costs = []

    for recipe in recipes:
        latest_version = (
            db.query(RecipeVersion)
            .filter(RecipeVersion.recipe_id == recipe.id)
            .order_by(RecipeVersion.version_number.desc())
            .first()
        )
        if latest_version:
            cost = get_recipe_version_cost(latest_version.id, db)
            if cost > 0:
                recipe_costs.append(cost)

    if recipe_costs:
        avg_recipe_cost = sum(recipe_costs) / len(recipe_costs)

    return {
        "total_recipes": total_recipes,
        "total_packaging": total_packaging,
        "total_products": total_products,
        "most_used_recipe": most_used_recipe,
        "most_used_recipe_count": most_used_recipe_count,
        "most_used_packaging": most_used_packaging,
        "most_used_packaging_count": most_used_packaging_count,
        "avg_recipe_cost": avg_recipe_cost,
    }


@router.get("/order-stats")
def get_order_dashboard_stats(db: Session = Depends(get_db)):
    """
    Get order and production statistics for dashboard.

    Returns:
    - today: Today's revenue, order count, margin, avg order value
    - yesterday: Yesterday's revenue for comparison
    - needs_attention: Counts for overdue, awaiting payment >24h, due today
    - pipeline: Production status counts (confirmed, packaging, etc.)
    - urgent_orders: Top 7 most urgent orders
    """
    return get_order_stats(db)
