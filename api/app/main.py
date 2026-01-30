import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import (
    ingredients_router,
    packaging_materials_router,
    tags_router,
    recipes_router,
    packaging_router,
    products_router,
    dashboard_router,
    customers_router,
    orders_router,
    menu_products_router,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup using modern lifespan handler."""
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        # Don't raise - tables may already exist in production
        logger.warning(f"Database initialization note: {e}")
    yield


# Create FastAPI app with lifespan handler
app = FastAPI(
    title="Malo Recipe Master API",
    description="Recipe and Product Concept Management for FMCG Snack Company",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
# For small team deployment, allow all origins (simplifies Vercel deployment)
# In future with auth, restrict to specific domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(dashboard_router)
app.include_router(ingredients_router)
app.include_router(packaging_materials_router)
app.include_router(tags_router)
app.include_router(recipes_router)
app.include_router(packaging_router)
app.include_router(products_router)
app.include_router(customers_router)
app.include_router(orders_router)
app.include_router(menu_products_router)


@app.get("/")
def root():
    """Root health check endpoint."""
    return {"status": "ok", "app": "Malo Recipe Master API"}


@app.get("/health")
def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "service": "malo-recipe-master"}


@app.get("/api/admin/db-check")
def check_database(secret: str = ""):
    """Diagnostic endpoint to check database connection and current state."""
    if secret != "malo-init-2026":
        return {"error": "Invalid secret. Use ?secret=malo-init-2026"}

    from app.database import SessionLocal, DATABASE_URL
    from app.models.menu_product import MenuProduct
    from app.models.tag import Tag

    try:
        db = SessionLocal()
        try:
            # Check connection
            menu_count = db.query(MenuProduct).count()
            tag_count = db.query(Tag).count()

            # Get a sample menu product if any
            sample_product = db.query(MenuProduct).first()

            return {
                "status": "connected",
                "database_url": DATABASE_URL.split('@')[0] + '@***',  # Hide credentials
                "menu_products_count": menu_count,
                "tags_count": tag_count,
                "sample_product": {
                    "name": sample_product.name,
                    "price": sample_product.default_price
                } if sample_product else None,
                "needs_seeding": menu_count == 0
            }
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Database check failed: {str(e)}", exc_info=True)
        return {
            "status": "error",
            "message": str(e),
            "type": type(e).__name__,
            "database_url": DATABASE_URL.split('@')[0] + '@***' if '@' in DATABASE_URL else "sqlite"
        }


@app.post("/api/admin/seed-only")
def admin_seed_only(secret: str = ""):
    """
    Seed menu products and tags without creating tables.
    Use this if tables already exist but are empty.
    """
    if secret != "malo-init-2026":
        return {"error": "Invalid secret. Use ?secret=malo-init-2026"}

    from app.database import SessionLocal
    from app.models.menu_product import MenuProduct
    from app.models.tag import Tag

    db = SessionLocal()
    try:
        # Check and seed tags
        existing_tags = db.query(Tag).count()
        tags_added = 0
        if existing_tags == 0:
            default_tags = [
                Tag(name="Dubai-Snack"),
                Tag(name="Extruded-Snack"),
                Tag(name="Sachet"),
                Tag(name="Pouch"),
                Tag(name="Box"),
            ]
            db.add_all(default_tags)
            tags_added = len(default_tags)

        # Check and seed menu products
        existing_products = db.query(MenuProduct).count()
        products_added = 0
        if existing_products == 0:
            default_products = [
                MenuProduct(
                    code="ORIGINAL_SINGLE",
                    name="Original Single (80g)",
                    grams=80,
                    default_price=50000,
                    production_type="original",
                    production_units=1
                ),
                MenuProduct(
                    code="BITE_SINGLE",
                    name="Bite Sized Single (45g)",
                    grams=45,
                    default_price=35000,
                    production_type="bite_sized",
                    production_units=1
                ),
                MenuProduct(
                    code="BITE_DOUBLE",
                    name="Bite Sized Double (90g)",
                    grams=90,
                    default_price=70000,
                    production_type="bite_sized",
                    production_units=2
                ),
                MenuProduct(
                    code="BITE_TRIPLE",
                    name="Bite Sized Triple (135g)",
                    grams=135,
                    default_price=99000,
                    production_type="bite_sized",
                    production_units=3
                ),
            ]
            db.add_all(default_products)
            products_added = len(default_products)

        db.commit()

        return {
            "status": "success",
            "message": "Seed completed",
            "tags_added": tags_added,
            "products_added": products_added,
            "existing_tags": existing_tags,
            "existing_products": existing_products
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Seeding failed: {str(e)}", exc_info=True)
        return {"status": "error", "message": str(e), "type": type(e).__name__}
    finally:
        db.close()


@app.post("/api/admin/init-db")
def admin_init_db(secret: str = ""):
    """
    One-time database initialization endpoint.
    Call with ?secret=malo-init-2026 to seed the database.
    Safe to call multiple times - only seeds if tables are empty.
    """
    if secret != "malo-init-2026":
        return {"error": "Invalid secret. Use ?secret=malo-init-2026"}

    try:
        init_db()
        return {
            "status": "success",
            "message": "Database initialized and seeded successfully",
            "seeded": {
                "tags": ["Dubai-Snack", "Extruded-Snack", "Sachet", "Pouch", "Box"],
                "menu_products": [
                    "Original Single (80g) - Rp 50,000",
                    "Bite Sized Single (45g) - Rp 35,000",
                    "Bite Sized Double (90g) - Rp 70,000",
                    "Bite Sized Triple (135g) - Rp 99,000",
                ]
            }
        }
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}", exc_info=True)
        return {"status": "error", "message": str(e), "type": type(e).__name__}
