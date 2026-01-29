from app.routers.ingredients import router as ingredients_router
from app.routers.packaging_materials import router as packaging_materials_router
from app.routers.tags import router as tags_router
from app.routers.recipes import router as recipes_router
from app.routers.packaging import router as packaging_router
from app.routers.products import router as products_router
from app.routers.dashboard import router as dashboard_router
from app.routers.customers import router as customers_router
from app.routers.orders import router as orders_router

__all__ = [
    "ingredients_router",
    "packaging_materials_router",
    "tags_router",
    "recipes_router",
    "packaging_router",
    "products_router",
    "dashboard_router",
    "customers_router",
    "orders_router",
]
