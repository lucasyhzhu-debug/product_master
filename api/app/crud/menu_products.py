from sqlalchemy.orm import Session
from ..models.menu_product import MenuProduct
from ..schemas.menu_product import MenuProductCreate
import uuid


def get_menu_products(db: Session, active_only: bool = True):
    query = db.query(MenuProduct)
    if active_only:
        query = query.filter(MenuProduct.is_active == True)
    return query.order_by(MenuProduct.name).all()


def get_menu_product_by_name(db: Session, name: str):
    """Find existing product by exact name match"""
    return db.query(MenuProduct).filter(MenuProduct.name == name).first()


def create_menu_product(db: Session, data: MenuProductCreate):
    """Create a new custom menu product"""
    # Generate unique code for custom products
    code = f"CUSTOM_{uuid.uuid4().hex[:8].upper()}"

    product = MenuProduct(
        code=code,
        name=data.name,
        grams=data.grams,
        default_price=data.default_price,
        production_type=data.production_type,
        production_units=data.production_units,
        is_active=True,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def get_or_create_menu_product(db: Session, name: str, default_price: float):
    """Get existing product by name or create a new custom one"""
    existing = get_menu_product_by_name(db, name)
    if existing:
        return existing

    # Create new custom product
    data = MenuProductCreate(name=name, default_price=default_price)
    return create_menu_product(db, data)
