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
)

# Create FastAPI app
app = FastAPI(
    title="Malo Recipe Master API",
    description="Recipe and Product Concept Management for FMCG Snack Company",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative dev port
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
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


@app.on_event("startup")
def on_startup():
    """Initialize database on startup."""
    init_db()


@app.get("/")
def root():
    """Health check endpoint."""
    return {"status": "ok", "app": "Malo Recipe Master API"}


@app.get("/api/health")
def health_check():
    """API health check."""
    return {"status": "healthy"}
