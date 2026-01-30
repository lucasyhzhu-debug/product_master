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
        return {"status": "error", "message": str(e)}
