import os
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.database import init_db, get_db, SessionLocal, DATABASE_URL
from app.models.menu_product import MenuProduct
from app.models.tag import Tag
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

# Admin secret from environment variable
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")


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


def _mask_db_url(url: str) -> str:
    """Mask database URL to hide credentials."""
    if url.startswith("sqlite"):
        return "sqlite://[local]"
    if "://" in url:
        scheme = url.split("://")[0]
        return f"{scheme}://***@***"
    return "***"


@app.get("/api/admin/db-check")
def check_database(secret: str = "", db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Diagnostic endpoint to check database connection and current state."""
    if not ADMIN_SECRET:
        raise HTTPException(status_code=503, detail="Admin endpoints not configured")
    if secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        # Check connection
        menu_count = db.query(MenuProduct).count()
        tag_count = db.query(Tag).count()

        # Get a sample menu product if any
        sample_product = db.query(MenuProduct).first()

        return {
            "status": "connected",
            "database_url": _mask_db_url(DATABASE_URL),
            "menu_products_count": menu_count,
            "tags_count": tag_count,
            "sample_product": {
                "name": sample_product.name,
                "price": sample_product.default_price
            } if sample_product else None,
            "needs_seeding": menu_count == 0
        }
    except Exception as e:
        logger.error(f"Database check failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {type(e).__name__}"
        )


@app.post("/api/admin/seed-only")
def admin_seed_only(secret: str = "", db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Seed menu products and tags without creating tables.
    Use this if tables already exist but are empty.
    """
    if not ADMIN_SECRET:
        raise HTTPException(status_code=503, detail="Admin endpoints not configured")
    if secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    from app.database import seed_default_data

    try:
        result = seed_default_data(db)
        logger.info(
            "Admin seed completed",
            extra={
                "tags_added": result["tags_added"],
                "products_added": result["products_added"],
            }
        )
        return {
            "status": "success",
            "message": "Seed completed",
            **result
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Seeding failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Seeding failed: {type(e).__name__}"
        )


@app.post("/api/admin/init-db")
def admin_init_db(secret: str = "") -> Dict[str, Any]:
    """
    One-time database initialization endpoint.
    Creates tables and seeds default data.
    Safe to call multiple times - only seeds if tables are empty.
    """
    if not ADMIN_SECRET:
        raise HTTPException(status_code=503, detail="Admin endpoints not configured")
    if secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        init_db()
        logger.info("Admin init-db completed successfully")
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
        raise HTTPException(
            status_code=500,
            detail=f"Initialization failed: {type(e).__name__}"
        )
