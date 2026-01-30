import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool
from pathlib import Path

# Get database URL from environment variable
# Falls back to SQLite for local development
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{Path(__file__).parent.parent / 'data' / 'malo_recipes.db'}"
)

# Create engine with database-specific configuration
if DATABASE_URL.startswith("sqlite"):
    # SQLite for local development
    DATABASE_DIR = Path(__file__).parent.parent / "data"
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)

    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )

    # Enable foreign keys for SQLite only
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
else:
    # PostgreSQL for production (with NullPool for serverless)
    # Handles both 'postgresql://' and 'postgres://' URL schemes
    engine = create_engine(
        DATABASE_URL,
        poolclass=NullPool
    )

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def seed_default_data(db) -> dict[str, int]:
    """
    Seed default tags and menu products if they don't exist.

    Args:
        db: SQLAlchemy session

    Returns:
        Dict with counts of tags_added and products_added
    """
    from app.models.tag import Tag
    from app.models.menu_product import MenuProduct

    tags_added = 0
    products_added = 0
    existing_tags_count = 0
    existing_products_count = 0

    # Seed tags
    existing_tags_count = db.query(Tag).count()
    if existing_tags_count == 0:
        default_tags = [
            Tag(name="Dubai-Snack"),
            Tag(name="Extruded-Snack"),
            Tag(name="Sachet"),
            Tag(name="Pouch"),
            Tag(name="Box"),
        ]
        db.add_all(default_tags)
        tags_added = len(default_tags)

    # Seed menu products
    existing_products_count = db.query(MenuProduct).count()
    if existing_products_count == 0:
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
        "tags_added": tags_added,
        "products_added": products_added,
        "existing_tags": existing_tags_count,
        "existing_products": existing_products_count,
    }


def init_db():
    """Initialize database tables and seed default data."""
    from app.models import ingredient, packaging_material, tag, recipe, packaging, product
    from app.models import customer, order, menu_product

    Base.metadata.create_all(bind=engine)

    # Seed default data using shared function
    db = SessionLocal()
    try:
        seed_default_data(db)
    finally:
        db.close()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
