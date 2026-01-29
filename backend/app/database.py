from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path

# Database path
DATABASE_DIR = Path(__file__).parent.parent / "data"
DATABASE_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{DATABASE_DIR}/malo_recipes.db"

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

# Enable foreign keys for SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def init_db():
    """Initialize database tables and seed default data."""
    from app.models import ingredient, packaging_material, tag, recipe, packaging, product
    from app.models import customer, order

    Base.metadata.create_all(bind=engine)

    # Seed default tags
    db = SessionLocal()
    try:
        from app.models.tag import Tag
        existing_tags = db.query(Tag).count()
        if existing_tags == 0:
            default_tags = [
                Tag(name="Dubai-Snack"),
                Tag(name="Extruded-Snack"),
                Tag(name="Sachet"),
                Tag(name="Pouch"),
                Tag(name="Box"),
            ]
            db.add_all(default_tags)
            db.commit()

        # Seed menu products
        from app.models.menu_product import MenuProduct
        existing_products = db.query(MenuProduct).count()
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
            db.commit()
    finally:
        db.close()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
