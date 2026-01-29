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
    finally:
        db.close()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
