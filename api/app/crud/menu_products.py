from sqlalchemy.orm import Session
from ..models.menu_product import MenuProduct

def get_menu_products(db: Session, active_only: bool = True):
    query = db.query(MenuProduct)
    if active_only:
        query = query.filter(MenuProduct.is_active == True)
    return query.all()
